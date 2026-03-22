import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Cache key helpers ────────────────────────────────────────────────────────

const CACHE_PREFIX = "offline_";

function cacheKey(table: string, userId: string): string {
  return `${CACHE_PREFIX}${table}_${userId}`;
}

// ── Read / Write ─────────────────────────────────────────────────────────────

export async function cacheGet<T = any[]>(table: string, userId: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(table, userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(table: string, userId: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(table, userId), JSON.stringify(data));
  } catch (e) {
    console.warn("[OfflineCache] Failed to write cache:", table, e);
  }
}

export async function cacheClear(table: string, userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cacheKey(table, userId));
  } catch {}
}

// ── Optimistic local mutations ───────────────────────────────────────────────
// Apply a mutation to the local cache immediately (optimistic update)

export async function cacheInsert(table: string, userId: string, row: any): Promise<void> {
  const existing = (await cacheGet<any[]>(table, userId)) ?? [];
  existing.unshift(row); // newest first
  await cacheSet(table, userId, existing);
}

export async function cacheUpdate(
  table: string,
  userId: string,
  filter: Record<string, any>,
  updates: Record<string, any>
): Promise<void> {
  const existing = (await cacheGet<any[]>(table, userId)) ?? [];
  const updated = existing.map((row) => {
    const match = Object.entries(filter).every(([k, v]) => row[k] === v);
    return match ? { ...row, ...updates } : row;
  });
  await cacheSet(table, userId, updated);
}

export async function cacheDelete(
  table: string,
  userId: string,
  filter: Record<string, any>,
  like?: Record<string, string>
): Promise<void> {
  const existing = (await cacheGet<any[]>(table, userId)) ?? [];
  const filtered = existing.filter((row) => {
    const eqMatch = Object.entries(filter).every(([k, v]) => row[k] === v);
    const likeMatch = like
      ? Object.entries(like).every(([k, v]) => {
          const escaped = String(v).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const pattern = escaped.replace(/%/g, ".*");
          return new RegExp(`^${pattern}$`, "i").test(String(row[k] ?? ""));
        })
      : true;
    return !(eqMatch && likeMatch);
  });
  await cacheSet(table, userId, filtered);
}

export async function cacheUpsert(
  table: string,
  userId: string,
  row: any,
  conflictKey = "id"
): Promise<void> {
  const existing = (await cacheGet<any[]>(table, userId)) ?? [];
  const idx = existing.findIndex((r) => r[conflictKey] === row[conflictKey]);
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...row };
  } else {
    existing.unshift(row);
  }
  await cacheSet(table, userId, existing);
}

// ── Clear all offline data for a user ────────────────────────────────────────

const TABLES = ["properties", "tenants", "payments", "expenses", "unit_labels", "documents"];

export async function clearAllCaches(userId: string): Promise<void> {
  await Promise.all(TABLES.map((t) => cacheClear(t, userId)));
}
