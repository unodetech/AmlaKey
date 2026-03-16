import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Platform, ScrollView, Share, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { crossAlert } from "../lib/alert";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "../lib/supabase";
import { useLanguage, TKey } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, radii } from "../constants/theme";
import { useSubscription } from "../context/SubscriptionContext";

/* ── types ── */
type MetricTab = "revenue" | "overdue" | "collected" | "expenses" | "netIncome";
/** Month filter: 1–12 index */
type MonthFilter = number;

interface Property { id: string; name: string; }

const METRIC_TABS: { key: MetricTab; icon: string; labelKey: TKey; color: string }[] = [
  { key: "revenue",   icon: "📈", labelKey: "revenue",         color: "#0EA5E9" },
  { key: "overdue",   icon: "⚠️", labelKey: "overduePayments", color: "#F59E0B" },
  { key: "collected", icon: "💰", labelKey: "collected",        color: "#22C55E" },
  { key: "expenses",  icon: "🧾", labelKey: "totalExpenses",    color: "#EF4444" },
  { key: "netIncome", icon: "💵", labelKey: "netIncomeLabel",   color: "" },
];

/** Build month labels from JS Intl so we get localised names for free */
function getMonthLabels(lang: string): { month: number; label: string }[] {
  const locale = lang === "ar" ? "ar-SA" : "en-US";
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: new Date(2026, i, 1).toLocaleDateString(locale, { month: "long" }),
  }));
}

const CATEGORY_ICONS: Record<string, string> = {
  water: "💧", electricity: "⚡", maintenance: "🔧", cleaning: "🧹", other: "📋",
};
const CATEGORY_COLORS: Record<string, string> = {
  water: "#0284C7", electricity: "#F59E0B", maintenance: "#8B5CF6", cleaning: "#0D9488", other: "#9CA3AF",
};

/* ── date range helper ── */
function getDateRange(monthIndex: MonthFilter) {
  const y = new Date().getFullYear();
  const m = monthIndex - 1; // 0-based
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const monthYear = `${y}-${String(monthIndex).padStart(2, "0")}`;

  return {
    startDate: `${y}-${String(monthIndex).padStart(2, "0")}-01`,
    endDate: `${y}-${String(monthIndex).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
    monthYears: [monthYear],
  };
}

/** How many payment periods fall within a range of months for a given frequency */
function getFrequencyMultiplier(freq: string): number {
  switch (freq) {
    case "annual": return 12;
    case "semi_annual": return 6;
    case "quarterly": return 3;
    default: return 1; // monthly
  }
}

/** Calculate expected revenue for a tenant within a date range, respecting lease dates and payment frequency */
function calcTenantRevenue(tn: any, monthYears: string[]): number {
  if (!tn.lease_start || !tn.monthly_rent) return 0;
  const freq = tn.payment_frequency || "monthly";
  const freqMonths = getFrequencyMultiplier(freq);
  const leaseStart = tn.lease_start.slice(0, 7); // YYYY-MM
  const leaseEnd = tn.lease_end ? tn.lease_end.slice(0, 7) : "9999-12";

  // Count how many months in the range overlap with the lease period
  let activeMonths = 0;
  for (const my of monthYears) {
    if (my >= leaseStart && my <= leaseEnd) activeMonths++;
  }

  // monthly_rent is the amount per payment period
  // e.g., if annual and monthly_rent=9000, that's 9000/year = 9000/12 per month
  const monthlyAmount = tn.monthly_rent / freqMonths;
  return monthlyAmount * activeMonths;
}

/* ── component ── */
export default function PerformanceScreen() {
  const { tab } = useLocalSearchParams<{ tab: string }>();
  const { t, isRTL } = useLanguage();
  const { colors: C, shadow } = useTheme();
  const { hasFeature } = useSubscription();
  const insets = useSafeAreaInsets();
  const S = useMemo(() => styles(C, shadow), [C, shadow]);

  const [activeTab, setActiveTab] = useState<MetricTab>((tab as MetricTab) || "revenue");
  const [selectedMonth, setSelectedMonth] = useState<MonthFilter>(new Date().getMonth() + 1);
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTenants, setActiveTenants] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [expensesData, setExpensesData] = useState<any[]>([]);
  const [overdueTenants, setOverdueTenants] = useState<any[]>([]);
  useEffect(() => { fetchData(); }, [activeTab, selectedMonth, propertyFilter]);

  async function fetchData() {
    setLoading(true);
    const { startDate, endDate, monthYears } = getDateRange(selectedMonth);

    let propsQ = supabase.from("properties").select("id, name");
    let tenantsQ = supabase.from("tenants")
      .select("id, name, unit_number, property_id, monthly_rent, lease_start, lease_end, status, payment_frequency, properties(name)")
      .eq("status", "active");
    let paysQ = supabase.from("payments")
      .select("id, amount, month_year, payment_date, tenant_id, property_id, created_at, tenants(name, unit_number, properties(name))")
      .gte("month_year", monthYears[0])
      .lte("month_year", monthYears[monthYears.length - 1])
      .order("created_at", { ascending: false });
    let expsQ = supabase.from("expenses")
      .select("id, category, amount, date, description, property_id, created_at, properties(name)")
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false });

    if (propertyFilter !== "all") {
      tenantsQ = tenantsQ.eq("property_id", propertyFilter);
      paysQ = paysQ.eq("property_id", propertyFilter);
      expsQ = expsQ.eq("property_id", propertyFilter);
    }

    const [{ data: props }, { data: tenants }, { data: pays }, { data: exps }] = await Promise.all([
      propsQ, tenantsQ, paysQ, expsQ,
    ]);

    setProperties(props ?? []);
    setActiveTenants(tenants ?? []);
    setPayments(pays ?? []);
    setExpensesData(exps ?? []);

    // Overdue computation — only fully paid tenants are excluded
    {
      const thisMonth = new Date().toISOString().slice(0, 7);
      const { data: monthPays } = await supabase.from("payments").select("tenant_id, amount").eq("month_year", thisMonth);
      const paidByTenantMap = new Map<string, number>();
      for (const p of (monthPays ?? [])) {
        paidByTenantMap.set(p.tenant_id, (paidByTenantMap.get(p.tenant_id) ?? 0) + (p.amount ?? 0));
      }
      const today = new Date();
      const currentDay = today.getDate();
      const list = (tenants ?? [])
        .filter((tn: any) => {
          if (!tn.lease_start) return false;
          const dueDay = new Date(tn.lease_start + "T12:00:00").getDate();
          const totalPaid = paidByTenantMap.get(tn.id) ?? 0;
          return currentDay >= dueDay && totalPaid < (tn.monthly_rent ?? 0);
        })
        .map((tn: any) => {
          const dueDay = new Date(tn.lease_start + "T12:00:00").getDate();
          const totalPaid = paidByTenantMap.get(tn.id) ?? 0;
          const overdueAmount = (tn.monthly_rent ?? 0) - totalPaid;
          return { ...tn, dueDay, daysOverdue: currentDay - dueDay, overdueAmount };
        })
        .sort((a: any, b: any) => b.daysOverdue - a.daysOverdue);
      setOverdueTenants(list);
    }

    setLoading(false);
  }

  /* ── computed values ── */
  const { monthYears } = getDateRange(selectedMonth);

  const totalRevenue = useMemo(() =>
    activeTenants.reduce((s, tn) => s + calcTenantRevenue(tn, monthYears), 0),
    [activeTenants, monthYears]);

  const totalCollected = useMemo(() =>
    payments.reduce((s, p) => s + (p.amount ?? 0), 0), [payments]);

  const totalExpenses = useMemo(() =>
    expensesData.reduce((s, e) => s + (e.amount ?? 0), 0), [expensesData]);

  const netIncome = totalCollected - totalExpenses;
  const collectionRate = totalRevenue > 0 ? Math.round((totalCollected / totalRevenue) * 100) : 0;
  const totalOverdue = useMemo(() =>
    overdueTenants.reduce((s, ot) => s + (ot.overdueAmount ?? ot.monthly_rent ?? 0), 0), [overdueTenants]);

  const propertyBreakdown = useMemo(() =>
    properties.map((p) => {
      const propTenants = activeTenants.filter((t) => t.property_id === p.id);
      const rev = propTenants.reduce((s, t) => s + calcTenantRevenue(t, monthYears), 0);
      const col = payments.filter((pay) => pay.property_id === p.id).reduce((s, pay) => s + (pay.amount ?? 0), 0);
      const exp = expensesData.filter((e) => e.property_id === p.id).reduce((s, e) => s + (e.amount ?? 0), 0);
      return { ...p, revenue: rev, collected: col, expenses: exp, net: col - exp };
    }).filter((p) => p.revenue > 0 || p.collected > 0 || p.expenses > 0),
    [properties, activeTenants, payments, expensesData, monthYears]);

  const categoryBreakdown = useMemo(() => {
    const cats = ["electricity", "water", "maintenance", "cleaning", "other"] as const;
    return cats.map((cat) => {
      const total = expensesData.filter((e) => e.category === cat).reduce((s, e) => s + (e.amount ?? 0), 0);
      return { category: cat, total, pct: totalExpenses > 0 ? Math.round((total / totalExpenses) * 100) : 0 };
    }).filter((c) => c.total > 0);
  }, [expensesData, totalExpenses]);

  const monthlyBreakdown = useMemo(() => {
    if (monthYears.length <= 1) return [];
    return monthYears.map((my) => {
      const col = payments.filter((p) => p.month_year === my).reduce((s, p) => s + (p.amount ?? 0), 0);
      const exp = expensesData.filter((e) => (e.date ?? "").startsWith(my)).reduce((s, e) => s + (e.amount ?? 0), 0);
      const rev = activeTenants.reduce((s, t) => s + calcTenantRevenue(t, [my]), 0);
      return { monthYear: my, revenue: rev, collected: col, expenses: exp, net: col - exp };
    });
  }, [payments, expensesData, activeTenants, monthYears]);

  /* ── tab renderers ── */
  function renderRevenueTab() {
    return (
      <>
        <View style={[S.bigStatCard, { borderTopColor: "#0EA5E9" }]}>
          <Text style={S.bigStatIcon}>📈</Text>
          <Text style={[S.bigStatValue, { color: "#0EA5E9" }]}>{totalRevenue.toLocaleString()}</Text>
          <Text style={S.bigStatLabel}>{t("expectedRevenue")} ({t("sar")})</Text>
        </View>
        {propertyBreakdown.length > 0 && (
          <>
            <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }]}>{t("byProperty")}</Text>
            {propertyBreakdown.map((p) => (
              <View key={p.id} style={[S.breakdownRow, isRTL && S.rowRev]}>
                <Text style={[S.breakdownName, isRTL && { textAlign: "right" }]}>{p.name}</Text>
                <Text style={[S.breakdownVal, { color: "#0EA5E9" }]}>{p.revenue.toLocaleString()} {t("sar")}</Text>
              </View>
            ))}
          </>
        )}
        {monthlyBreakdown.length > 0 && (
          <>
            <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }]}>{t("monthlyBreakdown")}</Text>
            {monthlyBreakdown.map((mb) => (
              <View key={mb.monthYear} style={[S.breakdownRow, isRTL && S.rowRev]}>
                <Text style={S.breakdownName}>{mb.monthYear}</Text>
                <Text style={[S.breakdownVal, { color: "#0EA5E9" }]}>{mb.revenue.toLocaleString()} {t("sar")}</Text>
              </View>
            ))}
          </>
        )}
        {propertyBreakdown.length === 0 && <Text style={S.emptyText}>{t("noDataPeriod")}</Text>}
      </>
    );
  }

  function renderCollectedTab() {
    const recent = payments.slice(0, 10);
    return (
      <>
        <View style={[S.bigStatCard, { borderTopColor: "#22C55E" }]}>
          <Text style={S.bigStatIcon}>💰</Text>
          <Text style={[S.bigStatValue, { color: "#22C55E" }]}>{totalCollected.toLocaleString()}</Text>
          <Text style={S.bigStatLabel}>{t("totalCollected")} ({t("sar")})</Text>
        </View>
        <View style={S.rateChip}>
          <Text style={S.rateChipText}>{t("collectionRate")}: {collectionRate}%</Text>
        </View>
        {propertyBreakdown.filter((p) => p.collected > 0).length > 0 && (
          <>
            <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }]}>{t("byProperty")}</Text>
            {propertyBreakdown.filter((p) => p.collected > 0).map((p) => (
              <View key={p.id} style={[S.breakdownRow, isRTL && S.rowRev]}>
                <Text style={[S.breakdownName, isRTL && { textAlign: "right" }]}>{p.name}</Text>
                <Text style={[S.breakdownVal, { color: "#22C55E" }]}>{p.collected.toLocaleString()} {t("sar")}</Text>
              </View>
            ))}
          </>
        )}
        {recent.length > 0 && (
          <>
            <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }]}>{t("recentPayments")}</Text>
            {recent.map((p) => (
              <View key={p.id} style={[S.listItem, isRTL && S.rowRev]}>
                <View style={[S.listIconWrap, { backgroundColor: "#22C55E20" }]}>
                  <Text style={{ fontSize: 16 }}>💰</Text>
                </View>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={[S.listItemTitle, isRTL && { textAlign: "right" }]}>{(p.tenants as any)?.name ?? ""}</Text>
                  <Text style={[S.listItemSub, isRTL && { textAlign: "right" }]}>{p.payment_date ?? p.month_year}</Text>
                </View>
                <Text style={[S.listItemAmount, { color: "#22C55E" }]}>{p.amount?.toLocaleString()} {t("sar")}</Text>
              </View>
            ))}
          </>
        )}
        {monthlyBreakdown.length > 0 && (
          <>
            <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }]}>{t("monthlyBreakdown")}</Text>
            {monthlyBreakdown.map((mb) => (
              <View key={mb.monthYear} style={[S.breakdownRow, isRTL && S.rowRev]}>
                <Text style={S.breakdownName}>{mb.monthYear}</Text>
                <Text style={[S.breakdownVal, { color: "#22C55E" }]}>{mb.collected.toLocaleString()} {t("sar")}</Text>
              </View>
            ))}
          </>
        )}
        {totalCollected === 0 && <Text style={S.emptyText}>{t("noDataPeriod")}</Text>}
      </>
    );
  }

  function renderExpensesTab() {
    const recent = expensesData.slice(0, 10);
    return (
      <>
        <View style={[S.bigStatCard, { borderTopColor: "#EF4444" }]}>
          <Text style={S.bigStatIcon}>🧾</Text>
          <Text style={[S.bigStatValue, { color: "#EF4444" }]}>{totalExpenses.toLocaleString()}</Text>
          <Text style={S.bigStatLabel}>{t("totalExpensesLabel")} ({t("sar")})</Text>
        </View>
        {categoryBreakdown.length > 0 && (
          <>
            <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }]}>{t("byCategory")}</Text>
            {categoryBreakdown.map((cat) => (
              <View key={cat.category} style={[S.breakdownRow, isRTL && S.rowRev]}>
                <View style={[{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }, isRTL && S.rowRev]}>
                  <Text style={{ fontSize: 16 }}>{CATEGORY_ICONS[cat.category]}</Text>
                  <Text style={[S.breakdownName, { flex: 0 }, isRTL && { textAlign: "right" }]}>{t(cat.category as TKey)}</Text>
                </View>
                <View style={{ alignItems: isRTL ? "flex-start" : "flex-end" }}>
                  <Text style={[S.breakdownVal, { color: CATEGORY_COLORS[cat.category] ?? "#9CA3AF" }]}>
                    {cat.total.toLocaleString()} {t("sar")}
                  </Text>
                  <Text style={S.breakdownPct}>{cat.pct}%</Text>
                </View>
              </View>
            ))}
          </>
        )}
        {propertyBreakdown.filter((p) => p.expenses > 0).length > 0 && (
          <>
            <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }]}>{t("byProperty")}</Text>
            {propertyBreakdown.filter((p) => p.expenses > 0).map((p) => (
              <View key={p.id} style={[S.breakdownRow, isRTL && S.rowRev]}>
                <Text style={[S.breakdownName, isRTL && { textAlign: "right" }]}>{p.name}</Text>
                <Text style={[S.breakdownVal, { color: "#EF4444" }]}>{p.expenses.toLocaleString()} {t("sar")}</Text>
              </View>
            ))}
          </>
        )}
        {recent.length > 0 && (
          <>
            <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }]}>{t("recentExpensesList")}</Text>
            {recent.map((e) => (
              <View key={e.id} style={[S.listItem, isRTL && S.rowRev]}>
                <View style={[S.listIconWrap, { backgroundColor: (CATEGORY_COLORS[e.category] ?? "#9CA3AF") + "20" }]}>
                  <Text style={{ fontSize: 16 }}>{CATEGORY_ICONS[e.category] ?? "📋"}</Text>
                </View>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={[S.listItemTitle, isRTL && { textAlign: "right" }]}>{t(e.category as TKey)}</Text>
                  <Text style={[S.listItemSub, isRTL && { textAlign: "right" }]}>
                    {e.properties?.name ?? ""}{e.properties?.name && e.date ? " · " : ""}{e.date ?? ""}
                  </Text>
                </View>
                <Text style={[S.listItemAmount, { color: "#EF4444" }]}>{e.amount?.toLocaleString()} {t("sar")}</Text>
              </View>
            ))}
          </>
        )}
        {totalExpenses === 0 && <Text style={S.emptyText}>{t("noDataPeriod")}</Text>}
      </>
    );
  }

  function renderOverdueTab() {
    return (
      <>
        <View style={[S.bigStatCard, { borderTopColor: "#F59E0B" }]}>
          <Text style={S.bigStatIcon}>⚠️</Text>
          <Text style={[S.bigStatValue, { color: "#F59E0B" }]}>{totalOverdue.toLocaleString()}</Text>
          <Text style={S.bigStatLabel}>
            {overdueTenants.length} {t("tenantsOverdue")} ({t("sar")})
          </Text>
        </View>
        {overdueTenants.length === 0 ? (
          <View style={S.messageCard}>
            <Text style={S.messageIcon}>✅</Text>
            <Text style={S.messageText}>{t("noDataPeriod")}</Text>
          </View>
        ) : (
          overdueTenants.map((ot) => (
            <TouchableOpacity
              key={ot.id}
              style={[S.overdueRow, isRTL && S.rowRev]}
              activeOpacity={0.7}
              onPress={() => {
                router.push({
                  pathname: "/unit-detail",
                  params: {
                    propertyId: ot.property_id ?? "",
                    propertyName: (ot.properties as any)?.name ?? "",
                    unitNumber: String(ot.unit_number),
                    tenantId: ot.id,
                    unitLabel: `${t("unit")} ${ot.unit_number}`,
                  },
                });
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[S.overdueName, isRTL && { textAlign: "right" }]}>{ot.name}</Text>
                <Text style={[S.overdueSub, isRTL && { textAlign: "right" }]}>
                  {(ot.properties as any)?.name ?? ""} · {t("unit")} {ot.unit_number}
                </Text>
              </View>
              <View style={{ alignItems: isRTL ? "flex-start" : "flex-end" }}>
                <Text style={S.overdueAmount}>{(ot.overdueAmount ?? ot.monthly_rent)?.toLocaleString()} {t("sar")}</Text>
                <Text style={S.overdueDays}>{ot.daysOverdue} {t("daysOverdue")}</Text>
              </View>
              <Text style={S.overdueChevron}>{isRTL ? "‹" : "›"}</Text>
            </TouchableOpacity>
          ))
        )}
      </>
    );
  }

  function renderNetIncomeTab() {
    const color = netIncome >= 0 ? C.accent : "#EF4444";
    return (
      <>
        <View style={[S.bigStatCard, { borderTopColor: color }]}>
          <Text style={S.bigStatIcon}>💵</Text>
          <Text style={[S.bigStatValue, { color }]}>{netIncome.toLocaleString()}</Text>
          <Text style={S.bigStatLabel}>{t("netIncomeLabel")} ({t("sar")})</Text>
        </View>
        <View style={S.comparisonCard}>
          <Text style={[S.compTitle, isRTL && { textAlign: "right" }]}>{t("collectedVsExpenses")}</Text>
          <View style={[S.compRow, isRTL && S.rowRev]}>
            <Text style={S.compLabel}>{t("collected")}</Text>
            <Text style={[S.compVal, { color: "#22C55E" }]}>{totalCollected.toLocaleString()} {t("sar")}</Text>
          </View>
          <View style={[S.compRow, { borderBottomWidth: 0 }, isRTL && S.rowRev]}>
            <Text style={S.compLabel}>{t("totalExpenses")}</Text>
            <Text style={[S.compVal, { color: "#EF4444" }]}>{totalExpenses.toLocaleString()} {t("sar")}</Text>
          </View>
        </View>
        {propertyBreakdown.length > 0 && (
          <>
            <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }]}>{t("byProperty")}</Text>
            {propertyBreakdown.map((p) => (
              <View key={p.id} style={[S.breakdownRow, isRTL && S.rowRev]}>
                <Text style={[S.breakdownName, isRTL && { textAlign: "right" }]}>{p.name}</Text>
                <Text style={[S.breakdownVal, { color: p.net >= 0 ? C.accent : "#EF4444" }]}>
                  {p.net.toLocaleString()} {t("sar")}
                </Text>
              </View>
            ))}
          </>
        )}
        {monthlyBreakdown.length > 0 && (
          <>
            <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }]}>{t("monthlyBreakdown")}</Text>
            {monthlyBreakdown.map((mb) => (
              <View key={mb.monthYear} style={[S.breakdownRow, isRTL && S.rowRev]}>
                <Text style={S.breakdownName}>{mb.monthYear}</Text>
                <Text style={[S.breakdownVal, { color: mb.net >= 0 ? C.accent : "#EF4444" }]}>
                  {mb.net.toLocaleString()} {t("sar")}
                </Text>
              </View>
            ))}
          </>
        )}
        {totalCollected === 0 && totalExpenses === 0 && <Text style={S.emptyText}>{t("noDataPeriod")}</Text>}
      </>
    );
  }

  async function handleShareReport() {
    if (!hasFeature("export_reports")) {
      crossAlert(t("upgradeRequired"), t("upgradeToUnlock"), [
        { text: t("upgrade"), onPress: () => router.push("/paywall" as any) },
        { text: t("later"), style: "cancel" },
      ]);
      return;
    }
    const message =
      `📊 ${t("performanceReport")}\n` +
      `${t("collectionRate")}: ${collectionRate}%\n` +
      `${t("totalCollected")}: ${totalCollected.toLocaleString()} ${t("sar")}\n` +
      `${t("pending")}: ${(totalRevenue - totalCollected).toLocaleString()} ${t("sar")}\n` +
      `${t("overduePayments")}: ${overdueTenants.length}\n` +
      `\nAmlakey Property Manager`;
    try {
      if (Platform.OS === "web" && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        window.alert("Report copied to clipboard");
      } else {
        await Share.share({ message });
      }
    } catch (_) {}
  }

  /* ── render ── */
  return (
    <View style={S.container}>
      {/* Header */}
      <View style={[S.header, { paddingTop: insets.top + 10 }, isRTL && S.rowRev]}>
        <View style={S.headerSide}>
          <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
            <Text style={S.backArrow}>{isRTL ? "›" : "‹"}</Text>
          </TouchableOpacity>
        </View>
        <View style={S.headerCenter}>
          <Text style={S.headerTitle}>{t("performance")}</Text>
        </View>
        <View style={S.headerSide}>
          <TouchableOpacity onPress={handleShareReport} style={S.backBtn}>
            <Text style={{ fontSize: 16 }}>📤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Metric tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingVertical: 8 }}
        style={{ flexGrow: 0, flexShrink: 0 }}>
        <View style={[S.pillRow, isRTL && S.rowRev]}>
          {METRIC_TABS.map((mt) => {
            const isActive = activeTab === mt.key;
            const pillColor = mt.key === "netIncome" ? C.accent : mt.color;
            return (
              <TouchableOpacity key={mt.key}
                style={[S.metricTab, isActive && { backgroundColor: pillColor, borderColor: pillColor }]}
                onPress={() => setActiveTab(mt.key)}>
                <Text style={[S.metricTabText, isActive && { color: "#fff" }]}>
                  {mt.icon} {t(mt.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Month filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 8 }}
        style={{ flexGrow: 0, flexShrink: 0 }}>
        <View style={[S.pillRow, isRTL && S.rowRev]}>
          {getMonthLabels(isRTL ? "ar" : "en").map((ml) => (
            <TouchableOpacity key={ml.month}
              style={[S.filterTab, selectedMonth === ml.month && S.filterTabActive]}
              onPress={() => setSelectedMonth(ml.month)}>
              <Text style={[S.filterTabText, selectedMonth === ml.month && S.filterTabTextActive]}>
                {ml.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Property filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 8 }}
        style={{ flexGrow: 0, flexShrink: 0, marginBottom: 4 }}>
        <View style={[S.pillRow, isRTL && S.rowRev]}>
          <TouchableOpacity
            style={[S.filterTab, propertyFilter === "all" && S.filterTabActive]}
            onPress={() => setPropertyFilter("all")}>
            <Text style={[S.filterTabText, propertyFilter === "all" && S.filterTabTextActive]}>
              {t("allProperties")}
            </Text>
          </TouchableOpacity>
          {properties.map((p) => (
            <TouchableOpacity key={p.id}
              style={[S.filterTab, propertyFilter === p.id && S.filterTabActive]}
              onPress={() => setPropertyFilter(p.id)}>
              <Text style={[S.filterTabText, propertyFilter === p.id && S.filterTabTextActive]}>
                {p.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Content */}
      {loading ? (
        <ActivityIndicator color={C.accent} size="large" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {activeTab === "revenue" && renderRevenueTab()}
          {activeTab === "collected" && renderCollectedTab()}
          {activeTab === "expenses" && renderExpensesTab()}
          {activeTab === "overdue" && renderOverdueTab()}
          {activeTab === "netIncome" && renderNetIncomeTab()}
        </ScrollView>
      )}
    </View>
  );
}

/* ── styles ── */
const styles = (C: any, shadow: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  rowRev: { flexDirection: "row-reverse" },
  headerSide: { width: 44 },
  headerCenter: { flex: 1, alignItems: "center" },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  backArrow: { fontSize: 22, color: C.text, fontWeight: "700", marginTop: -2 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: C.text },
  pillRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  metricTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  metricTabText: { color: C.textMuted, fontSize: 13, fontWeight: "500" },
  filterTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  filterTabActive: { backgroundColor: C.accent, borderColor: C.accent },
  filterTabText: { color: C.textMuted, fontSize: 12 },
  filterTabTextActive: { color: "#fff", fontWeight: "700" },
  bigStatCard: { backgroundColor: C.surface, borderRadius: radii.lg, padding: 24, marginHorizontal: spacing.md, marginBottom: 16, alignItems: "center", borderTopWidth: 3, ...shadow },
  bigStatIcon: { fontSize: 28, marginBottom: 8 },
  bigStatValue: { fontSize: 32, fontWeight: "800" },
  bigStatLabel: { fontSize: 13, color: C.textMuted, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: C.text, paddingHorizontal: spacing.md, marginTop: 16, marginBottom: 10 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.surface, borderRadius: radii.md, padding: 14, marginHorizontal: spacing.md, marginBottom: 8, ...shadow },
  breakdownName: { fontSize: 14, fontWeight: "600", color: C.text, flex: 1 },
  breakdownVal: { fontSize: 14, fontWeight: "700" },
  breakdownPct: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  listItem: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: radii.md, padding: spacing.md, marginHorizontal: spacing.md, marginBottom: 8, ...shadow },
  listIconWrap: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  listItemTitle: { fontSize: 14, fontWeight: "600", color: C.text },
  listItemSub: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  listItemAmount: { fontSize: 13, fontWeight: "700" },
  rateChip: { backgroundColor: C.accentSoft, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 8, alignSelf: "center", marginBottom: 12 },
  rateChipText: { color: C.accent, fontWeight: "700", fontSize: 14 },
  overdueRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.surface, borderRadius: radii.md, padding: 14, marginHorizontal: spacing.md, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: "#F59E0B", ...shadow },
  overdueName: { fontSize: 14, fontWeight: "600", color: C.text },
  overdueSub: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  overdueAmount: { fontSize: 13, fontWeight: "700", color: "#EF4444" },
  overdueDays: { fontSize: 11, color: "#F59E0B", marginTop: 2 },
  overdueChevron: { fontSize: 22, color: C.textMuted, fontWeight: "600", marginLeft: 8, alignSelf: "center" },
  messageCard: { backgroundColor: C.surface, borderRadius: radii.lg, padding: 32, marginHorizontal: spacing.md, alignItems: "center", ...shadow },
  messageIcon: { fontSize: 32, marginBottom: 12 },
  messageText: { fontSize: 14, color: C.textMuted, textAlign: "center", lineHeight: 20 },
  comparisonCard: { backgroundColor: C.surface, borderRadius: radii.lg, padding: spacing.md, marginHorizontal: spacing.md, marginBottom: 12, ...shadow },
  compTitle: { fontSize: 14, fontWeight: "700", color: C.text, marginBottom: 8 },
  compRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  compLabel: { fontSize: 14, color: C.text },
  compVal: { fontSize: 15, fontWeight: "700" },
  emptyText: { textAlign: "center", color: C.textMuted, marginTop: 40, fontSize: 14 },
});
