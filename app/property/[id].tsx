import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
// expo-location: use native module on mobile, browser API on web
const isWeb = Platform.OS === "web";
// DateTimePicker only available on native
let DateTimePicker: any = null;
if (!isWeb) {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
}
let Location: typeof import("expo-location") | null = null;
if (!isWeb) {
  Location = require("expo-location");
}
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, radii } from "../../constants/theme";
import { Ionicons } from "@expo/vector-icons";
import { WebDateInput, modalBackdropStyle, ModalOverlay, webContentClickStop } from "../../components/WebDateInput";
import { getDuePeriodMonth } from "../../lib/dateUtils";
import { useSubscription } from "../../context/SubscriptionContext";
import { getDocuments, VaultDocument, DOC_TYPE_ICONS, DocType } from "../../lib/vault";

type TenantMap = Record<string, { id: string; name: string; status: string; monthly_rent: number; lease_start: string; payment_frequency?: string }>;
type LabelMap = Record<string, string>;
type PropertyType = "apartment" | "villa" | "commercial" | "shop";
const CITIES = ["alkharj", "riyadh", "jeddah", "dammam"];
type EditForm = { name: string; type: PropertyType; city: string; total_units: string; floors: string; monthly_income: string; notes: string; sec_account: string; nwc_account: string; has_multiple_sec: boolean; has_multiple_nwc: boolean; latitude: number | null; longitude: number | null; };
type UnitAccountMap = Record<string, { sec_account?: string; nwc_account?: string }>;
const TYPE_COLORS: Record<PropertyType, string> = { apartment: "#0EA5E9", villa: "#14B8A6", commercial: "#F59E0B", shop: "#A855F7" };
const TYPE_ICONS: Record<PropertyType, string> = { apartment: "🏢", villa: "🏡", commercial: "🏗️", shop: "🛍️" };

/** Cross-platform alert: uses window.confirm / window.alert on web, Alert.alert on native */
function xAlert(title: string, message: string, buttons?: Array<{ text: string; style?: string; onPress?: () => void }>) {
  if (!isWeb) {
    Alert.alert(title, message, buttons as any);
    return;
  }
  if (!buttons || buttons.length <= 1) {
    window.alert(message ? `${title}\n\n${message}` : title);
    buttons?.[0]?.onPress?.();
    return;
  }
  const cancelBtn = buttons.find(b => b.style === "cancel");
  const actionBtn = buttons.find(b => b.style !== "cancel") ?? buttons[buttons.length - 1];
  const confirmed = window.confirm(message ? `${title}\n\n${message}` : title);
  if (confirmed) {
    actionBtn?.onPress?.();
  } else {
    cancelBtn?.onPress?.();
  }
}

export default function PropertyUnitsScreen() {
  const { id, name, total_units, type: routeType } = useLocalSearchParams<{
    id: string; name: string; total_units: string; type: string;
  }>();
  const [propType, setPropType] = useState<PropertyType>((routeType as PropertyType) || "apartment");
  const { t, isRTL } = useLanguage();
  const { colors: C, shadow, isDark } = useTheme();
  const { user } = useAuth();
  const { isPro } = useSubscription();
  const insets = useSafeAreaInsets();
  const S = useMemo(() => styles(C, shadow, isRTL), [C, shadow, isRTL]);

  const totalUnits = parseInt(total_units ?? "0", 10);
  const [tenantMap, setTenantMap] = useState<TenantMap>({});
  const [labelMap, setLabelMap] = useState<LabelMap>({});
  const [loading, setLoading] = useState(true);
  const [propertyDocs, setPropertyDocs] = useState<VaultDocument[]>([]);
  const [showDocs, setShowDocs] = useState(false);

  // Property edit modal
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ name: name ?? "", type: "apartment", city: "alkharj", total_units: total_units ?? "1", floors: "1", monthly_income: "0", notes: "", sec_account: "", nwc_account: "", has_multiple_sec: false, has_multiple_nwc: false, latitude: null, longitude: null });
  const [editSaving, setEditSaving] = useState(false);
  const [propName, setPropName] = useState(name ?? "");
  // Bill counts for delete buttons
  const [propSecBillCount, setPropSecBillCount] = useState(0);
  const [propNwcBillCount, setPropNwcBillCount] = useState(0);
  const [unitSecBillCount, setUnitSecBillCount] = useState(0);
  const [unitNwcBillCount, setUnitNwcBillCount] = useState(0);

  // Multi-select + bulk payment
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const [bulkPayModal, setBulkPayModal] = useState(false);
  const [bulkPayDate, setBulkPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [bulkPayDateObj, setBulkPayDateObj] = useState(new Date());
  const [showBulkPayDatePicker, setShowBulkPayDatePicker] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const dismissAll = () => {
    Keyboard.dismiss();
    setShowBulkPayDatePicker(false);
  };

  // Close date pickers when keyboard opens
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      setShowBulkPayDatePicker(false);
    });
    return () => sub.remove();
  }, []);

  async function fetchPropertyDetails() {
    if (!id) return;
    const { data } = await supabase.from("properties").select("*").eq("id", id).single();
    if (data) {
      setPropName(data.name);
      if (data.type) setPropType(data.type as PropertyType);
      setEditForm({ name: data.name, type: data.type ?? "apartment", city: data.city ?? "alkharj", total_units: String(data.total_units ?? 1), floors: String(data.floors ?? 1), monthly_income: String(data.monthly_income ?? 0), notes: data.notes ?? "", sec_account: data.sec_account ?? "", nwc_account: data.nwc_account ?? "", has_multiple_sec: data.has_multiple_sec ?? false, has_multiple_nwc: data.has_multiple_nwc ?? false, latitude: data.latitude ?? null, longitude: data.longitude ?? null });
    }
  }

  // City name mapping: reverse-geocoded names → our city keys
  const CITY_ALIASES: Record<string, string> = {
    "riyadh": "riyadh", "الرياض": "riyadh", "riyad": "riyadh",
    "jeddah": "jeddah", "جدة": "jeddah", "jiddah": "jeddah", "jedda": "jeddah",
    "dammam": "dammam", "الدمام": "dammam", "ad dammam": "dammam",
    "alkharj": "alkharj", "الخرج": "alkharj", "al kharj": "alkharj", "al-kharj": "alkharj",
  };

  function matchCity(geocodedCity: string): string | null {
    const lower = geocodedCity.toLowerCase().trim();
    if (CITY_ALIASES[lower]) return CITY_ALIASES[lower];
    for (const [alias, key] of Object.entries(CITY_ALIASES)) {
      if (lower.includes(alias) || alias.includes(lower)) return key;
    }
    return null;
  }

  async function detectCityFromLocation() {
    try {
      if (isWeb) {
        // Web: use browser Geolocation API (no reverse geocoding)
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setEditForm((prev) => ({
              ...prev,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }));
          },
          () => { /* denied or error — user can pick city manually */ }
        );
        return;
      }
      const { status } = await Location!.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location!.getCurrentPositionAsync({ accuracy: Location!.Accuracy.Balanced });
      const [geo] = await Location!.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      if (geo) {
        const cityName = geo.city || geo.subregion || geo.region || "";
        const matched = matchCity(cityName);
        setEditForm((prev) => ({
          ...prev,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          city: matched ?? cityName,
        }));
      } else {
        setEditForm((prev) => ({ ...prev, latitude: loc.coords.latitude, longitude: loc.coords.longitude }));
      }
    } catch {
      // Silently fail — user can pick city manually
    }
  }

  async function fetchBillCount(type: "sec" | "nwc", account: string): Promise<number> {
    if (!account.trim()) return 0;
    const prefix = `${type}_${account.trim()}_`;
    const { count, error } = await supabase
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .like("bill_ref", `${prefix}%`);
    if (error) return 0;
    return count ?? 0;
  }

  async function deleteBillsForAccount(type: "sec" | "nwc", account: string, onDone: () => void) {
    if (!account.trim()) return;
    const prefix = `${type}_${account.trim()}_`;
    const label = type === "sec" ? t("electricity") ?? "Electricity" : t("water") ?? "Water";
    xAlert(
      t("delete") ?? "Delete",
      `${t("deleteBillsConfirm") ?? "Delete all"} ${label} ${t("bills") ?? "bills"}?`,
      [
        { text: t("cancel") ?? "Cancel", style: "cancel" },
        {
          text: t("delete") ?? "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("expenses")
              .delete()
              .like("bill_ref", `${prefix}%`);
            if (error) xAlert(t("error") ?? "Error", error.message);
            else onDone();
          },
        },
      ],
    );
  }

  async function savePropertyEdit() {
    if (!id) return;
    if (!editForm.name.trim()) { xAlert(t("error"), t("nameRequired") ?? "Name required"); return; }
    setEditSaving(true);
    const { error } = await supabase.from("properties").update({
      name: editForm.name.trim(), type: editForm.type, city: editForm.city,
      total_units: parseInt(editForm.total_units) || totalUnits,
      floors: parseInt(editForm.floors) || 1,
      monthly_income: parseFloat(editForm.monthly_income) || 0,
      notes: editForm.notes.trim() || null,
      latitude: editForm.latitude,
      longitude: editForm.longitude,
    }).eq("id", id);
    setEditSaving(false);
    if (error) { xAlert(t("error"), error.message); }
    else { setPropName(editForm.name.trim()); setEditModal(false); fetchData(); }
  }

  // Edit unit label modal
  const [editUnit, setEditUnit] = useState<number | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const [unitSecInput, setUnitSecInput] = useState("");
  const [unitNwcInput, setUnitNwcInput] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);
  const [unitAccountMap, setUnitAccountMap] = useState<UnitAccountMap>({});
  const [overdueUnits, setOverdueUnits] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [{ data: tenants }, { data: labels }, { data: payments }] = await Promise.all([
        supabase.from("tenants").select("id, name, unit_number, status, monthly_rent, lease_start, payment_frequency").eq("property_id", id),
        supabase.from("unit_labels").select("unit_number, label, sec_account, nwc_account").eq("property_id", id),
        supabase.from("payments").select("tenant_id, month_year, amount").eq("property_id", id),
      ]);
      const tMap: TenantMap = {};
      (tenants ?? []).forEach((t: any) => {
        if (!tMap[String(t.unit_number)] || t.status === "active") {
          tMap[String(t.unit_number)] = { id: t.id, name: t.name, status: t.status, monthly_rent: t.monthly_rent ?? 0, lease_start: t.lease_start ?? "", payment_frequency: t.payment_frequency };
        }
      });
      setTenantMap(tMap);
      const lMap: LabelMap = {};
      const uaMap: UnitAccountMap = {};
      (labels ?? []).forEach((l: any) => {
        lMap[String(l.unit_number)] = l.label;
        uaMap[String(l.unit_number)] = { sec_account: l.sec_account ?? "", nwc_account: l.nwc_account ?? "" };
      });
      setLabelMap(lMap);
      setUnitAccountMap(uaMap);
      // Compute overdue units — only fully paid tenants are excluded
      const now = new Date();
      const currentDay = now.getDate();
      const currentMonthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const paidByTenantMap = new Map<string, number>();
      (payments ?? []).filter((p: any) => p.month_year === currentMonthYear).forEach((p: any) => {
        paidByTenantMap.set(p.tenant_id, (paidByTenantMap.get(p.tenant_id) ?? 0) + (p.amount ?? 0));
      });
      const odu = new Set<string>();
      (tenants ?? []).forEach((tn: any) => {
        if (tn.status !== "active" || !tn.lease_start) return;
        const dueDay = new Date(tn.lease_start + "T12:00:00").getDate();
        const totalPaid = paidByTenantMap.get(tn.id) ?? 0;
        if (currentDay >= dueDay && totalPaid < (tn.monthly_rent ?? 0)) {
          odu.add(String(tn.unit_number));
        }
      });
      setOverdueUnits(odu);
    } catch (e) {
      if (__DEV__) console.error("fetchData error:", e);
      xAlert(t("error"), t("failedToLoadData"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { fetchData(); fetchPropertyDetails(); }, [fetchData]));

  // Load property documents (Pro only)
  useEffect(() => {
    if (!isPro || !user?.id || !id) return;
    getDocuments(user.id, { propertyId: id as string }).then(setPropertyDocs).catch(() => {});
  }, [isPro, user?.id, id]);

  const handleUnitPress = (unitNum: number) => {
    const key = String(unitNum);
    if (selectMode) {
      const tenant = tenantMap[key];
      if (!tenant || tenant.status !== "active") return;
      setSelectedUnits(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
      return;
    }
    const tenant = tenantMap[key];
    router.push({
      pathname: "/unit-detail",
      params: {
        propertyId: id, propertyName: name,
        unitNumber: key,
        tenantId: tenant?.id ?? "",
        unitLabel: labelMap[key] ?? "",
      },
    });
  };

  const handleBulkPayment = async () => {
    if (selectedUnits.size === 0 || !bulkPayDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      xAlert(t("error"), t("validDateFormat"));
      return;
    }
    setBulkSaving(true);
    try {
      const inserts = Array.from(selectedUnits)
        .filter(unitKey => tenantMap[unitKey]?.id && id)
        .map(unitKey => {
          const tn = tenantMap[unitKey];
          return {
            tenant_id: tn.id,
            property_id: id,
            amount: tn.monthly_rent,
            payment_date: bulkPayDate,
            month_year: getDuePeriodMonth(tn.lease_start || bulkPayDate, tn.payment_frequency, bulkPayDate),
          };
        });
      if (inserts.length === 0) {
        xAlert(t("error"), t("failedToLoadData"));
        setBulkSaving(false);
        return;
      }
      const { error } = await supabase.from("payments").insert(inserts);
      if (error) throw error;
      setBulkPayModal(false);
      setSelectMode(false);
      setSelectedUnits(new Set());
      fetchData();
      xAlert("✅", `${inserts.length} ${t("paymentsRecorded")}`);
    } catch (e: any) {
      xAlert(t("error"), e.message);
    } finally {
      setBulkSaving(false);
    }
  };

  function openEditLabel(unitNum: number) {
    const key = String(unitNum);
    setEditUnit(unitNum);
    setLabelInput(labelMap[key] ?? "");
  }

  async function saveLabel() {
    if (editUnit === null || !id) return;
    setSavingLabel(true);
    try {
      const unitKey = String(editUnit);
      const hasLabel = !!labelInput.trim();
      if (hasLabel) {
        const { error } = await supabase.from("unit_labels").upsert(
          {
            property_id: id,
            unit_number: unitKey,
            label: labelInput.trim() || null,
            user_id: user?.id,
          },
          { onConflict: "property_id,unit_number" }
        );
        if (error) {
          xAlert(t("error"), error.message);
          return;
        }
      } else {
        // Remove label if everything is empty
        const { error } = await supabase
          .from("unit_labels")
          .delete()
          .eq("property_id", id)
          .eq("unit_number", unitKey);
        if (error) {
          xAlert(t("error"), error.message);
          return;
        }
      }
      // Re-fetch from DB to ensure label is persisted correctly
      await fetchData();
    } catch (e: any) {
      xAlert(t("error"), e.message ?? "Failed to save label");
    } finally {
      setSavingLabel(false);
      setEditUnit(null);
    }
  }

  const occupiedCount = Object.values(tenantMap).filter((t) => t.status === "active").length;
  const vacantCount = totalUnits - occupiedCount;

  return (
    <View style={S.container}>
      {/* Header */}
      <View style={[S.header, { paddingTop: insets.top + 10 }]}>
        <View style={[S.headerRow, isRTL && S.headerRowRTL]}>
          {/* Back button */}
          <TouchableOpacity
            onPress={() => { if (selectMode) { setSelectMode(false); setSelectedUnits(new Set()); } else router.back(); }}
            style={S.backBtn}
          >
            <Text style={S.backArrow}>{isRTL ? "›" : "‹"}</Text>
          </TouchableOpacity>

          {/* Property type avatar */}
          {!selectMode && (
            <View style={[S.propAvatar, { backgroundColor: TYPE_COLORS[propType] + "18" }]}>
              <Text style={S.propAvatarIcon}>{TYPE_ICONS[propType] ?? "🏠"}</Text>
            </View>
          )}

          {/* Name + subtitle */}
          <View style={S.headerTextWrap}>
            <Text style={[S.headerTitle, isRTL && { textAlign: "right" }]} numberOfLines={1}>
              {selectMode
                ? `${selectedUnits.size} ${t("unitsSelected")}`
                : propName}
            </Text>
            <Text style={[S.headerSub, isRTL && { textAlign: "right" }]}>
              {selectMode
                ? t("tapOccupiedToSelect")
                : `${totalUnits} ${t("allUnits")}`}
            </Text>
          </View>

          {/* Edit property button */}
          {!selectMode && (
            <TouchableOpacity style={S.editPropBtn} onPress={() => { fetchPropertyDetails(); setEditModal(true); }}>
              <Text style={S.editPropBtnText}>✏️</Text>
            </TouchableOpacity>
          )}

          {/* Select / Cancel button */}
          <TouchableOpacity
            style={[S.selectBtn, selectMode && { borderColor: C.danger }]}
            onPress={() => { if (selectMode) { setSelectMode(false); setSelectedUnits(new Set()); } else setSelectMode(true); }}
          >
            <Text style={[S.selectBtnText, selectMode && { color: C.danger }]}>
              {selectMode ? "✕" : "☑️"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Select All — only in select mode */}
      {selectMode && (() => {
        const allActiveKeys = Object.entries(tenantMap).filter(([, t]) => t.status === "active").map(([k]) => k);
        const allSelected = selectedUnits.size === allActiveKeys.length;
        return (
          <TouchableOpacity
            style={S.selectAllBtn}
            onPress={() => {
              setSelectedUnits(allSelected ? new Set() : new Set(allActiveKeys));
            }}
          >
            <Text style={S.selectAllText}>
              {allSelected
                ? (t("deselectAll") ?? "Deselect All")
                : (t("selectAll") ?? "Select All")}
            </Text>
          </TouchableOpacity>
        );
      })()}

      {/* Summary bar */}
      <View style={S.summaryBar}>
        <View style={S.summaryItem}>
          <Text style={S.summaryNum}>{occupiedCount}</Text>
          <Text style={S.summaryLabel}>{t("occupied")}</Text>
        </View>
        <View style={S.summaryDivider} />
        <View style={S.summaryItem}>
          <Text style={[S.summaryNum, { color: C.accent }]}>{vacantCount}</Text>
          <Text style={S.summaryLabel}>{t("vacant")}</Text>
        </View>
        <View style={S.summaryDivider} />
        <View style={S.summaryItem}>
          <Text style={S.summaryNum}>{totalUnits}</Text>
          <Text style={S.summaryLabel}>{t("total")}</Text>
        </View>
      </View>

      {loading ? (
        <View style={S.center}><ActivityIndicator color={C.primary} size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={S.scrollContent} showsVerticalScrollIndicator={false}>
          {Array.from({ length: totalUnits }, (_, i) => i + 1).map((unitNum) => {
            const tenant = tenantMap[String(unitNum)];
            const isOccupied = !!tenant && tenant.status === "active";
            const isExpired = tenant?.status === "expired";
            const customLabel = labelMap[String(unitNum)];

            const isSelected = selectMode && selectedUnits.has(String(unitNum));
            return (
              <TouchableOpacity
                key={unitNum}
                style={[S.unitCard, isOccupied && S.unitCardOccupied, isSelected && S.unitCardSelected, overdueUnits.has(String(unitNum)) && S.unitCardOverdue]}
                onPress={() => handleUnitPress(unitNum)}
                activeOpacity={0.75}
              >
                {/* Unit badge */}
                <View style={[S.unitBadge, isOccupied ? S.unitBadgeOccupied : S.unitBadgeVacant]}>
                  <Text style={S.unitBadgeText}>{unitNum}</Text>
                </View>

                {/* Info */}
                <View style={S.unitInfo}>
                  <Text style={S.unitLabel}>
                    {customLabel || `${t("unit")} ${unitNum}`}
                  </Text>
                  {isOccupied ? (
                    <Text style={S.tenantName} numberOfLines={1}>{tenant.name}</Text>
                  ) : (
                    <Text style={S.vacantLabel}>{t("vacant")}</Text>
                  )}
                </View>

                {/* Select checkbox */}
                {selectMode && isOccupied && (
                  <View style={[S.checkCircle, isSelected && S.checkCircleActive]}>
                    {isSelected && <Text style={S.checkMark}>✓</Text>}
                  </View>
                )}

                {/* Edit label button — hidden in select mode */}
                <TouchableOpacity
                  style={[S.editLabelBtn, selectMode && { opacity: 0 }]}
                  onPress={() => !selectMode && openEditLabel(unitNum)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={S.editLabelIcon}>✏️</Text>
                </TouchableOpacity>

                {/* Status chip */}
                <View style={[S.statusChip,
                  isOccupied ? S.chipActive : isExpired ? S.chipExpired : S.chipVacant,
                  overdueUnits.has(String(unitNum)) && { backgroundColor: "rgba(245,158,11,0.15)", borderColor: "#F59E0B" }]}>
                  <Text style={[S.chipText,
                    isOccupied ? S.chipTextActive : isExpired ? S.chipTextExpired : S.chipTextVacant,
                    overdueUnits.has(String(unitNum)) && { color: "#F59E0B" }]}>
                    {overdueUnits.has(String(unitNum)) ? t("overdue") : isOccupied ? t("active") : isExpired ? t("expired") : t("vacant")}
                  </Text>
                </View>

                <Text style={S.chevron}>{isRTL ? "‹" : "›"}</Text>
              </TouchableOpacity>
            );
          })}
          {/* ── Documents Section (Pro) ── */}
          {isPro && (
            <View style={{ marginTop: 16, paddingHorizontal: spacing.md }}>
              <TouchableOpacity
                onPress={() => setShowDocs(!showDocs)}
                style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }, isRTL && { flexDirection: "row-reverse" }]}
              >
                <Text style={{ fontSize: 16, fontWeight: "700", color: C.text }}>
                  📁 {t("documents")} ({propertyDocs.length})
                </Text>
                <Ionicons name={showDocs ? "chevron-up" : "chevron-down"} size={18} color={C.textMuted} />
              </TouchableOpacity>
              {showDocs && (
                <View>
                  {propertyDocs.length === 0 ? (
                    <Text style={{ color: C.textMuted, fontSize: 13, textAlign: isRTL ? "right" : "left", paddingVertical: 8 }}>
                      {t("noDocuments")}
                    </Text>
                  ) : (
                    propertyDocs.map((doc) => (
                      <View key={doc.id} style={[{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border }, isRTL && { flexDirection: "row-reverse" }]}>
                        <Text style={{ fontSize: 20 }}>{DOC_TYPE_ICONS[doc.type as DocType] || "📄"}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: "600", color: C.text, textAlign: isRTL ? "right" : "left" }} numberOfLines={1}>{doc.name}</Text>
                          <Text style={{ fontSize: 11, color: C.textMuted, textAlign: isRTL ? "right" : "left" }}>{new Date(doc.created_at).toLocaleDateString(isRTL ? "ar-SA" : "en-US")}</Text>
                        </View>
                      </View>
                    ))
                  )}
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: "/vault", params: { propertyId: id } } as any)}
                    style={{ paddingVertical: 12, alignItems: "center" }}
                  >
                    <Text style={{ color: C.accent, fontWeight: "600", fontSize: 14 }}>
                      {t("addDocument")} →
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}

      {/* ── Bulk Payment Bar ── */}
      {selectMode && selectedUnits.size > 0 && (
        <View style={[S.bulkBar, isRTL && { flexDirection: "row-reverse" }]}>
          <View style={{ flex: 1 }}>
            <Text style={[S.bulkBarText, isRTL && { textAlign: "right" }]}>
              {`${selectedUnits.size} ${t("unitsSelectedCount")}`}
            </Text>
            <Text style={[S.bulkBarSub, isRTL && { textAlign: "right" }]}>
              {Array.from(selectedUnits).reduce((sum, key) => sum + (tenantMap[key]?.monthly_rent ?? 0), 0).toLocaleString()} {t("sar")}
            </Text>
          </View>
          <TouchableOpacity
            style={S.bulkPayBtn}
            onPress={() => { const now = new Date(); setBulkPayDate(now.toISOString().split("T")[0]); setBulkPayDateObj(now); setShowBulkPayDatePicker(false); setBulkPayModal(true); }}
          >
            <Text style={S.bulkPayBtnText}>💰 {t("collectPaymentTitle")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Bulk Payment Modal ── */}
      <Modal visible={bulkPayModal} animationType={isWeb ? "fade" : "slide"} transparent onRequestClose={() => setBulkPayModal(false)}>
        <ModalOverlay style={S.editModalOverlay} onDismiss={() => setBulkPayModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} {...webContentClickStop}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: "100%" }}>
            <View style={S.editModalBox}>
              <Text style={S.modalTitle}>{t("collectPaymentTitle")}</Text>

              <Text style={S.editFieldLabel}>{t("paymentDate")}</Text>
              {isWeb ? (
                <WebDateInput
                  value={bulkPayDate}
                  onChange={(val) => {
                    setBulkPayDate(val);
                    setBulkPayDateObj(new Date(val + "T12:00:00"));
                  }}
                  textColor={C.text}
                  backgroundColor={C.surfaceElevated}
                  borderColor={C.border}
                />
              ) : (
                <>
                  <TouchableOpacity
                    style={S.editInput}
                    onPress={() => setShowBulkPayDatePicker(true)}
                  >
                    <Text style={{ color: C.text, fontSize: 15 }}>📅 {bulkPayDate}</Text>
                  </TouchableOpacity>
                  {showBulkPayDatePicker && (
                    <>
                      <DateTimePicker
                        value={bulkPayDateObj}
                        mode="date"
                        display="spinner"
                        locale="en-US"
                        themeVariant={isDark ? "dark" : "light"}
                        onChange={(_: any, date: any) => {
                          if (date) {
                            setBulkPayDateObj(date);
                            setBulkPayDate(date.toISOString().split("T")[0]);
                          }
                        }}
                      />
                      <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowBulkPayDatePicker(false)}>
                        <Text style={S.pickerConfirmText}>✓</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}

              <Text style={S.editFieldLabel}>{t("selectedUnitsLabel")}</Text>
              {Array.from(selectedUnits).map(key => {
                const tn = tenantMap[key];
                return (
                  <View key={key} style={[S.bulkPreviewRow, isRTL && { flexDirection: "row-reverse" }]}>
                    <Text style={S.bulkPreviewUnit}>{t("unit")} {key}</Text>
                    <Text style={S.bulkPreviewName} numberOfLines={1}>{tn?.name}</Text>
                    <Text style={S.bulkPreviewAmount}>{tn?.monthly_rent.toLocaleString()} {t("sar")}</Text>
                  </View>
                );
              })}

              <View style={[S.bulkPreviewRow, S.bulkTotalRow, isRTL && { flexDirection: "row-reverse" }]}>
                <Text style={[S.bulkPreviewUnit, { fontWeight: "700", color: C.text }]}>{t("total")}</Text>
                <Text style={{ flex: 1 }} />
                <Text style={[S.bulkPreviewAmount, { fontWeight: "700", color: C.accent, fontSize: 15 }]}>
                  {Array.from(selectedUnits).reduce((sum, k) => sum + (tenantMap[k]?.monthly_rent ?? 0), 0).toLocaleString()} {t("sar")}
                </Text>
              </View>

              <View style={[S.modalActions, { marginTop: 20 }]}>
                <TouchableOpacity style={S.cancelBtn} onPress={() => setBulkPayModal(false)}>
                  <Text style={S.cancelBtnText}>{t("cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.saveBtn, bulkSaving && { opacity: 0.6 }]}
                  onPress={handleBulkPayment}
                  disabled={bulkSaving}
                >
                  {bulkSaving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={S.saveBtnText}>{t("confirm")}</Text>}
                </TouchableOpacity>
              </View>
            </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </ModalOverlay>
      </Modal>

      {/* ── Edit Label Modal ── */}
      <Modal visible={editUnit !== null} animationType="fade" transparent onRequestClose={() => setEditUnit(null)}>
        <ModalOverlay style={S.modalOverlay} onDismiss={() => setEditUnit(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} {...webContentClickStop}>
          <View style={S.modalBox}>
            <Text style={S.modalTitle}>{t("unit")} {editUnit} — {t("editLabel")}</Text>
            <TextInput
              style={S.labelInput}
              value={labelInput}
              onChangeText={setLabelInput}
              placeholder={`e.g. Shop 1, Apt A, Studio...`}
              placeholderTextColor={C.textMuted}
              textAlign={isRTL ? "right" : "left"}
              autoFocus
            />
            <Text style={S.labelHint}>{t("labelHint")}</Text>
            <View style={S.modalActions}>
              <TouchableOpacity style={S.cancelBtn} onPress={() => setEditUnit(null)}>
                <Text style={S.cancelBtnText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.saveBtn, savingLabel && { opacity: 0.6 }]}
                onPress={saveLabel} disabled={savingLabel}
              >
                {savingLabel
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={S.saveBtnText}>{t("save")}</Text>}
              </TouchableOpacity>
            </View>
          </View>
          </KeyboardAvoidingView>
        </ModalOverlay>
      </Modal>

      {/* ── Edit Property Modal ── */}
      <Modal visible={editModal} animationType={isWeb ? "fade" : "slide"} transparent onRequestClose={() => setEditModal(false)}>
        <ModalOverlay style={S.editModalOverlay} onDismiss={() => { dismissAll(); setEditModal(false); }}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ maxHeight: "90%" }} {...webContentClickStop}>
            <ScrollView keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={true}>
              <View style={S.editModalBox}>
                <Text style={S.modalTitle}>{t("editProperty")}</Text>

                {/* Property Name */}
                <Text style={S.editFieldLabel}>{t("propertyName")}</Text>
                <TextInput
                  style={S.editInput}
                  value={editForm.name}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, name: v }))}
                  placeholder={t("propertyName")}
                  placeholderTextColor={C.textMuted}
                  textAlign={isRTL ? "right" : "left"}
                />

                {/* Type */}
                <Text style={S.editFieldLabel}>{t("type")}</Text>
                <View style={[S.editSegRow, isRTL && { flexDirection: "row-reverse" }]}>
                  {(["apartment", "villa", "commercial"] as PropertyType[]).map((pt) => (
                    <TouchableOpacity
                      key={pt}
                      style={[S.editSeg, editForm.type === pt && { backgroundColor: TYPE_COLORS[pt], borderColor: TYPE_COLORS[pt] }]}
                      onPress={() => setEditForm((f) => ({ ...f, type: pt }))}
                    >
                      <Text style={S.editSegIcon}>{TYPE_ICONS[pt]}</Text>
                      <Text style={[S.editSegText, editForm.type === pt && { color: "#fff" }]}>{t(pt as any)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* City */}
                <Text style={S.editFieldLabel}>{t("city")}</Text>
                <View style={[S.editSegRow, isRTL && { flexDirection: "row-reverse" }]}>
                  {CITIES.map((ct) => (
                    <TouchableOpacity
                      key={ct}
                      style={[S.editSeg, editForm.city === ct && { backgroundColor: C.primary, borderColor: C.primary }]}
                      onPress={() => setEditForm((f) => ({ ...f, city: ct }))}
                    >
                      <Text style={[S.editSegText, editForm.city === ct && { color: "#fff" }]}>{t(ct as any)}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[S.editSeg, !CITIES.includes(editForm.city) && { backgroundColor: C.primary, borderColor: C.primary }]}
                    onPress={() => setEditForm((f) => ({ ...f, city: "" }))}
                  >
                    <Text style={[S.editSegText, !CITIES.includes(editForm.city) && { color: "#fff" }]}>{t("otherCity")}</Text>
                  </TouchableOpacity>
                </View>
                {!CITIES.includes(editForm.city) && (
                  <TextInput
                    style={S.editInput}
                    placeholder={t("city")} placeholderTextColor={C.textMuted}
                    value={editForm.city}
                    onChangeText={(v) => setEditForm((f) => ({ ...f, city: v }))}
                    textAlign={isRTL ? "right" : "left"}
                  />
                )}

                {/* Units & Floors */}
                <View style={[S.editRow2, isRTL && { flexDirection: "row-reverse" }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={S.editFieldLabel}>{t("totalUnits")}</Text>
                    <TextInput
                      style={S.editInput}
                      value={editForm.total_units}
                      onChangeText={(v) => setEditForm((f) => ({ ...f, total_units: v }))}
                      keyboardType="numeric"
                      textAlign={isRTL ? "right" : "left"}
                      placeholderTextColor={C.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.editFieldLabel}>{t("floorCount")}</Text>
                    <TextInput
                      style={S.editInput}
                      value={editForm.floors}
                      onChangeText={(v) => setEditForm((f) => ({ ...f, floors: v }))}
                      keyboardType="numeric"
                      textAlign={isRTL ? "right" : "left"}
                      placeholderTextColor={C.textMuted}
                    />
                  </View>
                </View>

                {/* Annual Expected Income */}
                <Text style={S.editFieldLabel}>{t("monthlyIncome2")}</Text>
                <TextInput
                  style={S.editInput}
                  value={editForm.monthly_income}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, monthly_income: v }))}
                  keyboardType="numeric"
                  textAlign={isRTL ? "right" : "left"}
                  placeholderTextColor={C.textMuted}
                />

                {/* Notes */}
                <Text style={S.editFieldLabel}>{t("notes")}</Text>
                <TextInput
                  style={[S.editInput, { height: 72, textAlignVertical: "top" }]}
                  value={editForm.notes}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, notes: v }))}
                  multiline
                  placeholder={t("notesPlaceholder")}
                  placeholderTextColor={C.textMuted}
                  textAlign={isRTL ? "right" : "left"}
                />

                {/* Buttons */}
                <View style={[S.modalActions, { marginTop: 20 }]}>
                  <TouchableOpacity style={S.cancelBtn} onPress={() => setEditModal(false)}>
                    <Text style={S.cancelBtnText}>{t("cancel")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[S.saveBtn, editSaving && { opacity: 0.6 }]}
                    onPress={savePropertyEdit}
                    disabled={editSaving}
                  >
                    {editSaving
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={S.saveBtnText}>{t("save")}</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </ModalOverlay>
      </Modal>
    </View>
  );
}

const styles = (C: any, shadow: any, isRTL: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { paddingBottom: 16, paddingHorizontal: spacing.md, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerRowRTL: { flexDirection: "row-reverse" },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceElevated, alignItems: "center", justifyContent: "center" },
  backArrow: { fontSize: 22, color: C.primary, fontWeight: "700" },
  propAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  propAvatarIcon: { fontSize: 22 },
  headerTextWrap: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: C.text },
  headerSub: { fontSize: 13, color: C.textMuted, marginTop: 2 },
  summaryBar: { flexDirection: "row", backgroundColor: C.surface, paddingVertical: 14, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 8 },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryNum: { fontSize: 20, fontWeight: "700", color: C.text },
  summaryLabel: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: C.border, marginVertical: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrollContent: { paddingHorizontal: spacing.md, paddingTop: 8 },
  unitCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: radii.md, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border, ...shadow },
  unitCardOccupied: { borderColor: "rgba(2,132,199,0.25)" },
  unitBadge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: isRTL ? 0 : 14, marginLeft: isRTL ? 14 : 0 },
  unitBadgeOccupied: { backgroundColor: "rgba(2,132,199,0.15)" },
  unitBadgeVacant: { backgroundColor: C.surfaceElevated },
  unitBadgeText: { fontSize: 15, fontWeight: "700", color: C.text },
  unitInfo: { flex: 1 },
  unitLabel: { fontSize: 13, color: C.textMuted },
  tenantName: { fontSize: 16, fontWeight: "600", color: C.text, marginTop: 2 },
  vacantLabel: { fontSize: 15, fontWeight: "500", color: C.textMuted, marginTop: 2 },
  editLabelBtn: { padding: 6, marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 },
  editLabelIcon: { fontSize: 14 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 },
  chipActive: { backgroundColor: "rgba(13,148,136,0.15)" },
  chipExpired: { backgroundColor: "rgba(220,38,38,0.12)" },
  chipVacant: { backgroundColor: C.surfaceElevated },
  chipText: { fontSize: 11, fontWeight: "600" },
  chipTextActive: { color: C.accent },
  chipTextExpired: { color: C.danger },
  chipTextVacant: { color: C.textMuted },
  chevron: { fontSize: 18, color: C.textMuted },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", paddingHorizontal: spacing.lg, ...(Platform.OS === "web" ? { alignItems: "center", backdropFilter: 'blur(8px)' } as any : {}) },
  modalBox: { backgroundColor: C.surface, borderRadius: radii.lg, padding: spacing.lg, ...shadow, ...(Platform.OS === "web" ? { maxWidth: 480, width: "100%", boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', zIndex: 1 } as any : {}) },
  modalTitle: { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 16 },
  labelInput: { backgroundColor: C.surfaceElevated, borderRadius: radii.sm, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 15, marginBottom: 8 },
  labelHint: { fontSize: 12, color: C.textMuted, marginBottom: 20 },
  modalActions: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: radii.md, paddingVertical: 14, alignItems: "center" },
  cancelBtnText: { color: C.textMuted, fontWeight: "600", fontSize: 15 },
  saveBtn: { flex: 1, backgroundColor: C.primary, borderRadius: radii.md, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  // Edit Property button in header
  editPropBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.surfaceElevated, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  editPropBtnText: { fontSize: 14 },
  // Select button in header
  selectBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surfaceElevated, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  selectBtnText: { fontSize: 15, color: C.text },
  // Unit card selected state
  unitCardSelected: { borderColor: C.accent, backgroundColor: C.accent + "10" },
  unitCardOverdue: { borderColor: "#F59E0B", borderWidth: 1.5 },
  selectAllBtn: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 16, marginBottom: 4 },
  selectAllText: { fontSize: 13, fontWeight: "600", color: C.primary },
  // Checkbox
  checkCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.border, backgroundColor: C.background, alignItems: "center", justifyContent: "center", marginRight: isRTL ? 0 : 6, marginLeft: isRTL ? 6 : 0 },
  checkCircleActive: { backgroundColor: C.accent, borderColor: C.accent },
  checkMark: { color: "#fff", fontSize: 13, fontWeight: "700", lineHeight: 16 },
  // Bulk payment bar
  bulkBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.surface, paddingHorizontal: spacing.md, paddingTop: 14, paddingBottom: 28, borderTopWidth: 1, borderTopColor: C.border, ...shadow },
  bulkBarText: { fontSize: 14, fontWeight: "700", color: C.text },
  bulkBarSub: { fontSize: 12, color: C.accent, marginTop: 2 },
  bulkPayBtn: { backgroundColor: C.accent, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 12 },
  bulkPayBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  // Bulk payment preview
  bulkPreviewRow: { flexDirection: "row", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border },
  bulkTotalRow: { borderBottomWidth: 0, marginTop: 4, paddingTop: 10 },
  bulkPreviewUnit: { fontSize: 12, color: C.textMuted, width: 60 },
  bulkPreviewName: { flex: 1, fontSize: 14, fontWeight: "600", color: C.text, marginHorizontal: 4 },
  bulkPreviewAmount: { fontSize: 13, fontWeight: "600", color: C.accent },
  // Edit Property modal
  editModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", ...(Platform.OS === "web" ? { justifyContent: "center", paddingHorizontal: 16, backdropFilter: 'blur(8px)' } as any : {}) },
  editModalBox: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 40, ...(Platform.OS === "web" ? { borderRadius: 20, maxWidth: 560, width: "100%", alignSelf: "center" as any, paddingBottom: spacing.lg, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', zIndex: 1 } as any : {}) },
  editFieldLabel: { fontSize: 12, color: C.textMuted, marginBottom: 6, marginTop: 14 },
  editInput: { backgroundColor: C.surfaceElevated, borderRadius: radii.sm, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, color: C.text, fontSize: 15 },
  pickerConfirm: {
    alignSelf: "center", backgroundColor: C.accent, borderRadius: 20,
    width: 40, height: 40, alignItems: "center", justifyContent: "center", marginTop: 4, marginBottom: 8,
  },
  pickerConfirmText: { color: "#fff", fontSize: 20, fontWeight: "700" as const },
  editSegRow: { flexDirection: "row", gap: 6, marginBottom: 2 },
  editSeg: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radii.sm, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceElevated, gap: 2 },
  editSegIcon: { fontSize: 16 },
  editSegText: { fontSize: 10, fontWeight: "600", color: C.textMuted },
  editRow2: { flexDirection: "row", gap: 12 },
  hintText: { fontSize: 12, color: C.textMuted, fontStyle: "italic", marginBottom: 10, paddingHorizontal: 4, marginTop: 6 },
  unitAccountLabel: { fontSize: 13, fontWeight: "600", color: C.text, marginTop: 12, marginBottom: 6 },
  deleteBillsBtn: { marginTop: 6, marginBottom: 4, alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: "rgba(220,38,38,0.1)" },
  deleteBillsText: { fontSize: 13, fontWeight: "600", color: "#DC2626" },
});
