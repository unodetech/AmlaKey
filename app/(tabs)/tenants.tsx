import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { showAlert, crossAlert } from "../../lib/alert";

const isWeb = Platform.OS === "web";

// Native-only imports (crash on web)
let WebView: any = null;
let DateTimePicker: any = null;
if (!isWeb) {
  WebView = require("react-native-webview").WebView;
  DateTimePicker = require("@react-native-community/datetimepicker").default;
}
import { SwipeableRow, SwipeableRowRef } from "../../components/SwipeableRow";
import { SkeletonList } from "../../components/SkeletonLoader";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, radii } from "../../constants/theme";
import { userKey, EJAR_IMPORT_KEY } from "../../lib/storage";
import WebContainer from "../../components/WebContainer";
import { WebDateInput, modalBackdropStyle, ModalOverlay, webContentClickStop } from "../../components/WebDateInput";
import { getDuePeriodMonth } from "../../lib/dateUtils";

type TenantStatus = "active" | "expired";
type FilterType = "all" | TenantStatus;

interface Tenant {
  id: string;
  name: string;
  phone: string;
  national_id: string;
  contract_number: string;
  property_id: string | null;
  unit_number: string;
  monthly_rent: number;
  lease_start: string;
  lease_end: string;
  status: TenantStatus;
  payment_frequency?: string;
  properties?: { name: string };
}

interface Property { id: string; name: string }

export default function TenantsScreen() {
  const { t, isRTL } = useLanguage();
  const { colors: C, shadow, isDark } = useTheme();
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const insets = useSafeAreaInsets();
  const S = useMemo(() => styles(C, shadow), [C, shadow]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [addChoiceVisible, setAddChoiceVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Payment modal state
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [payTenant, setPayTenant] = useState<Tenant | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date());
  const [payingSaving, setPayingSaving] = useState(false);

  // Date picker state for payment modal
  const [showPayDatePicker, setShowPayDatePicker] = useState(false);

  // Date picker states (add modal)
  const [showLeaseStart, setShowLeaseStart] = useState(false);
  const [showLeaseEnd, setShowLeaseEnd] = useState(false);
  const addTenantScrollRef = useRef<ScrollView>(null);
  const [leaseStartDate, setLeaseStartDate] = useState(new Date());
  const [leaseEndDate, setLeaseEndDate] = useState(new Date());
  const [hasLeaseEnd, setHasLeaseEnd] = useState(false);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [editForm, setEditForm] = useState({
    name: "", phone: "", national_id: "",
    property_id: "", unit_number: "",
    monthly_rent: "", lease_start: "", lease_end: "",
  });
  const [editLeaseStartDate, setEditLeaseStartDate] = useState(new Date());
  const [editLeaseEndDate, setEditLeaseEndDate] = useState(new Date());
  const [showEditLeaseStart, setShowEditLeaseStart] = useState(false);
  const [showEditLeaseEnd, setShowEditLeaseEnd] = useState(false);
  const [hasEditLeaseEnd, setHasEditLeaseEnd] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const closeDatePickers = () => {
    setShowLeaseStart(false);
    setShowLeaseEnd(false);
    setShowPayDatePicker(false);
    setShowEditLeaseStart(false);
    setShowEditLeaseEnd(false);
  };

  const dismissAll = () => {
    Keyboard.dismiss();
    closeDatePickers();
  };

  // Close date pickers when keyboard opens
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", closeDatePickers);
    return () => sub.remove();
  }, []);

  const [form, setForm] = useState({
    name: "", phone: "", national_id: "", contract_number: "",
    property_id: "", unit_number: "",
    monthly_rent: "", lease_start: "", lease_end: "",
  });

  // Ejar import billing data for auto-generating payment records
  const [ejarData, setEjarData] = useState<{
    bill_count: number; unpaid_bills: number;
    total_amount: number; payment_type: string;
  } | null>(null);

  // Ejar background sync state
  const [ejarSyncUrl, setEjarSyncUrl] = useState<string | null>(null);
  const [ejarSyncQueue, setEjarSyncQueue] = useState<Tenant[]>([]);
  const ejarSyncing = useRef(false);
  const hasSyncedEjar = useRef(false);
  const ejarWebViewRef = useRef<any>(null);

  // Swipeable gesture refs — track open rows so we can auto-close them
  const swipeRefs = useRef<Map<string, SwipeableRowRef | null>>(new Map());
  const openSwipeId = useRef<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  // Auto-sync Ejar payments on first focus (like SEC/NWC pattern)
  useFocusEffect(useCallback(() => {
    if (!hasSyncedEjar.current) {
      hasSyncedEjar.current = true;
      backgroundSyncEjarPayments();
    }
  }, []));

  // Check for Ejar import data when screen gains focus
  useFocusEffect(useCallback(() => {
    if (!uid) return;
    AsyncStorage.getItem(userKey(uid, EJAR_IMPORT_KEY)).then((raw) => {
      if (!raw) return;
      AsyncStorage.removeItem(userKey(uid, EJAR_IMPORT_KEY)); // consume it
      try {
        const d = JSON.parse(raw);
        setForm({
          name: d.name || "",
          phone: "",
          national_id: d.national_id || "",
          contract_number: d.contract_number || "",
          property_id: "",
          unit_number: "",
          monthly_rent: d.rent || "",
          lease_start: d.lease_start || "",
          lease_end: d.lease_end || "",
        });
        if (d.lease_start) {
          setLeaseStartDate(new Date(d.lease_start + "T12:00:00"));
        }
        if (d.lease_end) {
          setLeaseEndDate(new Date(d.lease_end + "T12:00:00"));
          setHasLeaseEnd(true);
        }
        // Store billing data for auto-generating payment records
        if (d.bill_count > 0) {
          setEjarData({
            bill_count: d.bill_count,
            unpaid_bills: d.unpaid_bills || 0,
            total_amount: d.total_amount || 0,
            payment_type: d.payment_type || "",
          });
        }
        setModalVisible(true);
      } catch {}
    });
  }, []));

  async function fetchAll() {
    setLoading(true);
    const [{ data: tData }, { data: pData }] = await Promise.all([
      supabase.from("tenants").select("*, properties(name)").order("created_at", { ascending: false }),
      supabase.from("properties").select("id, name"),
    ]);
    if (tData) setTenants(tData as Tenant[]);
    if (pData) setProperties(pData);
    setLoading(false);
  }

  /* ── Ejar background sync ── */
  const REGA_DETAIL_BASE = "https://rega.gov.sa/en/rega-services/real-estate-enquiries/result-page/%D8%AA%D9%81%D8%A7%D8%B5%D9%8A%D9%84-%D8%B9%D9%82%D8%AF-%D8%A7%D9%84%D8%A5%D9%8A%D8%AC%D8%A7%D8%B1/";

  const EJAR_EXTRACT_JS = `
(function() {
  try {
    var data = {};
    var allText = document.body.innerText || "";
    var cards = document.querySelectorAll('.card-body, .card');
    cards.forEach(function(card) {
      var text = card.innerText || "";
      if (text.indexOf("المعلومات المالية") >= 0) {
        var amountM = text.match(/(\\d[\\d,.]+)\\s*ريال/);
        if (amountM) data.totalAmount = parseFloat(amountM[1].replace(/,/g, ""));
        if (text.indexOf("شهري") >= 0) data.paymentType = "monthly";
        else if (text.indexOf("ربع سنوي") >= 0) data.paymentType = "quarterly";
        else if (text.indexOf("نصف سنوي") >= 0) data.paymentType = "semi-annual";
        else data.paymentType = "annual";
      }
    });
    var billsM = allText.match(/الفواتير\\s*(\\d+)/);
    data.billCount = billsM ? parseInt(billsM[1]) : 0;
    var unpaidMatches = allText.match(/غير مدفوعة/g);
    data.unpaidBills = unpaidMatches ? unpaidMatches.length : 0;
    window.ReactNativeWebView.postMessage(JSON.stringify({ success: true, data: data }));
  } catch(e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ error: e.message }));
  }
})();
true;
`;

  async function backgroundSyncEjarPayments() {
    if (isWeb) return; // WebView not available on web
    if (ejarSyncing.current) return;
    ejarSyncing.current = true;
    try {
      // Find all active tenants with contract_number + national_id (imported from Ejar)
      const { data: ejarTenants } = await supabase
        .from("tenants")
        .select("id, national_id, contract_number, property_id, lease_start, monthly_rent, payment_frequency")
        .not("contract_number", "is", null)
        .not("national_id", "is", null)
        .eq("status", "active");

      if (!ejarTenants || ejarTenants.length === 0) {
        ejarSyncing.current = false;
        return;
      }

      setEjarSyncQueue(ejarTenants as Tenant[]);
      // Start processing first tenant — the rest will be processed in onEjarSyncMessage
      processNextEjarTenant(ejarTenants as Tenant[]);
    } catch {
      ejarSyncing.current = false;
    }
  }

  function processNextEjarTenant(queue: Tenant[]) {
    if (queue.length === 0) {
      setEjarSyncUrl(null);
      setEjarSyncQueue([]);
      ejarSyncing.current = false;
      fetchAll(); // Refresh list after sync
      return;
    }
    const tenant = queue[0];
    const url = `${REGA_DETAIL_BASE}?id_number=${tenant.national_id}&contract_number=${tenant.contract_number}&major_version=1&minor_version=0`;
    setEjarSyncUrl(url);
  }

  async function onEjarSyncMessage(event: any) {
    try {
      const result = JSON.parse(event.nativeEvent.data);
      const currentTenant = ejarSyncQueue[0];
      const remaining = ejarSyncQueue.slice(1);
      setEjarSyncQueue(remaining);

      if (result.success && result.data && currentTenant) {
        const { billCount, unpaidBills, totalAmount, paymentType } = result.data;
        if (billCount > 0 && totalAmount > 0) {
          const paidCount = billCount - (unpaidBills || 0);

          // Count existing payments for this tenant
          const { count: existingCount } = await supabase
            .from("payments")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", currentTenant.id);

          const newPaidCount = paidCount - (existingCount || 0);
          if (newPaidCount > 0 && currentTenant.lease_start) {
            const perBillAmount = totalAmount / billCount;
            const intervalMap: Record<string, number> = {
              "monthly": 1, "quarterly": 3, "semi-annual": 6, "annual": 12,
            };
            const interval = intervalMap[paymentType] || 1;
            const payments = [];
            const start = new Date(currentTenant.lease_start + "T12:00:00");

            // Generate only the NEW payments (skip already recorded ones)
            for (let i = existingCount || 0; i < paidCount; i++) {
              const payDate = new Date(start);
              payDate.setMonth(payDate.getMonth() + i * interval);
              const dateStr = payDate.toISOString().split("T")[0];
              const monthYear = getDuePeriodMonth(currentTenant.lease_start, currentTenant.payment_frequency, payDate);
              payments.push({
                tenant_id: currentTenant.id,
                property_id: currentTenant.property_id,
                amount: Math.round(perBillAmount * 100) / 100,
                payment_date: dateStr,
                month_year: monthYear,
              });
            }

            if (payments.length > 0) {
              await supabase.from("payments").insert(payments);
            }
          }
        }
      }

      // Process next tenant
      processNextEjarTenant(remaining);
    } catch {
      // Skip failed tenant, continue with next
      const remaining = ejarSyncQueue.slice(1);
      setEjarSyncQueue(remaining);
      processNextEjarTenant(remaining);
    }
  }

  // Use imported showAlert from lib/alert (cross-platform)

  async function addTenant() {
    if (!form.name.trim() || form.name.trim().length < 4) {
      showAlert(t("error"), t("validationNameTooShort"));
      return;
    }
    if (form.phone.trim() && !/^05\d{8}$/.test(form.phone.trim())) {
      showAlert(t("error"), t("validationPhoneInvalid"));
      return;
    }
    if (!form.monthly_rent.trim() || parseFloat(form.monthly_rent) <= 0) {
      showAlert(t("error"), t("validationAmountPositive"));
      return;
    }
    if (!form.lease_start.trim()) {
      showAlert(t("error"), t("leaseStartRequired"));
      return;
    }
    if (!form.lease_end.trim()) {
      showAlert(t("error"), t("leaseEndRequired"));
      return;
    }
    setSaving(true);
    const { data: inserted, error } = await supabase.from("tenants").insert([{
      name: form.name.trim(),
      phone: form.phone.trim(),
      national_id: form.national_id.trim(),
      contract_number: form.contract_number?.trim() || null,
      property_id: form.property_id || null,
      unit_number: form.unit_number.trim(),
      monthly_rent: parseFloat(form.monthly_rent) || 0,
      lease_start: form.lease_start || null,
      lease_end: form.lease_end || null,
      status: form.lease_end && new Date(form.lease_end) < new Date() ? "expired" : "active",
    }]).select("id").single();
    setSaving(false);
    if (error) { showAlert(t("error"), error.message); }
    else {
      // Auto-generate payment records from Ejar billing data
      if (ejarData && inserted?.id && ejarData.bill_count > 0) {
        const paidCount = ejarData.bill_count - ejarData.unpaid_bills;
        if (paidCount > 0) {
          const perBillAmount = ejarData.total_amount / ejarData.bill_count;
          const intervalMap: Record<string, number> = {
            "monthly": 1, "quarterly": 3, "semi-annual": 6, "annual": 12,
          };
          const interval = intervalMap[ejarData.payment_type] || 1;
          const payments = [];
          const start = new Date(form.lease_start + "T12:00:00");

          // Map EJAR payment type to our frequency for period attribution
          const freqMap: Record<string, string> = {
            "monthly": "monthly", "quarterly": "quarterly", "semi-annual": "semi_annual", "annual": "annual",
          };
          const tenantFreq = freqMap[ejarData.payment_type] || "monthly";

          for (let i = 0; i < paidCount; i++) {
            const payDate = new Date(start);
            payDate.setMonth(payDate.getMonth() + i * interval);
            const dateStr = payDate.toISOString().split("T")[0];
            const monthYear = getDuePeriodMonth(form.lease_start, tenantFreq, payDate);
            payments.push({
              tenant_id: inserted.id,
              property_id: form.property_id || null,
              amount: Math.round(perBillAmount * 100) / 100,
              payment_date: dateStr,
              month_year: monthYear,
            });
          }

          await supabase.from("payments").insert(payments);
        }
        setEjarData(null);
      }

      setModalVisible(false);
      setForm({ name: "", phone: "", national_id: "", contract_number: "", property_id: "", unit_number: "", monthly_rent: "", lease_start: "", lease_end: "" });
      setLeaseStartDate(new Date());
      setLeaseEndDate(new Date());
      setHasLeaseEnd(false);
      fetchAll();
    }
  }

  function openPayModal(tenant: Tenant) {
    setPayTenant(tenant);
    setPayAmount(String(tenant.monthly_rent));
    setPayDate(new Date());
    setPayModalVisible(true);
  }

  async function recordPayment() {
    if (!payTenant) return;
    const amt = parseFloat(payAmount);
    if (!payAmount || isNaN(amt) || amt <= 0) {
      showAlert(t("error"), t("amountRequired"));
      return;
    }
    if (!payTenant.id) {
      showAlert(t("error"), t("failedToLoadData"));
      return;
    }
    setPayingSaving(true);
    const monthYear = getDuePeriodMonth(payTenant.lease_start, payTenant.payment_frequency, payDate);
    const { error } = await supabase.from("payments").insert([{
      tenant_id: payTenant.id,
      property_id: payTenant.property_id || null,
      amount: amt,
      payment_date: payDate.toISOString().split("T")[0],
      month_year: monthYear,
    }]);
    setPayingSaving(false);
    if (error) { showAlert(t("error"), error.message); }
    else {
      setPayModalVisible(false);
      showAlert("", t("paymentRecorded") ?? "Payment recorded!");
    }
  }

  function openEditModal(tenant: Tenant) {
    setEditTenant(tenant);
    setEditForm({
      name: tenant.name,
      phone: tenant.phone ?? "",
      national_id: tenant.national_id ?? "",
      property_id: tenant.property_id ?? "",
      unit_number: tenant.unit_number ?? "",
      monthly_rent: String(tenant.monthly_rent),
      lease_start: tenant.lease_start ?? "",
      lease_end: tenant.lease_end ?? "",
    });
    setEditLeaseStartDate(tenant.lease_start ? new Date(tenant.lease_start) : new Date());
    setEditLeaseEndDate(tenant.lease_end ? new Date(tenant.lease_end) : new Date());
    setHasEditLeaseEnd(!!tenant.lease_end);
    setEditModalVisible(true);
  }

  async function updateTenant() {
    if (!editTenant) return;
    if (!editForm.name.trim() || editForm.name.trim().length < 4) {
      showAlert(t("error"), t("validationNameTooShort"));
      return;
    }
    if (editForm.phone.trim() && !/^05\d{8}$/.test(editForm.phone.trim())) {
      showAlert(t("error"), t("validationPhoneInvalid"));
      return;
    }
    if (!editForm.monthly_rent.trim() || parseFloat(editForm.monthly_rent) <= 0) {
      showAlert(t("error"), t("validationAmountPositive"));
      return;
    }
    if (!editForm.lease_start.trim()) {
      showAlert(t("error"), t("leaseStartRequired"));
      return;
    }
    if (!editForm.lease_end.trim()) {
      showAlert(t("error"), t("leaseEndRequired"));
      return;
    }
    setEditSaving(true);
    const { error } = await supabase.from("tenants").update({
      name: editForm.name.trim(),
      phone: editForm.phone.trim(),
      national_id: editForm.national_id.trim(),
      property_id: editForm.property_id || null,
      unit_number: editForm.unit_number.trim(),
      monthly_rent: parseFloat(editForm.monthly_rent) || 0,
      lease_start: editForm.lease_start || null,
      lease_end: editForm.lease_end || null,
      status: editForm.lease_end && new Date(editForm.lease_end) < new Date() ? "expired" : "active",
    }).eq("id", editTenant.id);
    setEditSaving(false);
    if (error) { showAlert(t("error"), error.message); }
    else { setEditModalVisible(false); fetchAll(); }
  }

  async function deleteTenant(tenant: Tenant) {
    crossAlert(
      t("delete") ?? "Delete",
      `"${tenant.name}"?`,
      [
        { text: t("cancel"), style: "cancel" },
        { text: t("delete") ?? "Delete", style: "destructive", onPress: async () => {
          const { error } = await supabase.from("tenants").delete().eq("id", tenant.id);
          if (error) showAlert(t("error"), error.message);
          else fetchAll();
        }},
      ]
    );
  }

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  const filtered = filter === "all" ? tenants : tenants.filter((t) => t.status === filter);
  const activeCount = tenants.filter((t) => t.status === "active").length;

  if (isWeb) {
    return renderContent();
  }
  return (
    <TouchableWithoutFeedback onPress={dismissAll} accessible={false}>
      {renderContent()}
    </TouchableWithoutFeedback>
  );

  function renderContent() {
  return (
      <View style={S.container}>
        <WebContainer maxWidth={1000}>
        <View style={[S.header, { paddingTop: insets.top + 10 }, isRTL && S.rowRev]}>
          <Text style={S.headerTitle}>{t("tenants")}</Text>
          <TouchableOpacity style={S.addBtn} onPress={() => setAddChoiceVisible(true)} accessibilityRole="button" accessibilityLabel={t("addTenant")}>
            <Text style={S.addBtnText}>+ {t("add")}</Text>
          </TouchableOpacity>
        </View>

        {/* Summary */}
        <View style={[S.summaryRow, isRTL && S.rowRev]}>
          <View style={S.summaryCard}>
            <Text style={S.summaryVal}>{tenants.length}</Text>
            <Text style={S.summaryLbl}>{t("total")}</Text>
          </View>
          <View style={S.summaryCard}>
            <Text style={[S.summaryVal, { color: "#22C55E" }]}>{activeCount}</Text>
            <Text style={S.summaryLbl}>{t("active")}</Text>
          </View>
          <View style={S.summaryCard}>
            <Text style={[S.summaryVal, { color: "#EF4444" }]}>{tenants.length - activeCount}</Text>
            <Text style={S.summaryLbl}>{t("expired")}</Text>
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={[S.filterRow, isRTL && S.rowRev]}>
          {(["all", "active", "expired"] as FilterType[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[S.filterTab, filter === f && S.filterTabActive]}
              onPress={() => setFilter(f)}
              accessibilityRole="button"
              accessibilityLabel={t(f as any)}
              accessibilityState={{ selected: filter === f }}
            >
              <Text style={[S.filterTabText, filter === f && S.filterTabTextActive]}>
                {t(f as any)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <SkeletonList count={5} />
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => {
              // Close any open swipe row when user starts scrolling
              if (openSwipeId.current) {
                swipeRefs.current.get(openSwipeId.current)?.close();
                openSwipeId.current = null;
              }
            }}
          >
            {filtered.length === 0 && (
              <View style={{ alignItems: "center", marginTop: 60 }}>
                <Text style={S.emptyText}>{t("noTenants")}</Text>
                <TouchableOpacity
                  style={S.emptyAddBtn}
                  onPress={() => setAddChoiceVisible(true)}
                  activeOpacity={0.75}
                >
                  <Text style={S.emptyAddBtnText}>+ {t("addTenant")}</Text>
                </TouchableOpacity>
              </View>
            )}
            {filtered.map((tenant) => (
              <SwipeableRow
                key={tenant.id}
                ref={(r) => { swipeRefs.current.set(tenant.id, r); }}
                isRTL={isRTL}
                onEdit={() => openEditModal(tenant)}
                onDelete={() => deleteTenant(tenant)}
                editLabel={t("edit") ?? "Edit"}
                deleteLabel={t("delete") ?? "Delete"}
                borderRadius={12}
                onSwipeOpen={() => {
                  openSwipeId.current = tenant.id;
                  // Auto-close all other open rows
                  swipeRefs.current.forEach((r, id) => {
                    if (id !== tenant.id) r?.close();
                  });
                }}
                onSwipeClose={() => {
                  if (openSwipeId.current === tenant.id) openSwipeId.current = null;
                }}
              >
                <TouchableOpacity
                  style={S.card}
                  activeOpacity={0.85}
                  onPress={() => {
                    // If this row is open, close it; otherwise navigate
                    if (openSwipeId.current === tenant.id) {
                      swipeRefs.current.get(tenant.id)?.close();
                      return;
                    }
                    router.push({
                      pathname: "/unit-detail",
                      params: {
                        propertyId: tenant.property_id ?? "",
                        propertyName: tenant.properties?.name ?? "",
                        unitNumber: tenant.unit_number ?? "",
                        tenantId: tenant.id,
                        unitLabel: "",
                      },
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${tenant.name}, ${tenant.properties?.name ?? ""}, ${t(tenant.status)}, ${tenant.monthly_rent.toLocaleString()} ${t("sar")}`}
                >
                  <View style={[S.cardTop, isRTL && S.rowRev]}>
                    <View style={S.avatar}>
                      <Text style={S.avatarText}>{tenant.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1, marginHorizontal: 10 }}>
                      <Text style={[S.tenantName, isRTL && { textAlign: "right" }]}>{tenant.name}</Text>
                      <Text style={[S.tenantSub, isRTL && { textAlign: "right" }]}>
                        {tenant.properties?.name ?? ""} {tenant.unit_number ? `· ${tenant.unit_number}` : ""}
                      </Text>
                    </View>
                    <View style={[S.statusBadge, { backgroundColor: tenant.status === "active" ? "#22C55E20" : "#EF444420" }]}>
                      <Text style={[S.statusText, { color: tenant.status === "active" ? "#22C55E" : "#EF4444" }]}>
                        {t(tenant.status)}
                      </Text>
                    </View>
                  </View>
                  <View style={S.divider} />
                  <View style={[S.cardBottom, isRTL && S.rowRev]}>
                    {tenant.phone ? <Text style={S.detailText}>📞 {tenant.phone}</Text> : null}
                    <Text style={S.rentText}>{tenant.monthly_rent.toLocaleString()} {t("sar")}/mo</Text>
                    {tenant.lease_end ? <Text style={S.detailText}>📅 {tenant.lease_end}</Text> : null}
                  </View>
                  {tenant.status === "active" && (
                    <TouchableOpacity style={S.collectBtn} onPress={() => openPayModal(tenant)} accessibilityRole="button" accessibilityLabel={`${t("markAsPaid") ?? "Collect Payment"} - ${tenant.name}`}>
                      <Text style={S.collectBtnText}>💰 {t("markAsPaid") ?? "Collect Payment"}</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </SwipeableRow>
            ))}
          </ScrollView>
        )}
        </WebContainer>

        {/* Add Choice Modal — Manual vs Ejar */}
        <Modal visible={addChoiceVisible} animationType="fade" transparent onRequestClose={() => setAddChoiceVisible(false)}>
          <ModalOverlay style={S.modalOverlay} onDismiss={() => setAddChoiceVisible(false)}>
              <View style={S.choiceBox} {...webContentClickStop}>
                <Text style={S.choiceTitle}>{t("addTenant")}</Text>
                <TouchableOpacity
                  style={S.choiceOption}
                  onPress={() => { setAddChoiceVisible(false); setModalVisible(true); }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={t("enterManually")}
                >
                  <View style={S.choiceIconWrap}>
                    <Text style={{ fontSize: 28 }}>✍️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[S.choiceLabel, isRTL && { textAlign: "right" }]}>
                      {t("enterManually")}
                    </Text>
                    <Text style={[S.choiceSub, isRTL && { textAlign: "right" }]}>
                      {t("enterManuallyDesc")}
                    </Text>
                  </View>
                  <Text style={S.choiceArrow}>{isRTL ? "‹" : "›"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.choiceOption, S.choiceOptionEjar]}
                  onPress={() => { setAddChoiceVisible(false); router.push("/ejar-import"); }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={t("importFromEjar")}
                >
                  <View style={[S.choiceIconWrap, { backgroundColor: "#25935f15" }]}>
                    <Text style={{ fontSize: 28 }}>🏠</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[S.choiceLabel, isRTL && { textAlign: "right" }, { color: "#25935f" }]}>
                      {t("importFromEjar")}
                    </Text>
                    <Text style={[S.choiceSub, isRTL && { textAlign: "right" }]}>
                      {t("fetchFromEjar")}
                    </Text>
                  </View>
                  <Text style={[S.choiceArrow, { color: "#25935f" }]}>{isRTL ? "‹" : "›"}</Text>
                </TouchableOpacity>
              </View>
          </ModalOverlay>
        </Modal>

        {/* Add Tenant Modal */}
        <Modal visible={modalVisible} animationType={Platform.OS === 'web' ? 'fade' : 'slide'} transparent onRequestClose={() => setModalVisible(false)}>
          <ModalOverlay style={S.modalOverlay} onDismiss={() => { dismissAll(); setModalVisible(false); }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ maxHeight: "90%" }} {...webContentClickStop}>
              <ScrollView ref={addTenantScrollRef} keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={S.modalBox}>
                  <Text style={S.modalTitle}>{t("addTenant")}</Text>

                  <TextInput
                    style={[S.input, isRTL && { textAlign: "right" }]}
                    placeholder={t("name")}
                    placeholderTextColor={C.textMuted}
                    returnKeyType="done"
                    value={form.name}
                    onFocus={closeDatePickers}
                    onChangeText={(v) => setForm({ ...form, name: v })}
                  />
                  <TextInput
                    style={[S.input, isRTL && { textAlign: "right" }]}
                    placeholder={t("phone")}
                    placeholderTextColor={C.textMuted}
                    keyboardType="number-pad"
                    maxLength={10}
                    returnKeyType="done"
                    value={form.phone}
                    onFocus={closeDatePickers}
                    onChangeText={(v) => setForm({ ...form, phone: v.replace(/\D/g, "").slice(0, 10) })}
                  />
                  <TextInput
                    style={[S.input, isRTL && { textAlign: "right" }]}
                    placeholder={t("nationalId")}
                    placeholderTextColor={C.textMuted}
                    returnKeyType="done"
                    value={form.national_id}
                    onFocus={closeDatePickers}
                    onChangeText={(v) => setForm({ ...form, national_id: v })}
                  />
                  <TextInput
                    style={[S.input, isRTL && { textAlign: "right" }]}
                    placeholder={t("unitNumber")}
                    placeholderTextColor={C.textMuted}
                    returnKeyType="done"
                    value={form.unit_number}
                    onFocus={closeDatePickers}
                    onChangeText={(v) => setForm({ ...form, unit_number: v })}
                  />
                  <TextInput
                    style={[S.input, isRTL && { textAlign: "right" }]}
                    placeholder={`${t("monthlyRent")} (${t("sar")})`}
                    placeholderTextColor={C.textMuted}
                    keyboardType="numeric"
                    returnKeyType="done"
                    value={form.monthly_rent}
                    onFocus={closeDatePickers}
                    onChangeText={(v) => setForm({ ...form, monthly_rent: v })}
                  />

                  {/* Lease Start Date Picker */}
                  <Text style={S.fieldLabel}>{t("leaseStart")}</Text>
                  {isWeb ? (
                    <WebDateInput
                      value={form.lease_start}
                      onChange={(val) => {
                        setForm({ ...form, lease_start: val });
                        if (val) setLeaseStartDate(new Date(val + "T00:00:00"));
                      }}
                      textColor={C.text}
                      backgroundColor={C.surfaceElevated}
                      borderColor={C.border}
                    />
                  ) : (
                    <>
                      <TouchableOpacity
                        style={S.datePickerBtn}
                        onPress={() => { Keyboard.dismiss(); setShowLeaseEnd(false); setShowLeaseStart(true); setTimeout(() => addTenantScrollRef.current?.scrollToEnd({ animated: true }), 100); }}
                      >
                        <Text style={S.datePickerText}>
                          📅 {form.lease_start || (t("selectDate") ?? "Select date")}
                        </Text>
                      </TouchableOpacity>
                      {showLeaseStart && (
                        <>
                          <DateTimePicker
                            value={leaseStartDate}
                            mode="date"
                            display="spinner"
                            locale="en-US"
                            themeVariant={isDark ? "dark" : "light"}
                            onChange={(_: any, date: any) => {
                              if (date) {
                                setLeaseStartDate(date);
                                setForm({ ...form, lease_start: formatDate(date) });
                              }
                            }}
                          />
                          <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowLeaseStart(false)}>
                            <Text style={S.pickerConfirmText}>{t("done")}</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </>
                  )}

                  {/* Lease End Date Picker — Required */}
                  <Text style={[S.fieldLabel, { marginTop: 8 }]}>{t("leaseEnd")} *</Text>
                  {isWeb ? (
                    <WebDateInput
                      value={form.lease_end}
                      onChange={(val) => {
                        setForm({ ...form, lease_end: val });
                        if (val) setLeaseEndDate(new Date(val + "T00:00:00"));
                      }}
                      textColor={C.text}
                      backgroundColor={C.surfaceElevated}
                      borderColor={C.border}
                    />
                  ) : (
                    <>
                      <TouchableOpacity
                        style={S.datePickerBtn}
                        onPress={() => { Keyboard.dismiss(); setShowLeaseStart(false); setShowLeaseEnd(true); if (!form.lease_end) { setForm({ ...form, lease_end: formatDate(leaseEndDate) }); } setTimeout(() => addTenantScrollRef.current?.scrollToEnd({ animated: true }), 100); }}
                      >
                        <Text style={[S.datePickerText, !form.lease_end && { color: C.textMuted }]}>
                          📅 {form.lease_end || (t("selectDate") ?? "Select date")}
                        </Text>
                      </TouchableOpacity>
                      {showLeaseEnd && (
                        <>
                          <DateTimePicker
                            value={leaseEndDate}
                            mode="date"
                            display="spinner"
                            locale="en-US"
                            themeVariant={isDark ? "dark" : "light"}
                            onChange={(_: any, date: any) => {
                              if (date) {
                                setLeaseEndDate(date);
                                setForm({ ...form, lease_end: formatDate(date) });
                              }
                            }}
                          />
                          <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowLeaseEnd(false)}>
                            <Text style={S.pickerConfirmText}>{t("done")}</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </>
                  )}

                  {/* Property Selector */}
                  <Text style={[S.fieldLabel, { marginTop: 8 }]}>{t("property")}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={[S.segmentRow, isRTL && S.rowRev]}>
                      <TouchableOpacity
                        style={[S.segBtn, form.property_id === "" && { backgroundColor: C.accent }]}
                        onPress={() => setForm({ ...form, property_id: "" })}
                      >
                        <Text style={[S.segBtnText, form.property_id === "" && { color: "#fff" }]}>—</Text>
                      </TouchableOpacity>
                      {properties.map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          style={[S.segBtn, form.property_id === p.id && { backgroundColor: C.accent }]}
                          onPress={() => setForm({ ...form, property_id: p.id })}
                        >
                          <Text style={[S.segBtnText, form.property_id === p.id && { color: "#fff" }]}>{p.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  <View style={[S.modalBtns, isRTL && S.rowRev]}>
                    <TouchableOpacity style={S.cancelBtn} onPress={() => setModalVisible(false)}>
                      <Text style={S.cancelBtnText}>{t("cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={S.saveBtn} onPress={addTenant} disabled={saving}>
                      {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={S.saveBtnText}>{t("save")}</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </ModalOverlay>
        </Modal>

        {/* Collect Payment Modal */}
        <Modal visible={payModalVisible} animationType={Platform.OS === 'web' ? 'fade' : 'slide'} transparent onRequestClose={() => setPayModalVisible(false)}>
          <ModalOverlay style={S.modalOverlay} onDismiss={() => { dismissAll(); setPayModalVisible(false); }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} {...webContentClickStop}>
              <View style={S.modalBox}>
                <Text style={S.modalTitle}>💰 {t("markAsPaid") ?? "Collect Payment"}</Text>
                {payTenant && (
                  <Text style={[S.fieldLabel, { marginBottom: 12, textAlign: "center", fontSize: 14 }]}>
                    {payTenant.name} — {payTenant.monthly_rent.toLocaleString()} {t("sar")}/mo
                  </Text>
                )}

                <Text style={S.fieldLabel}>{t("paymentAmount") ?? "Amount (SAR)"}</Text>
                <TextInput
                  style={S.input}
                  placeholder={`${t("amount")} (${t("sar")})`}
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                  returnKeyType="done"
                  value={payAmount}
                  onChangeText={setPayAmount}
                />

                <Text style={S.fieldLabel}>{t("date")}</Text>
                {isWeb ? (
                  <WebDateInput
                    value={formatDate(payDate)}
                    onChange={(val) => {
                      if (val) setPayDate(new Date(val + "T00:00:00"));
                    }}
                    textColor={C.text}
                    backgroundColor={C.surfaceElevated}
                    borderColor={C.border}
                  />
                ) : (
                  <>
                    <TouchableOpacity
                      style={S.datePickerBtn}
                      onPress={() => setShowPayDatePicker(true)}
                    >
                      <Text style={S.datePickerText}>📅 {formatDate(payDate)}</Text>
                    </TouchableOpacity>
                    {showPayDatePicker && (
                      <>
                        <DateTimePicker
                          value={payDate}
                          mode="date"
                          display="spinner"
                          locale="en-US"
                          themeVariant={isDark ? "dark" : "light"}
                          onChange={(_: any, date: any) => {
                            if (date) setPayDate(date);
                          }}
                        />
                        <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowPayDatePicker(false)}>
                          <Text style={S.pickerConfirmText}>{t("done")}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </>
                )}

                <View style={[S.modalBtns, isRTL && S.rowRev, { marginTop: 16 }]}>
                  <TouchableOpacity style={S.cancelBtn} onPress={() => setPayModalVisible(false)}>
                    <Text style={S.cancelBtnText}>{t("cancel")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.saveBtn} onPress={recordPayment} disabled={payingSaving}>
                    {payingSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={S.saveBtnText}>{t("recordPayment") ?? "Record"}</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </ModalOverlay>
        </Modal>

        {/* Edit Tenant Modal */}
        <Modal visible={editModalVisible} animationType={Platform.OS === 'web' ? 'fade' : 'slide'} transparent onRequestClose={() => setEditModalVisible(false)}>
          <ModalOverlay style={S.modalOverlay} onDismiss={() => { dismissAll(); setEditModalVisible(false); }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ maxHeight: "90%" }} {...webContentClickStop}>
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={S.modalBox}>
                  <Text style={S.modalTitle}>{t("edit") ?? "Edit"} {editTenant?.name}</Text>

                  {[
                    { key: "name", label: t("name") },
                    { key: "phone", label: t("phone") },
                    { key: "national_id", label: t("nationalId") },
                    { key: "unit_number", label: t("unitNumber") },
                    { key: "monthly_rent", label: `${t("monthlyRent")} (${t("sar")})`, numeric: true },
                  ].map(({ key, label, numeric }) => (
                    <TextInput
                      key={key}
                      style={[S.input, isRTL && { textAlign: "right" }]}
                      placeholder={label}
                      placeholderTextColor={C.textMuted}
                      keyboardType={numeric ? "numeric" : "default"}
                      returnKeyType="done"
                      value={(editForm as any)[key]}
                      onChangeText={(v) => setEditForm({ ...editForm, [key]: v })}
                    />
                  ))}

                  {/* Lease Start */}
                  <Text style={S.fieldLabel}>{t("leaseStart")}</Text>
                  {isWeb ? (
                    <WebDateInput
                      value={editForm.lease_start}
                      onChange={(val) => {
                        setEditForm({ ...editForm, lease_start: val });
                        if (val) setEditLeaseStartDate(new Date(val + "T00:00:00"));
                      }}
                      textColor={C.text}
                      backgroundColor={C.surfaceElevated}
                      borderColor={C.border}
                    />
                  ) : (
                    <>
                      <TouchableOpacity style={S.datePickerBtn} onPress={() => setShowEditLeaseStart(true)}>
                        <Text style={S.datePickerText}>📅 {editForm.lease_start || (t("selectDate") ?? "Select date")}</Text>
                      </TouchableOpacity>
                      {showEditLeaseStart && (
                        <>
                          <DateTimePicker
                            value={editLeaseStartDate}
                            mode="date"
                            display="spinner"
                            locale="en-US"
                            themeVariant={isDark ? "dark" : "light"}
                            onChange={(_: any, date: any) => {
                              if (date) { setEditLeaseStartDate(date); setEditForm({ ...editForm, lease_start: date.toISOString().split("T")[0] }); }
                            }}
                          />
                          <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowEditLeaseStart(false)}>
                            <Text style={S.pickerConfirmText}>{t("done")}</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </>
                  )}

                  {/* Lease End — Optional */}
                  {!hasEditLeaseEnd ? (
                    <TouchableOpacity
                      style={S.addLeaseEndBtn}
                      onPress={() => { setHasEditLeaseEnd(true); const d = new Date(); setEditLeaseEndDate(d); setEditForm({ ...editForm, lease_end: d.toISOString().split("T")[0] }); }}
                    >
                      <Text style={S.addLeaseEndText}>＋ {t("addLeaseEnd")}</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                        <Text style={S.fieldLabel}>{t("leaseEnd")}</Text>
                        <TouchableOpacity onPress={() => { setHasEditLeaseEnd(false); setEditForm({ ...editForm, lease_end: "" }); setShowEditLeaseEnd(false); }}>
                          <Text style={{ color: "#EF4444", fontSize: 12, fontWeight: "600" }}>✕ {t("removeLeaseEnd")}</Text>
                        </TouchableOpacity>
                      </View>
                      {isWeb ? (
                        <WebDateInput
                          value={editForm.lease_end}
                          onChange={(val) => {
                            setEditForm({ ...editForm, lease_end: val });
                            if (val) setEditLeaseEndDate(new Date(val + "T00:00:00"));
                          }}
                          textColor={C.text}
                          backgroundColor={C.surfaceElevated}
                          borderColor={C.border}
                        />
                      ) : (
                        <>
                          <TouchableOpacity style={S.datePickerBtn} onPress={() => setShowEditLeaseEnd(true)}>
                            <Text style={S.datePickerText}>📅 {editForm.lease_end || (t("selectDate") ?? "Select date")}</Text>
                          </TouchableOpacity>
                          {showEditLeaseEnd && (
                            <>
                              <DateTimePicker
                                value={editLeaseEndDate}
                                mode="date"
                                display="spinner"
                                locale="en-US"
                                themeVariant={isDark ? "dark" : "light"}
                                onChange={(_: any, date: any) => {
                                  if (date) { setEditLeaseEndDate(date); setEditForm({ ...editForm, lease_end: date.toISOString().split("T")[0] }); }
                                }}
                              />
                              <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowEditLeaseEnd(false)}>
                                <Text style={S.pickerConfirmText}>{t("done")}</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}

                  {/* Property selector */}
                  <Text style={[S.fieldLabel, { marginTop: 8 }]}>{t("property")}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                    <View style={[S.segmentRow, isRTL && S.rowRev]}>
                      <TouchableOpacity
                        style={[S.segBtn, editForm.property_id === "" && { backgroundColor: C.accent }]}
                        onPress={() => setEditForm({ ...editForm, property_id: "" })}
                      >
                        <Text style={[S.segBtnText, editForm.property_id === "" && { color: "#fff" }]}>—</Text>
                      </TouchableOpacity>
                      {properties.map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          style={[S.segBtn, editForm.property_id === p.id && { backgroundColor: C.accent }]}
                          onPress={() => setEditForm({ ...editForm, property_id: p.id })}
                        >
                          <Text style={[S.segBtnText, editForm.property_id === p.id && { color: "#fff" }]}>{p.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  <View style={[S.modalBtns, isRTL && S.rowRev]}>
                    <TouchableOpacity style={S.cancelBtn} onPress={() => setEditModalVisible(false)}>
                      <Text style={S.cancelBtnText}>{t("cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={S.saveBtn} onPress={updateTenant} disabled={editSaving}>
                      {editSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={S.saveBtnText}>{t("save")}</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </ModalOverlay>
        </Modal>

        {/* Hidden WebView for Ejar background sync — native only */}
        {!isWeb && ejarSyncUrl && (
          <WebView
            ref={ejarWebViewRef}
            source={{ uri: ejarSyncUrl }}
            style={{ height: 0, width: 0, position: "absolute", top: -1000 }}
            injectedJavaScript={EJAR_EXTRACT_JS}
            onMessage={onEjarSyncMessage}
            onError={() => {
              // Skip failed tenant, continue with next
              const remaining = ejarSyncQueue.slice(1);
              setEjarSyncQueue(remaining);
              processNextEjarTenant(remaining);
            }}
            onHttpError={() => {
              const remaining = ejarSyncQueue.slice(1);
              setEjarSyncQueue(remaining);
              processNextEjarTenant(remaining);
            }}
            javaScriptEnabled
            startInLoadingState
          />
        )}
      </View>
  );
  }
}

const styles = (C: any, shadow: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md },
  rowRev: { flexDirection: "row-reverse" },
  headerTitle: { fontSize: 24, fontWeight: "700", color: C.text },
  addBtn: { backgroundColor: C.accent, borderRadius: radii.md, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  summaryRow: { flexDirection: "row", paddingHorizontal: spacing.md, gap: 8, marginBottom: 12 },
  summaryCard: { flex: 1, backgroundColor: C.surface, borderRadius: radii.md, padding: 12, alignItems: "center" },
  summaryVal: { fontSize: 18, fontWeight: "700", color: C.accent },
  summaryLbl: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  filterRow: { flexDirection: "row", paddingHorizontal: spacing.md, gap: 8, marginBottom: 12 },
  filterTab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999, backgroundColor: C.surface },
  filterTabActive: { backgroundColor: C.accent },
  filterTabText: { color: C.textMuted, fontSize: 13 },
  filterTabTextActive: { color: "#fff", fontWeight: "700" },
  card: { backgroundColor: C.surface, borderRadius: radii.lg, marginHorizontal: spacing.md, marginBottom: 12, padding: spacing.md, ...shadow },
  cardTop: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  tenantName: { fontSize: 15, fontWeight: "700", color: C.text },
  tenantSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  statusBadge: { borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: "700" },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 10 },
  cardBottom: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 4 },
  detailText: { fontSize: 12, color: C.textMuted },
  rentText: { fontSize: 13, fontWeight: "700", color: C.accent },
  collectBtn: { marginTop: 10, backgroundColor: C.accent + "15", borderRadius: radii.md, paddingVertical: 9, alignItems: "center", borderWidth: 1, borderColor: C.accent + "40" },
  collectBtnText: { color: C.accent, fontWeight: "700", fontSize: 13 },
  emptyText: { textAlign: "center", color: C.textMuted, marginTop: 0, fontSize: 15 },
  emptyAddBtn: { marginTop: 16, backgroundColor: C.accent, borderRadius: radii.md, paddingHorizontal: 24, paddingVertical: 12 },
  emptyAddBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", ...(Platform.OS === 'web' ? { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, backdropFilter: 'blur(8px)' } as any : {}) },
  modalBox: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 40, ...(Platform.OS === 'web' ? { maxWidth: 560, width: '100%', borderRadius: 20, alignSelf: 'center', paddingBottom: spacing.lg, zIndex: 1 } : {}) },
  modalTitle: { fontSize: 20, fontWeight: "700", color: C.text, marginBottom: 16, textAlign: "center" },
  choiceBox: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 30, ...(Platform.OS === 'web' ? { maxWidth: 560, width: '100%', borderRadius: 24, alignSelf: 'center', zIndex: 1 } : {}) },
  choiceTitle: { fontSize: 20, fontWeight: "700", color: C.text, textAlign: "center", marginBottom: 20 },
  choiceOption: { flexDirection: "row", alignItems: "center", backgroundColor: C.background, borderRadius: radii.lg, padding: 16, marginBottom: 10, borderWidth: 1.5, borderColor: C.border, gap: 14 },
  choiceOptionEjar: { borderColor: "#25935f60", backgroundColor: "#25935f08" },
  choiceIconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  choiceLabel: { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 2 },
  choiceSub: { fontSize: 12, color: C.textMuted },
  choiceArrow: { fontSize: 22, color: C.textMuted, fontWeight: "700" },
  input: { backgroundColor: C.background, borderRadius: radii.md, padding: 12, color: C.text, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  fieldLabel: { color: C.textMuted, fontSize: 13, marginBottom: 6 },
  datePickerBtn: { backgroundColor: C.background, borderRadius: radii.md, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  datePickerText: { color: C.text, fontSize: 14 },
  pickerConfirm: {
    alignSelf: "stretch", backgroundColor: C.accent, borderRadius: radii.md,
    paddingVertical: 10, alignItems: "center", justifyContent: "center", marginTop: 4, marginBottom: 8,
  },
  pickerConfirmText: { color: "#fff", fontSize: 15, fontWeight: "700" as const },
  segmentRow: { flexDirection: "row", gap: 6 },
  segBtn: { backgroundColor: C.background, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  segBtnText: { color: C.textMuted, fontSize: 12 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, backgroundColor: C.background, borderRadius: radii.md, padding: 14, alignItems: "center", borderWidth: 1, borderColor: C.border },
  cancelBtnText: { color: C.textMuted, fontWeight: "600", fontSize: 15 },
  saveBtn: { flex: 1, backgroundColor: C.accent, borderRadius: radii.md, padding: 14, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700" },
  addLeaseEndBtn: { backgroundColor: C.background, borderRadius: radii.md, padding: 13, marginBottom: 10, marginTop: 8, borderWidth: 1, borderColor: C.accent + "40", borderStyle: "dashed", alignItems: "center" },
  addLeaseEndText: { color: C.accent, fontSize: 13, fontWeight: "600" },
});
