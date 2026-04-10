import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { showAlert, crossAlert } from "../lib/alert";

const isWeb = Platform.OS === "web";

// DateTimePicker only available on native
let DateTimePicker: any = null;
if (!isWeb) {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
}
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as offlineDb from "../lib/offlineDb";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { useNotification } from "../context/NotificationContext";
import { useAuth } from "../context/AuthContext";
import { useNetwork } from "../context/NetworkContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, radii } from "../constants/theme";
import { formatDualDate, getDuePeriodMonth } from "../lib/dateUtils";
import { generateAndShareReceipt, ReceiptData } from "../lib/receiptGenerator";
import { userKey, HIJRI_KEY, EJAR_IMPORT_KEY } from "../lib/storage";
import WebContainer from "../components/WebContainer";
import { WebDateInput, modalBackdropStyle, ModalOverlay, webContentClickStop } from "../components/WebDateInput";
import { useSubscription } from "../context/SubscriptionContext";
import { getDocuments, VaultDocument, DOC_TYPE_ICONS, DocType } from "../lib/vault";

type Tenant = {
  id: string;
  name: string;
  phone: string;
  unit_number: string;
  monthly_rent: number;
  lease_start: string;
  lease_end: string;
  status: string;
  payment_frequency?: string;
  whatsapp_enabled?: boolean;
  maintenance_enabled?: boolean;
  maintenance_token?: string;
};

type Payment = {
  id: string;
  amount: number;
  payment_date: string;
  month_year: string;
};

type PaymentFrequency = "monthly" | "semi_annual" | "annual";

type AddForm = {
  name: string;
  phone: string;
  monthly_rent: string;
  lease_start: string;
  lease_end: string;
  payment_frequency: PaymentFrequency;
};

const EMPTY_FORM: AddForm = {
  name: "",
  phone: "",
  monthly_rent: "",
  lease_start: "",
  lease_end: "",
  payment_frequency: "monthly",
};

export default function UnitDetailScreen() {
  const { propertyId, propertyName, unitNumber, tenantId, unitLabel } =
    useLocalSearchParams<{
      propertyId: string;
      propertyName: string;
      unitNumber: string;
      tenantId: string;
      unitLabel: string;
    }>();
  const { t, isRTL, lang } = useLanguage();
  const { colors: C, shadow, isDark } = useTheme();
  const { addNotification, settings: notifSettings } = useNotification();
  const { user } = useAuth();
  const { isPro } = useSubscription();
  const { refreshPendingCount } = useNetwork();
  const insets = useSafeAreaInsets();
  const S = useMemo(() => styles(C, shadow, isRTL), [C, shadow, isRTL]);
  const [unitDocs, setUnitDocs] = useState<VaultDocument[]>([]);

  // Hijri calendar preference
  const [showHijri, setShowHijri] = useState(false);
  const uid = user?.id ?? "";
  React.useEffect(() => {
    if (!uid) return;
    AsyncStorage.getItem(userKey(uid, HIJRI_KEY)).then(v => {
      if (v !== null) setShowHijri(v === "true");
      else setShowHijri(lang === "ar");
    }).catch(() => {});
  }, [uid]);

  const isVacant = !tenantId || tenantId === "";

  // Occupied state
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [previousTenants, setPreviousTenants] = useState<Tenant[]>([]);
  const [loadingTenant, setLoadingTenant] = useState(!isVacant);
  const [loadingPayments, setLoadingPayments] = useState(!isVacant);

  // Add tenant modal
  const [addChoiceVisible, setAddChoiceVisible] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const addTenantScrollRef = useRef<ScrollView>(null);

  // Collect payment modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payNotes, setPayNotes] = useState("");
  const [showPayDatePicker, setShowPayDatePicker] = useState(false);
  const [savingPay, setSavingPay] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);

  // End lease
  const [endingLease, setEndingLease] = useState(false);

  // Renew lease
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewLeaseEnd, setRenewLeaseEnd] = useState("");
  const [showRenewDatePicker, setShowRenewDatePicker] = useState(false);
  const [renewingLease, setRenewingLease] = useState(false);

  // Edit tenant modal
  const [showEditTenantModal, setShowEditTenantModal] = useState(false);
  const [editTenantForm, setEditTenantForm] = useState<AddForm>(EMPTY_FORM);
  const [savingEditTenant, setSavingEditTenant] = useState(false);
  const [showEditTenantStart, setShowEditTenantStart] = useState(false);
  const [showEditTenantEnd, setShowEditTenantEnd] = useState(false);

  // Edit payment modal
  const [editPayModal, setEditPayModal] = useState(false);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);
  const [editPayAmount, setEditPayAmount] = useState("");
  const [editPayDate, setEditPayDate] = useState("");
  const [showEditPayDatePicker, setShowEditPayDatePicker] = useState(false);
  const [savingEditPay, setSavingEditPay] = useState(false);

  // Validation errors
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [payErrors, setPayErrors] = useState<Record<string, string>>({});
  const [editPayErrors, setEditPayErrors] = useState<Record<string, string>>({});

  const closeDatePickers = () => {
    setShowStartPicker(false);
    setShowEndPicker(false);
    setShowPayDatePicker(false);
    setShowEditTenantStart(false);
    setShowEditTenantEnd(false);
    setShowEditPayDatePicker(false);
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

  const fetchTenant = useCallback(async () => {
    if (!tenantId) return;
    setLoadingTenant(true);
    try {
      const { data, error } = await offlineDb.select("tenants", {
        userId: uid,
        eq: { id: tenantId },
        single: true,
      });
      if (error) throw error;
      setTenant(data);
    } catch (e) {
      if (__DEV__) console.error("fetchTenant error:", e);
      if (isWeb) window.alert(`${t("error")}: ${t("failedToLoadData")}`);
      else showAlert(t("error"), t("failedToLoadData"));
    } finally {
      setLoadingTenant(false);
    }
  }, [tenantId, uid]);

  const fetchPayments = useCallback(async () => {
    if (!tenantId) return;
    setLoadingPayments(true);
    try {
      const { data, error } = await offlineDb.select("payments", {
        userId: uid,
        columns: "id, amount, payment_date, month_year",
        eq: { tenant_id: tenantId },
        order: { column: "payment_date", ascending: false },
      });
      if (error) throw error;
      setPayments(data ?? []);
    } catch (e) {
      if (__DEV__) console.error("fetchPayments error:", e);
    } finally {
      setLoadingPayments(false);
    }
  }, [tenantId, uid]);

  const fetchPreviousTenants = useCallback(async () => {
    if (!propertyId || !unitNumber) return;
    try {
      const { data } = await offlineDb.select("tenants", {
        userId: uid,
        columns: "id, name, phone, unit_number, monthly_rent, lease_start, lease_end, status, payment_frequency, whatsapp_enabled, maintenance_enabled, maintenance_token",
        eq: { property_id: propertyId, unit_number: unitNumber, status: "expired" },
        order: { column: "lease_end", ascending: false },
      });
      setPreviousTenants(data ?? []);
    } catch (e) {
      if (__DEV__) console.error("fetchPreviousTenants error:", e);
    }
  }, [propertyId, unitNumber, uid]);

  useFocusEffect(
    useCallback(() => {
      if (!isVacant) {
        fetchTenant();
        fetchPayments();
      }
      fetchPreviousTenants();
    }, [isVacant, fetchTenant, fetchPayments, fetchPreviousTenants])
  );

  // Check for Ejar import data when screen gains focus
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(userKey(uid, EJAR_IMPORT_KEY)).then((raw) => {
        if (!raw) return;
        AsyncStorage.removeItem(userKey(uid, EJAR_IMPORT_KEY)); // consume it
        try {
          const d = JSON.parse(raw);
          setForm({
            name: d.name || "",
            phone: "",
            monthly_rent: d.rent || "",
            lease_start: d.lease_start || "",
            lease_end: d.lease_end || "",
            payment_frequency: (d.payment_frequency as PaymentFrequency) || "monthly",
          });
          setShowAddModal(true);
        } catch {}
      });
    }, [])
  );

  // Load unit documents
  useEffect(() => {
    if (!isPro || !uid || !propertyId) return;
    getDocuments(uid, { propertyId: propertyId as string, unitId: unitNumber as string }).then(setUnitDocs).catch(() => {});
  }, [isPro, uid, propertyId, unitNumber]);

  // ── Add Tenant ──────────────────────────────────────────────
  const handleAddTenant = async () => {
    if (!propertyId || !unitNumber) {
      if (isWeb) window.alert(`${t("error")}: ${t("failedToLoadData")}`);
      else showAlert(t("error"), t("failedToLoadData"));
      return;
    }
    const errors: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length < 4) {
      errors.name = t("validationNameTooShort");
    }
    if (form.phone.trim() && !/^05\d{8}$/.test(form.phone.trim())) {
      errors.phone = t("validationPhoneInvalid");
    }
    if (!form.monthly_rent.trim() || parseFloat(form.monthly_rent) <= 0) {
      errors.rent = t("validationAmountPositive");
    } else if (parseFloat(form.monthly_rent) > 999999) {
      errors.rent = t("validationRentTooHigh");
    }
    if (!form.lease_start) {
      errors.leaseStart = t("leaseStartRequired");
    }
    if (!form.lease_end) {
      errors.leaseEnd = t("leaseEndRequired");
    } else if (form.lease_start && form.lease_end < form.lease_start) {
      errors.leaseEnd = t("validationLeaseEndBeforeStart");
    }
    setAddErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    try {
      const leaseEnd = form.lease_end;
      const status =
        leaseEnd && leaseEnd < new Date().toISOString().split("T")[0]
          ? "expired"
          : "active";
      const { error } = await offlineDb.insert("tenants", uid, {
        property_id: propertyId,
        unit_number: unitNumber,
        name: form.name.trim(),
        phone: form.phone.trim(),
        monthly_rent: parseFloat(form.monthly_rent) || 0,
        lease_start: form.lease_start || null,
        lease_end: leaseEnd || null,
        payment_frequency: form.payment_frequency,
        status,
      });
      if (error) throw error;
      await refreshPendingCount();
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      router.back();
    } catch (e: any) {
      if (isWeb) window.alert(`${t("error")}: ${e.message}`);
      else showAlert(t("error"), e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Collect Payment ─────────────────────────────────────────
  const doInsertPayment = async () => {
    const resolvedTenantId = tenant?.id || tenantId;
    const resolvedPropertyId = (tenant as any)?.property_id || propertyId;
    if (!resolvedTenantId || !resolvedPropertyId) {
      if (isWeb) window.alert(`${t("error")}: ${t("failedToLoadData")}`);
      else showAlert(t("error"), t("failedToLoadData"));
      return;
    }
    setSavingPay(true);
    try {
      const monthYear = getDuePeriodMonth(
        tenant?.lease_start ?? payDate,
        tenant?.payment_frequency,
        payDate,
      );
      const { error } = await offlineDb.insert("payments", uid, {
        tenant_id: resolvedTenantId,
        property_id: resolvedPropertyId,
        amount: parseFloat(payAmount),
        payment_date: payDate,
        month_year: monthYear,
      });
      if (error) {
        if (isWeb) window.alert(`${t("error")}: ${error.message}`);
        else showAlert(t("error"), error.message);
        setSavingPay(false);
        return;
      }
      await refreshPendingCount();
      // Fire instant payment notification
      if (notifSettings.paymentConfirmationEnabled && tenant) {
        addNotification({
          type: "payment_received",
          title: t("paymentReceivedTitle"),
          body: t("paymentReceivedBody").replace("%amount%", payAmount).replace("%name%", tenant.name),
          tenantId,
          propertyId,
        });
      }
      setShowPayModal(false);
      const savedAmount = payAmount;
      const savedDate = payDate;
      const savedMonthYear = monthYear;
      setPayAmount("");
      setPayNotes("");
      setPayDate(new Date().toISOString().split("T")[0]);
      fetchPayments();
      // Offer to share receipt
      if (tenant) {
        crossAlert(
          "✅",
          t("paymentRecorded"),
          [
            { text: t("cancel"), style: "cancel" },
            {
              text: t("shareReceipt"),
              onPress: () => {
                const receiptData: ReceiptData = {
                  receiptNumber: `RCP-${Date.now().toString(36).toUpperCase()}`,
                  tenantName: tenant.name,
                  propertyName: propertyName || "",
                  unitNumber: unitLabel || unitNumber || "",
                  amount: parseFloat(savedAmount),
                  paymentDate: savedDate,
                  monthYear: savedMonthYear,
                  lang,
                };
                generateAndShareReceipt(receiptData).catch(() => {});
              },
            },
          ]
        );
      }
    } catch (e: any) {
      if (isWeb) window.alert(`${t("error")}: ${e.message}`);
      else showAlert(t("error"), e.message);
    } finally {
      setSavingPay(false);
    }
  };

  const handleCollectPayment = async () => {
    const errors: Record<string, string> = {};
    if (!payAmount || isNaN(parseFloat(payAmount)) || parseFloat(payAmount) <= 0) {
      errors.amount = t("validationAmountPositive");
    } else if (parseFloat(payAmount) > 999999) {
      errors.amount = t("validationAmountTooHigh");
    }
    const today = new Date().toISOString().split("T")[0];
    if (payDate > today) {
      errors.date = t("validationFutureDateNotAllowed");
    }
    setPayErrors(errors);
    if (Object.keys(errors).length > 0) return;
    // Duplicate payment detection (#7)
    const d = new Date(payDate);
    const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const existing = payments.find((p) => p.month_year === monthYear);
    if (existing) {
      if (isWeb) {
        const proceed = window.confirm(
          t("duplicatePaymentWarning") ?? `A payment for ${monthYear} already exists. Record anyway?`
        );
        if (proceed) doInsertPayment();
      } else {
        crossAlert(
          "⚠️",
          t("duplicatePaymentWarning") ?? `A payment for ${monthYear} already exists. Record anyway?`,
          [
            { text: t("cancel"), style: "cancel" },
            { text: t("proceed") ?? "Proceed", onPress: doInsertPayment },
          ],
        );
      }
      return;
    }
    doInsertPayment();
  };

  // ── End Lease ────────────────────────────────────────────────
  const handleEndLease = () => {
    const resolvedId = tenant?.id || tenantId;
    if (!resolvedId) return;
    const doEnd = async () => {
      setEndingLease(true);
      try {
        const { error } = await offlineDb.update("tenants", uid, { id: resolvedId }, { status: "expired" });
        if (error) throw error;
        await refreshPendingCount();
        fetchTenant();
      } catch (e: any) {
        if (isWeb) window.alert(e.message);
        else showAlert(t("error"), e.message);
      } finally {
        setEndingLease(false);
      }
    };
    crossAlert(
      t("endLease"),
      `${t("endLease")} ${tenant?.name}?`,
      [
        { text: t("cancel"), style: "cancel" },
        { text: t("endLease"), style: "destructive", onPress: doEnd },
      ]
    );
  };

  // ── Renew Lease ────────────────────────────────────────────
  const openRenewLease = () => {
    setRenewLeaseEnd("");
    setShowRenewDatePicker(false);
    setShowRenewModal(true);
  };

  const handleRenewLease = async () => {
    if (!renewLeaseEnd) {
      if (isWeb) window.alert(`${t("error")}: ${t("selectDate")}`);
      else showAlert(t("error"), t("selectDate"));
      return;
    }
    const resolvedId = tenant?.id || tenantId;
    if (!resolvedId) return;
    setRenewingLease(true);
    try {
      const updates: Record<string, string> = { lease_end: renewLeaseEnd };
      // Set lease_start to current lease_end (start of new term)
      if (tenant?.lease_end) updates.lease_start = tenant.lease_end;
      const { error } = await offlineDb.update("tenants", uid, { id: resolvedId }, updates);
      if (error) throw error;
      await refreshPendingCount();
      setShowRenewModal(false);
      if (isWeb) window.alert(t("leaseRenewed"));
      else showAlert("✅", t("leaseRenewed"));
      fetchTenant();
    } catch (e: any) {
      if (isWeb) window.alert(`${t("error")}: ${e.message}`);
      else showAlert(t("error"), e.message);
    } finally {
      setRenewingLease(false);
    }
  };

  // ── Edit Tenant ─────────────────────────────────────────────
  const openEditTenant = () => {
    if (!tenant) return;
    setEditTenantForm({
      name: tenant.name,
      phone: tenant.phone ?? "",
      monthly_rent: String(tenant.monthly_rent),
      lease_start: tenant.lease_start ?? "",
      lease_end: tenant.lease_end ?? "",
      payment_frequency: (tenant.payment_frequency as PaymentFrequency) ?? "monthly",
    });
    setShowEditTenantModal(true);
  };

  const handleEditTenant = async () => {
    const errors: Record<string, string> = {};
    if (!tenant) return;
    if (!editTenantForm.name.trim() || editTenantForm.name.trim().length < 4) {
      errors.name = t("validationNameTooShort");
    }
    if (editTenantForm.phone.trim() && !/^05\d{8}$/.test(editTenantForm.phone.trim())) {
      errors.phone = t("validationPhoneInvalid");
    }
    if (!editTenantForm.monthly_rent.trim() || parseFloat(editTenantForm.monthly_rent) <= 0) {
      errors.rent = t("validationAmountPositive");
    } else if (parseFloat(editTenantForm.monthly_rent) > 999999) {
      errors.rent = t("validationRentTooHigh");
    }
    if (!editTenantForm.lease_start) {
      errors.leaseStart = t("leaseStartRequired");
    }
    if (!editTenantForm.lease_end) {
      errors.leaseEnd = t("leaseEndRequired");
    } else if (editTenantForm.lease_start && editTenantForm.lease_end < editTenantForm.lease_start) {
      errors.leaseEnd = t("validationLeaseEndBeforeStart");
    }
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSavingEditTenant(true);
    try {
      const leaseEnd = editTenantForm.lease_end;
      const status = leaseEnd && leaseEnd < new Date().toISOString().split("T")[0] ? "expired" : "active";
      const { error } = await offlineDb.update("tenants", uid, { id: tenant.id }, {
        name: editTenantForm.name.trim(),
        phone: editTenantForm.phone.trim(),
        monthly_rent: parseFloat(editTenantForm.monthly_rent) || 0,
        lease_start: editTenantForm.lease_start || null,
        lease_end: leaseEnd,
        payment_frequency: editTenantForm.payment_frequency,
        status,
      });
      if (error) throw error;
      await refreshPendingCount();
      setShowEditTenantModal(false);
      fetchTenant();
    } catch (e: any) {
      if (isWeb) window.alert(`${t("error")}: ${e.message}`);
      else showAlert(t("error"), e.message);
    } finally {
      setSavingEditTenant(false);
    }
  };

  // ── Edit Payment ─────────────────────────────────────────────
  const handleEditPayment = async () => {
    const errors: Record<string, string> = {};
    if (!editPayment) return;
    if (!editPayAmount || isNaN(parseFloat(editPayAmount)) || parseFloat(editPayAmount) <= 0) {
      errors.amount = t("validationAmountPositive");
    } else if (parseFloat(editPayAmount) > 999999) {
      errors.amount = t("validationAmountTooHigh");
    }
    const today = new Date().toISOString().split("T")[0];
    if (editPayDate > today) {
      errors.date = t("validationFutureDateNotAllowed");
    }
    setEditPayErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setSavingEditPay(true);
    try {
      const d = new Date(editPayDate);
      const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const { error } = await offlineDb.update("payments", uid, { id: editPayment.id }, {
        amount: parseFloat(editPayAmount),
        payment_date: editPayDate,
        month_year: monthYear,
      });
      if (error) throw error;
      await refreshPendingCount();
      setEditPayModal(false);
      setEditPayment(null);
      fetchPayments();
    } catch (e: any) {
      if (isWeb) window.alert(`${t("error")}: ${e.message}`);
      else showAlert(t("error"), e.message);
    } finally {
      setSavingEditPay(false);
    }
  };

  const formatDate = (d?: string) => formatDualDate(d, lang, showHijri);

  const formatCurrency = (n: number) =>
    `${n.toLocaleString()} ${t("sar")}`;

  // ── Render Vacant ────────────────────────────────────────────
  const renderVacant = () => (
    <ScrollView contentContainerStyle={S.vacantScroll} showsVerticalScrollIndicator={false}>
      <View style={S.vacantWrap}>
        <View style={S.vacantIconCircle}>
          <Text style={S.vacantIcon}>🏠</Text>
        </View>
        <Text style={S.vacantTitle}>{t("vacant")}</Text>
        <Text style={S.vacantSub}>{t("noTenantYet")}</Text>
        <TouchableOpacity style={S.addTenantBtn} onPress={() => setAddChoiceVisible(true)}>
          <Text style={S.addTenantBtnText}>+ {t("addTenantToUnit")}</Text>
        </TouchableOpacity>
      </View>

      {previousTenants.length > 0 && (
        <View style={[S.card, { margin: spacing.md }]}>
          <Text style={S.cardTitle}>{t("previousTenants")}</Text>
          {previousTenants.map((pt, idx) => (
            <View key={pt.id}>
              {idx > 0 && <View style={S.divider} />}
              <View style={S.prevTenantRow}>
                <View style={S.prevAvatar}>
                  <Text style={S.prevAvatarText}>{pt.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.prevName}>{pt.name}</Text>
                  <Text style={S.prevDates}>
                    {formatDate(pt.lease_start)} → {formatDate(pt.lease_end)}
                  </Text>
                  <Text style={S.prevRent}>{formatCurrency(pt.monthly_rent)}/mo</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
      {isPro && unitDocs.length > 0 && (
        <View style={{ marginTop: 16, paddingHorizontal: spacing.md }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>📁 {t("documents")} ({unitDocs.length})</Text>
          {unitDocs.map((doc) => (
            <View key={doc.id} style={[{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }, isRTL && { flexDirection: "row-reverse" }]}>
              <Text style={{ fontSize: 18 }}>{DOC_TYPE_ICONS[doc.type as DocType] || "📄"}</Text>
              <Text style={{ flex: 1, fontSize: 13, color: C.text, textAlign: isRTL ? "right" : "left" }} numberOfLines={1}>{doc.name}</Text>
            </View>
          ))}
          <TouchableOpacity onPress={() => router.push({ pathname: "/vault", params: { propertyId, unitId: unitNumber } } as any)} style={{ paddingVertical: 8 }}>
            <Text style={{ color: C.accent, fontWeight: "600", fontSize: 13 }}>{t("addDocument")} →</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  // ── Render Occupied ──────────────────────────────────────────
  const renderOccupied = () => {
    if (loadingTenant) {
      return (
        <View style={S.center}>
          <ActivityIndicator color={C.primary} />
        </View>
      );
    }
    if (!tenant) return null;

    const isExpired = tenant.status === "expired";

    return (
      <ScrollView
        contentContainerStyle={S.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status banner */}
        <View
          style={[S.statusBanner, isExpired ? S.bannerExpired : S.bannerActive]}
        >
          <Text style={S.statusBannerText}>
            {isExpired ? t("expired") : t("active")}
          </Text>
        </View>

        {/* Tenant info card */}
        <View style={S.card}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={S.cardTitle}>{t("tenantInfo")}</Text>
            <TouchableOpacity style={S.editTenantBtn} onPress={openEditTenant}>
              <Text style={S.editTenantBtnText}>✏️ {t("edit")}</Text>
            </TouchableOpacity>
          </View>
          <View style={S.infoRow}>
            <Text style={S.infoLabel}>{t("tenantName")}</Text>
            <Text style={S.infoValue}>{tenant.name}</Text>
          </View>
          <View style={S.divider} />
          <View style={S.infoRow}>
            <Text style={S.infoLabel}>{t("phone")}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={S.infoValue}>{tenant.phone || "—"}</Text>
              {!!tenant.phone && (
                <>
                  <TouchableOpacity
                    style={{ backgroundColor: "#25D36620", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}
                    onPress={() => {
                      const phone = tenant.phone.startsWith("0")
                        ? "966" + tenant.phone.slice(1)
                        : tenant.phone;
                      Linking.openURL(`https://wa.me/${phone}`).catch(() => {
                        if (isWeb) window.alert(`${t("error")}: ${t("whatsappNotInstalled")}`);
                        else showAlert(t("error"), t("whatsappNotInstalled"));
                      });
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>💬</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ backgroundColor: C.primary + "20", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}
                    onPress={() => Linking.openURL(`tel:${tenant.phone}`)}
                  >
                    <Text style={{ fontSize: 16 }}>📞</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
          <View style={S.divider} />
          <View style={S.infoRow}>
            <Text style={S.infoLabel}>{t("rent")}</Text>
            <Text style={[S.infoValue, { color: C.primary, fontWeight: "700" }]}>
              {formatCurrency(tenant.monthly_rent)}
            </Text>
          </View>
          <View style={S.divider} />
          <View style={S.infoRow}>
            <Text style={S.infoLabel}>{t("frequency")}</Text>
            <Text style={S.infoValue}>
              {tenant.payment_frequency === "annual" ? t("annual") :
               tenant.payment_frequency === "semi_annual" ? t("semiAnnual") :
               tenant.payment_frequency === "quarterly" ? t("quarterly") :
               t("monthly")}
            </Text>
          </View>
          <View style={S.divider} />
          <View style={S.infoRow}>
            <Text style={S.infoLabel}>{t("leaseStart")}</Text>
            <Text style={S.infoValue}>{formatDate(tenant.lease_start)}</Text>
          </View>
          <View style={S.divider} />
          <View style={S.infoRow}>
            <Text style={S.infoLabel}>{t("leaseEnd")}</Text>
            <Text style={[S.infoValue, isExpired && { color: C.danger }]}>
              {formatDate(tenant.lease_end)}
            </Text>
          </View>
        </View>

        {/* Collect payment button — only for active tenants */}
        {!isExpired && (
          <TouchableOpacity
            style={S.collectBtn}
            onPress={() => setShowPayModal(true)}
          >
            <Text style={S.collectBtnText}>
              💰 {t("collectPayment")}
            </Text>
          </TouchableOpacity>
        )}

        {/* Send WhatsApp Reminder — only for active tenants */}
        {!isExpired && !!tenant.phone && (
          <TouchableOpacity
            style={{
              backgroundColor: "#25D366",
              borderRadius: radii.md,
              paddingVertical: 14,
              alignItems: "center",
              marginBottom: 14,
            }}
            onPress={() => {
              const phone = tenant.phone.startsWith("0")
                ? "966" + tenant.phone.slice(1)
                : tenant.phone;
              const message = t("reminderMessage")
                .replace("%name%", tenant.name)
                .replace("%amount%", String(tenant.monthly_rent));
              const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;
              Linking.openURL(url).catch(() => {
                if (isWeb) window.alert(`${t("error")}: ${t("whatsappNotInstalled")}`);
                else showAlert(t("error"), t("whatsappNotInstalled"));
              });
            }}
            activeOpacity={0.8}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              📱 {t("sendReminder")}
            </Text>
          </TouchableOpacity>
        )}

        {/* Renew Lease button — only for active tenants */}
        {!isExpired && (
          <TouchableOpacity
            style={S.renewLeaseBtn}
            onPress={openRenewLease}
          >
            <Text style={S.renewLeaseBtnText}>
              🔄 {t("renewLease")}
            </Text>
          </TouchableOpacity>
        )}

        {/* End Lease button — only for active tenants */}
        {!isExpired && (
          <TouchableOpacity
            style={S.endLeaseBtn}
            onPress={handleEndLease}
            disabled={endingLease}
          >
            {endingLease ? (
              <ActivityIndicator color="#EF4444" size="small" />
            ) : (
              <Text style={S.endLeaseBtnText}>
                🔴 {t("endLease")}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* Add new tenant button — for expired tenants */}
        {isExpired && (
          <TouchableOpacity
            style={S.addTenantBtn}
            onPress={() => setAddChoiceVisible(true)}
          >
            <Text style={S.addTenantBtnText}>
              + {t("addTenantToUnit")}
            </Text>
          </TouchableOpacity>
        )}

        {/* WhatsApp & Maintenance Settings */}
        {!isExpired && (
          <View style={[S.card, { marginBottom: 14 }]}>
            <Text style={S.cardTitle}>{"⚙️ " + t("settings")}</Text>

            {/* WhatsApp Toggle */}
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: "600", fontSize: 14 }}>{"📱 " + t("whatsappEnabled")}</Text>
                <Text style={{ color: C.subText, fontSize: 12, marginTop: 2 }}>
                  {tenant.phone ? t("whatsappEnabledDesc") : t("whatsappRequiresPhone")}
                </Text>
              </View>
              <Switch
                value={tenant.whatsapp_enabled !== false && !!tenant.phone}
                disabled={!tenant.phone}
                onValueChange={async (val) => {
                  setTenant((prev) => prev ? { ...prev, whatsapp_enabled: val } : prev);
                  const { error } = await offlineDb.update("tenants", uid, { id: tenant.id }, { whatsapp_enabled: val });
                  if (error) setTenant((prev) => prev ? { ...prev, whatsapp_enabled: !val } : prev);
                }}
                trackColor={{ false: "#ccc", true: "#25D366" }}
                thumbColor="#fff"
              />
            </View>

            {/* Maintenance Toggle */}
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontWeight: "600", fontSize: 14 }}>{"🔧 " + t("maintenanceEnabled")}</Text>
                <Text style={{ color: C.subText, fontSize: 12, marginTop: 2 }}>{t("maintenanceEnabledDesc")}</Text>
              </View>
              <Switch
                value={tenant.maintenance_enabled === true}
                onValueChange={async (val) => {
                  setTenant((prev) => prev ? { ...prev, maintenance_enabled: val } : prev);
                  const { error } = await offlineDb.update("tenants", uid, { id: tenant.id }, { maintenance_enabled: val });
                  if (error) setTenant((prev) => prev ? { ...prev, maintenance_enabled: !val } : prev);
                }}
                trackColor={{ false: "#ccc", true: C.primary }}
                thumbColor="#fff"
              />
            </View>

            {/* Share Maintenance Link */}
            {tenant.maintenance_enabled && tenant.maintenance_token && (
              <TouchableOpacity
                style={{ backgroundColor: "#25D366", borderRadius: radii.md, paddingVertical: 12, alignItems: "center", marginTop: 10 }}
                onPress={() => {
                  const link = `https://amlakey.vercel.app/maintenance-request?token=${tenant.maintenance_token}`;
                  const phone = tenant.phone?.startsWith("0") ? "966" + tenant.phone.slice(1) : tenant.phone;
                  const msg = lang === "ar"
                    ? `مرحباً ${tenant.name}، يمكنك تقديم طلب صيانة عبر الرابط التالي:\n${link}`
                    : `Hi ${tenant.name}, you can submit a maintenance request here:\n${link}`;
                  if (phone) {
                    Linking.openURL(`whatsapp://send?phone=${phone}&text=${encodeURIComponent(msg)}`).catch(() => {
                      if (isWeb) window.alert(t("whatsappNotInstalled"));
                      else showAlert(t("error"), t("whatsappNotInstalled"));
                    });
                  } else {
                    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`).catch(() => {});
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                  {"📤 " + t("shareMaintenanceLink")}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Payment history */}
        <View style={S.card}>
          <Text style={S.cardTitle}>{t("paymentHistory")}</Text>
          {loadingPayments ? (
            <ActivityIndicator color={C.primary} style={{ marginVertical: 16 }} />
          ) : payments.length === 0 ? (
            <Text style={S.noPayText}>{t("noPayments")}</Text>
          ) : (
            <>
              {(showAllPayments ? payments : payments.slice(0, 5)).map((p, idx) => (
                <View key={p.id}>
                  {idx > 0 && <View style={S.divider} />}
                  <TouchableOpacity
                    style={S.payRow}
                    activeOpacity={0.85}
                    onLongPress={() => {
                      setEditPayment(p);
                      setEditPayAmount(String(p.amount));
                      setEditPayDate(p.payment_date);
                      setEditPayModal(true);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={S.payMonth}>{p.month_year}</Text>
                      <Text style={S.payDate}>{formatDate(p.payment_date)}</Text>
                      <Text style={S.payEditHint}>{t("holdToEdit")}</Text>
                    </View>
                    <Text style={S.payAmount}>{formatCurrency(p.amount)}</Text>
                    <TouchableOpacity
                      style={{ marginLeft: isRTL ? 0 : 8, marginRight: isRTL ? 8 : 0, padding: 6, backgroundColor: C.primary + "15", borderRadius: 8 }}
                      onPress={() => {
                        if (!tenant) return;
                        const receiptData: ReceiptData = {
                          receiptNumber: `RCP-${p.id.slice(0, 8).toUpperCase()}`,
                          tenantName: tenant.name,
                          propertyName: propertyName || "",
                          unitNumber: unitLabel || unitNumber || "",
                          amount: p.amount,
                          paymentDate: p.payment_date,
                          monthYear: p.month_year,
                          lang,
                        };
                        generateAndShareReceipt(receiptData).catch(() => {});
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>📄</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                </View>
              ))}
              {payments.length > 5 && !showAllPayments && (
                <TouchableOpacity style={S.showAllBtn} onPress={() => setShowAllPayments(true)}>
                  <Text style={S.showAllBtnText}>{t("showAll") ?? "Show All"} ({payments.length})</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Previous tenants history */}
        {previousTenants.length > 0 && (
          <View style={S.card}>
            <Text style={S.cardTitle}>{t("previousTenants")}</Text>
            {previousTenants.map((pt, idx) => (
              <View key={pt.id}>
                {idx > 0 && <View style={S.divider} />}
                <View style={S.prevTenantRow}>
                  <View style={S.prevAvatar}>
                    <Text style={S.prevAvatarText}>{pt.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={S.prevName}>{pt.name}</Text>
                    <Text style={S.prevDates}>
                      {formatDate(pt.lease_start)} → {formatDate(pt.lease_end)}
                    </Text>
                    <Text style={S.prevRent}>{formatCurrency(pt.monthly_rent)}/mo</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {isPro && unitDocs.length > 0 && (
          <View style={{ marginTop: 16, paddingHorizontal: spacing.md }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>📁 {t("documents")} ({unitDocs.length})</Text>
            {unitDocs.map((doc) => (
              <View key={doc.id} style={[{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }, isRTL && { flexDirection: "row-reverse" }]}>
                <Text style={{ fontSize: 18 }}>{DOC_TYPE_ICONS[doc.type as DocType] || "📄"}</Text>
                <Text style={{ flex: 1, fontSize: 13, color: C.text, textAlign: isRTL ? "right" : "left" }} numberOfLines={1}>{doc.name}</Text>
              </View>
            ))}
            <TouchableOpacity onPress={() => router.push({ pathname: "/vault", params: { propertyId, unitId: unitNumber } } as any)} style={{ paddingVertical: 8 }}>
              <Text style={{ color: C.accent, fontWeight: "600", fontSize: 13 }}>{t("addDocument")} →</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  return (
    <View style={S.container}>
      <WebContainer maxWidth={800}>
      {/* Header */}
      <View style={[S.header, { paddingTop: insets.top + 10 }, isRTL && S.headerRTL]}>
        <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
          <Text style={S.backArrow}>{isRTL ? "›" : "‹"}</Text>
        </TouchableOpacity>
        <View style={S.headerTextWrap}>
          <Text style={S.headerTitle}>
            {propertyName} — {unitLabel || `${t("unit")} ${unitNumber}`}
          </Text>
          <Text style={S.headerSub}>{t("unitDetails")}</Text>
        </View>
      </View>

      {isVacant ? renderVacant() : renderOccupied()}
      </WebContainer>

      {/* ── Edit Payment Modal ── */}
      <Modal
        visible={editPayModal}
        animationType="slide"
        transparent
        onRequestClose={() => setEditPayModal(false)}
      >
        <ModalOverlay style={S.modalOverlay} onDismiss={() => { dismissAll(); setEditPayModal(false); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={[S.modalSheet, { maxHeight: "90%" }]}
            {...webContentClickStop}
          >
            <Text style={S.modalTitle}>
              ✏️ {t("editPayment")}
            </Text>

            <Text style={S.fieldLabel}>{t("amount")} *</Text>
            <TextInput
              style={[S.input, !!editPayErrors.amount && S.inputError]}
              value={editPayAmount}
              onChangeText={(v) => { setEditPayAmount(v); const num = parseFloat(v); setEditPayErrors((e) => ({ ...e, amount: v.trim() && (isNaN(num) || num <= 0) ? t("validationAmountPositive") : v.trim() && num > 999999 ? t("validationAmountTooHigh") : "" })); }}
              placeholder="0"
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
              textAlign={isRTL ? "right" : "left"}
            />
            {!!editPayErrors.amount && <Text style={S.fieldError}>{editPayErrors.amount}</Text>}

            <Text style={S.fieldLabel}>{t("paymentDate")}</Text>
            {isWeb ? (
              <WebDateInput
                value={editPayDate}
                onChange={(val) => { setEditPayDate(val); const today = new Date().toISOString().split("T")[0]; setEditPayErrors((e) => ({ ...e, date: val > today ? t("validationFutureDateNotAllowed") : "" })); }}
                textColor={C.text}
                backgroundColor={C.surfaceElevated}
                borderColor={editPayErrors.date ? "#EF4444" : C.border}
              />
            ) : (
              <>
                <TouchableOpacity
                  style={[S.dateBtn, !!editPayErrors.date && S.inputError]}
                  onPress={() => setShowEditPayDatePicker(true)}
                >
                  <Text style={S.dateBtnText}>📅 {editPayDate}</Text>
                </TouchableOpacity>
                {showEditPayDatePicker && (
                  <>
                    <DateTimePicker
                      value={editPayDate ? new Date(editPayDate) : new Date()}
                      mode="date"
                      display="spinner"
                      locale="en-US"
                      themeVariant={isDark ? "dark" : "light"}
                      onChange={(_: any, d?: Date) => {
                        if (d) { const dateStr = d.toISOString().split("T")[0]; setEditPayDate(dateStr); const today = new Date().toISOString().split("T")[0]; setEditPayErrors((e) => ({ ...e, date: dateStr > today ? t("validationFutureDateNotAllowed") : "" })); }
                      }}
                    />
                    <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowEditPayDatePicker(false)}>
                      <Text style={S.pickerConfirmText}>{t("done")}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
            {!!editPayErrors.date && <Text style={S.fieldError}>{editPayErrors.date}</Text>}

            <View style={S.modalActions}>
              <TouchableOpacity
                style={S.cancelBtn}
                onPress={() => setEditPayModal(false)}
              >
                <Text style={S.cancelBtnText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.saveBtn, savingEditPay && S.saveBtnDisabled]}
                onPress={handleEditPayment}
                disabled={savingEditPay}
              >
                {savingEditPay ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={S.saveBtnText}>{t("save")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </ModalOverlay>
      </Modal>

      {/* ── Renew Lease Modal ── */}
      <Modal
        visible={showRenewModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowRenewModal(false)}
      >
        <ModalOverlay style={S.modalOverlay} onDismiss={() => { dismissAll(); setShowRenewModal(false); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={[S.modalSheet, { maxHeight: "90%" }]}
            {...webContentClickStop}
          >
            <Text style={S.modalTitle}>{t("renewLease")}</Text>
            <Text style={{ fontSize: 13, color: C.textMuted, marginBottom: 16, textAlign: isRTL ? "right" : "left" }}>
              {t("renewLeaseConfirm")}
            </Text>

            {tenant && (
              <View style={[S.card, { marginBottom: 16, paddingVertical: 12 }]}>
                <View style={S.infoRow}>
                  <Text style={S.infoLabel}>{t("tenantName")}</Text>
                  <Text style={S.infoValue}>{tenant.name}</Text>
                </View>
              </View>
            )}

            <Text style={S.fieldLabel}>{t("newLeaseEnd")} *</Text>
            {isWeb ? (
              <WebDateInput
                value={renewLeaseEnd}
                onChange={(val) => setRenewLeaseEnd(val)}
                textColor={C.text}
                backgroundColor={C.surfaceElevated}
                borderColor={C.border}
              />
            ) : (
              <>
                <TouchableOpacity
                  style={S.dateBtn}
                  onPress={() => setShowRenewDatePicker(!showRenewDatePicker)}
                >
                  <Text style={S.dateBtnText}>
                    📅 {renewLeaseEnd || t("selectDate")}
                  </Text>
                </TouchableOpacity>
                {showRenewDatePicker && (
                  <>
                    <DateTimePicker
                      value={renewLeaseEnd ? new Date(renewLeaseEnd) : new Date()}
                      mode="date"
                      display="spinner"
                      locale="en-US"
                      themeVariant={isDark ? "dark" : "light"}
                      minimumDate={new Date()}
                      onChange={(_: any, d?: Date) => {
                        if (d) setRenewLeaseEnd(d.toISOString().split("T")[0]);
                      }}
                    />
                    <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowRenewDatePicker(false)}>
                      <Text style={S.pickerConfirmText}>{t("done")}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}

            <View style={S.modalActions}>
              <TouchableOpacity
                style={S.cancelBtn}
                onPress={() => setShowRenewModal(false)}
              >
                <Text style={S.cancelBtnText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.saveBtn, renewingLease && S.saveBtnDisabled]}
                onPress={handleRenewLease}
                disabled={renewingLease}
              >
                {renewingLease ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={S.saveBtnText}>{t("renewLease")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </ModalOverlay>
      </Modal>

      {/* ── Add Choice Modal — Manual vs Ejar ── */}
      <Modal visible={addChoiceVisible} animationType="fade" transparent onRequestClose={() => setAddChoiceVisible(false)}>
        <ModalOverlay style={S.modalOverlay} onDismiss={() => setAddChoiceVisible(false)}>
            <View style={S.choiceBox} {...webContentClickStop}>
              <Text style={S.choiceTitle}>{t("addTenantToUnit")}</Text>
              <TouchableOpacity
                style={S.choiceOption}
                onPress={() => { setAddChoiceVisible(false); setShowAddModal(true); }}
                activeOpacity={0.75}
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

      {/* ── Add Tenant Modal ── */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <ModalOverlay style={S.modalOverlay} onDismiss={() => { dismissAll(); setShowAddModal(false); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={[S.modalSheet, { maxHeight: "90%" }]}
            {...webContentClickStop}
          >
            <ScrollView
              ref={addTenantScrollRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              <Text style={S.modalTitle}>{t("addTenantToUnit")}</Text>

              <Text style={S.fieldLabel}>{t("tenantName")} *</Text>
              <TextInput
                style={[S.input, !!addErrors.name && S.inputError]}
                value={form.name}
                onFocus={closeDatePickers}
                onChangeText={(v) => { setForm((f) => ({ ...f, name: v })); setAddErrors((e) => ({ ...e, name: v.trim().length > 0 && v.trim().length < 4 ? t("validationNameTooShort") : "" })); }}
                placeholder={t("tenantName")}
                placeholderTextColor={C.textMuted}
                textAlign={isRTL ? "right" : "left"}
              />
              {!!addErrors.name && <Text style={S.fieldError}>{addErrors.name}</Text>}

              <Text style={S.fieldLabel}>{t("phone")}</Text>
              <TextInput
                style={[S.input, !!addErrors.phone && S.inputError]}
                value={form.phone}
                onFocus={closeDatePickers}
                onChangeText={(v) => { const cleaned = v.replace(/\D/g, "").slice(0, 10); setForm((f) => ({ ...f, phone: cleaned })); setAddErrors((e) => ({ ...e, phone: cleaned.length > 0 && !/^05\d{8}$/.test(cleaned) ? t("validationPhoneInvalid") : "" })); }}
                placeholder="05XXXXXXXX"
                placeholderTextColor={C.textMuted}
                keyboardType="number-pad"
                maxLength={10}
                textAlign={isRTL ? "right" : "left"}
              />
              {!!addErrors.phone && <Text style={S.fieldError}>{addErrors.phone}</Text>}

              <Text style={S.fieldLabel}>{t("rent")} *</Text>
              <TextInput
                style={[S.input, !!addErrors.rent && S.inputError]}
                value={form.monthly_rent}
                onFocus={closeDatePickers}
                onChangeText={(v) => { setForm((f) => ({ ...f, monthly_rent: v })); const num = parseFloat(v); setAddErrors((e) => ({ ...e, rent: v.trim() && (isNaN(num) || num <= 0) ? t("validationAmountPositive") : v.trim() && num > 999999 ? t("validationRentTooHigh") : "" })); }}
                placeholder="0"
                placeholderTextColor={C.textMuted}
                keyboardType="numeric"
                textAlign={isRTL ? "right" : "left"}
              />
              {!!addErrors.rent && <Text style={S.fieldError}>{addErrors.rent}</Text>}

              <Text style={S.fieldLabel}>{t("paymentFrequencyLabel")}</Text>
              <View style={[S.freqRow, isRTL && { flexDirection: "row-reverse" }]}>
                {([
                  { key: "monthly",    labelKey: "monthly" as const },
                  { key: "semi_annual", labelKey: "semiAnnual" as const },
                  { key: "annual",     labelKey: "annual" as const },
                ] as { key: PaymentFrequency; labelKey: "monthly" | "semiAnnual" | "annual" }[]).map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[S.freqBtn, form.payment_frequency === opt.key && S.freqBtnActive]}
                    onPress={() => setForm((f) => ({ ...f, payment_frequency: opt.key }))}
                  >
                    <Text style={[S.freqBtnText, form.payment_frequency === opt.key && S.freqBtnTextActive]}>
                      {t(opt.labelKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={S.fieldLabel}>{t("leaseStart")} *</Text>
              {isWeb ? (
                <>
                  <WebDateInput
                    value={form.lease_start}
                    onChange={(val) => { setForm((f) => ({ ...f, lease_start: val })); setAddErrors((e) => ({ ...e, leaseStart: "" })); }}
                    textColor={C.text}
                    backgroundColor={C.surfaceElevated}
                    borderColor={addErrors.leaseStart ? "#EF4444" : C.border}
                    error={!!addErrors.leaseStart}
                  />
                  {!!addErrors.leaseStart && <Text style={{ color: "#EF4444", fontSize: 12, marginBottom: 4 }}>{addErrors.leaseStart}</Text>}
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[S.dateBtn, !!addErrors.leaseStart && { borderColor: "#EF4444" }]}
                    onPress={() => { Keyboard.dismiss(); setShowEndPicker(false); setShowStartPicker(true); setAddErrors((e) => ({ ...e, leaseStart: "" })); setTimeout(() => addTenantScrollRef.current?.scrollToEnd({ animated: true }), 100); }}
                  >
                    <Text style={[S.dateBtnText, !form.lease_start && S.datePlaceholder]}>
                      📅 {form.lease_start || t("selectDate")}
                    </Text>
                  </TouchableOpacity>
                  {!!addErrors.leaseStart && <Text style={{ color: "#EF4444", fontSize: 12, marginBottom: 4 }}>{addErrors.leaseStart}</Text>}
                  {showStartPicker && (
                    <>
                      <DateTimePicker
                        value={form.lease_start ? new Date(form.lease_start) : new Date()}
                        mode="date"
                        display="spinner"
                        locale="en-US"
                        themeVariant={isDark ? "dark" : "light"}
                        onChange={(_: any, d?: Date) => {
                          if (d) setForm((f) => ({ ...f, lease_start: d.toISOString().split("T")[0] }));
                        }}
                      />
                      <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowStartPicker(false)}>
                        <Text style={S.pickerConfirmText}>{t("done")}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}

              <Text style={S.fieldLabel}>{t("leaseEnd")}</Text>
              {isWeb ? (
                <>
                  <WebDateInput
                    value={form.lease_end}
                    onChange={(val) => { setForm((f) => ({ ...f, lease_end: val })); setAddErrors((e) => ({ ...e, leaseEnd: form.lease_start && val < form.lease_start ? t("validationLeaseEndBeforeStart") : "" })); }}
                    textColor={C.text}
                    backgroundColor={C.surfaceElevated}
                    borderColor={addErrors.leaseEnd ? "#EF4444" : C.border}
                    error={!!addErrors.leaseEnd}
                  />
                  {!!addErrors.leaseEnd && <Text style={S.fieldError}>{addErrors.leaseEnd}</Text>}
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[S.dateBtn, !!addErrors.leaseEnd && S.inputError]}
                    onPress={() => { Keyboard.dismiss(); setShowStartPicker(false); setShowEndPicker(true); setTimeout(() => addTenantScrollRef.current?.scrollToEnd({ animated: true }), 100); }}
                  >
                    <Text style={[S.dateBtnText, !form.lease_end && S.datePlaceholder]}>
                      📅 {form.lease_end || t("selectDate")}
                    </Text>
                  </TouchableOpacity>
                  {showEndPicker && (
                    <>
                      <DateTimePicker
                        value={form.lease_end ? new Date(form.lease_end) : new Date()}
                        mode="date"
                        display="spinner"
                        locale="en-US"
                        themeVariant={isDark ? "dark" : "light"}
                        onChange={(_: any, d?: Date) => {
                          if (d) { const dateStr = d.toISOString().split("T")[0]; setForm((f) => ({ ...f, lease_end: dateStr })); setAddErrors((e) => ({ ...e, leaseEnd: form.lease_start && dateStr < form.lease_start ? t("validationLeaseEndBeforeStart") : "" })); }
                        }}
                      />
                      <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowEndPicker(false)}>
                        <Text style={S.pickerConfirmText}>{t("done")}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {!!addErrors.leaseEnd && <Text style={S.fieldError}>{addErrors.leaseEnd}</Text>}
                </>
              )}

              <View style={S.modalActions}>
                <TouchableOpacity
                  style={S.cancelBtn}
                  onPress={() => {
                    setShowAddModal(false);
                    setForm(EMPTY_FORM);
                  }}
                >
                  <Text style={S.cancelBtnText}>{t("cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.saveBtn, saving && S.saveBtnDisabled]}
                  onPress={handleAddTenant}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={S.saveBtnText}>{t("save")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </ModalOverlay>
      </Modal>

      {/* ── Collect Payment Modal ── */}
      <Modal
        visible={showPayModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPayModal(false)}
      >
        <ModalOverlay style={S.modalOverlay} onDismiss={() => { dismissAll(); setShowPayModal(false); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={[S.modalSheet, { maxHeight: "90%" }]}
            {...webContentClickStop}
          >
            <Text style={S.modalTitle}>
              {t("collectPayment")}
            </Text>

            <Text style={S.fieldLabel}>{t("amount")} *</Text>
            <TextInput
              style={[S.input, !!payErrors.amount && S.inputError]}
              value={payAmount}
              onChangeText={(v) => { setPayAmount(v); const num = parseFloat(v); setPayErrors((e) => ({ ...e, amount: v.trim() && (isNaN(num) || num <= 0) ? t("validationAmountPositive") : v.trim() && num > 999999 ? t("validationAmountTooHigh") : "" })); }}
              placeholder="0"
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
              textAlign={isRTL ? "right" : "left"}
            />
            {!!payErrors.amount && <Text style={S.fieldError}>{payErrors.amount}</Text>}

            <Text style={S.fieldLabel}>{t("paymentDate")}</Text>
            {isWeb ? (
              <WebDateInput
                value={payDate}
                onChange={(val) => { setPayDate(val); const today = new Date().toISOString().split("T")[0]; setPayErrors((e) => ({ ...e, date: val > today ? t("validationFutureDateNotAllowed") : "" })); }}
                textColor={C.text}
                backgroundColor={C.surfaceElevated}
                borderColor={payErrors.date ? "#EF4444" : C.border}
              />
            ) : (
              <>
                <TouchableOpacity
                  style={[S.dateBtn, !!payErrors.date && S.inputError]}
                  onPress={() => setShowPayDatePicker(true)}
                >
                  <Text style={S.dateBtnText}>📅 {payDate}</Text>
                </TouchableOpacity>
                {showPayDatePicker && (
                  <>
                    <DateTimePicker
                      value={new Date(payDate)}
                      mode="date"
                      display="spinner"
                      locale="en-US"
                      themeVariant={isDark ? "dark" : "light"}
                      onChange={(_: any, d?: Date) => {
                        if (d) { const dateStr = d.toISOString().split("T")[0]; setPayDate(dateStr); const today = new Date().toISOString().split("T")[0]; setPayErrors((e) => ({ ...e, date: dateStr > today ? t("validationFutureDateNotAllowed") : "" })); }
                      }}
                    />
                    <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowPayDatePicker(false)}>
                      <Text style={S.pickerConfirmText}>{t("done")}</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
            {!!payErrors.date && <Text style={S.fieldError}>{payErrors.date}</Text>}

            <Text style={S.fieldLabel}>{t("paymentNotes")}</Text>
            <TextInput
              style={[S.input, { height: 60, textAlignVertical: "top" }]}
              value={payNotes}
              onChangeText={setPayNotes}
              placeholder={t("exampleBankTransfer")}
              placeholderTextColor={C.textMuted}
              multiline
              textAlign={isRTL ? "right" : "left"}
            />

            <View style={S.modalActions}>
              <TouchableOpacity
                style={S.cancelBtn}
                onPress={() => setShowPayModal(false)}
              >
                <Text style={S.cancelBtnText}>{t("cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.saveBtn, savingPay && S.saveBtnDisabled]}
                onPress={handleCollectPayment}
                disabled={savingPay}
              >
                {savingPay ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={S.saveBtnText}>{t("save")}</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </ModalOverlay>
      </Modal>

      {/* ── Edit Tenant Modal ── */}
      <Modal
        visible={showEditTenantModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditTenantModal(false)}
      >
        <ModalOverlay style={S.modalOverlay} onDismiss={() => { dismissAll(); setShowEditTenantModal(false); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={[S.modalSheet, { maxHeight: "90%" }]}
            {...webContentClickStop}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              <Text style={S.modalTitle}>✏️ {t("edit")} {tenant?.name}</Text>

              <Text style={S.fieldLabel}>{t("tenantName")} *</Text>
              <TextInput
                style={[S.input, !!editErrors.name && S.inputError]}
                value={editTenantForm.name}
                onChangeText={(v) => { setEditTenantForm((f) => ({ ...f, name: v })); setEditErrors((e) => ({ ...e, name: v.trim().length > 0 && v.trim().length < 4 ? t("validationNameTooShort") : "" })); }}
                placeholder={t("tenantName")}
                placeholderTextColor={C.textMuted}
                textAlign={isRTL ? "right" : "left"}
              />
              {!!editErrors.name && <Text style={S.fieldError}>{editErrors.name}</Text>}

              <Text style={S.fieldLabel}>{t("phone")}</Text>
              <TextInput
                style={[S.input, !!editErrors.phone && S.inputError]}
                value={editTenantForm.phone}
                onChangeText={(v) => { const cleaned = v.replace(/\D/g, "").slice(0, 10); setEditTenantForm((f) => ({ ...f, phone: cleaned })); setEditErrors((e) => ({ ...e, phone: cleaned.length > 0 && !/^05\d{8}$/.test(cleaned) ? t("validationPhoneInvalid") : "" })); }}
                placeholder="05XXXXXXXX"
                placeholderTextColor={C.textMuted}
                keyboardType="number-pad"
                maxLength={10}
                textAlign={isRTL ? "right" : "left"}
              />
              {!!editErrors.phone && <Text style={S.fieldError}>{editErrors.phone}</Text>}

              <Text style={S.fieldLabel}>{t("rent")} *</Text>
              <TextInput
                style={[S.input, !!editErrors.rent && S.inputError]}
                value={editTenantForm.monthly_rent}
                onChangeText={(v) => { setEditTenantForm((f) => ({ ...f, monthly_rent: v })); const num = parseFloat(v); setEditErrors((e) => ({ ...e, rent: v.trim() && (isNaN(num) || num <= 0) ? t("validationAmountPositive") : v.trim() && num > 999999 ? t("validationRentTooHigh") : "" })); }}
                placeholder="0"
                placeholderTextColor={C.textMuted}
                keyboardType="numeric"
                textAlign={isRTL ? "right" : "left"}
              />
              {!!editErrors.rent && <Text style={S.fieldError}>{editErrors.rent}</Text>}

              <Text style={S.fieldLabel}>{t("paymentFrequencyLabel")}</Text>
              <View style={[S.freqRow, isRTL && { flexDirection: "row-reverse" }]}>
                {([
                  { key: "monthly",    labelKey: "monthly" as const },
                  { key: "semi_annual", labelKey: "semiAnnual" as const },
                  { key: "annual",     labelKey: "annual" as const },
                ] as { key: PaymentFrequency; labelKey: "monthly" | "semiAnnual" | "annual" }[]).map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[S.freqBtn, editTenantForm.payment_frequency === opt.key && S.freqBtnActive]}
                    onPress={() => setEditTenantForm((f) => ({ ...f, payment_frequency: opt.key }))}
                  >
                    <Text style={[S.freqBtnText, editTenantForm.payment_frequency === opt.key && S.freqBtnTextActive]}>
                      {t(opt.labelKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={S.fieldLabel}>{t("leaseStart")} *</Text>
              {isWeb ? (
                <>
                  <WebDateInput
                    value={editTenantForm.lease_start}
                    onChange={(val) => { setEditTenantForm((f) => ({ ...f, lease_start: val })); setEditErrors((e) => ({ ...e, leaseStart: "" })); }}
                    textColor={C.text}
                    backgroundColor={C.surfaceElevated}
                    borderColor={editErrors.leaseStart ? "#EF4444" : C.border}
                    error={!!editErrors.leaseStart}
                  />
                  {!!editErrors.leaseStart && <Text style={{ color: "#EF4444", fontSize: 12, marginBottom: 4 }}>{editErrors.leaseStart}</Text>}
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[S.dateBtn, !!editErrors.leaseStart && { borderColor: "#EF4444" }]}
                    onPress={() => { setShowEditTenantStart(true); setEditErrors((e) => ({ ...e, leaseStart: "" })); }}
                  >
                    <Text style={[S.dateBtnText, !editTenantForm.lease_start && S.datePlaceholder]}>
                      📅 {editTenantForm.lease_start || t("selectDate")}
                    </Text>
                  </TouchableOpacity>
                  {!!editErrors.leaseStart && <Text style={{ color: "#EF4444", fontSize: 12, marginBottom: 4 }}>{editErrors.leaseStart}</Text>}
                  {showEditTenantStart && (
                    <>
                      <DateTimePicker
                        value={editTenantForm.lease_start ? new Date(editTenantForm.lease_start) : new Date()}
                        mode="date"
                        display="spinner"
                        locale="en-US"
                        themeVariant={isDark ? "dark" : "light"}
                        onChange={(_: any, d?: Date) => {
                          if (d) setEditTenantForm((f) => ({ ...f, lease_start: d.toISOString().split("T")[0] }));
                        }}
                      />
                      <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowEditTenantStart(false)}>
                        <Text style={S.pickerConfirmText}>{t("done")}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}

              <Text style={S.fieldLabel}>{t("leaseEnd")}</Text>
              {isWeb ? (
                <>
                  <WebDateInput
                    value={editTenantForm.lease_end}
                    onChange={(val) => { setEditTenantForm((f) => ({ ...f, lease_end: val })); setEditErrors((e) => ({ ...e, leaseEnd: editTenantForm.lease_start && val < editTenantForm.lease_start ? t("validationLeaseEndBeforeStart") : "" })); }}
                    textColor={C.text}
                    backgroundColor={C.surfaceElevated}
                    borderColor={editErrors.leaseEnd ? "#EF4444" : C.border}
                    error={!!editErrors.leaseEnd}
                  />
                  {!!editErrors.leaseEnd && <Text style={S.fieldError}>{editErrors.leaseEnd}</Text>}
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={[S.dateBtn, !!editErrors.leaseEnd && S.inputError]}
                    onPress={() => setShowEditTenantEnd(true)}
                  >
                    <Text style={[S.dateBtnText, !editTenantForm.lease_end && S.datePlaceholder]}>
                      📅 {editTenantForm.lease_end || t("selectDate")}
                    </Text>
                  </TouchableOpacity>
                  {showEditTenantEnd && (
                    <>
                      <DateTimePicker
                        value={editTenantForm.lease_end ? new Date(editTenantForm.lease_end) : new Date()}
                        mode="date"
                        display="spinner"
                        locale="en-US"
                        themeVariant={isDark ? "dark" : "light"}
                        onChange={(_: any, d?: Date) => {
                          if (d) { const dateStr = d.toISOString().split("T")[0]; setEditTenantForm((f) => ({ ...f, lease_end: dateStr })); setEditErrors((e) => ({ ...e, leaseEnd: editTenantForm.lease_start && dateStr < editTenantForm.lease_start ? t("validationLeaseEndBeforeStart") : "" })); }
                        }}
                      />
                      <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowEditTenantEnd(false)}>
                        <Text style={S.pickerConfirmText}>{t("done")}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {!!editErrors.leaseEnd && <Text style={S.fieldError}>{editErrors.leaseEnd}</Text>}
                </>
              )}

              <View style={S.modalActions}>
                <TouchableOpacity
                  style={S.cancelBtn}
                  onPress={() => setShowEditTenantModal(false)}
                >
                  <Text style={S.cancelBtnText}>{t("cancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[S.saveBtn, savingEditTenant && S.saveBtnDisabled]}
                  onPress={handleEditTenant}
                  disabled={savingEditTenant}
                >
                  {savingEditTenant ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={S.saveBtnText}>{t("save")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </ModalOverlay>
      </Modal>
    </View>
  );
}

const styles = (C: any, shadow: any, isRTL: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },

    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingBottom: 16,
      paddingHorizontal: spacing.md,
      backgroundColor: C.surface,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    headerRTL: { flexDirection: "row-reverse" },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: C.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
      marginRight: isRTL ? 0 : 12,
      marginLeft: isRTL ? 12 : 0,
    },
    backArrow: { fontSize: 22, color: C.primary, fontWeight: "700" },
    headerTextWrap: { flex: 1 },
    headerTitle: { fontSize: 16, fontWeight: "700", color: C.text },
    headerSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },

    center: { flex: 1, alignItems: "center", justifyContent: "center" },

    // Vacant
    vacantScroll: { flexGrow: 1 },
    vacantWrap: {
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      paddingTop: 60,
      paddingBottom: 32,
    },
    vacantIconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: C.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    vacantIcon: { fontSize: 36 },
    vacantTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: C.text,
      marginBottom: 8,
    },
    vacantSub: {
      fontSize: 14,
      color: C.textMuted,
      textAlign: "center",
      marginBottom: 28,
    },
    addTenantBtn: {
      backgroundColor: C.primary,
      paddingHorizontal: 28,
      paddingVertical: 14,
      borderRadius: radii.md,
      alignItems: "center",
      marginBottom: 14,
    },
    addTenantBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

    // Occupied
    scrollContent: { padding: spacing.md },
    statusBanner: {
      borderRadius: radii.sm,
      paddingVertical: 8,
      paddingHorizontal: 14,
      alignSelf: "flex-start",
      marginBottom: 14,
    },
    bannerActive: { backgroundColor: "rgba(13, 148, 136, 0.15)" },
    bannerExpired: { backgroundColor: "rgba(220, 38, 38, 0.12)" },
    statusBannerText: { fontSize: 13, fontWeight: "600", color: C.text },

    card: {
      backgroundColor: C.surface,
      borderRadius: radii.lg,
      padding: 18,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: C.border,
      ...shadow,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: C.textMuted,
      marginBottom: 12,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 10,
    },
    infoLabel: { fontSize: 13, color: C.textMuted },
    infoValue: { fontSize: 14, fontWeight: "600", color: C.text },
    divider: { height: 1, backgroundColor: C.border },

    collectBtn: {
      backgroundColor: C.primary,
      borderRadius: radii.md,
      paddingVertical: 14,
      alignItems: "center",
      marginBottom: 14,
      ...shadow,
    },
    collectBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

    payRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 10,
    },
    payMonth: { fontSize: 14, fontWeight: "600", color: C.text },
    payDate: { fontSize: 12, color: C.textMuted, marginTop: 2 },
    payEditHint: { fontSize: 10, color: C.textMuted, marginTop: 2, opacity: 0.6 },
    payAmount: { fontSize: 15, fontWeight: "700", color: C.accent },
    noPayText: { fontSize: 13, color: C.textMuted, paddingVertical: 16, textAlign: "center" },
    showAllBtn: { paddingVertical: 12, alignItems: "center" },
    showAllBtnText: { fontSize: 13, fontWeight: "600", color: C.primary },
    // End Lease button
    endLeaseBtn: {
      backgroundColor: "rgba(239, 68, 68, 0.08)",
      borderRadius: radii.md,
      paddingVertical: 13,
      alignItems: "center",
      marginBottom: 14,
      borderWidth: 1,
      borderColor: "rgba(239, 68, 68, 0.3)",
    },
    endLeaseBtnText: { color: "#EF4444", fontWeight: "700", fontSize: 14 },
    // Renew Lease button
    renewLeaseBtn: {
      backgroundColor: "rgba(59, 130, 246, 0.08)",
      borderRadius: radii.md,
      paddingVertical: 13,
      alignItems: "center",
      marginBottom: 14,
      borderWidth: 1,
      borderColor: "rgba(59, 130, 246, 0.3)",
    },
    renewLeaseBtnText: { color: "#3B82F6", fontWeight: "700", fontSize: 14 },
    editTenantBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.sm, backgroundColor: C.surfaceElevated, borderWidth: 1, borderColor: C.border },
    editTenantBtnText: { fontSize: 12, color: C.accent, fontWeight: "600" },
    prevTenantRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 },
    prevAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surfaceElevated, alignItems: "center", justifyContent: "center" },
    prevAvatarText: { fontSize: 15, fontWeight: "700", color: C.textMuted },
    prevName: { fontSize: 14, fontWeight: "600", color: C.text },
    prevDates: { fontSize: 12, color: C.textMuted, marginTop: 2 },
    prevRent: { fontSize: 12, color: C.accent, fontWeight: "600", marginTop: 1 },

    // Modal
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
      ...(Platform.OS === "web" ? { justifyContent: "center", paddingHorizontal: 16, backdropFilter: 'blur(8px)' } as any : {}),
    },
    // Choice modal
    choiceBox: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 30, ...(Platform.OS === "web" ? { borderRadius: 20, maxWidth: 480, width: "100%", alignSelf: "center", zIndex: 1 } : {}) },
    choiceTitle: { fontSize: 20, fontWeight: "700", color: C.text, textAlign: "center", marginBottom: 20 },
    choiceOption: { flexDirection: "row", alignItems: "center", backgroundColor: C.background, borderRadius: radii.lg, padding: 16, marginBottom: 10, borderWidth: 1.5, borderColor: C.border, gap: 14 },
    choiceOptionEjar: { borderColor: "#25935f60", backgroundColor: "#25935f08" },
    choiceIconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
    choiceLabel: { fontSize: 16, fontWeight: "700", color: C.text, marginBottom: 2 },
    choiceSub: { fontSize: 12, color: C.textMuted },
    choiceArrow: { fontSize: 22, color: C.textMuted, fontWeight: "700" },
    modalSheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: spacing.lg,
      paddingBottom: Platform.OS === "ios" ? 40 : spacing.lg,
      maxHeight: "92%",
      ...(Platform.OS === "web" ? { borderRadius: 20, maxWidth: 520, width: "100%", maxHeight: "85%" as any, paddingBottom: spacing.lg, alignSelf: "center" as any, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', zIndex: 1 } as any : {}),
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: C.text,
      marginBottom: 20,
      ...(Platform.OS === "web" ? { fontSize: 20, textAlign: "center" } : {}),
    },
    fieldLabel: {
      fontSize: 13,
      color: C.textMuted,
      marginBottom: 6,
      marginTop: 12,
    },
    input: {
      backgroundColor: C.surfaceElevated,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
      paddingVertical: 13,
      color: C.text,
      fontSize: 15,
    },
    dateBtn: {
      backgroundColor: C.surfaceElevated,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    dateBtnText: { color: C.text, fontSize: 15 },
    datePlaceholder: { color: C.textMuted },
    fieldError: { fontSize: 11, color: "#EF4444", marginTop: 2, marginBottom: 4 },
    inputError: { borderColor: "#EF4444" },
    pickerConfirm: {
      alignSelf: "stretch", backgroundColor: C.accent, borderRadius: radii.md,
      paddingVertical: 10, alignItems: "center", justifyContent: "center", marginTop: 4, marginBottom: 8,
    },
    pickerConfirmText: { color: "#fff", fontSize: 15, fontWeight: "700" },
    freqRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
    freqBtn: { flex: 1, paddingVertical: 9, borderRadius: radii.sm, borderWidth: 1, borderColor: C.border, alignItems: "center", backgroundColor: C.background },
    freqBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
    freqBtnText: { fontSize: 12, color: C.textMuted, fontWeight: "600" },
    freqBtnTextActive: { color: "#fff" },
    modalActions: {
      flexDirection: "row",
      gap: 12,
      marginTop: 24,
    },
    cancelBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: radii.md,
      paddingVertical: 14,
      alignItems: "center",
      ...(Platform.OS === "web" ? { cursor: "pointer" } as any : {}),
    },
    cancelBtnText: { color: C.textMuted, fontWeight: "600", fontSize: 15 },
    saveBtn: {
      flex: 1,
      backgroundColor: C.primary,
      borderRadius: radii.md,
      paddingVertical: 14,
      alignItems: "center",
      ...(Platform.OS === "web" ? { cursor: "pointer" } as any : {}),
    },
    saveBtnDisabled: { opacity: 0.6 },
    saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  });
