import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity,
  TouchableWithoutFeedback, View,
} from "react-native";
import { router } from "expo-router";
// expo-location: use native module on mobile, browser API on web
const isWeb = Platform.OS === "web";
let Location: typeof import("expo-location") | null = null;
if (!isWeb) {
  Location = require("expo-location");
}
import * as offlineDb from "../../lib/offlineDb";
import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { SwipeableRow, SwipeableRowRef } from "../../components/SwipeableRow";
import { SkeletonList } from "../../components/SkeletonLoader";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { userKey, PERSONAL_INFO_KEY } from "../../lib/storage";
import { spacing, radii } from "../../constants/theme";
import { useSubscription, FREE_LIMITS } from "../../context/SubscriptionContext";
import WebContainer, { useResponsive } from "../../components/WebContainer";
import { modalBackdropStyle, ModalOverlay, webContentClickStop } from "../../components/WebDateInput";
import { useNetwork } from "../../context/NetworkContext";

type PropertyType = "apartment" | "villa" | "commercial" | "shop";
const CITIES = ["alkharj", "riyadh", "jeddah", "dammam"];

interface Property {
  id: string; name: string; type: PropertyType; city: string;
  total_units: number; floors: number; monthly_income: number; notes?: string;
  sec_account?: string; nwc_account?: string;
  has_multiple_sec?: boolean; has_multiple_nwc?: boolean;
  latitude?: number | null; longitude?: number | null;
  owner_name?: string; owner_phone?: string;
}

type FormState = {
  name: string; type: PropertyType; city: string;
  total_units: string; floors: string; monthly_income: string; notes: string;
  sec_account: string; nwc_account: string;
  has_multiple_sec: boolean; has_multiple_nwc: boolean;
  latitude: number | null; longitude: number | null;
  owner_name: string; owner_phone: string;
};

const EMPTY_FORM: FormState = {
  name: "", type: "apartment", city: "alkharj",
  total_units: "", floors: "", monthly_income: "", notes: "",
  sec_account: "", nwc_account: "",
  has_multiple_sec: false, has_multiple_nwc: false,
  latitude: null, longitude: null,
  owner_name: "", owner_phone: "",
};

const TYPE_COLORS: Record<PropertyType, string> = {
  apartment: "#0EA5E9", villa: "#14B8A6", commercial: "#F59E0B", shop: "#A855F7",
};
const TYPE_ICONS: Record<PropertyType, string> = {
  apartment: "🏢", villa: "🏡", commercial: "🏗️", shop: "🛍️",
};

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
  // Find the destructive / non-cancel action
  const cancelBtn = buttons.find(b => b.style === "cancel");
  const actionBtn = buttons.find(b => b.style !== "cancel") ?? buttons[buttons.length - 1];
  const confirmed = window.confirm(message ? `${title}\n\n${message}` : title);
  if (confirmed) {
    actionBtn?.onPress?.();
  } else {
    cancelBtn?.onPress?.();
  }
}

export default function PropertiesScreen() {
  const { t, isRTL } = useLanguage();
  const { colors: C, shadow } = useTheme();
  const { user } = useAuth();
  const { canAddProperty, canAddUnits } = useSubscription();
  const { isDesktop, isWide } = useResponsive();
  const insets = useSafeAreaInsets();
  const uid = user?.id ?? "";
  const S = useMemo(() => styles(C, shadow, isRTL), [C, shadow, isRTL]);
  const { refreshPendingCount } = useNetwork();

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const swipeRefs = useRef<Map<string, SwipeableRowRef | null>>(new Map());
  const openSwipeId = useRef<string | null>(null);

  // Add modal
  const [addVisible, setAddVisible] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editVisible, setEditVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Property | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);

  const [addPropErrors, setAddPropErrors] = useState<Record<string, string>>({});
  const [editPropErrors, setEditPropErrors] = useState<Record<string, string>>({});
  const [tenantIncomeByProp, setTenantIncomeByProp] = useState<Record<string, number>>({});

  const [defaultCity, setDefaultCity] = useState("alkharj");

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
    // Partial match
    for (const [alias, key] of Object.entries(CITY_ALIASES)) {
      if (lower.includes(alias) || alias.includes(lower)) return key;
    }
    return null;
  }

  async function detectCityFromLocation(setFormFn: (fn: (prev: FormState) => FormState) => void) {
    try {
      if (isWeb) {
        // Web: use browser Geolocation API (no reverse geocoding)
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setFormFn((prev) => ({
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
        setFormFn((prev) => ({
          ...prev,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          city: matched ?? cityName,
        }));
      } else {
        setFormFn((prev) => ({ ...prev, latitude: loc.coords.latitude, longitude: loc.coords.longitude }));
      }
    } catch {
      // Silently fail — user can pick city manually
    }
  }

  useEffect(() => {
    if (!uid) return;
    AsyncStorage.getItem(userKey(uid, PERSONAL_INFO_KEY)).then((raw) => {
      if (raw) {
        try { const info = JSON.parse(raw); if (info.city) setDefaultCity(info.city); } catch {}
      }
    });
  }, [uid]);

  useEffect(() => { if (uid) fetchProperties(); }, [uid]);

  async function fetchProperties() {
    if (!uid) return;
    setLoading(true);
    try {
      const [{ data: propData }, { data: tenantData }] = await Promise.all([
        offlineDb.select("properties", { userId: uid, order: { column: "created_at", ascending: false } }),
        offlineDb.select("tenants", { userId: uid, columns: "property_id,monthly_rent", eq: { status: "active" } }),
      ]);
      if (propData) setProperties(propData as Property[]);
      // Build income map from active tenant rents
      const incMap: Record<string, number> = {};
      for (const tn of ((tenantData as any[]) ?? [])) {
        if (tn.property_id) {
          incMap[tn.property_id] = (incMap[tn.property_id] ?? 0) + (tn.monthly_rent ?? 0);
        }
      }
      setTenantIncomeByProp(incMap);
    } catch (e) {
      if (__DEV__) console.error("fetchProperties error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function addProperty() {
    const errors: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length < 2) {
      errors.name = t("validationPropertyNameShort");
    }
    const units = parseInt(form.total_units);
    if (form.total_units && (isNaN(units) || units < 1)) {
      errors.units = t("validationUnitsRequired");
    } else if (units > 500) {
      errors.units = t("validationUnitsMax");
    } else if (!canAddUnits(units)) {
      errors.units = t("unitLimitMsg");
    }
    const floors = parseInt(form.floors);
    if (form.floors && floors > 100) {
      errors.floors = t("validationFloorsMax");
    }
    const income = parseFloat(form.monthly_income);
    if (form.monthly_income && income > 9999999) {
      errors.income = t("validationAmountTooHigh");
    }
    setAddPropErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    const { error } = await offlineDb.insert("properties", uid, {
      name: form.name.trim(), type: form.type, city: form.city,
      total_units: parseInt(form.total_units) || 1,
      floors: parseInt(form.floors) || 1,
      monthly_income: parseFloat(form.monthly_income) || 0,
      notes: form.notes.trim() || null,
      sec_account: form.has_multiple_sec ? null : (form.sec_account.trim() || null),
      nwc_account: form.has_multiple_nwc ? null : (form.nwc_account.trim() || null),
      has_multiple_sec: form.has_multiple_sec,
      has_multiple_nwc: form.has_multiple_nwc,
      latitude: form.latitude,
      longitude: form.longitude,
      owner_name: form.owner_name.trim() || null,
      owner_phone: form.owner_phone.trim() || null,
    });
    setSaving(false);
    if (error) { xAlert(t("error"), error.message); }
    else {
      setAddVisible(false);
      setForm(EMPTY_FORM);
      refreshPendingCount();
      fetchProperties();
    }
  }

  function openEdit(p: Property) {
    setEditTarget(p);
    setEditPropErrors({});
    setEditForm({
      name: p.name, type: p.type, city: p.city ?? "alkharj",
      total_units: String(p.total_units), floors: String(p.floors),
      monthly_income: String(p.monthly_income), notes: p.notes ?? "",
      sec_account: p.sec_account ?? "", nwc_account: p.nwc_account ?? "",
      has_multiple_sec: p.has_multiple_sec ?? false, has_multiple_nwc: p.has_multiple_nwc ?? false,
      latitude: p.latitude ?? null, longitude: p.longitude ?? null,
      owner_name: p.owner_name ?? "", owner_phone: p.owner_phone ?? "",
    });
    setEditVisible(true);
  }

  async function saveEdit() {
    const errors: Record<string, string> = {};
    if (!editTarget) return;
    if (!editForm.name.trim() || editForm.name.trim().length < 2) {
      errors.name = t("validationPropertyNameShort");
    }
    const units = parseInt(editForm.total_units);
    if (editForm.total_units && (isNaN(units) || units < 1)) {
      errors.units = t("validationUnitsRequired");
    } else if (units > 500) {
      errors.units = t("validationUnitsMax");
    } else if (!canAddUnits(units)) {
      errors.units = t("unitLimitMsg");
    }
    const floors = parseInt(editForm.floors);
    if (editForm.floors && floors > 100) {
      errors.floors = t("validationFloorsMax");
    }
    const income = parseFloat(editForm.monthly_income);
    if (editForm.monthly_income && income > 9999999) {
      errors.income = t("validationAmountTooHigh");
    }
    setEditPropErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setEditSaving(true);
    const { error } = await offlineDb.update(
      "properties",
      uid,
      { id: editTarget.id },
      {
        name: editForm.name.trim(), type: editForm.type, city: editForm.city,
        total_units: parseInt(editForm.total_units) || editTarget.total_units,
        floors: parseInt(editForm.floors) || editTarget.floors,
        monthly_income: parseFloat(editForm.monthly_income) || editTarget.monthly_income,
        notes: editForm.notes.trim() || null,
        sec_account: editForm.has_multiple_sec ? null : (editForm.sec_account.trim() || null),
        nwc_account: editForm.has_multiple_nwc ? null : (editForm.nwc_account.trim() || null),
        has_multiple_sec: editForm.has_multiple_sec,
        has_multiple_nwc: editForm.has_multiple_nwc,
        latitude: editForm.latitude,
        longitude: editForm.longitude,
        owner_name: editForm.owner_name.trim() || null,
        owner_phone: editForm.owner_phone.trim() || null,
      }
    );
    setEditSaving(false);
    if (error) { xAlert(t("error"), error.message); }
    else {
      setEditVisible(false);
      setEditTarget(null);
      refreshPendingCount();
      fetchProperties();
    }
  }

  function confirmDelete(p: Property) {
    xAlert(
      t("deletePropertyTitle"),
      `${t("delete")} "${p.name}"? ${t("deletePropertyMsg")}`,
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"), style: "destructive", onPress: async () => {
            // Set tenants to expired instead of deleting them
            await offlineDb.update("tenants", uid, { property_id: p.id }, { status: "expired" });
            const { error } = await offlineDb.del("properties", uid, { id: p.id });
            if (error) xAlert(t("error"), error.message);
            else {
              refreshPendingCount();
              fetchProperties();
            }
          },
        },
      ]
    );
  }

  const displayedProperties = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter((p) => p.name.toLowerCase().includes(q));
  }, [properties, searchQuery]);

  const totalUnits = properties.reduce((s, p) => s + p.total_units, 0);
  const getAnnualIncome = (p: Property) => p.monthly_income ? p.monthly_income : (tenantIncomeByProp[p.id] ?? 0) * 12;
  const totalIncome = properties.reduce((s, p) => s + getAnnualIncome(p), 0);

  if (isWeb) {
    return renderContent();
  }
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {renderContent()}
    </TouchableWithoutFeedback>
  );

  function renderContent() {
  return (
      <View style={S.container}>
        <WebContainer maxWidth={1200}>
        <View style={[S.header, { paddingTop: insets.top + 10 }, isRTL && S.rowRev]}>
          <Text style={S.headerTitle}>{t("properties")}</Text>
          <TouchableOpacity style={S.addBtn} onPress={() => { if (!canAddProperty(properties.length)) { xAlert(t("propertyLimitTitle"), t("propertyLimitMsg"), [{ text: t("upgrade"), onPress: () => router.push("/paywall" as any) }, { text: t("later"), style: "cancel" }]); return; } const f = { ...EMPTY_FORM, city: defaultCity }; setForm(f); setAddPropErrors({}); setAddVisible(true); if (!isWeb) { detectCityFromLocation(setForm); } }} accessibilityRole="button" accessibilityLabel={t("addProperty")}>
            <Text style={S.addBtnText}>+ {t("add")}</Text>
          </TouchableOpacity>
        </View>

        <View style={S.searchBar}>
          <Text style={S.searchIcon}>🔍</Text>
          <TextInput
            style={[S.searchInput, isRTL && { textAlign: "right" }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t("searchProperties")}
            placeholderTextColor={C.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel={t("searchProperties")}
            accessibilityRole="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} style={S.searchClearBtn} accessibilityRole="button" accessibilityLabel={isRTL ? "مسح البحث" : "Clear search"}>
              <Text style={S.searchClearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[S.summaryRow, isRTL && S.rowRev]}>
          {[
            { val: properties.length, lbl: t("properties") },
            { val: totalUnits, lbl: t("totalUnits") },
            { val: totalIncome.toLocaleString(), lbl: `${t("sar")}/${t("perYear")}` },
          ].map((item) => (
            <View key={item.lbl} style={S.summaryCard}>
              <Text style={S.summaryVal}>{item.val}</Text>
              <Text style={S.summaryLbl}>{item.lbl}</Text>
            </View>
          ))}
        </View>

        {loading ? (
          <SkeletonList count={5} />
        ) : (
          <ScrollView
            contentContainerStyle={S.listContent}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => {
              if (openSwipeId.current) {
                swipeRefs.current.get(openSwipeId.current)?.close();
                openSwipeId.current = null;
              }
            }}
          >
            {displayedProperties.length === 0 && (
              <Text style={S.emptyText}>{searchQuery ? t("noResults") : t("noProperties")}</Text>
            )}
            <View style={isDesktop ? [{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 12 }] : {}}>
            {displayedProperties.map((p) => (
              <View key={p.id} style={isWide ? { width: "31.5%" } : isDesktop ? { width: "48%" } : { width: "100%" }}>
              <SwipeableRow
                ref={(r) => { swipeRefs.current.set(p.id, r); }}
                isRTL={isRTL}
                onEdit={() => openEdit(p)}
                onDelete={() => confirmDelete(p)}
                editLabel={t("edit") ?? "Edit"}
                deleteLabel={t("delete") ?? "Delete"}
                borderRadius={radii.lg}
                onSwipeOpen={() => {
                  if (openSwipeId.current && openSwipeId.current !== p.id) {
                    swipeRefs.current.get(openSwipeId.current)?.close();
                  }
                  openSwipeId.current = p.id;
                }}
                onSwipeClose={() => {
                  if (openSwipeId.current === p.id) openSwipeId.current = null;
                }}
              >
                <Pressable
                  style={({ hovered }: any) => [S.card, isDesktop && S.cardDesktop, hovered && Platform.OS === 'web' && S.cardHover]}
                  onPress={() => router.push({
                    pathname: `/property/${p.id}` as any,
                    params: { name: p.name, total_units: p.total_units, type: p.type },
                  })}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.name}, ${t(p.type as any)}, ${p.total_units} ${t("units")}, ${getAnnualIncome(p).toLocaleString()} ${t("sar")}/${t("perYear")}`}
                  accessibilityHint={t("tapToViewUnits")}
                >
                  <View style={[S.cardHeader, isRTL && S.rowRev]}>
                    <Text style={[S.cardIcon, isDesktop && { fontSize: 30 }]}>{TYPE_ICONS[p.type] ?? "🏠"}</Text>
                    <View style={{ flex: 1, marginHorizontal: 8 }}>
                      <Text style={[S.cardName, isRTL && { textAlign: "right" }, isDesktop && { fontSize: 16 }]}>{p.name}</Text>
                      <Text style={[S.cardCity, isRTL && { textAlign: "right" }]}>{p.city}</Text>
                      {!!p.owner_name && (
                        <Text style={[S.cardCity, isRTL && { textAlign: "right" }, { marginTop: 1 }]} numberOfLines={1}>
                          {isRTL ? `\u{1F464} ${t("owner") ?? "المالك"}: ${p.owner_name}` : `\u{1F464} Owner: ${p.owner_name}`}
                        </Text>
                      )}
                      {!!p.notes && (
                        <Text style={[S.cardNotes, isRTL && { textAlign: "right" }]} numberOfLines={1}>
                          📝 {p.notes}
                        </Text>
                      )}
                    </View>
                    <View style={[S.badge, { backgroundColor: TYPE_COLORS[p.type] ?? C.primary }]}>
                      <Text style={S.badgeText}>{t(p.type as any)}</Text>
                    </View>
                  </View>
                  <View style={S.divider} />
                  <View style={[S.cardStats, isRTL && S.rowRev]}>
                    <Text style={S.statText}>🏠 {p.total_units} {t("units")}</Text>
                    <Text style={S.statText}>🏗 {p.floors} {t("floors")}</Text>
                    <Text style={S.incomeText}>{getAnnualIncome(p).toLocaleString()} {t("sar")}/{t("perYear")}</Text>
                  </View>
                  <Text style={[S.viewHint, isRTL && { textAlign: "right" }, { marginTop: 8 }]}>
                    {isRTL ? `‹ ${t("tapToViewUnits")}` : `${t("tapToViewUnits")} ›`}
                  </Text>
                </Pressable>
              </SwipeableRow>
              </View>
            ))}
            </View>
            <View style={{ height: 100 }} />
          </ScrollView>
        )}
        </WebContainer>

        {/* ── Add Modal ── */}
        <Modal visible={addVisible} animationType={Platform.OS === 'web' ? 'fade' : 'slide'} transparent onRequestClose={() => setAddVisible(false)}>
          <ModalOverlay style={S.modalOverlay} onDismiss={() => setAddVisible(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ maxHeight: "90%" }} {...webContentClickStop}>
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={true}>
                <View style={S.modalBox}>
                  <Text style={S.modalTitle}>{t("addProperty")}</Text>
                  <TextInput style={[S.input, isRTL && { textAlign: "right" }, !!addPropErrors.name && S.inputError]}
                    placeholder={t("propertyName")} placeholderTextColor={C.textMuted}
                    returnKeyType="done" value={form.name}
                    onChangeText={(v) => { setForm({ ...form, name: v }); setAddPropErrors((e) => ({ ...e, name: v.trim().length > 0 && v.trim().length < 2 ? t("validationPropertyNameShort") : "" })); }} />
                  {!!addPropErrors.name && <Text style={S.fieldError}>{addPropErrors.name}</Text>}
                  <Text style={S.fieldLabel}>{t("type")}</Text>
                  <View style={[S.segRow, isRTL && S.rowRev]}>
                    {(["apartment", "villa", "commercial"] as PropertyType[]).map((tp) => (
                      <TouchableOpacity key={tp}
                        style={[S.seg, form.type === tp && { backgroundColor: TYPE_COLORS[tp] }]}
                        onPress={() => setForm({ ...form, type: tp })}>
                        <Text style={[S.segText, form.type === tp && { color: "#fff" }]}>
                          {TYPE_ICONS[tp]} {t(tp as any)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={S.fieldLabel}>{t("city")}</Text>
                  <View style={[S.segRow, isRTL && S.rowRev]}>
                    {CITIES.map((c) => (
                      <TouchableOpacity key={c}
                        style={[S.seg, form.city === c && { backgroundColor: C.accent }]}
                        onPress={() => setForm({ ...form, city: c })}>
                        <Text style={[S.segText, form.city === c && { color: "#fff" }]}>{t(c as any)}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[S.seg, !CITIES.includes(form.city) && { backgroundColor: C.accent }]}
                      onPress={() => setForm({ ...form, city: "" })}>
                      <Text style={[S.segText, !CITIES.includes(form.city) && { color: "#fff" }]}>{t("otherCity")}</Text>
                    </TouchableOpacity>
                  </View>
                  {!CITIES.includes(form.city) && (
                    <TextInput style={[S.input, isRTL && { textAlign: "right" }]}
                      placeholder={t("city")} placeholderTextColor={C.textMuted}
                      value={form.city} onChangeText={(v) => setForm({ ...form, city: v })} />
                  )}
                  <Text style={S.fieldLabel}>{isRTL ? "المالك" : "Owner"}</Text>
                  <TextInput style={[S.input, isRTL && { textAlign: "right" }]}
                    placeholder={isRTL ? "اسم المالك (اختياري)" : "Owner Name (optional)"} placeholderTextColor={C.textMuted}
                    value={form.owner_name} onChangeText={(v) => setForm({ ...form, owner_name: v })} />
                  <TextInput style={[S.input, isRTL && { textAlign: "right" }]}
                    placeholder={isRTL ? "هاتف المالك (اختياري)" : "Owner Phone (optional)"} placeholderTextColor={C.textMuted}
                    keyboardType="phone-pad"
                    value={form.owner_phone} onChangeText={(v) => setForm({ ...form, owner_phone: v })} />
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 6 }}>
                    <TextInput style={[S.input, { flex: 1 }, !!addPropErrors.units && S.inputError]} placeholder={t("totalUnits")}
                      placeholderTextColor={C.textMuted} keyboardType="numeric" returnKeyType="done"
                      value={form.total_units} onChangeText={(v) => { setForm({ ...form, total_units: v }); const n = parseInt(v); setAddPropErrors((e) => ({ ...e, units: v.trim() && (isNaN(n) || n < 1) ? t("validationUnitsRequired") : v.trim() && n > 500 ? t("validationUnitsMax") : "" })); }} />
                    <TextInput style={[S.input, { flex: 1 }, !!addPropErrors.floors && S.inputError]} placeholder={t("floors")}
                      placeholderTextColor={C.textMuted} keyboardType="numeric" returnKeyType="done"
                      value={form.floors} onChangeText={(v) => { setForm({ ...form, floors: v }); const n = parseInt(v); setAddPropErrors((e) => ({ ...e, floors: v.trim() && n > 100 ? t("validationFloorsMax") : "" })); }} />
                  </View>
                  {(!!addPropErrors.units || !!addPropErrors.floors) && (
                    <Text style={S.fieldError}>{addPropErrors.units || addPropErrors.floors}</Text>
                  )}
                  <TextInput style={[S.input, isRTL && { textAlign: "right" }, !!addPropErrors.income && S.inputError]}
                    placeholder={`${t("monthlyIncome")} (${t("sar")})`} placeholderTextColor={C.textMuted}
                    keyboardType="numeric" returnKeyType="done"
                    value={form.monthly_income} onChangeText={(v) => { setForm({ ...form, monthly_income: v }); const n = parseFloat(v); setAddPropErrors((e) => ({ ...e, income: v.trim() && n > 9999999 ? t("validationAmountTooHigh") : "" })); }} />
                  {!!addPropErrors.income && <Text style={S.fieldError}>{addPropErrors.income}</Text>}
                  <TextInput style={[S.input, S.notesInput, isRTL && { textAlign: "right" }]}
                    placeholder={t("notes") ?? "Notes (optional)"} placeholderTextColor={C.textMuted}
                    multiline numberOfLines={3}
                    value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} />

                  <View style={[S.modalBtns, isRTL && S.rowRev]}>
                    <TouchableOpacity style={S.cancelBtn} onPress={() => setAddVisible(false)} accessibilityRole="button" accessibilityLabel={t("cancel")}>
                      <Text style={S.cancelBtnText}>{t("cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={S.saveBtn} onPress={addProperty} disabled={saving} accessibilityRole="button" accessibilityLabel={t("save")} accessibilityState={{ disabled: saving }}>
                      {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={S.saveBtnText}>{t("save")}</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </ModalOverlay>
        </Modal>

        {/* ── Edit Modal ── */}
        <Modal visible={editVisible} animationType={Platform.OS === 'web' ? 'fade' : 'slide'} transparent onRequestClose={() => setEditVisible(false)}>
          <ModalOverlay style={S.modalOverlay} onDismiss={() => setEditVisible(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ maxHeight: "90%" }} {...webContentClickStop}>
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false} showsVerticalScrollIndicator={true}>
                <View style={S.modalBox}>
                  <Text style={S.modalTitle}>{t("edit") ?? "Edit Property"}</Text>
                  <TextInput style={[S.input, isRTL && { textAlign: "right" }, !!editPropErrors.name && S.inputError]}
                    placeholder={t("propertyName")} placeholderTextColor={C.textMuted}
                    returnKeyType="done" value={editForm.name}
                    onChangeText={(v) => { setEditForm({ ...editForm, name: v }); setEditPropErrors((e) => ({ ...e, name: v.trim().length > 0 && v.trim().length < 2 ? t("validationPropertyNameShort") : "" })); }} />
                  {!!editPropErrors.name && <Text style={S.fieldError}>{editPropErrors.name}</Text>}
                  <Text style={S.fieldLabel}>{t("type")}</Text>
                  <View style={[S.segRow, isRTL && S.rowRev]}>
                    {(["apartment", "villa", "commercial"] as PropertyType[]).map((tp) => (
                      <TouchableOpacity key={tp}
                        style={[S.seg, editForm.type === tp && { backgroundColor: TYPE_COLORS[tp] }]}
                        onPress={() => setEditForm({ ...editForm, type: tp })}>
                        <Text style={[S.segText, editForm.type === tp && { color: "#fff" }]}>
                          {TYPE_ICONS[tp]} {t(tp as any)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={S.fieldLabel}>{t("city")}</Text>
                  <View style={[S.segRow, isRTL && S.rowRev]}>
                    {CITIES.map((c) => (
                      <TouchableOpacity key={c}
                        style={[S.seg, editForm.city === c && { backgroundColor: C.accent }]}
                        onPress={() => setEditForm({ ...editForm, city: c })}>
                        <Text style={[S.segText, editForm.city === c && { color: "#fff" }]}>{t(c as any)}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[S.seg, !CITIES.includes(editForm.city) && { backgroundColor: C.accent }]}
                      onPress={() => setEditForm({ ...editForm, city: "" })}>
                      <Text style={[S.segText, !CITIES.includes(editForm.city) && { color: "#fff" }]}>{t("otherCity")}</Text>
                    </TouchableOpacity>
                  </View>
                  {!CITIES.includes(editForm.city) && (
                    <TextInput style={[S.input, isRTL && { textAlign: "right" }]}
                      placeholder={t("city")} placeholderTextColor={C.textMuted}
                      value={editForm.city} onChangeText={(v) => setEditForm({ ...editForm, city: v })} />
                  )}
                  <Text style={S.fieldLabel}>{isRTL ? "المالك" : "Owner"}</Text>
                  <TextInput style={[S.input, isRTL && { textAlign: "right" }]}
                    placeholder={isRTL ? "اسم المالك (اختياري)" : "Owner Name (optional)"} placeholderTextColor={C.textMuted}
                    value={editForm.owner_name} onChangeText={(v) => setEditForm({ ...editForm, owner_name: v })} />
                  <TextInput style={[S.input, isRTL && { textAlign: "right" }]}
                    placeholder={isRTL ? "هاتف المالك (اختياري)" : "Owner Phone (optional)"} placeholderTextColor={C.textMuted}
                    keyboardType="phone-pad"
                    value={editForm.owner_phone} onChangeText={(v) => setEditForm({ ...editForm, owner_phone: v })} />
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 6 }}>
                    <TextInput style={[S.input, { flex: 1 }, !!editPropErrors.units && S.inputError]} placeholder={t("totalUnits")}
                      placeholderTextColor={C.textMuted} keyboardType="numeric" returnKeyType="done"
                      value={editForm.total_units} onChangeText={(v) => { setEditForm({ ...editForm, total_units: v }); const n = parseInt(v); setEditPropErrors((e) => ({ ...e, units: v.trim() && (isNaN(n) || n < 1) ? t("validationUnitsRequired") : v.trim() && n > 500 ? t("validationUnitsMax") : "" })); }} />
                    <TextInput style={[S.input, { flex: 1 }, !!editPropErrors.floors && S.inputError]} placeholder={t("floors")}
                      placeholderTextColor={C.textMuted} keyboardType="numeric" returnKeyType="done"
                      value={editForm.floors} onChangeText={(v) => { setEditForm({ ...editForm, floors: v }); const n = parseInt(v); setEditPropErrors((e) => ({ ...e, floors: v.trim() && n > 100 ? t("validationFloorsMax") : "" })); }} />
                  </View>
                  {(!!editPropErrors.units || !!editPropErrors.floors) && (
                    <Text style={S.fieldError}>{editPropErrors.units || editPropErrors.floors}</Text>
                  )}
                  <TextInput style={[S.input, isRTL && { textAlign: "right" }, !!editPropErrors.income && S.inputError]}
                    placeholder={`${t("monthlyIncome")} (${t("sar")})`} placeholderTextColor={C.textMuted}
                    keyboardType="numeric" returnKeyType="done"
                    value={editForm.monthly_income} onChangeText={(v) => { setEditForm({ ...editForm, monthly_income: v }); const n = parseFloat(v); setEditPropErrors((e) => ({ ...e, income: v.trim() && n > 9999999 ? t("validationAmountTooHigh") : "" })); }} />
                  {!!editPropErrors.income && <Text style={S.fieldError}>{editPropErrors.income}</Text>}
                  <TextInput style={[S.input, S.notesInput, isRTL && { textAlign: "right" }]}
                    placeholder={t("notes") ?? "Notes (optional)"} placeholderTextColor={C.textMuted}
                    multiline numberOfLines={3}
                    value={editForm.notes} onChangeText={(v) => setEditForm({ ...editForm, notes: v })} />

                  <View style={[S.modalBtns, isRTL && S.rowRev]}>
                    <TouchableOpacity style={S.cancelBtn} onPress={() => setEditVisible(false)} accessibilityRole="button" accessibilityLabel={t("cancel")}>
                      <Text style={S.cancelBtnText}>{t("cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={S.saveBtn} onPress={saveEdit} disabled={editSaving} accessibilityRole="button" accessibilityLabel={t("save")} accessibilityState={{ disabled: editSaving }}>
                      {editSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={S.saveBtnText}>{t("save")}</Text>}
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
}

const styles = (C: any, shadow: any, isRTL: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md },
  rowRev: { flexDirection: "row-reverse" },
  headerTitle: { fontSize: 24, fontWeight: "700", color: C.text },
  addBtn: { backgroundColor: C.accent, borderRadius: radii.md, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  searchBar: { flexDirection: "row", alignItems: "center", marginHorizontal: spacing.md, marginBottom: 10, backgroundColor: C.background, borderRadius: radii.md, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 },
  searchIcon: { fontSize: 14, marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 },
  searchInput: { flex: 1, paddingVertical: 10, color: C.text, fontSize: 14 },
  searchClearBtn: { padding: 4 },
  searchClearText: { color: C.textMuted, fontSize: 14 },
  summaryRow: { flexDirection: "row", paddingHorizontal: spacing.md, gap: 8, marginBottom: 12 },
  summaryCard: { flex: 1, backgroundColor: C.surface, borderRadius: radii.md, padding: 12, alignItems: "center" },
  summaryVal: { fontSize: 18, fontWeight: "700", color: C.accent },
  summaryLbl: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  listContent: { paddingHorizontal: spacing.md, paddingTop: 4 },
  card: { backgroundColor: C.surface, borderRadius: radii.lg, padding: spacing.md, ...shadow, borderWidth: 1, borderColor: C.border, marginBottom: 12 } as any,
  cardDesktop: { padding: 20, marginBottom: 0, ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'transform 0.15s ease, box-shadow 0.15s ease' } as any : {}) },
  cardHover: { transform: [{ translateY: -2 }], shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12 },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  cardIcon: { fontSize: 28 },
  cardName: { fontSize: 16, fontWeight: "700", color: C.text },
  cardCity: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  cardNotes: { fontSize: 11, color: C.textMuted, marginTop: 3, fontStyle: "italic" },
  badge: { borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 10 },
  cardStats: { flexDirection: "row", justifyContent: "space-between" },
  statText: { fontSize: 12, color: C.textMuted },
  incomeText: { fontSize: 13, fontWeight: "700", color: C.accent },
  viewHint: { fontSize: 11, color: C.accent },
  emptyText: { textAlign: "center", color: C.textMuted, marginTop: 60, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", ...(Platform.OS === 'web' ? { justifyContent: 'center', paddingHorizontal: 16, backdropFilter: 'blur(8px)' } as any : {}) },
  modalBox: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 40, ...(Platform.OS === 'web' ? { maxWidth: 560, width: '100%', borderRadius: 20, alignSelf: 'center', paddingBottom: spacing.lg, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', zIndex: 1 } as any : {}) },
  modalTitle: { fontSize: 20, fontWeight: "700", color: C.text, marginBottom: 16, textAlign: "center" },
  input: { backgroundColor: C.background, borderRadius: radii.md, padding: 12, color: C.text, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  notesInput: { height: 80, textAlignVertical: "top" },
  fieldLabel: { color: C.textMuted, fontSize: 13, marginBottom: 6 },
  segRow: { flexDirection: "row", gap: 6, marginBottom: 12, flexWrap: "wrap" },
  seg: { backgroundColor: C.background, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  segText: { color: C.textMuted, fontSize: 12 },
  hintText: { fontSize: 12, color: C.textMuted, fontStyle: "italic", marginBottom: 10, paddingHorizontal: 4 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, backgroundColor: C.background, borderRadius: radii.md, padding: 14, alignItems: "center", borderWidth: 1, borderColor: C.border },
  cancelBtnText: { color: C.textMuted, fontWeight: "600", fontSize: 15 },
  saveBtn: { flex: 1, backgroundColor: C.accent, borderRadius: radii.md, padding: 14, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  fieldError: { fontSize: 11, color: "#EF4444", marginTop: -6, marginBottom: 6 },
  inputError: { borderColor: "#EF4444" },
  webActionBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: "rgba(2,132,199,0.1)" },
  webActionBtnText: { fontSize: 11, color: "#0284C7", fontWeight: "600" },
  webDeleteBtn: { backgroundColor: "rgba(220,38,38,0.1)" },
  webDeleteBtnText: { fontSize: 11, color: "#DC2626", fontWeight: "600" },
});
