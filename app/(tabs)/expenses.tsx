import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { showAlert, crossAlert } from "../../lib/alert";

const isWeb = Platform.OS === "web";

// DateTimePicker only available on native
let DateTimePicker: any = null;
if (!isWeb) {
  DateTimePicker = require("@react-native-community/datetimepicker").default;
}
import { useFocusEffect } from "expo-router";
import { supabase } from "../../lib/supabase";
import { fetchSECBill, SECBillResult } from "../../lib/sec";
import { fetchNWCBill } from "../../lib/nwc";
import { useLanguage, TKey } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, radii } from "../../constants/theme";
import { formatDualDate, formatMonthDual } from "../../lib/dateUtils";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { userKey, HIJRI_KEY } from "../../lib/storage";
import { SwipeableRow, SwipeableRowRef } from "../../components/SwipeableRow";
import { suggestCategory } from "../../lib/expenseCategorizer";
import WebContainer, { useResponsive } from "../../components/WebContainer";
import { WebDateInput, modalBackdropStyle, ModalOverlay, webContentClickStop } from "../../components/WebDateInput";

type Category = "water" | "electricity" | "maintenance" | "cleaning" | "management" | "other" | "insurance" | "taxes";

interface Expense {
  id: string;
  category: Category;
  amount: number;
  date: string;
  description: string;
  property_id: string | null;
  bill_ref?: string | null;
  bill_paid?: boolean | null;
  properties?: { name: string };
}

interface Property {
  id: string; name: string;
  sec_account?: string; nwc_account?: string;
  has_multiple_sec?: boolean; has_multiple_nwc?: boolean;
  total_units?: number;
}

type IntegrationType = "sec" | "nwc";

interface IntegrationAccount {
  propertyId: string;
  propertyName: string;
  unitNumber?: string;
  accountNumber: string;
  type: IntegrationType;
  status: IntegrationStatus;
  error?: string;
  billAmount?: number;
  billRef?: string;
  existingExpenseId?: string;
  billPaid?: boolean;
}

type IntegrationStatus = "idle" | "loading" | "success" | "updated" | "error" | "synced" | "paid";

/** Statuses that indicate a bill has been successfully synced/fetched */
const SYNCED_STATUSES: IntegrationStatus[] = ["synced", "success", "updated"];

const CATEGORY_COLORS: Record<Category, string> = {
  water: "#0284C7",
  electricity: "#F59E0B",
  maintenance: "#8B5CF6",
  cleaning: "#0D9488",
  management: "#0891B2",
  other: "#9CA3AF",
  // Legacy (kept for backward compatibility with existing DB records)
  insurance: "#8B5CF6",
  taxes: "#D97706",
};

const CATEGORY_ICONS: Record<Category, string> = {
  water: "💧",
  electricity: "⚡",
  maintenance: "🔧",
  cleaning: "🧹",
  management: "📋",
  other: "📋",
  // Legacy
  insurance: "🛡️",
  taxes: "📊",
};

/** User-selectable categories (insurance & taxes removed) */
const CATEGORIES: Category[] = ["water", "electricity", "maintenance", "cleaning", "management", "other"];

function generateBillRef(type: IntegrationType, accountNumber: string): string {
  const month = new Date().toISOString().slice(0, 7);
  return `${type}_${accountNumber.trim()}_${month}`;
}

export default function ExpensesScreen() {
  const { t, isRTL, lang } = useLanguage();
  const { colors: C, shadow, isDark } = useTheme();
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const { isDesktop, isWide } = useResponsive();
  const insets = useSafeAreaInsets();
  const S = useMemo(() => styles(C, shadow), [C, shadow]);


  // Hijri calendar preference
  const [showHijri, setShowHijri] = useState(false);
  useEffect(() => {
    if (!uid) return;
    AsyncStorage.getItem(userKey(uid, HIJRI_KEY)).then(v => {
      if (v !== null) setShowHijri(v === "true");
      else setShowHijri(lang === "ar");
    }).catch(() => {});
  }, [uid]);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [filterCategory, setFilterCategory] = useState<Category | "all">("all");
  // Month selector — defaults to current month (YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const swipeRefs = useRef<Map<string, SwipeableRowRef | null>>(new Map());
  const openSwipeId = useRef<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Integration modal state
  const [integrationModal, setIntegrationModal] = useState(false);
  const [integrationType, setIntegrationType] = useState<IntegrationType>("sec");
  const [integrationAccounts, setIntegrationAccounts] = useState<IntegrationAccount[]>([]);
  const [integrationLoading, setIntegrationLoading] = useState(false);

  const [form, setForm] = useState({
    category: "maintenance" as Category,
    amount: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
    property_id: "",
    isRecurring: false,
    account_number: "",
    unit_number: "",
  });

  const isBillCategory = form.category === "electricity" || form.category === "water";
  const [fetchingBill, setFetchingBill] = useState(false);

  // Edit expense state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Expense | null>(null);
  const [editForm, setEditForm] = useState({
    category: "maintenance" as Category,
    amount: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
    property_id: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editShowDatePicker, setEditShowDatePicker] = useState(false);
  const [editSelectedDate, setEditSelectedDate] = useState(new Date());

  const [addExpErrors, setAddExpErrors] = useState<Record<string, string>>({});
  const [editExpErrors, setEditExpErrors] = useState<Record<string, string>>({});

  // Auto-categorize state
  const [suggestedCat, setSuggestedCat] = useState<Category | null>(null);
  const [manualCatSelected, setManualCatSelected] = useState(false);
  const [editSuggestedCat, setEditSuggestedCat] = useState<Category | null>(null);
  const [editManualCatSelected, setEditManualCatSelected] = useState(false);

  const dismissAll = () => {
    Keyboard.dismiss();
    setShowDatePicker(false);
    setEditShowDatePicker(false);
  };

  // Close date pickers when keyboard opens
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      setShowDatePicker(false);
      setEditShowDatePicker(false);
    });
    return () => sub.remove();
  }, []);

  // Auto-sync state
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const hasSyncedOnMount = useRef(false);
  // Bill dismissal is now handled via Supabase soft-delete (bill_ref prefixed with "dismissed_")
  // No AsyncStorage tracking needed — works across all devices

  useFocusEffect(useCallback(() => {
    fetchAll();
    // Auto-sync bills on first focus (app open)
    if (!hasSyncedOnMount.current) {
      hasSyncedOnMount.current = true;
      backgroundSyncAllBills();
      autoCreateRecurringExpenses();
    }
  }, []));

  async function fetchAll() {
    setLoading(true);
    const [{ data: eData }, { data: pData }] = await Promise.all([
      supabase.from("expenses").select("*, properties(name)").order("date", { ascending: false }),
      supabase.from("properties").select("id, name, sec_account, nwc_account, has_multiple_sec, has_multiple_nwc, total_units"),
    ]);
    // Filter out soft-deleted utility bills (bill_ref starts with "dismissed_")
    if (eData) setExpenses((eData as Expense[]).filter(e => !e.bill_ref?.startsWith("dismissed_")));
    if (pData) setProperties(pData);
    setLoading(false);
  }

  /** Silently sync all SEC + NWC bills in the background */
  async function backgroundSyncAllBills() {
    if (syncing) return;
    setSyncing(true);
    try {
      // Load all properties with their accounts
      const { data: props } = await supabase
        .from("properties")
        .select("id, name, sec_account, nwc_account, has_multiple_sec, has_multiple_nwc, total_units");

      const allAccounts: IntegrationAccount[] = [];

      for (const type of ["sec", "nwc"] as IntegrationType[]) {
        const accountField = type === "sec" ? "sec_account" : "nwc_account";
        const multipleField = type === "sec" ? "has_multiple_sec" : "has_multiple_nwc";

        for (const p of props ?? []) {
          const hasMultiple = p[multipleField];
          const propAccount = p[accountField];

          if (!hasMultiple && propAccount) {
            allAccounts.push({
              propertyId: p.id, propertyName: p.name,
              accountNumber: propAccount, type, status: "idle",
            });
          } else if (hasMultiple) {
            const { data: labels } = await supabase
              .from("unit_labels")
              .select(`unit_number, ${accountField}`)
              .eq("property_id", p.id);
            for (const l of (labels ?? []) as Record<string, any>[]) {
              const acc = l[accountField];
              if (acc) {
                allAccounts.push({
                  propertyId: p.id, propertyName: p.name,
                  unitNumber: String(l.unit_number),
                  accountNumber: acc, type, status: "idle",
                });
              }
            }
          }
        }
      }

      if (allAccounts.length === 0) { setSyncing(false); return; }

      const thisMonth = new Date().toISOString().slice(0, 7);
      const today = new Date().toISOString().split("T")[0];

      // Sync each account silently
      for (const acc of allAccounts) {
        try {
          const billRef = generateBillRef(acc.type, acc.accountNumber);
          let amount = 0;
          let dueAmount = 0;
          const billPeriod = isRTL
            ? new Date().toLocaleDateString("ar-SA-u-ca-gregory", { month: "long", year: "numeric" })
            : new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" });
          let desc = "";

          if (acc.type === "sec") {
            const bill = await fetchSECBill(acc.accountNumber);
            amount = bill.totalAmount;
            dueAmount = bill.dueAmount;
            const unitStr = acc.unitNumber ? ` ${t("unit")} ${acc.unitNumber}` : "";
            const kWhLabel = isRTL ? "كيلوواط" : "kWh";
            desc = `${t("electricity")} - ${acc.propertyName}${unitStr} - ${bill.consumption} ${kWhLabel} - ${billPeriod}`;
          } else {
            const bill = await fetchNWCBill(acc.accountNumber);
            amount = bill.lastBillAmount || bill.dueAmount;
            dueAmount = bill.dueAmount;
            const unitStr = acc.unitNumber ? ` ${t("unit")} ${acc.unitNumber}` : "";
            desc = `${t("water")} - ${acc.propertyName}${unitStr} - ${billPeriod}`;
          }

          const isBillPaid = dueAmount === 0;

          // Check if this bill exists (active or dismissed)
          const [{ data: existing }, { data: dismissed }] = await Promise.all([
            supabase.from("expenses").select("id, amount")
              .eq("bill_ref", billRef).maybeSingle(),
            supabase.from("expenses").select("id")
              .eq("bill_ref", `dismissed_${billRef}`).maybeSingle(),
          ]);

          // User explicitly dismissed this bill — never re-create
          if (dismissed) continue;

          if (isBillPaid) {
            if (existing) {
              await supabase.from("expenses")
                .update({ bill_paid: true })
                .eq("id", existing.id);
            }
            // If no existing and bill is paid, don't create — nothing to charge
            continue;
          }

          if (existing) {
            await supabase.from("expenses")
              .update({ amount, date: today, description: desc, bill_paid: false })
              .eq("id", existing.id);
          } else {
            await supabase.from("expenses").insert([{
              category: acc.type === "sec" ? "electricity" : "water",
              amount, date: today, description: desc,
              property_id: acc.propertyId, bill_ref: billRef, bill_paid: false,
            }]);
          }
        } catch {
          // Silently skip failed accounts
        }
      }

      setLastSyncTime(new Date());
      // Refresh expense list after sync
      await fetchAll();
    } catch {
      // Silently fail
    }
    setSyncing(false);
  }

  /** Auto-create recurring expenses for the current month if they don't already exist */
  async function autoCreateRecurringExpenses() {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      // Get all recurring expense templates (any month, bill_ref starts with rec_)
      const { data: recExpenses } = await supabase
        .from("expenses")
        .select("*")
        .like("bill_ref", "rec_%");
      if (!recExpenses || recExpenses.length === 0) return;

      // Group by base pattern (without month suffix) — find unique recurring patterns
      const templates = new Map<string, any>();
      for (const exp of recExpenses) {
        if (!exp.bill_ref) continue;
        // Extract base: rec_category_propertyId  (strip the _YYYY-MM suffix)
        const parts = exp.bill_ref.split("_");
        parts.pop(); // remove month
        const base = parts.join("_");
        // Keep the latest occurrence as template
        if (!templates.has(base) || exp.date > templates.get(base).date) {
          templates.set(base, exp);
        }
      }

      // Check which don't have an entry for current month
      let created = 0;
      for (const [base, template] of templates) {
        const currentRef = `${base}_${currentMonth}`;
        const exists = recExpenses.some(e => e.bill_ref === currentRef);
        if (!exists) {
          const today = new Date().toISOString().split("T")[0];
          await supabase.from("expenses").insert([{
            category: template.category,
            amount: template.amount,
            date: today,
            description: template.description,
            property_id: template.property_id,
            bill_ref: currentRef,
          }]);
          created++;
        }
      }
      if (created > 0) {
        fetchAll();
      }
    } catch {
      // Silently fail
    }
  }

  async function onPullToRefresh() {
    setRefreshing(true);
    await backgroundSyncAllBills();
    setRefreshing(false);
  }

  async function loadIntegrationAccounts(type: IntegrationType) {
    setIntegrationLoading(true);
    setIntegrationType(type);
    setIntegrationModal(true);

    const accountField = type === "sec" ? "sec_account" : "nwc_account";
    const multipleField = type === "sec" ? "has_multiple_sec" : "has_multiple_nwc";

    const { data: props } = await supabase
      .from("properties")
      .select(`id, name, ${accountField}, ${multipleField}, total_units`);

    const accounts: IntegrationAccount[] = [];

    for (const p of (props ?? []) as Record<string, any>[]) {
      const hasMultiple = p[multipleField];
      const propAccount = p[accountField];

      if (!hasMultiple && propAccount) {
        accounts.push({
          propertyId: p.id,
          propertyName: p.name,
          accountNumber: propAccount,
          type,
          status: "idle",
        });
      } else if (hasMultiple) {
        const { data: labels } = await supabase
          .from("unit_labels")
          .select(`unit_number, ${accountField}`)
          .eq("property_id", p.id);

        for (const l of (labels ?? []) as Record<string, any>[]) {
          const acc = l[accountField];
          if (acc) {
            accounts.push({
              propertyId: p.id,
              propertyName: p.name,
              unitNumber: String(l.unit_number),
              accountNumber: acc,
              type,
              status: "idle",
            });
          }
        }
      }
    }

    // Check which accounts already have a synced bill this month
    const thisMonth = new Date().toISOString().slice(0, 7);
    const { data: existingBills } = await supabase
      .from("expenses")
      .select("id, bill_ref, amount")
      .like("bill_ref", `${type}_%_${thisMonth}`)
      .not("bill_ref", "is", null);

    const billRefMap = new Map<string, { id: string; amount: number }>();
    (existingBills ?? []).forEach((e: any) => {
      billRefMap.set(e.bill_ref, { id: e.id, amount: e.amount });
    });

    const enrichedAccounts = accounts.map((acc) => {
      const ref = generateBillRef(acc.type, acc.accountNumber);
      const existing = billRefMap.get(ref);
      return {
        ...acc,
        billRef: ref,
        status: existing ? ("synced" as const) : ("idle" as const),
        billAmount: existing?.amount,
        existingExpenseId: existing?.id,
      };
    });

    setIntegrationAccounts(enrichedAccounts);
    setIntegrationLoading(false);
  }

  async function syncBill(index: number) {
    const acc = integrationAccounts[index];
    if (acc.status === "loading") return;

    const wasAlreadySynced = acc.status === "synced";

    setIntegrationAccounts((prev) =>
      prev.map((a, i) => (i === index ? { ...a, status: "loading" } : a))
    );

    try {
      let amount = 0;
      let dueAmount = 0;
      let desc = "";
      const billRef = acc.billRef ?? generateBillRef(acc.type, acc.accountNumber);

      // Format bill period label (e.g. "Mar 2026" / "مارس ٢٠٢٦")
      const now = new Date();
      const billPeriod = isRTL
        ? now.toLocaleDateString("ar-SA-u-ca-gregory", { month: "long", year: "numeric" })
        : now.toLocaleDateString("en-US", { month: "short", year: "numeric" });

      if (acc.type === "sec") {
        const bill = await fetchSECBill(acc.accountNumber);
        amount = bill.totalAmount;
        dueAmount = bill.dueAmount;
        const unitStr = acc.unitNumber ? ` ${t("unit")} ${acc.unitNumber}` : "";
        const kWhLabel = isRTL ? "كيلوواط" : "kWh";
        desc = `${t("electricity")} - ${acc.propertyName}${unitStr} - ${bill.consumption} ${kWhLabel} - ${billPeriod}`;
      } else {
        const bill = await fetchNWCBill(acc.accountNumber);
        amount = bill.dueAmount;
        dueAmount = bill.dueAmount;
        const unitStr = acc.unitNumber ? ` ${t("unit")} ${acc.unitNumber}` : "";
        desc = `${t("water")} - ${acc.propertyName}${unitStr} - ${billPeriod}`;
      }

      const isBillPaid = dueAmount === 0;

      // If bill is paid (due = 0), don't insert an expense — just show status
      if (isBillPaid) {
        setIntegrationAccounts((prev) =>
          prev.map((a, i) =>
            i === index ? { ...a, status: "paid", billAmount: amount, billPaid: true } : a
          )
        );
        return;
      }

      const today = new Date().toISOString().split("T")[0];

      // Check if bill already exists (active or dismissed)
      const [{ data: existing }, { data: dismissed }] = await Promise.all([
        supabase.from("expenses").select("id, amount")
          .eq("bill_ref", billRef).maybeSingle(),
        supabase.from("expenses").select("id")
          .eq("bill_ref", `dismissed_${billRef}`).maybeSingle(),
      ]);

      if (dismissed) {
        // User previously dismissed this bill — remove the dismissal and re-fetch
        await supabase.from("expenses")
          .update({ bill_ref: billRef, amount, description: desc, bill_paid: false })
          .eq("id", dismissed.id);

        setIntegrationAccounts((prev) =>
          prev.map((a, i) =>
            i === index ? { ...a, status: "success", billAmount: amount, billPaid: false } : a
          )
        );
        fetchAll();
        return;
      }

      if (existing) {
        // Update existing bill
        const { error } = await supabase.from("expenses")
          .update({ amount, date: today, description: desc, bill_paid: false })
          .eq("id", existing.id);
        if (error) throw error;

        setIntegrationAccounts((prev) =>
          prev.map((a, i) =>
            i === index ? { ...a, status: "updated", billAmount: amount, billPaid: false } : a
          )
        );
        return;
      } else {
        // Insert new bill
        const { error } = await supabase.from("expenses").insert([{
          category: acc.type === "sec" ? "electricity" : "water",
          amount,
          date: today,
          description: desc,
          property_id: acc.propertyId,
          bill_ref: billRef,
          bill_paid: false,
        }]);
        if (error) throw error;
      }

      setIntegrationAccounts((prev) =>
        prev.map((a, i) =>
          i === index ? { ...a, status: "success", billAmount: amount, billPaid: false } : a
        )
      );
    } catch (e: any) {
      setIntegrationAccounts((prev) =>
        prev.map((a, i) =>
          i === index ? { ...a, status: wasAlreadySynced ? "synced" : "error", error: e.message } : a
        )
      );
    }
  }

  async function syncAllBills() {
    const promises = integrationAccounts.map((_, i) => syncBill(i));
    await Promise.allSettled(promises);
    fetchAll();
  }

  async function confirmDeleteExpense(exp: Expense) {
    if (exp.bill_ref && !exp.bill_ref.startsWith("dismissed_")) {
      // Utility bill: soft-delete by prefixing bill_ref so sync won't re-create it.
      // This persists in Supabase so it works across all devices and sessions.
      const { error } = await supabase.from("expenses")
        .update({ bill_ref: `dismissed_${exp.bill_ref}`, amount: 0 })
        .eq("id", exp.id);
      if (error) {
        if (isWeb) window.alert(error.message);
        else showAlert(t("error"), error.message);
        return;
      }
    } else {
      // Non-utility expense or already dismissed: hard delete
      const { error } = await supabase.from("expenses").delete().eq("id", exp.id);
      if (error) {
        if (isWeb) window.alert(error.message);
        else showAlert(t("error"), error.message);
        return;
      }
    }
    fetchAll();
  }

  async function deleteExpense(exp: Expense) {
    const msg = `${CATEGORY_ICONS[exp.category]} ${exp.amount.toLocaleString()} ${t("sar")}?`;
    crossAlert(
      t("delete") ?? "Delete",
      msg,
      [
        { text: t("cancel"), style: "cancel" },
        { text: t("delete") ?? "Delete", style: "destructive", onPress: () => confirmDeleteExpense(exp) },
      ]
    );
  }

  async function togglePaid(exp: Expense) {
    const newPaid = !exp.bill_paid;
    const { error } = await supabase.from("expenses").update({ bill_paid: newPaid }).eq("id", exp.id);
    if (error) {
      if (isWeb) window.alert(error.message);
      else showAlert(t("error"), error.message);
      return;
    }
    setExpenses(prev => prev.map(e => e.id === exp.id ? { ...e, bill_paid: newPaid } : e));
  }

  function openEditExpense(exp: Expense) {
    setEditTarget(exp);
    const d = exp.date ? new Date(exp.date + "T12:00:00") : new Date();
    setEditSelectedDate(d);
    setEditForm({
      category: exp.category,
      amount: String(exp.amount),
      date: exp.date,
      description: exp.description,
      property_id: exp.property_id ?? "",
    });
    setEditManualCatSelected(true);
    setEditSuggestedCat(null);
    setEditModalVisible(true);
  }

  async function saveEditExpense() {
    if (!editTarget) return;
    const errors: Record<string, string> = {};
    if (!editForm.amount || parseFloat(editForm.amount) <= 0) {
      errors.amount = t("validationAmountPositive");
    } else if (parseFloat(editForm.amount) > 999999) {
      errors.amount = t("validationAmountTooHigh");
    }
    if (editForm.description.length > 200) {
      errors.description = t("validationDescriptionLong");
    }
    setEditExpErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setEditSaving(true);
    const { error } = await supabase
      .from("expenses")
      .update({
        category: editForm.category,
        amount: parseFloat(editForm.amount),
        date: editForm.date,
        description: editForm.description.trim(),
        property_id: editForm.property_id || null,
      })
      .eq("id", editTarget.id);
    setEditSaving(false);
    if (error) {
      if (isWeb) window.alert(error.message);
      else showAlert(t("error"), error.message);
    } else {
      setEditModalVisible(false);
      setEditTarget(null);
      fetchAll();
    }
  }

  async function addExpense() {
    const isBill = form.category === "electricity" || form.category === "water";
    const errors: Record<string, string> = {};

    if (isBill) {
      // For utility bills: property and account number are mandatory
      if (!form.property_id) {
        errors.property_id = t("propertyRequired");
      }
      if (!form.account_number.trim()) {
        errors.account_number = t("accountRequired");
      }
    } else {
      if (!form.amount || parseFloat(form.amount) <= 0) {
        errors.amount = t("validationAmountPositive");
      } else if (parseFloat(form.amount) > 999999) {
        errors.amount = t("validationAmountTooHigh");
      }
    }
    if (form.description.length > 200) {
      errors.description = t("validationDescriptionLong");
    }
    setAddExpErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);

    if (isBill) {
      // Fetch bill from SEC/NWC API
      setFetchingBill(true);
      try {
        const type: IntegrationType = form.category === "electricity" ? "sec" : "nwc";
        const accountNumber = form.account_number.trim();
        const billRef = generateBillRef(type, accountNumber);
        const today = new Date().toISOString().split("T")[0];
        const selectedProp = properties.find(p => p.id === form.property_id);
        const propName = selectedProp?.name ?? "";
        const unitLabel = form.unit_number ? ` ${t("unit")} ${form.unit_number}` : "";
        const billPeriod = isRTL
          ? new Date().toLocaleDateString("ar-SA-u-ca-gregory", { month: "long", year: "numeric" })
          : new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" });

        let amount = 0;
        let dueAmount = 0;
        let desc = "";

        if (type === "sec") {
          const bill = await fetchSECBill(accountNumber);
          amount = bill.totalAmount;
          dueAmount = bill.dueAmount;
          const kWhLabel = isRTL ? "كيلوواط" : "kWh";
          desc = `${t("electricity")} - ${propName}${unitLabel} - ${bill.consumption} ${kWhLabel} - ${billPeriod}`;
        } else {
          const bill = await fetchNWCBill(accountNumber);
          amount = bill.lastBillAmount || bill.dueAmount;
          dueAmount = bill.dueAmount;
          desc = `${t("water")} - ${propName}${unitLabel} - ${billPeriod}`;
        }

        const isBillPaid = dueAmount === 0;

        // Check if bill already exists
        const { data: existing } = await supabase
          .from("expenses").select("id, amount")
          .eq("bill_ref", billRef).maybeSingle();

        if (existing) {
          // Update existing bill
          await supabase.from("expenses")
            .update({ amount, date: today, description: desc, bill_paid: isBillPaid })
            .eq("id", existing.id);
        } else {
          // Insert new bill
          await supabase.from("expenses").insert([{
            category: form.category,
            amount, date: today, description: desc,
            property_id: form.property_id, bill_ref: billRef, bill_paid: isBillPaid,
          }]);
        }

        // Also save the account number to the property for background sync
        if (type === "sec") {
          if (form.unit_number) {
            await supabase.from("unit_labels").upsert({
              property_id: form.property_id, unit_number: form.unit_number,
              sec_account: accountNumber, user_id: uid,
            }, { onConflict: "property_id,unit_number" });
            await supabase.from("properties").update({ has_multiple_sec: true }).eq("id", form.property_id);
          } else {
            await supabase.from("properties").update({
              sec_account: accountNumber, has_multiple_sec: false,
            }).eq("id", form.property_id);
          }
        } else {
          if (form.unit_number) {
            await supabase.from("unit_labels").upsert({
              property_id: form.property_id, unit_number: form.unit_number,
              nwc_account: accountNumber, user_id: uid,
            }, { onConflict: "property_id,unit_number" });
            await supabase.from("properties").update({ has_multiple_nwc: true }).eq("id", form.property_id);
          } else {
            await supabase.from("properties").update({
              nwc_account: accountNumber, has_multiple_nwc: false,
            }).eq("id", form.property_id);
          }
        }

        setFetchingBill(false);
        setSaving(false);
        setModalVisible(false);
        resetForm();
        fetchAll();
      } catch (e: any) {
        setFetchingBill(false);
        setSaving(false);
        if (isWeb) window.alert(e.message ?? t("fetchError"));
        else showAlert(t("error"), e.message ?? t("fetchError"));
      }
      return;
    }

    // Non-bill expense
    const insertData: any = {
      category: form.category,
      amount: parseFloat(form.amount),
      date: form.date,
      description: form.description.trim(),
      property_id: form.property_id || null,
    };
    // If recurring, set bill_ref to prevent duplicates per month
    if (form.isRecurring) {
      const monthStr = form.date.slice(0, 7); // YYYY-MM
      insertData.bill_ref = `rec_${form.category}_${form.property_id || "general"}_${monthStr}`;
    }
    const { error } = await supabase.from("expenses").insert([insertData]);
    setSaving(false);
    if (error) {
      if (isWeb) window.alert(error.message);
      else showAlert(t("error"), error.message);
    } else {
      setModalVisible(false);
      resetForm();
      fetchAll();
    }
  }

  function resetForm() {
    const today = new Date();
    setSelectedDate(today);
    setForm({ category: "maintenance", amount: "", date: today.toISOString().split("T")[0], description: "", property_id: "", isRecurring: false, account_number: "", unit_number: "" });
    setSuggestedCat(null); setManualCatSelected(false);
  }

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  // Filter by selected month first, then by category
  const monthExpenses = expenses.filter((e) => e.date?.startsWith(selectedMonth));
  const filtered = filterCategory === "all" ? monthExpenses : monthExpenses.filter((e) => e.category === filterCategory);
  const totalThisMonth = monthExpenses.reduce((s, e) => s + e.amount, 0);

  const changeMonth = (offset: number) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + offset, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const monthLabel = formatMonthDual(selectedMonth, lang, showHijri);

  return (
      <View style={S.container}>
        <WebContainer maxWidth={1200}>
        <View style={[S.header, { paddingTop: insets.top + 10 }, isRTL && S.rowRev]}>
          <Text style={S.headerTitle}>{t("expenses")}</Text>
          <TouchableOpacity style={S.addBtn} onPress={() => setModalVisible(true)} accessibilityRole="button" accessibilityLabel={t("addExpense")}>
            <Text style={S.addBtnText}>+ {t("add")}</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={C.accent} size="large" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: 100 }}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onPullToRefresh}
                tintColor={C.accent}
              />
            }
            onScrollBeginDrag={() => {
              if (openSwipeId.current) {
                swipeRefs.current.get(openSwipeId.current)?.close();
                openSwipeId.current = null;
              }
            }}
          >
            {/* Month selector */}
            <View style={[S.monthSelector, isRTL && S.rowRev]}>
              <TouchableOpacity onPress={() => changeMonth(-1)} style={S.monthNavBtn} accessibilityRole="button" accessibilityLabel={isRTL ? "الشهر السابق" : "Previous month"}>
                <Text style={S.monthNavTxt}>{isRTL ? "›" : "‹"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSelectedMonth(new Date().toISOString().slice(0, 7))} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={monthLabel}>
                <Text style={S.monthTitle}>{monthLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => changeMonth(1)} style={S.monthNavBtn} accessibilityRole="button" accessibilityLabel={isRTL ? "الشهر التالي" : "Next month"}>
                <Text style={S.monthNavTxt}>{isRTL ? "‹" : "›"}</Text>
              </TouchableOpacity>
            </View>

            {/* Total card */}
            <View style={S.totalCard}>
              <View style={[S.totalTopRow, isRTL && S.rowRev]}>
                <Text style={S.totalLabel}>{t("totalExpenses")}</Text>
                {syncing ? (
                  <View style={S.syncIndicator}>
                    <ActivityIndicator size="small" color={C.accent} />
                    <Text style={S.syncText}>{t("syncing")}</Text>
                  </View>
                ) : lastSyncTime ? (
                  <Text style={S.lastSyncText}>
                    🔄 {lastSyncTime.toLocaleTimeString(isRTL ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                ) : null}
              </View>
              <Text style={S.totalAmount}>{totalThisMonth.toLocaleString()} {t("sar")}</Text>
              <View style={[S.categoryChips, isRTL && S.rowRev]}>
                {CATEGORIES.map((cat) => {
                  const sum = monthExpenses.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0);
                  if (sum === 0) return null;
                  return (
                    <View key={cat} style={[S.chip, { backgroundColor: CATEGORY_COLORS[cat] + "30" }]}>
                      <Text style={[S.chipText, { color: CATEGORY_COLORS[cat] }]}>
                        {CATEGORY_ICONS[cat]} {sum.toLocaleString()}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[S.filterScroll, isRTL && { paddingLeft: 0, paddingRight: spacing.md }]}>
              <View style={[S.filterRow, isRTL && S.rowRev, isRTL && { paddingRight: 0, paddingLeft: spacing.md }]}>
                <TouchableOpacity
                  style={[S.filterTab, filterCategory === "all" && S.filterTabActive]}
                  onPress={() => setFilterCategory("all")}
                  accessibilityRole="button"
                  accessibilityLabel={t("all")}
                  accessibilityState={{ selected: filterCategory === "all" }}
                >
                  <Text style={[S.filterTabText, filterCategory === "all" && S.filterTabTextActive]}>
                    {t("all")}
                  </Text>
                </TouchableOpacity>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[S.filterTab, filterCategory === cat && { backgroundColor: CATEGORY_COLORS[cat] }]}
                    onPress={() => setFilterCategory(cat)}
                    accessibilityRole="button"
                    accessibilityLabel={t(cat as TKey)}
                    accessibilityState={{ selected: filterCategory === cat }}
                  >
                    <Text style={[S.filterTabText, filterCategory === cat && { color: "#fff", fontWeight: "700" }]}>
                      {CATEGORY_ICONS[cat]} {t(cat as TKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {filtered.length === 0 && (
              <Text style={S.emptyText}>{t("noExpenses")}</Text>
            )}
            <View style={isDesktop ? { flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 12, paddingHorizontal: spacing.md } : {}}>
            {filtered.map((exp) => (
              <View key={exp.id} style={[isDesktop ? { width: isWide ? "31.5%" : "48%" } : {}, !isDesktop && S.swipeWrapper]}>
                <SwipeableRow
                  ref={(r) => { swipeRefs.current.set(exp.id, r); }}
                  isRTL={isRTL}
                  onEdit={() => openEditExpense(exp)}
                  onDelete={() => deleteExpense(exp)}
                  onMarkPaid={
                    exp.bill_ref && (exp.bill_ref.startsWith("sec_") || exp.bill_ref.startsWith("nwc_"))
                      ? undefined
                      : () => togglePaid(exp)
                  }
                  markPaidLabel={exp.bill_paid ? (t("markUnpaid") ?? "Unpaid") : (t("markPaid") ?? "Paid")}
                  markPaidIcon={exp.bill_paid ? "🔴" : "✅"}
                  markPaidColor={exp.bill_paid ? "#F59E0B" : "#22C55E"}
                  editLabel={t("edit") ?? "Edit"}
                  deleteLabel={t("delete") ?? "Delete"}
                  borderRadius={radii.lg}
                  onSwipeOpen={() => {
                    if (openSwipeId.current && openSwipeId.current !== exp.id) {
                      swipeRefs.current.get(openSwipeId.current)?.close();
                    }
                    openSwipeId.current = exp.id;
                  }}
                  onSwipeClose={() => {
                    if (openSwipeId.current === exp.id) openSwipeId.current = null;
                  }}
                >
                  <Pressable style={({ hovered }: any) => [S.cardInner, hovered && isWeb && S.cardInnerHover]} accessible={true} accessibilityLabel={`${t(exp.category as TKey)}: ${exp.amount.toLocaleString()} ${t("sar")}${exp.properties?.name ? `, ${exp.properties.name}` : ""}${exp.description ? `, ${exp.description}` : ""}`}>
                    <View style={[S.cardRow, isRTL && S.rowRev]}>
                      <View style={[S.catIcon, { backgroundColor: CATEGORY_COLORS[exp.category] + "20" }]}>
                        <Text style={{ fontSize: 20 }}>{CATEGORY_ICONS[exp.category]}</Text>
                      </View>
                      <View style={{ flex: 1, marginHorizontal: 10 }}>
                        <Text style={[S.catName, isRTL && { textAlign: "right" }]}>{t(exp.category as TKey)}</Text>
                        {exp.description ? (
                          <Text style={[S.description, isRTL && { textAlign: "right" }]}>{exp.description}</Text>
                        ) : null}
                        {exp.properties?.name ? (
                          <Text style={[S.propName, isRTL && { textAlign: "right" }]}>🏠 {exp.properties.name}</Text>
                        ) : null}
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[S.amount, { color: CATEGORY_COLORS[exp.category] }]}>
                          {exp.amount.toLocaleString()} {t("sar")}
                        </Text>
                        <Text style={S.date}>{formatDualDate(exp.date, lang, showHijri)}</Text>
                        {(exp.bill_paid != null) && (
                          <Text style={exp.bill_paid ? S.billPaidBadge : S.billUnpaidBadge}>
                            {exp.bill_paid
                              ? `✅ ${t("billPaid")}`
                              : `🔴 ${t("billUnpaid")}`}
                          </Text>
                        )}
                        {exp.bill_ref != null && (exp.bill_ref.startsWith("rec_") || exp.bill_ref.startsWith("sec_") || exp.bill_ref.startsWith("nwc_")) && (
                          <Text style={{ fontSize: 11, color: C.accent, fontWeight: "600", marginTop: 2 }}>
                            🔄 {t("recurringExpense")}
                          </Text>
                        )}
                      </View>
                    </View>
                  </Pressable>
                </SwipeableRow>
              </View>
            ))}
            </View>
          </ScrollView>
        )}
        </WebContainer>

        {/* Add Modal */}
        <Modal visible={modalVisible} animationType={isWeb ? 'fade' : 'slide'} transparent onRequestClose={() => setModalVisible(false)}>
          <ModalOverlay style={S.modalOverlay} onDismiss={() => { Keyboard.dismiss(); setModalVisible(false); }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ maxHeight: "90%" }} {...webContentClickStop}>
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={S.modalBox}>
                  <Text style={S.modalTitle}>{t("addExpense")}</Text>

                  <Text style={S.fieldLabel}>{t("category")}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                    <View style={[S.segmentRow, isRTL && S.rowRev]}>
                      {CATEGORIES.map((cat) => (
                        <TouchableOpacity
                          key={cat}
                          style={[S.segBtn, form.category === cat && { backgroundColor: CATEGORY_COLORS[cat] }]}
                          onPress={() => { setForm({ ...form, category: cat }); setManualCatSelected(true); }}
                        >
                          <Text style={[S.segBtnText, form.category === cat && { color: "#fff" }]}>
                            {CATEGORY_ICONS[cat]} {t(cat as TKey)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  {suggestedCat && suggestedCat !== form.category && !manualCatSelected && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setForm({ ...form, category: suggestedCat })}
                      style={{
                        flexDirection: isRTL ? "row-reverse" : "row",
                        alignItems: "center",
                        gap: 6,
                        alignSelf: isRTL ? "flex-end" : "flex-start",
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                        backgroundColor: CATEGORY_COLORS[suggestedCat] + "20",
                        borderWidth: 1,
                        borderColor: CATEGORY_COLORS[suggestedCat],
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: CATEGORY_COLORS[suggestedCat], fontWeight: "600" }}>
                        {CATEGORY_ICONS[suggestedCat]} {t("suggestedCategory")}: {t(suggestedCat as TKey)} ✓
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Amount, date, description — hidden for bill categories (auto-fetched) */}
                  {!isBillCategory && (
                    <>
                      <TextInput
                        style={[S.input, isRTL && { textAlign: "right" }, !!addExpErrors.amount && S.inputError]}
                        placeholder={`${t("amount")} (${t("sar")})`}
                        placeholderTextColor={C.textMuted}
                        keyboardType="numeric"
                        returnKeyType="done"
                        value={form.amount}
                        onChangeText={(v) => { setForm({ ...form, amount: v }); const num = parseFloat(v); setAddExpErrors((e) => ({ ...e, amount: v.trim() && (isNaN(num) || num <= 0) ? t("validationAmountPositive") : v.trim() && num > 999999 ? t("validationAmountTooHigh") : "" })); }}
                      />
                      {!!addExpErrors.amount && <Text style={S.fieldError}>{addExpErrors.amount}</Text>}

                      <Text style={S.fieldLabel}>{t("date")}</Text>
                      {isWeb ? (
                        <WebDateInput
                          value={form.date}
                          onChange={(val) => {
                            setForm({ ...form, date: val });
                            setSelectedDate(new Date(val + "T12:00:00"));
                          }}
                          textColor={C.text}
                          backgroundColor={C.background}
                          borderColor={C.border}
                        />
                      ) : (
                        <>
                          <TouchableOpacity
                            style={S.datePickerBtn}
                            onPress={() => setShowDatePicker(true)}
                          >
                            <Text style={S.datePickerText}>📅 {form.date}</Text>
                          </TouchableOpacity>
                          {showDatePicker && (
                            <>
                              <DateTimePicker
                                value={selectedDate}
                                mode="date"
                                display="spinner"
                                locale="en-US"
                                themeVariant={isDark ? "dark" : "light"}
                                onChange={(_: any, date: any) => {
                                  if (date) {
                                    setSelectedDate(date);
                                    setForm({ ...form, date: formatDate(date) });
                                  }
                                }}
                              />
                              <TouchableOpacity style={S.pickerConfirm} onPress={() => setShowDatePicker(false)}>
                                <Text style={S.pickerConfirmText}>{t("done")}</Text>
                              </TouchableOpacity>
                            </>
                          )}
                        </>
                      )}

                      <TextInput
                        style={[S.input, isRTL && { textAlign: "right" }, !!addExpErrors.description && S.inputError]}
                        placeholder={t("description")}
                        placeholderTextColor={C.textMuted}
                        returnKeyType="done"
                        maxLength={200}
                        value={form.description}
                        onChangeText={(v) => { setForm({ ...form, description: v }); setAddExpErrors((e) => ({ ...e, description: v.length > 200 ? t("validationDescriptionLong") : "" })); if (!manualCatSelected) { const cat = suggestCategory(v); setSuggestedCat(cat); if (cat) setForm(f => ({ ...f, description: v, category: cat })); } }}
                      />
                      {!!addExpErrors.description && <Text style={S.fieldError}>{addExpErrors.description}</Text>}
                    </>
                  )}

                  <Text style={S.fieldLabel}>{t("property")} {isBillCategory ? "*" : ""}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                    <View style={[S.segmentRow, isRTL && S.rowRev]}>
                      {!isBillCategory && (
                        <TouchableOpacity
                          style={[S.segBtn, form.property_id === "" && { backgroundColor: C.accent }]}
                          onPress={() => setForm({ ...form, property_id: "", unit_number: "" })}
                        >
                          <Text style={[S.segBtnText, form.property_id === "" && { color: "#fff" }]}>—</Text>
                        </TouchableOpacity>
                      )}
                      {properties.map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          style={[S.segBtn, form.property_id === p.id && { backgroundColor: C.accent }]}
                          onPress={() => setForm({ ...form, property_id: p.id, unit_number: "" })}
                        >
                          <Text style={[S.segBtnText, form.property_id === p.id && { color: "#fff" }]}>{p.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                  {!!addExpErrors.property_id && <Text style={S.fieldError}>{addExpErrors.property_id}</Text>}

                  {/* Unit selector — only for bill categories, optional */}
                  {isBillCategory && form.property_id ? (() => {
                    const selectedProp = properties.find(p => p.id === form.property_id);
                    const totalUnits = selectedProp?.total_units ?? 0;
                    if (totalUnits <= 1) return null;
                    return (
                      <>
                        <Text style={S.fieldLabel}>{t("unitOptional")}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                          <View style={[S.segmentRow, isRTL && S.rowRev]}>
                            <TouchableOpacity
                              style={[S.segBtn, form.unit_number === "" && { backgroundColor: C.accent }]}
                              onPress={() => setForm({ ...form, unit_number: "" })}
                            >
                              <Text style={[S.segBtnText, form.unit_number === "" && { color: "#fff" }]}>—</Text>
                            </TouchableOpacity>
                            {Array.from({ length: totalUnits }, (_, i) => String(i + 1)).map((u) => (
                              <TouchableOpacity
                                key={u}
                                style={[S.segBtn, form.unit_number === u && { backgroundColor: C.accent }]}
                                onPress={() => setForm({ ...form, unit_number: u })}
                              >
                                <Text style={[S.segBtnText, form.unit_number === u && { color: "#fff" }]}>{u}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      </>
                    );
                  })() : null}

                  {/* Account number — only for bill categories */}
                  {isBillCategory && (
                    <>
                      <Text style={S.fieldLabel}>{form.category === "electricity" ? "⚡" : "💧"} {t("accountNumber")} *</Text>
                      <TextInput
                        style={[S.input, isRTL && { textAlign: "right" }, !!addExpErrors.account_number && S.inputError]}
                        placeholder={t("accountNumber")}
                        placeholderTextColor={C.textMuted}
                        keyboardType="numeric"
                        returnKeyType="done"
                        value={form.account_number}
                        onChangeText={(v) => { setForm({ ...form, account_number: v }); setAddExpErrors((e) => ({ ...e, account_number: "" })); }}
                      />
                      {!!addExpErrors.account_number && <Text style={S.fieldError}>{addExpErrors.account_number}</Text>}
                    </>
                  )}

                  {/* Recurring toggle — only for non-bill categories */}
                  {!isBillCategory && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setForm({ ...form, isRecurring: !form.isRecurring })}
                      style={{
                        flexDirection: isRTL ? "row-reverse" : "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 12,
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderRadius: 12,
                        backgroundColor: form.isRecurring ? (isDark ? "#166534" : "#DCFCE7") : (isDark ? C.surface : "#F3F4F6"),
                        borderWidth: 1.5,
                        borderColor: form.isRecurring ? "#22C55E" : C.border,
                      }}
                    >
                      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <Text style={{ fontSize: 22 }}>🔄</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: "600", color: form.isRecurring ? "#16A34A" : C.text, textAlign: isRTL ? "right" : "left" }}>
                            {t("repeatMonthly")}
                          </Text>
                          <Text style={{ fontSize: 11, color: form.isRecurring ? "#15803D" : C.textMuted, marginTop: 2, textAlign: isRTL ? "right" : "left" }}>
                            {form.isRecurring
                              ? t("recurringHintOn")
                              : t("recurringHintOff")}
                          </Text>
                        </View>
                      </View>
                      <View style={{
                        width: 24, height: 24, borderRadius: 12,
                        backgroundColor: form.isRecurring ? "#22C55E" : "transparent",
                        borderWidth: 2,
                        borderColor: form.isRecurring ? "#22C55E" : C.border,
                        alignItems: "center", justifyContent: "center",
                      }}>
                        {form.isRecurring && <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700", lineHeight: 16 }}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Fetching bill indicator */}
                  {fetchingBill && (
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}>
                      <ActivityIndicator size="small" color={C.accent} />
                      <Text style={{ color: C.accent, fontWeight: "600" }}>{t("fetchingBill")}</Text>
                    </View>
                  )}

                  <View style={[S.modalBtns, isRTL && S.rowRev]}>
                    <TouchableOpacity style={S.cancelBtn} onPress={() => setModalVisible(false)}>
                      <Text style={S.cancelBtnText}>{t("cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={S.saveBtn} onPress={addExpense} disabled={saving || fetchingBill}>
                      {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={S.saveBtnText}>{isBillCategory ? t("fetchBills") : t("save")}</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </ModalOverlay>
        </Modal>

        {/* Integration Modal */}
        <Modal visible={integrationModal} animationType={isWeb ? 'fade' : 'slide'} transparent onRequestClose={() => setIntegrationModal(false)}>
          <ModalOverlay style={S.modalOverlay} onDismiss={() => { setIntegrationModal(false); fetchAll(); }}>
              <View style={[S.modalBox, { maxHeight: "75%" }]} {...webContentClickStop}>
                {/* Header */}
                <View style={[S.integrationHeader, isRTL && S.rowRev]}>
                  <Text style={[S.modalTitle, { marginBottom: 0, textAlign: isRTL ? "right" : "left" }]}>
                    {integrationType === "sec" ? "⚡" : "💧"} {t("integrationAccounts")}
                  </Text>
                  <TouchableOpacity onPress={() => { setIntegrationModal(false); fetchAll(); }}>
                    <Text style={{ fontSize: 18, color: C.textMuted, padding: 4 }}>✕</Text>
                  </TouchableOpacity>
                </View>

                {integrationLoading ? (
                  <ActivityIndicator color={C.accent} size="large" style={{ marginVertical: 40 }} />
                ) : integrationAccounts.length === 0 ? (
                  <Text style={[S.emptyText, { marginTop: 20, marginBottom: 20 }]}>{t("noAccounts")}</Text>
                ) : (
                  <>
                    {/* Sync All button */}
                    <TouchableOpacity
                      style={[S.fetchAllBtn, {
                        backgroundColor: integrationType === "sec" ? "#F59E0B" : "#0284C7",
                      }]}
                      onPress={syncAllBills}
                      disabled={integrationAccounts.every((a) => a.status === "success" || a.status === "updated" || a.status === "loading" || a.status === "paid")}
                    >
                      <Text style={S.fetchAllBtnText}>
                        {t("syncAll")} ({integrationAccounts.filter((a) => a.status === "idle" || a.status === "error").length})
                      </Text>
                    </TouchableOpacity>

                    <ScrollView style={{ maxHeight: 400 }}>
                      {integrationAccounts.map((acc, i) => (
                        <TouchableOpacity
                          key={`${acc.propertyId}-${acc.unitNumber ?? "prop"}-${acc.accountNumber}`}
                          style={[S.integrationRow, isRTL && S.rowRev]}
                          onPress={() => syncBill(i)}
                          disabled={acc.status === "loading"}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[S.integrationName, isRTL && { textAlign: "right" }]}>
                              {acc.propertyName}
                              {acc.unitNumber ? ` - ${t("unit")} ${acc.unitNumber}` : ""}
                            </Text>
                            <Text style={[S.integrationAccount, isRTL && { textAlign: "right" }]}>
                              {t("accountLabel")}: {acc.accountNumber}
                            </Text>
                            {SYNCED_STATUSES.includes(acc.status) && acc.billAmount !== undefined && (
                              <View>
                                <Text style={[S.integrationAmount, { color: "#22C55E" }, isRTL && { textAlign: "right" }]}>
                                  {acc.billAmount.toLocaleString()} {t("sar")} — {t("upToDate")}
                                </Text>
                              </View>
                            )}
                            {acc.status === "paid" && (
                              <Text style={[S.integrationPaid, isRTL && { textAlign: "right" }]}>
                                {t("paid")}
                              </Text>
                            )}
                            {acc.status === "idle" && (
                              <Text style={[S.integrationNeedsSync, isRTL && { textAlign: "right" }]}>
                                {t("needsSync")}
                              </Text>
                            )}
                            {acc.status === "error" && (
                              <Text style={[S.integrationError, isRTL && { textAlign: "right" }]}>
                                {t("syncError")}{acc.error ? `: ${acc.error}` : ""}
                              </Text>
                            )}
                          </View>
                          <View style={S.statusIndicator}>
                            {acc.status === "idle" && (
                              <Text style={{ fontSize: 18 }}>{integrationType === "sec" ? "⚡" : "💧"}</Text>
                            )}
                            {acc.status === "loading" && (
                              <ActivityIndicator
                                size="small"
                                color={integrationType === "sec" ? "#F59E0B" : "#0284C7"}
                              />
                            )}
                            {SYNCED_STATUSES.includes(acc.status) && (
                              <Text style={{ fontSize: 18 }}>✅</Text>
                            )}
                            {acc.status === "paid" && (
                              <Text style={{ fontSize: 18 }}>💚</Text>
                            )}
                            {acc.status === "error" && (
                              <Text style={{ fontSize: 18 }}>❌</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}
              </View>
          </ModalOverlay>
        </Modal>

        {/* Edit Modal */}
        <Modal visible={editModalVisible} animationType={isWeb ? 'fade' : 'slide'} transparent onRequestClose={() => setEditModalVisible(false)}>
          <ModalOverlay style={S.modalOverlay} onDismiss={() => { Keyboard.dismiss(); setEditModalVisible(false); }}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ maxHeight: "90%" }} {...webContentClickStop}>
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ paddingBottom: 40 }}>
                <View style={S.modalBox}>
                  <Text style={S.modalTitle}>{t("editExpense")}</Text>

                  <Text style={S.fieldLabel}>{t("category")}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                    <View style={[S.segmentRow, isRTL && S.rowRev]}>
                      {CATEGORIES.map((cat) => (
                        <TouchableOpacity
                          key={cat}
                          style={[S.segBtn, editForm.category === cat && { backgroundColor: CATEGORY_COLORS[cat] }]}
                          onPress={() => { setEditForm({ ...editForm, category: cat }); setEditManualCatSelected(true); }}
                        >
                          <Text style={[S.segBtnText, editForm.category === cat && { color: "#fff" }]}>
                            {CATEGORY_ICONS[cat]} {t(cat as TKey)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  {editSuggestedCat && editSuggestedCat !== editForm.category && !editManualCatSelected && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setEditForm({ ...editForm, category: editSuggestedCat })}
                      style={{
                        flexDirection: isRTL ? "row-reverse" : "row",
                        alignItems: "center",
                        gap: 6,
                        alignSelf: isRTL ? "flex-end" : "flex-start",
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 8,
                        backgroundColor: CATEGORY_COLORS[editSuggestedCat] + "20",
                        borderWidth: 1,
                        borderColor: CATEGORY_COLORS[editSuggestedCat],
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: CATEGORY_COLORS[editSuggestedCat], fontWeight: "600" }}>
                        {CATEGORY_ICONS[editSuggestedCat]} {t("suggestedCategory")}: {t(editSuggestedCat as TKey)} ✓
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TextInput
                    style={[S.input, isRTL && { textAlign: "right" }, !!editExpErrors.amount && S.inputError]}
                    placeholder={`${t("amount")} (${t("sar")})`}
                    placeholderTextColor={C.textMuted}
                    keyboardType="numeric"
                    returnKeyType="done"
                    value={editForm.amount}
                    onChangeText={(v) => { setEditForm({ ...editForm, amount: v }); const num = parseFloat(v); setEditExpErrors((e) => ({ ...e, amount: v.trim() && (isNaN(num) || num <= 0) ? t("validationAmountPositive") : v.trim() && num > 999999 ? t("validationAmountTooHigh") : "" })); }}
                  />
                  {!!editExpErrors.amount && <Text style={S.fieldError}>{editExpErrors.amount}</Text>}

                  <Text style={S.fieldLabel}>{t("date")}</Text>
                  {isWeb ? (
                    <WebDateInput
                      value={editForm.date}
                      onChange={(val) => {
                        setEditForm({ ...editForm, date: val });
                        setEditSelectedDate(new Date(val + "T12:00:00"));
                      }}
                      textColor={C.text}
                      backgroundColor={C.background}
                      borderColor={C.border}
                    />
                  ) : (
                    <>
                      <TouchableOpacity
                        style={S.datePickerBtn}
                        onPress={() => setEditShowDatePicker(true)}
                      >
                        <Text style={S.datePickerText}>📅 {editForm.date}</Text>
                      </TouchableOpacity>
                      {editShowDatePicker && (
                        <>
                          <DateTimePicker
                            value={editSelectedDate}
                            mode="date"
                            display="spinner"
                            locale="en-US"
                            themeVariant={isDark ? "dark" : "light"}
                            onChange={(_: any, date: any) => {
                              if (date) {
                                setEditSelectedDate(date);
                                setEditForm({ ...editForm, date: formatDate(date) });
                              }
                            }}
                          />
                          <TouchableOpacity style={S.pickerConfirm} onPress={() => setEditShowDatePicker(false)}>
                            <Text style={S.pickerConfirmText}>{t("done")}</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </>
                  )}

                  <TextInput
                    style={[S.input, isRTL && { textAlign: "right" }, !!editExpErrors.description && S.inputError]}
                    placeholder={t("description")}
                    placeholderTextColor={C.textMuted}
                    returnKeyType="done"
                    maxLength={200}
                    value={editForm.description}
                    onChangeText={(v) => { setEditForm({ ...editForm, description: v }); setEditExpErrors((e) => ({ ...e, description: v.length > 200 ? t("validationDescriptionLong") : "" })); if (!editManualCatSelected) { const cat = suggestCategory(v); setEditSuggestedCat(cat); if (cat) setEditForm(f => ({ ...f, description: v, category: cat })); } }}
                  />
                  {!!editExpErrors.description && <Text style={S.fieldError}>{editExpErrors.description}</Text>}

                  <Text style={S.fieldLabel}>{t("property")}</Text>
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
                    <TouchableOpacity style={S.saveBtn} onPress={saveEditExpense} disabled={editSaving}>
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

const styles = (C: any, shadow: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md },
  rowRev: { flexDirection: "row-reverse" },
  headerTitle: { fontSize: 24, fontWeight: "700", color: C.text },
  addBtn: { backgroundColor: C.accent, borderRadius: radii.md, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  monthSelector: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 8, gap: 16, marginHorizontal: spacing.md },
  monthNavBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  monthNavTxt: { fontSize: 20, color: C.accent, fontWeight: "700" },
  monthTitle: { fontSize: 16, fontWeight: "700", color: C.text },
  totalCard: { backgroundColor: C.surface, borderRadius: radii.lg, marginHorizontal: spacing.md, marginBottom: 12, padding: spacing.md, ...shadow },
  totalTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  totalLabel: { fontSize: 13, color: C.textMuted },
  totalAmount: { fontSize: 28, fontWeight: "700", color: "#EF4444", marginBottom: 10 },
  syncIndicator: { flexDirection: "row", alignItems: "center", gap: 4 },
  syncText: { fontSize: 11, color: C.accent },
  lastSyncText: { fontSize: 11, color: C.textMuted },
  categoryChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: "600" },
  filterScroll: { paddingLeft: spacing.md, marginBottom: 8, flexGrow: 0 },
  filterRow: { flexDirection: "row", gap: 8, paddingRight: spacing.md, alignItems: "center" },
  filterTab: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: C.surface },
  filterTabActive: { backgroundColor: C.accent },
  filterTabText: { color: C.textMuted, fontSize: 13 },
  filterTabTextActive: { color: "#fff", fontWeight: "700" },
  swipeWrapper: { marginHorizontal: spacing.md, marginBottom: 10 },
  cardInner: { backgroundColor: C.surface, borderRadius: radii.lg, padding: spacing.md, ...shadow } as any,
  cardInnerHover: { backgroundColor: C.background, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8 },
  cardRow: { flexDirection: "row", alignItems: "center" },
  catIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  catName: { fontSize: 15, fontWeight: "600", color: C.text },
  description: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  propName: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "700" },
  date: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  billPaidBadge: { fontSize: 10, color: "#22C55E", fontWeight: "600", marginTop: 3 },
  billUnpaidBadge: { fontSize: 10, color: "#F59E0B", fontWeight: "600", marginTop: 3 },
  emptyText: { textAlign: "center", color: C.textMuted, marginTop: 60, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", ...(Platform.OS === 'web' ? { justifyContent: 'center', paddingHorizontal: 16, backdropFilter: 'blur(8px)' } as any : {}) },
  modalBox: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 40, ...(Platform.OS === 'web' ? { maxWidth: 560, width: '100%', borderRadius: 20, alignSelf: 'center', paddingBottom: spacing.lg, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', zIndex: 1 } as any : {}) },
  modalTitle: { fontSize: 20, fontWeight: "700", color: C.text, marginBottom: 16, textAlign: "center" },
  input: { backgroundColor: C.background, borderRadius: radii.md, padding: 12, color: C.text, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  fieldLabel: { color: C.textMuted, fontSize: 13, marginBottom: 6 },
  datePickerBtn: { backgroundColor: C.background, borderRadius: radii.md, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  datePickerText: { color: C.text, fontSize: 14 },
  pickerConfirm: {
    alignSelf: "stretch", backgroundColor: C.accent, borderRadius: radii.md,
    paddingVertical: 10, alignItems: "center", justifyContent: "center", marginTop: 4, marginBottom: 8,
  },
  pickerConfirmText: { color: "#fff", fontSize: 15, fontWeight: "700" as const },
  segmentRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  segBtn: { backgroundColor: C.background, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.border, marginBottom: 6 },
  segBtnText: { color: C.textMuted, fontSize: 12 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, backgroundColor: C.background, borderRadius: radii.md, padding: 14, alignItems: "center", borderWidth: 1, borderColor: C.border },
  cancelBtnText: { color: C.textMuted, fontWeight: "600", fontSize: 15 },
  saveBtn: { flex: 1, backgroundColor: C.accent, borderRadius: radii.md, padding: 14, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  // Integration modal
  integrationHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  fetchAllBtn: { borderRadius: radii.md, padding: 14, alignItems: "center", marginBottom: 12 },
  fetchAllBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  integrationRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.background, borderRadius: radii.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  integrationName: { fontSize: 14, fontWeight: "600", color: C.text },
  integrationAccount: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  integrationAmount: { fontSize: 13, fontWeight: "700", color: "#22C55E", marginTop: 4 },
  integrationPaid: { fontSize: 12, fontWeight: "600", color: "#22C55E", marginTop: 4 },
  integrationError: { fontSize: 11, color: "#EF4444", marginTop: 2 },
  integrationNeedsSync: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  statusIndicator: { width: 36, alignItems: "center", justifyContent: "center" },
  fieldError: { fontSize: 11, color: "#EF4444", marginTop: 2, marginBottom: 4 },
  inputError: { borderColor: "#EF4444" },
});
