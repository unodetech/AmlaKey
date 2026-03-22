import NetInfo from "@react-native-community/netinfo";
import { supabase } from "./supabase";
import { cacheGet, cacheSet, cacheInsert, cacheUpdate, cacheDelete, cacheUpsert } from "./offlineCache";
import { enqueue, generateUUID } from "./syncQueue";

// ── Network check ────────────────────────────────────────────────────────────

let _isOnline = true;

export function setOnlineStatus(online: boolean) {
  _isOnline = online;
}

export function isOnline(): boolean {
  return _isOnline;
}

// Initialize on import
NetInfo.fetch().then((state) => {
  _isOnline = !!state.isConnected;
});

// ── SELECT (Read) ────────────────────────────────────────────────────────────
// Try network first. If successful, cache the result.
// If offline or network fails, return cached data.

interface SelectOptions {
  userId: string;
  columns?: string;
  eq?: Record<string, any>;
  gte?: Record<string, any>;
  lte?: Record<string, any>;
  like?: Record<string, any>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
  single?: boolean;
  count?: "exact" | "planned" | "estimated";
}

export async function select<T = any>(
  table: string,
  opts: SelectOptions
): Promise<{ data: T | null; error: any; fromCache: boolean }> {
  const { userId, columns = "*", eq, gte, lte, like, order, limit, single, count } = opts;

  // Try network first
  if (_isOnline) {
    try {
      let q = count
        ? supabase.from(table).select(columns, { count })
        : supabase.from(table).select(columns);

      if (eq) for (const [k, v] of Object.entries(eq)) q = q.eq(k, v);
      if (gte) for (const [k, v] of Object.entries(gte)) q = q.gte(k, v);
      if (lte) for (const [k, v] of Object.entries(lte)) q = q.lte(k, v);
      if (like) for (const [k, v] of Object.entries(like)) q = q.like(k, v);
      if (order) q = q.order(order.column, { ascending: order.ascending ?? true });
      if (limit) q = q.limit(limit);
      if (single) q = q.single();

      const result = await q;
      if (!result.error && result.data) {
        // Cache full table data (only for non-single, non-filtered queries)
        if (!single && !eq && !gte && !lte && !like) {
          await cacheSet(table, userId, result.data);
        }
        return { data: result.data as T, error: null, fromCache: false };
      }
      if (result.error) throw result.error;
    } catch (e) {
      // Network failed, fall through to cache
    }
  }

  // Offline or network failed — read from cache
  const cached = await cacheGet<any[]>(table, userId);
  if (!cached) return { data: null, error: null, fromCache: true };

  let result = [...cached];

  // Apply filters locally
  if (eq) {
    result = result.filter((row) =>
      Object.entries(eq).every(([k, v]) => row[k] === v)
    );
  }
  if (gte) {
    result = result.filter((row) =>
      Object.entries(gte).every(([k, v]) => row[k] >= v)
    );
  }
  if (lte) {
    result = result.filter((row) =>
      Object.entries(lte).every(([k, v]) => row[k] <= v)
    );
  }
  if (like) {
    result = result.filter((row) =>
      Object.entries(like).every(([k, v]) => {
        const escaped = String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = escaped.replace(/%/g, ".*");
        return new RegExp(`^${pattern}$`, "i").test(String(row[k] ?? ""));
      })
    );
  }
  if (order) {
    result.sort((a, b) => {
      const va = a[order.column], vb = b[order.column];
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return order.ascending === false ? -cmp : cmp;
    });
  }
  if (limit) result = result.slice(0, limit);
  if (single) return { data: (result[0] ?? null) as T, error: null, fromCache: true };

  return { data: result as T, error: null, fromCache: true };
}

// ── INSERT ───────────────────────────────────────────────────────────────────

export async function insert(
  table: string,
  userId: string,
  data: Record<string, any> | Record<string, any>[],
  opts?: { returnData?: boolean }
): Promise<{ data: any; error: any }> {
  const rows = Array.isArray(data) ? data : [data];

  // Ensure every row has an ID
  for (const row of rows) {
    if (!row.id) row.id = generateUUID();
  }

  if (_isOnline) {
    try {
      let q = supabase.from(table).insert(rows);
      if (opts?.returnData) q = q.select();
      const result = await q;
      if (result.error) throw result.error;
      // Update cache
      for (const row of rows) {
        await cacheInsert(table, userId, row);
      }
      return { data: result.data ?? rows, error: null };
    } catch (e) {
      // Fall through to offline queue
    }
  }

  // Offline: optimistic local update + queue
  for (const row of rows) {
    await cacheInsert(table, userId, row);
    await enqueue({ table, operation: "insert", data: row });
  }
  return { data: rows, error: null };
}

// ── UPDATE ───────────────────────────────────────────────────────────────────

export async function update(
  table: string,
  userId: string,
  filter: Record<string, any>,
  updates: Record<string, any>
): Promise<{ error: any }> {
  if (_isOnline) {
    try {
      let q = supabase.from(table).update(updates);
      for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
      const { error } = await q;
      if (error) throw error;
      await cacheUpdate(table, userId, filter, updates);
      return { error: null };
    } catch (e) {
      // Fall through to offline queue
    }
  }

  // Offline: optimistic local update + queue
  await cacheUpdate(table, userId, filter, updates);
  await enqueue({ table, operation: "update", data: updates, filter });
  return { error: null };
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function del(
  table: string,
  userId: string,
  filter: Record<string, any>,
  like?: Record<string, string>
): Promise<{ error: any }> {
  if (_isOnline) {
    try {
      let q = supabase.from(table).delete();
      for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
      if (like) { for (const [k, v] of Object.entries(like)) q = q.like(k, v); }
      const { error } = await q;
      if (error) throw error;
      await cacheDelete(table, userId, filter, like);
      return { error: null };
    } catch (e) {
      // Fall through to offline queue
    }
  }

  // Offline: optimistic local delete + queue
  await cacheDelete(table, userId, filter, like);
  await enqueue({ table, operation: "delete", data: {}, filter: { ...filter, ...Object.fromEntries(Object.entries(like ?? {}).map(([k, v]) => [`${k}_like`, v])) } });
  return { error: null };
}

// ── UPSERT ───────────────────────────────────────────────────────────────────

export async function upsert(
  table: string,
  userId: string,
  data: Record<string, any> | Record<string, any>[],
  conflictKey = "id"
): Promise<{ error: any }> {
  const rows = Array.isArray(data) ? data : [data];

  if (_isOnline) {
    try {
      const { error } = await supabase.from(table).upsert(rows, { onConflict: conflictKey });
      if (error) throw error;
      for (const row of rows) {
        await cacheUpsert(table, userId, row, conflictKey);
      }
      return { error: null };
    } catch (e) {
      // Fall through to offline queue
    }
  }

  // Offline: optimistic local upsert + queue
  for (const row of rows) {
    await cacheUpsert(table, userId, row, conflictKey);
    await enqueue({ table, operation: "upsert", data: row, conflictKey });
  }
  return { error: null };
}

// ── Convenience: fetch and cache full table ──────────────────────────────────
// Use this to preload/refresh a table's cache

export async function refreshCache(table: string, userId: string, columns = "*"): Promise<void> {
  if (!_isOnline) return;
  try {
    const { data } = await supabase.from(table).select(columns).eq("user_id", userId);
    if (data) await cacheSet(table, userId, data);
  } catch {}
}
