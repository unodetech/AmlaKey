import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Modal,
  Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { showAlert, crossAlert } from "../lib/alert";

const isWeb = Platform.OS === "web";

// DateTimePicker only available on native
let DateTimePicker: any = null;
if (!isWeb) {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
}
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SwipeableRow, SwipeableRowRef } from "../components/SwipeableRow";
import { spacing, radii } from "../constants/theme";

type TenantRow = {
  id: string; name: string; phone: string; unit_number: string;
  monthly_rent: number; status: string; property_id: string;
  lease_start: string; lease_end: string;
  properties: { id: string; name: string } | null;
};

type Property = { id: string; name: string };
type FilterStatus = "all" | "active" | "expired";

type EditForm = {
  name: string; phone: string; monthly_rent: string;
  lease_start: string; lease_end: string; status: string;
};

export default function TenantSearchScreen() {
  const { t, isRTL } = useLanguage();
  const { colors: C, shadow, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const S = useMemo(() => styles(C, shadow), [C, shadow]);
  const params = useLocalSearchParams<{ leaseExpiring?: string }>();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("active");
  const [showExpiringOnly, setShowExpiringOnly] = useState(params.leaseExpiring === "true");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "rent" | "date">("name");
  const [allTenants, setAllTenants] = useState<TenantRow[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit modal
  const [editTarget, setEditTarget] = useState<TenantRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "", phone: "", monthly_rent: "", lease_start: "", lease_end: "", status: "active",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const dismissAll = () => {
    Keyboard.dismiss();
    setShowStartPicker(false);
    setShowEndPicker(false);
  };

  // Close date pickers when keyboard opens
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      setShowStartPicker(false);
      setShowEndPicker(false);
    });
    return () => sub.remove();
  }, []);

  // Swipe row refs — track open rows so only one is open at a time
  const swipeRefs = useRef<Map<string, SwipeableRowRef | null>>(new Map());
  const openSwipeId = useRef<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: tenants, error: te }, { data: props, error: pe }] = await Promise.all([
        supabase
          .from("tenants")
          .select("id, name, phone, unit_number, monthly_rent, status, property_id, lease_start, lease_end, properties(id, name)")
          .order("name", { ascending: true }),
        supabase.from("properties").select("id, name").order("name", { ascending: true }),
      ]);
      if (te) throw te;
      if (pe) throw pe;
      setAllTenants((tenants ?? []).map((t: any) => ({
        ...t,
        properties: Array.isArray(t.properties) ? t.properties[0] ?? null : t.properties,
      })));
      setProperties(props ?? []);
    } catch (e) {
      if (__DEV__) console.error("TenantSearch fetchAll error:", e);
      showAlert(t("error"), t("failedToLoadData"));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const isLeaseExpiringSoon = useCallback((tenant: TenantRow) => {
    if (!tenant.lease_end) return false;
    const today = new Date();
    const endDate = new Date(tenant.lease_end + "T23:59:59");
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    return endDate >= today && endDate <= thirtyDaysFromNow;
  }, []);

  const daysUntilExpiry = useCallback((leaseEnd: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(leaseEnd + "T00:00:00");
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }, []);

  const filtered = useMemo(() => {
    let list = allTenants;
    // Lease expiring filter
    if (showExpiringOnly) list = list.filter(isLeaseExpiringSoon);
    // Status filter
    if (filter !== "all") list = list.filter((t) => t.status === filter);
    // Property filter
    if (propertyFilter !== "all") list = list.filter((t) => t.property_id === propertyFilter);
    // Text search
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        (t.phone ?? "").toLowerCase().includes(q) ||
        (t.properties?.name ?? "").toLowerCase().includes(q) ||
        String(t.unit_number).includes(q)
      );
    }
    // Sort: when showing expiring, sort by lease_end ascending by default
    if (showExpiringOnly && sortBy === "name") {
      list = [...list].sort((a, b) => (a.lease_end ?? "").localeCompare(b.lease_end ?? ""));
    } else {
      list = [...list].sort((a, b) => {
        if (sortBy === "rent") return (b.monthly_rent ?? 0) - (a.monthly_rent ?? 0);
        if (sortBy === "date") return (b.lease_start ?? "").localeCompare(a.lease_start ?? "");
        return a.name.localeCompare(b.name);
      });
    }
    return list;
  }, [allTenants, query, filter, propertyFilter, sortBy, showExpiringOnly, isLeaseExpiringSoon]);

  const handlePress = (item: TenantRow) => {
    router.push({
      pathname: "/unit-detail",
      params: {
        propertyId: item.property_id,
        propertyName: item.properties?.name ?? "",
        unitNumber: String(item.unit_number),
        tenantId: item.id,
      },
    });
  };

  function openEdit(item: TenantRow) {
    setEditTarget(item);
    setEditForm({
      name: item.name, phone: item.phone ?? "",
      monthly_rent: String(item.monthly_rent),
      lease_start: item.lease_start ?? "",
      lease_end: item.lease_end ?? "",
      status: item.status,
    });
  }

  async function saveEdit() {
    if (!editTarget || !editForm.name.trim()) {
      showAlert(t("error"), t("nameRequired"));
      return;
    }
    if (!editForm.lease_end) {
      showAlert(t("error"), t("leaseEndRequired"));
      return;
    }
    setEditSaving(true);
    const leaseEnd = editForm.lease_end;
    const status = leaseEnd && leaseEnd < new Date().toISOString().split("T")[0] ? "expired" : editForm.status;
    const { error } = await supabase.from("tenants").update({
      name: editForm.name.trim(),
      phone: editForm.phone.trim(),
      monthly_rent: parseFloat(editForm.monthly_rent) || 0,
      lease_start: editForm.lease_start || null,
      lease_end: leaseEnd || null,
      status,
    }).eq("id", editTarget.id);
    setEditSaving(false);
    if (error) { showAlert(t("error"), error.message); return; }
    setEditTarget(null);
    fetchAll();
  }

  function confirmDelete(item: TenantRow) {
    crossAlert(
      t("delete"),
      t("deleteTenantMsg").replace("%name%", item.name),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"), style: "destructive", onPress: async () => {
            const { error } = await supabase.from("tenants").delete().eq("id", item.id);
            if (error) showAlert(t("error"), error.message);
            else fetchAll();
          },
        },
      ]
    );
  }

  const formatCurrency = (n: number) => `${(n ?? 0).toLocaleString()} ${t("sar")}`;

  const STATUS_FILTERS: { key: FilterStatus; label: string }[] = [
    { key: "all", label: t("all") },
    { key: "active", label: t("active") },
    { key: "expired", label: t("expired") },
  ];

  const renderItem = ({ item }: { item: TenantRow }) => {
    const isExpired = item.status === "expired";
    const expiringSoon = isLeaseExpiringSoon(item);
    const daysLeft = expiringSoon && item.lease_end ? daysUntilExpiry(item.lease_end) : null;
    return (
      <SwipeableRow
        ref={(r) => { swipeRefs.current.set(item.id, r); }}
        isRTL={isRTL}
        editLabel={t("edit")}
        deleteLabel={t("delete")}
        onEdit={() => openEdit(item)}
        onDelete={() => confirmDelete(item)}
        onSwipeOpen={() => {
          if (openSwipeId.current && openSwipeId.current !== item.id) {
            swipeRefs.current.get(openSwipeId.current)?.close();
          }
          openSwipeId.current = item.id;
        }}
        onSwipeClose={() => {
          if (openSwipeId.current === item.id) openSwipeId.current = null;
        }}
      >
        <TouchableOpacity style={[S.card, expiringSoon && S.cardExpiring]} onPress={() => handlePress(item)} activeOpacity={0.75}>
          <View style={S.avatar}>
            <Text style={S.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={S.info}>
            <Text style={S.tenantName} numberOfLines={1}>{item.name}</Text>
            <Text style={S.sub} numberOfLines={1}>
              {item.properties?.name ?? "—"} · {t("unit")} {item.unit_number}
            </Text>
            <Text style={S.rent}>{formatCurrency(item.monthly_rent)}</Text>
            {expiringSoon && daysLeft !== null && (
              <View style={S.expiryBadge}>
                <Text style={S.expiryBadgeText}>
                  ⏰ {daysLeft <= 0
                    ? t("expiresToday")
                    : t("expiresInDays").replace("%d%", String(daysLeft))}
                </Text>
              </View>
            )}
          </View>
          <View style={[S.chip, isExpired ? S.chipExpired : expiringSoon ? S.chipExpiring : S.chipActive]}>
            <Text style={[S.chipText, isExpired ? S.chipTextExpired : expiringSoon ? S.chipTextExpiring : S.chipTextActive]}>
              {isExpired ? t("expired") : expiringSoon ? t("expiringSoon") : t("active")}
            </Text>
          </View>
          <Text style={S.chevron}>{isRTL ? "‹" : "›"}</Text>
        </TouchableOpacity>
      </SwipeableRow>
    );
  };

  return (
    <View style={S.container}>
      {/* Header */}
      <View style={[S.header, { paddingTop: insets.top + 10 }, isRTL && S.headerRTL]}>
        <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
          <Text style={S.backArrow}>{isRTL ? "›" : "‹"}</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>{t("searchTenants")}</Text>
      </View>

      {/* Search bar */}
      <View style={S.searchWrap}>
        <Text style={S.searchIcon}>🔍</Text>
        <TextInput
          style={S.searchInput} value={query} onChangeText={setQuery}
          placeholder={t("searchPlaceholder")} placeholderTextColor={C.textMuted}
          returnKeyType="search" textAlign={isRTL ? "right" : "left"}
          autoCorrect={false} autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")} style={S.clearBtn}>
            <Text style={S.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Lease expiring banner */}
      {showExpiringOnly && (
        <View style={[S.expiringBanner, isRTL && S.filterRowRTL]}>
          <Text style={S.expiringBannerIcon}>⏰</Text>
          <Text style={S.expiringBannerText}>{t("leaseExpiringSoon")}</Text>
          <TouchableOpacity onPress={() => setShowExpiringOnly(false)} style={S.expiringBannerClose}>
            <Text style={S.expiringBannerCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Status filter chips */}
      <View style={[S.filterRow, isRTL && S.filterRowRTL]}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[S.filterChip, filter === f.key && S.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[S.filterChipText, filter === f.key && S.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <Text style={S.countBadge}>{filtered.length} {t("tenants")}</Text>
      </View>

      {/* Sort pills */}
      <View style={[S.sortRow, isRTL && S.filterRowRTL]}>
        {([
          { key: "name" as const, label: t("sortByName") },
          { key: "rent" as const, label: t("sortByRent") },
          { key: "date" as const, label: t("sortByDate") },
        ]).map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[S.sortPill, sortBy === s.key && S.sortPillActive]}
            onPress={() => setSortBy(s.key)}
          >
            <Text style={[S.sortPillText, sortBy === s.key && S.sortPillTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Property filter — horizontal scroll */}
      {properties.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={S.propFilterScroll}
          contentContainerStyle={[S.propFilterRow, isRTL && S.filterRowRTL]}
        >
          <TouchableOpacity
            style={[S.propChip, propertyFilter === "all" && S.propChipActive]}
            onPress={() => setPropertyFilter("all")}
          >
            <Text style={[S.propChipText, propertyFilter === "all" && S.propChipTextActive]}>
              🏢 {t("all")}
            </Text>
          </TouchableOpacity>
          {properties.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[S.propChip, propertyFilter === p.id && S.propChipActive]}
              onPress={() => setPropertyFilter(p.id)}
            >
              <Text style={[S.propChipText, propertyFilter === p.id && S.propChipTextActive]}>
                🏠 {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={S.center}><ActivityIndicator color={C.primary} size="large" /></View>
      ) : filtered.length === 0 ? (
        <View style={S.center}>
          <Text style={S.noResults}>
            {query || filter !== "all" || propertyFilter !== "all" ? t("noResults") : t("noTenants")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered} keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={S.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => {
            if (openSwipeId.current) {
              swipeRefs.current.get(openSwipeId.current)?.close();
              openSwipeId.current = null;
            }
          }}
        />
      )}

      {/* ── Edit Tenant Modal ── */}
      <Modal
        visible={!!editTarget}
        animationType="slide" transparent
        onRequestClose={() => setEditTarget(null)}
      >
        <View style={S.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { dismissAll(); setEditTarget(null); }} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={S.modalSheet}
          >
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={S.modalTitle}>{t("edit")}</Text>

              <Text style={S.fieldLabel}>{t("tenantName")} *</Text>
              <TextInput style={S.input} value={editForm.name}
                onChangeText={(v) => setEditForm((f) => ({ ...f, name: v }))}
                placeholder={t("tenantName")} placeholderTextColor={C.textMuted}
                textAlign={isRTL ? "right" : "left"} />

              <Text style={S.fieldLabel}>{t("phone")}</Text>
              <TextInput style={S.input} value={editForm.phone}
                onChangeText={(v) => setEditForm((f) => ({ ...f, phone: v }))}
                placeholder="05XXXXXXXX" placeholderTextColor={C.textMuted}
                keyboardType="phone-pad" textAlign={isRTL ? "right" : "left"} />

              <Text style={S.fieldLabel}>{t("rent")} (SAR) *</Text>
              <TextInput style={S.input} value={editForm.monthly_rent}
                onChangeText={(v) => setEditForm((f) => ({ ...f, monthly_rent: v }))}
                placeholder="0" placeholderTextColor={C.textMuted}
                keyboardType="numeric" textAlign={isRTL ? "right" : "left"} />

              <Text style={S.fieldLabel}>{t("leaseStart")}</Text>
              <TouchableOpacity style={S.dateBtn} onPress={() => setShowStartPicker(true)}>
                <Text style={[S.dateBtnText, !editForm.lease_start && S.datePlaceholder]}>
                  📅 {editForm.lease_start || t("selectDate")}
                </Text>
              </TouchableOpacity>
              {showStartPicker && (
                <>
                  <DateTimePicker
                    value={editForm.lease_start ? new Date(editForm.lease_start) : new Date()}
                    mode="date" display="spinner"
                    locale="en-US"
                    themeVariant={isDark ? "dark" : "light"}
                    onChange={(_: any, d?: Date) => {
                      if (d) setEditForm((f) => ({ ...f, lease_start: d.toISOString().split("T")[0] }));
                    }}
                  />
                  <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowStartPicker(false)}>
                    <Text style={S.pickerConfirmText}>✓</Text>
                  </TouchableOpacity>
                </>
              )}

              <Text style={S.fieldLabel}>{t("leaseEnd")}</Text>
              <TouchableOpacity style={S.dateBtn} onPress={() => setShowEndPicker(true)}>
                <Text style={[S.dateBtnText, !editForm.lease_end && S.datePlaceholder]}>
                  📅 {editForm.lease_end || t("selectDate")}
                </Text>
              </TouchableOpacity>
              {showEndPicker && (
                <>
                  <DateTimePicker
                    value={editForm.lease_end ? new Date(editForm.lease_end) : new Date()}
                    mode="date" display="spinner"
                    locale="en-US"
                    themeVariant={isDark ? "dark" : "light"}
                    onChange={(_: any, d?: Date) => {
                      if (d) setEditForm((f) => ({ ...f, lease_end: d.toISOString().split("T")[0] }));
                    }}
                  />
                  <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowEndPicker(false)}>
                    <Text style={S.pickerConfirmText}>✓</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={S.modalActions}>
                <TouchableOpacity style={S.cancelBtn} onPress={() => setEditTarget(null)}>
                  <Text style={S.cancelBtnText}>{t("cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.saveBtn, editSaving && S.saveBtnDisabled]}
                  onPress={saveEdit} disabled={editSaving}
                >
                  {editSaving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={S.saveBtnText}>{t("save")}</Text>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = (C: any, shadow: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: "row", alignItems: "center", paddingBottom: 16, paddingHorizontal: spacing.md, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  headerRTL: { flexDirection: "row-reverse" },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceElevated, alignItems: "center", justifyContent: "center", marginRight: 12 },
  backArrow: { fontSize: 22, color: C.primary, fontWeight: "700" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: C.text },
  searchWrap: { flexDirection: "row", alignItems: "center", margin: spacing.md, backgroundColor: C.surface, borderRadius: radii.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, ...shadow },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, color: C.text, fontSize: 15 },
  clearBtn: { padding: 4 },
  clearText: { color: C.textMuted, fontSize: 14 },
  filterRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, marginBottom: 8, gap: 8 },
  filterRowRTL: { flexDirection: "row-reverse" },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  filterChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterChipText: { fontSize: 13, color: C.textMuted, fontWeight: "500" },
  filterChipTextActive: { color: "#fff", fontWeight: "700" },
  countBadge: { marginLeft: "auto", fontSize: 12, color: C.textMuted },
  sortRow: { flexDirection: "row", paddingHorizontal: spacing.md, marginBottom: 8, gap: 6 },
  sortPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  sortPillActive: { backgroundColor: C.accent + "20", borderColor: C.accent },
  sortPillText: { fontSize: 11, color: C.textMuted, fontWeight: "500" },
  sortPillTextActive: { color: C.accent, fontWeight: "700" },
  // Property filter
  propFilterScroll: { marginBottom: 10, flexGrow: 0, flexShrink: 0 },
  propFilterRow: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.md, paddingRight: spacing.lg, alignItems: "center" },
  propChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  propChipActive: { backgroundColor: C.accent + "25", borderColor: C.accent },
  propChipText: { fontSize: 13, color: C.textMuted, fontWeight: "500" },
  propChipTextActive: { color: C.accent, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  noResults: { fontSize: 15, color: C.textMuted },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: 32 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: radii.md, paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: C.border, ...shadow },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(2,132,199,0.15)", alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { fontSize: 18, fontWeight: "700", color: C.primary },
  info: { flex: 1 },
  tenantName: { fontSize: 15, fontWeight: "600", color: C.text },
  sub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  rent: { fontSize: 13, color: C.accent, fontWeight: "600", marginTop: 3 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: 6 },
  cardExpiring: { borderWidth: 1.5, borderColor: "#F59E0B" },
  chipActive: { backgroundColor: "rgba(13,148,136,0.15)" },
  chipExpired: { backgroundColor: "rgba(220,38,38,0.12)" },
  chipExpiring: { backgroundColor: "rgba(245,158,11,0.15)" },
  chipText: { fontSize: 11, fontWeight: "600" },
  chipTextActive: { color: C.accent },
  chipTextExpired: { color: C.danger },
  chipTextExpiring: { color: "#92400E" },
  expiryBadge: { backgroundColor: "#FEF3C7", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4, alignSelf: "flex-start" },
  expiryBadgeText: { fontSize: 11, fontWeight: "600", color: "#92400E" },
  expiringBanner: { flexDirection: "row", alignItems: "center", marginHorizontal: spacing.md, marginBottom: 8, backgroundColor: "#FEF3C7", borderRadius: radii.md, padding: 10, gap: 8, borderWidth: 1, borderColor: "#FDE68A" },
  expiringBannerIcon: { fontSize: 16 },
  expiringBannerText: { flex: 1, fontSize: 13, fontWeight: "600", color: "#92400E" },
  expiringBannerClose: { padding: 4 },
  expiringBannerCloseText: { fontSize: 14, color: "#92400E", fontWeight: "700" },
  chevron: { fontSize: 18, color: C.textMuted },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", ...(Platform.OS === "web" ? { justifyContent: "center", alignItems: "center", paddingHorizontal: 16 } : {}) },
  modalSheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: Platform.OS === "ios" ? 40 : spacing.lg, maxHeight: "88%", ...(Platform.OS === "web" ? { borderRadius: 20, maxWidth: 520, width: "100%", maxHeight: "85%" as any, paddingBottom: spacing.lg } : {}) },
  modalTitle: { fontSize: 18, fontWeight: "700", color: C.text, marginBottom: 20, ...(Platform.OS === "web" ? { fontSize: 20, textAlign: "center" } : {}) },
  fieldLabel: { fontSize: 13, color: C.textMuted, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: C.surfaceElevated, borderRadius: radii.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 13, color: C.text, fontSize: 15 },
  dateBtn: { backgroundColor: C.surfaceElevated, borderRadius: radii.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 13 },
  dateBtnText: { color: C.text, fontSize: 15 },
  datePlaceholder: { color: C.textMuted },
  pickerConfirm: {
    alignSelf: "center", backgroundColor: C.accent, borderRadius: 20,
    width: 40, height: 40, alignItems: "center", justifyContent: "center", marginTop: 4, marginBottom: 8,
  },
  pickerConfirmText: { color: "#fff", fontSize: 20, fontWeight: "700" as const },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: radii.md, paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { color: C.textMuted, fontWeight: "600", fontSize: 15 },
  saveBtn: { flex: 1, backgroundColor: C.primary, borderRadius: radii.md, paddingVertical: 14, alignItems: "center" },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: "#fff", fontWeight: "700" },
});
