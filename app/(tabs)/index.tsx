import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { crossAlert } from "../../lib/alert";
import { router, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as offlineDb from "../../lib/offlineDb";
import { supabase } from "../../lib/supabase";
import { useLanguage, TKey } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { spacing, radii } from "../../constants/theme";
import { useNetwork } from "../../context/NetworkContext";
import { Onboarding } from "../../components/Onboarding";
import { useOnboarding } from "../../hooks/useOnboarding";
import { useNotification } from "../../context/NotificationContext";
import { NotificationBell } from "../../components/NotificationBell";
import { NotificationCenter } from "../../components/NotificationCenter";
import { formatDualDate, formatMonthDual, isPaymentDueInMonth } from "../../lib/dateUtils";
import { useAuth } from "../../context/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebContainer, { useResponsive } from "../../components/WebContainer";
import { modalBackdropStyle, ModalOverlay, webContentClickStop } from "../../components/WebDateInput";
import { useSubscription } from "../../context/SubscriptionContext";
import { userKey, PERSONAL_INFO_KEY, HIJRI_KEY } from "../../lib/storage";

interface PropertyOcc {
  id: string; name: string; total_units: number; occupied: number;
}
interface Update {
  id: string; icon: string; title: string; sub: string;
  amount?: number; time: string; color: string;
  // Extra fields for expanded view
  detail?: string; propertyName?: string; unitNumber?: string;
}

interface OverdueTenant {
  id: string; name: string; unitNumber: string;
  propertyName: string; propertyId: string;
  monthlyRent: number; overdueAmount: number; dueDay: number; daysOverdue: number;
}

interface BroadcastTenant {
  id: string; name: string; unitNumber: string;
  propertyName: string; phone: string | null;
  isOverdue: boolean; isExpiring: boolean;
  monthlyRent: number;
}

function getGreeting(t: (k: any) => string) {
  const h = new Date().getHours();
  return h < 12 ? t("goodMorning") : h < 17 ? t("goodAfternoon") : t("goodEvening");
}

function timeAgo(dateStr: string, isRTL: boolean) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (isRTL) {
    if (m < 60) return `قبل ${m} د`;
    if (h < 24) return `قبل ${h} س`;
    return `قبل ${d} ي`;
  }
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function formatFullDate(dateStr: string, lang: string = "en") {
  try {
    return new Date(dateStr).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export default function DashboardScreen() {
  const { t, isRTL, lang } = useLanguage();
  const currentMonthName = new Date().toLocaleDateString(lang === "ar" ? "ar-SA-u-ca-gregory" : "en-US", { month: "long" });
  const { colors: C, shadow, isDark } = useTheme();
  const { showOnboarding, completeOnboarding } = useOnboarding();
  const { rescheduleAll } = useNotification();
  const { user } = useAuth();
  const { hasFeature } = useSubscription();
  const { isDesktop, isWide } = useResponsive();
  const insets = useSafeAreaInsets();
  const uid = user?.id ?? "";
  const [notifCenterOpen, setNotifCenterOpen] = useState(false);
  const { isOnline, pendingSyncCount } = useNetwork();

  // Hijri calendar preference
  const [showHijri, setShowHijri] = useState(false);
  useEffect(() => {
    if (!uid) return;
    AsyncStorage.getItem(userKey(uid, HIJRI_KEY)).then(v => {
      if (v !== null) setShowHijri(v === "true");
      else setShowHijri(lang === "ar");
    }).catch(() => {});
  }, [uid]);

  const S = useMemo(() => styles(C, shadow), [C, shadow]);

  const [revenue, setRevenue] = useState(0);
  const [collected, setCollected] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [totalUnits, setTotalUnits] = useState(0);
  const [occupiedUnits, setOccupiedUnits] = useState(0);
  const [vacancyCost, setVacancyCost] = useState(0);
  const [openMaintenanceCount, setOpenMaintenanceCount] = useState(0);
  const [tenantCounts, setTenantCounts] = useState({ total: 0, active: 0, expired: 0 });
  const [propertyOccs, setPropertyOccs] = useState<PropertyOcc[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [occModal, setOccModal] = useState(false);
  const [expandedUpdateId, setExpandedUpdateId] = useState<string | null>(null);
  const [calendarModal, setCalendarModal] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarEvents, setCalendarEvents] = useState<{ [date: string]: { type: "lease" | "payment" | "due"; label: string }[] }>({});
  const [selectedCalDate, setSelectedCalDate] = useState<string | null>(null);
  // showAllUpdates removed — now navigates to /recent-updates
  const [userName, setUserName] = useState("");
  const [overdueTenants, setOverdueTenants] = useState<OverdueTenant[]>([]);
  const [expiringLeaseCount, setExpiringLeaseCount] = useState(0);
  // overdueExpanded removed — now navigates to /performance
  // Notify tenant
  const [broadcastModal, setBroadcastModal] = useState(false);
  const [broadcastTenants, setBroadcastTenants] = useState<BroadcastTenant[]>([]);
  const [broadcastFilter, setBroadcastFilter] = useState<"all" | "overdue" | "expiring">("all");
  const [broadcastSelected, setBroadcastSelected] = useState<string | null>(null);
  const [broadcastMsgType, setBroadcastMsgType] = useState<"auto" | "custom">("auto");
  const [broadcastCustomMsg, setBroadcastCustomMsg] = useState("");

  useEffect(() => {
    if (!uid) return;
    AsyncStorage.getItem(userKey(uid, PERSONAL_INFO_KEY)).then((raw) => {
      if (raw) {
        try { const info = JSON.parse(raw); if (info.fullName) setUserName(info.fullName.split(" ")[0]); } catch {}
      }
    });
  }, [uid]);

  useFocusEffect(useCallback(() => { if (uid) { fetchDashboard(); fetchCalendarEvents(); } }, [uid]));

  async function fetchDashboard() {
   try {
    const thisMonth = new Date().toISOString().slice(0, 7);
    const [
      { data: props }, { data: activeTenants }, { data: allTenants },
      { data: expData }, { data: payByTenant },
      { data: recentTenants }, { data: recentPayments }, { data: recentExpenses },
    ] = await Promise.all([
      offlineDb.select("properties", { userId: uid, columns: "id, name, total_units, monthly_income" }),
      offlineDb.select("tenants", { userId: uid, columns: "id, name, unit_number, property_id, monthly_rent, lease_start, lease_end, payment_frequency, phone, properties!inner(name)", eq: { status: "active" } }),
      offlineDb.select("tenants", { userId: uid, columns: "id, status" }),
      offlineDb.select("expenses", { userId: uid, columns: "amount, date, properties!inner(id)", gte: { date: `${thisMonth}-01` }, lte: { date: `${thisMonth}-31` } }),
      offlineDb.select("payments", { userId: uid, columns: "tenant_id, amount, tenants!inner(properties!inner(id))", eq: { month_year: thisMonth } }),
      offlineDb.select("tenants", { userId: uid, columns: "id, name, unit_number, monthly_rent, created_at, properties!inner(id, name)", order: { column: "created_at", ascending: false }, limit: 3 }),
      offlineDb.select("payments", { userId: uid, columns: "id, amount, created_at, tenants!inner(name, unit_number, properties!inner(name))", order: { column: "created_at", ascending: false }, limit: 3 }),
      offlineDb.select("expenses", { userId: uid, columns: "id, category, amount, description, created_at, properties!inner(id, name)", order: { column: "created_at", ascending: false }, limit: 3 }),
    ]);

    // Tenants whose lease covers the current month (for occupancy/counts)
    const monthStart = new Date(`${thisMonth}-01T00:00:00`);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const leaseActiveTenants = (activeTenants ?? []).filter((tn: any) => {
      if (!tn.lease_start) return false;
      const ls = new Date(tn.lease_start + "T00:00:00");
      if (ls > monthEnd) return false;
      if (tn.lease_end) {
        const le = new Date(tn.lease_end + "T23:59:59");
        if (le < monthStart) return false;
      }
      return true;
    });

    // Tenants whose payment is actually due this month (for revenue/overdue)
    const paymentDueTenants = leaseActiveTenants.filter((tn: any) =>
      isPaymentDueInMonth(tn.lease_start, tn.lease_end, tn.payment_frequency, thisMonth)
    );

    // Amount due this month per tenant — semi_annual tenants pay 50% per installment
    const amountDueThisMonth = (tn: any) => {
      const rent = tn.monthly_rent ?? 0;
      if (tn.payment_frequency === "semi_annual") return rent / 2;
      return rent;
    };

    setRevenue(paymentDueTenants.reduce((s: number, tn: any) => s + amountDueThisMonth(tn), 0));
    // Only count payments from tenants whose rent is due this month
    const paymentDueTenantIds = new Set(paymentDueTenants.map((tn: any) => tn.id));
    const monthCollected = (payByTenant ?? [])
      .filter((p: any) => paymentDueTenantIds.has(p.tenant_id))
      .reduce((s: number, p: any) => s + (p.amount ?? 0), 0);
    setCollected(monthCollected);
    setExpenses(expData?.reduce((s, e) => s + (e.amount ?? 0), 0) ?? 0);
    const units = (props ?? []).reduce((s: number, p: any) => s + p.total_units, 0);
    setTotalUnits(units);
    setOccupiedUnits(leaseActiveTenants.length);
    setTenantCounts({
      total: allTenants?.length ?? 0,
      active: leaseActiveTenants.length,
      expired: allTenants?.filter((tn) => tn.status === "expired").length ?? 0,
    });
    setPropertyOccs((props ?? []).map((p: any) => ({
      id: p.id, name: p.name, total_units: p.total_units,
      occupied: leaseActiveTenants.filter((tn: any) => tn.property_id === p.id).length,
    })));

    // Compute vacancy cost — monthly_income is annual, so divide by 12
    const totalMonthlyIncome = (props ?? []).reduce((s: number, p: any) => s + ((p.monthly_income ?? 0) / 12), 0);
    const vacantUnits = units - leaseActiveTenants.length;
    const avgRentPerUnit = units > 0 ? totalMonthlyIncome / units : 0;
    setVacancyCost(vacantUnits > 0 ? vacantUnits * avgRentPerUnit : 0);

    // Fetch open maintenance requests count
    try {
      const { count } = await supabase
        .from("maintenance_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .in("status", ["open", "in_progress"]);
      setOpenMaintenanceCount(count ?? 0);
    } catch { setOpenMaintenanceCount(0); }

    // Compute unpaid tenants — any tenant whose payment is due this month and hasn't fully paid
    const today = new Date();
    const paidByTenantMap = new Map<string, number>();
    for (const p of (payByTenant ?? [])) {
      paidByTenantMap.set(p.tenant_id, (paidByTenantMap.get(p.tenant_id) ?? 0) + (p.amount ?? 0));
    }
    const overdueList: OverdueTenant[] = [];
    for (const tn of paymentDueTenants) {
      if (!tn.lease_start) continue;
      const dueDay = new Date(tn.lease_start + "T12:00:00").getDate();
      const totalPaid = paidByTenantMap.get(tn.id) ?? 0;
      const dueAmount = amountDueThisMonth(tn);
      if (totalPaid < dueAmount) {
        overdueList.push({
          id: tn.id,
          name: tn.name,
          unitNumber: String(tn.unit_number),
          propertyName: (tn as any).properties?.name ?? "",
          propertyId: tn.property_id,
          monthlyRent: dueAmount,
          overdueAmount: dueAmount - totalPaid,
          dueDay,
          daysOverdue: Math.max(0, Math.floor((today.getTime() - new Date(today.getFullYear(), today.getMonth(), dueDay).getTime()) / 86400000)),
        });
      }
    }
    overdueList.sort((a, b) => b.overdueAmount - a.overdueAmount);
    setOverdueTenants(overdueList);

    // Compute leases expiring within 30 days
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringCount = (activeTenants ?? []).filter((tn) => {
      if (!tn.lease_end) return false;
      const endDate = new Date(tn.lease_end + "T23:59:59");
      return endDate >= today && endDate <= thirtyDaysFromNow;
    }).length;
    setExpiringLeaseCount(expiringCount);

    // Build broadcast list
    const overdueIds = new Set(overdueList.map(o => o.id));
    const bList: BroadcastTenant[] = (activeTenants ?? []).map((tn) => {
      const isExpiring = tn.lease_end
        ? (() => { const end = new Date(tn.lease_end + "T23:59:59"); return end >= today && end <= thirtyDaysFromNow; })()
        : false;
      return {
        id: tn.id,
        name: tn.name,
        unitNumber: String(tn.unit_number),
        propertyName: (tn as any).properties?.name ?? "",
        phone: (tn as any).phone ?? null,
        isOverdue: overdueIds.has(tn.id),
        isExpiring,
        monthlyRent: tn.monthly_rent,
      };
    });
    setBroadcastTenants(bList);

    // Build recent updates — only show tenants past their due day in the activity feed
    const overdueUpdates: Update[] = overdueList
      .filter((ot) => ot.daysOverdue > 0)
      .map((ot) => {
        const dueDate = new Date(today.getFullYear(), today.getMonth(), ot.dueDay, 12, 0, 0);
        return {
          id: `o-${ot.id}`, icon: "⚠️", title: ot.name,
          sub: `${t("overdue")} - ${t("unit")} ${ot.unitNumber}, ${ot.propertyName}`,
          amount: ot.overdueAmount, time: dueDate.toISOString(), color: "#F59E0B",
          detail: `${ot.daysOverdue} ${t("daysOverdue")}`,
          propertyName: ot.propertyName,
          unitNumber: ot.unitNumber,
        };
      });

    const recentMerged: Update[] = [
      ...(recentTenants ?? []).map((tn: any) => ({
        id: `t-${tn.id}`, icon: "👤", title: tn.name,
        sub: `${tn.properties?.name ?? ""} · ${t("unit")} ${tn.unit_number}`,
        amount: tn.monthly_rent, time: tn.created_at, color: C.primary,
        detail: t("newTenantAdded"),
        propertyName: tn.properties?.name ?? "",
        unitNumber: String(tn.unit_number),
      })),
      ...(recentPayments ?? []).map((p: any) => {
        const tenant = p.tenants as any;
        return {
          id: `p-${p.id}`, icon: "💰",
          title: tenant?.name ?? t("tenant"),
          sub: t("rentCollected"),
          amount: p.amount, time: p.created_at, color: "#22C55E",
          detail: t("paymentReceived"),
          propertyName: tenant?.properties?.name ?? "",
          unitNumber: tenant?.unit_number ? String(tenant.unit_number) : "",
        };
      }),
      ...(recentExpenses ?? []).map((e: any) => ({
        id: `e-${e.id}`, icon: "🧾",
        title: t(e.category as TKey) || e.category,
        sub: e.properties?.name ?? "",
        amount: e.amount, time: e.created_at, color: "#EF4444",
        detail: e.description || t(e.category as TKey) || e.category,
        propertyName: e.properties?.name ?? "",
      })),
    ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    const merged = [...overdueUpdates, ...recentMerged]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 5);
    setUpdates(merged);

    // Schedule notifications based on fresh data
    rescheduleAll(activeTenants ?? [], payByTenant ?? []);
   } catch (e) {
    if (__DEV__) console.error("fetchDashboard error:", e);
   } finally {
    setLoading(false);
    setRefreshing(false);
   }
  }

  async function fetchCalendarEvents() {
   try {
    const [{ data: tenants }, { data: payments }] = await Promise.all([
      offlineDb.select("tenants", { userId: uid, columns: "name, unit_number, lease_start, lease_end, status, properties(name)" }),
      offlineDb.select("payments", { userId: uid, columns: "payment_date, amount, tenants(name)" }),
    ]);
    const events: { [date: string]: { type: "lease" | "payment" | "due"; label: string }[] } = {};
    const today = new Date();

    (tenants ?? []).forEach((tn: any) => {
      // Lease end marker
      if (tn.lease_end) {
        const d = tn.lease_end.slice(0, 10);
        if (!events[d]) events[d] = [];
        events[d].push({ type: "lease", label: tn.name });
      }
      // Monthly payment due dates — recurring on same day as lease_start
      if (tn.status === "active" && tn.lease_start) {
        const dueDay = new Date(tn.lease_start + "T12:00:00").getDate();
        const leaseEnd = tn.lease_end ? new Date(tn.lease_end + "T23:59:59") : null;
        for (let offset = -1; offset <= 12; offset++) {
          const ref = new Date(today.getFullYear(), today.getMonth() + offset, 1);
          const year = ref.getFullYear();
          const month = ref.getMonth();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          if (dueDay > daysInMonth) continue; // month too short (e.g. Feb 30)
          const dueDate = new Date(year, month, dueDay);
          if (leaseEnd && dueDate > leaseEnd) continue;
          const d = `${year}-${String(month + 1).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
          if (!events[d]) events[d] = [];
          if (!events[d].some(e => e.type === "due" && e.label === tn.name)) {
            events[d].push({ type: "due", label: tn.name });
          }
        }
      }
    });

    (payments ?? []).forEach((p: any) => {
      if (p.payment_date) {
        const d = p.payment_date.slice(0, 10);
        if (!events[d]) events[d] = [];
        events[d].push({ type: "payment", label: `${p.tenants?.name ?? ""}` });
      }
    });
    setCalendarEvents(events);
   } catch (e) {
    if (__DEV__) console.error("fetchCalendarEvents error:", e);
   }
  }

  const netIncome = collected - expenses;
  const occupancyPct = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
  const collectionPct = revenue > 0 ? Math.round((collected / revenue) * 100) : 0;
  const totalOverdue = Math.max(0, revenue - collected);

  const handleOccPropertyPress = (p: PropertyOcc) => {
    setOccModal(false);
    setTimeout(() => {
      router.push({
        pathname: "/property/[id]",
        params: { id: p.id, name: p.name, total_units: String(p.total_units) },
      });
    }, 300);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchDashboard(); }}
            tintColor={C.accent}
          />
        }
      >
        <WebContainer maxWidth={1200}>
        {!isOnline && (
          <View style={{ backgroundColor: "#EF4444", paddingVertical: 8, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>📡 {t("offlineMode")}</Text>
          </View>
        )}

        {/* Header */}
        <View style={[S.header, { paddingTop: Platform.OS === "web" ? 10 : insets.top + 10 }, isRTL && S.rowRev, isDesktop && S.headerDesktop]}>
          <View style={{ flex: 1 }}>
            <Text style={[S.greeting, isRTL && { textAlign: "right" }, isDesktop && { fontSize: 28 }]}>{getGreeting(t)}{userName ? `, ${userName}` : ""} 👋</Text>
            <Text style={[S.subtitle, isRTL && { textAlign: "right" }, isDesktop && { fontSize: 14, marginTop: 4 }]}>{t("hereIsYourOverview")}</Text>
          </View>
          <View style={[S.headerRight, isRTL && S.rowRev]}>
            <NotificationBell onPress={() => setNotifCenterOpen(true)} />
            <TouchableOpacity style={S.calBtn} onPress={() => { setCalendarDate(new Date()); setCalendarModal(true); }} accessibilityRole="button" accessibilityLabel="Calendar">
              <Text style={S.calBtnText}>📅</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Actions */}
        {(() => {
          const quickActions = [
            { emoji: "🏠", label: t("addProperty"), onPress: () => router.push("/(tabs)/properties") },
            { emoji: "💳", label: t("collectPayment"), onPress: () => router.push("/(tabs)/tenants") },
            { emoji: "🧾", label: t("addExpense"), onPress: () => router.push("/(tabs)/expenses") },
            { emoji: "🔔", label: t("broadcastMessage"), onPress: () => { setBroadcastFilter("all"); setBroadcastSelected(null); setBroadcastMsgType("auto"); setBroadcastCustomMsg(""); setBroadcastModal(true); } },
          ] as const;
          const cards = quickActions.map((item, i) => (
            <TouchableOpacity key={i} style={[S.quickActionCard, isDesktop && S.quickActionCardDesktop]} onPress={item.onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={item.label}>
              <Text style={[S.quickActionEmoji, isDesktop && { fontSize: 26 }]}>{item.emoji}</Text>
              <Text style={[S.quickActionLabel, isDesktop && { fontSize: 13 }]} numberOfLines={1}>{item.label}</Text>
            </TouchableOpacity>
          ));
          return isDesktop ? (
            <View style={[S.quickActionsDesktop, isRTL && S.rowRev]}>
              {cards}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[S.quickActionsRow, isRTL && { flexDirection: "row-reverse" }]}>
              {cards}
            </ScrollView>
          );
        })()}

        {loading ? (
          <ActivityIndicator color={C.accent} size="large" style={{ marginTop: 60 }} />
        ) : (<>

          {/* Stats Grid — 4-col on wide, 2-col otherwise */}
          <View style={[S.statsGrid, isRTL && S.rowRev, isWide && { gap: 12 }]}>
            <Pressable
              style={({ hovered }: any) => [S.statCard, isDesktop && S.statCardDesktop, { borderTopColor: C.primary }, hovered && S.statCardHover, isWide && S.statCardWide]}
              onPress={() => router.push({ pathname: "/performance", params: { tab: "revenue" } })}
              accessibilityRole="button"
              accessibilityLabel={`${t("revenue")}: ${revenue.toLocaleString()} ${t("sar")}`}
            >
              <Text style={{ fontSize: isDesktop ? 22 : 18, marginBottom: 2 }}>📈</Text>
              <Text style={[S.statLabel, isDesktop && { fontSize: 13 }]}>{t("revenue")}</Text>
              <Text style={[S.statVal, { color: C.primary }, isDesktop && { fontSize: 22 }]}>{revenue.toLocaleString()}</Text>
              <Text style={[S.statSub, isDesktop && { fontSize: 11 }]}>{t("sar")} - {currentMonthName}</Text>
            </Pressable>
            <Pressable
              style={({ hovered }: any) => [S.statCard, isDesktop && S.statCardDesktop, { borderTopColor: "#F59E0B" }, hovered && S.statCardHover, isWide && S.statCardWide]}
              onPress={() => router.push({ pathname: "/performance", params: { tab: "overdue" } })}
              accessibilityRole="button"
              accessibilityLabel={`${t("overduePayments")}: ${totalOverdue.toLocaleString()} ${t("sar")}`}
            >
              <Text style={{ fontSize: isDesktop ? 22 : 18, marginBottom: 2 }}>⚠️</Text>
              <Text style={[S.statLabel, isDesktop && { fontSize: 13 }]}>{t("overduePayments")}</Text>
              <Text style={[S.statVal, { color: "#F59E0B" }, isDesktop && { fontSize: 22 }]}>
                {totalOverdue.toLocaleString()}
              </Text>
              <Text style={[S.statSub, isDesktop && { fontSize: 11 }]}>
                {totalOverdue > 0 ? `${overdueTenants.length} ${t("tenantsOverdue")}` : "✅"}
              </Text>
            </Pressable>
            <Pressable
              style={({ hovered }: any) => [S.statCard, isDesktop && S.statCardDesktop, { borderTopColor: "#22C55E" }, hovered && S.statCardHover, isWide && S.statCardWide]}
              onPress={() => router.push({ pathname: "/performance", params: { tab: "collected" } })}
              accessibilityRole="button"
              accessibilityLabel={`${t("collected")}: ${collected.toLocaleString()} ${t("sar")}, ${collectionPct}%`}
            >
              <Text style={{ fontSize: isDesktop ? 22 : 18, marginBottom: 2 }}>💰</Text>
              <Text style={[S.statLabel, isDesktop && { fontSize: 13 }]}>{t("collected")}</Text>
              <Text style={[S.statVal, { color: "#22C55E" }, isDesktop && { fontSize: 22 }]}>{collected.toLocaleString()}</Text>
              <Text style={[S.statSub, isDesktop && { fontSize: 11 }]}>{collectionPct}%</Text>
            </Pressable>
            <Pressable
              style={({ hovered }: any) => [S.statCard, isDesktop && S.statCardDesktop, { borderTopColor: "#EF4444" }, hovered && S.statCardHover, isWide && S.statCardWide]}
              onPress={() => router.push({ pathname: "/performance", params: { tab: "expenses" } })}
              accessibilityRole="button"
              accessibilityLabel={`${t("totalExpenses")}: ${expenses.toLocaleString()} ${t("sar")}`}
            >
              <Text style={{ fontSize: isDesktop ? 22 : 18, marginBottom: 2 }}>🧾</Text>
              <Text style={[S.statLabel, isDesktop && { fontSize: 13 }]}>{t("totalExpenses")}</Text>
              <Text style={[S.statVal, { color: "#EF4444" }, isDesktop && { fontSize: 22 }]}>{expenses.toLocaleString()}</Text>
              <Text style={[S.statSub, isDesktop && { fontSize: 11 }]}>{t("sar")} - {currentMonthName}</Text>
            </Pressable>
          </View>

          {/* Net Income — full width */}
          <View style={[S.statsRow, { marginBottom: 12 }]}>
            <Pressable
              style={({ hovered }: any) => [S.statCardFull, isDesktop && S.statCardDesktop, { borderTopColor: netIncome >= 0 ? C.accent : "#EF4444" }, hovered && S.statCardHover]}
              onPress={() => router.push({ pathname: "/performance", params: { tab: "netIncome" } })}
              accessibilityRole="button"
              accessibilityLabel={`${t("netIncome")}: ${netIncome.toLocaleString()} ${t("sar")}`}
            >
              <Text style={{ fontSize: isDesktop ? 24 : 20, marginBottom: 4 }}>💵</Text>
              <Text style={[S.statLabel, { fontSize: isDesktop ? 14 : 12 }]}>{t("netIncome")}</Text>
              <Text style={[S.statValLg, { color: netIncome >= 0 ? C.accent : "#EF4444" }, isDesktop && { fontSize: 28 }]}>{netIncome.toLocaleString()}</Text>
              <Text style={[S.statSub, isDesktop && { fontSize: 12 }]}>{t("sar")} - {currentMonthName}</Text>
            </Pressable>
          </View>

          {/* Tenants + Occupancy — side by side on wide */}
          <View style={isWide ? [S.wideRow, isRTL && S.rowRev] : {}}>
            {/* Tenants Box */}
            <TouchableOpacity style={[S.tenantsCard, isWide && { flex: 1, marginHorizontal: 0 }]} onPress={() => router.push("/tenant-search")} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={`${t("tenantBox")}: ${tenantCounts.total} ${t("total")}, ${tenantCounts.active} ${t("active")}`}>
              <View style={[S.tenantsTop, isRTL && S.rowRev]}>
                <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, isRTL && S.rowRev]}>
                  <Text style={S.tenantsIcon}>👥</Text>
                  <Text style={[S.tenantsTitle, isDesktop && { fontSize: 16 }]}>{t("tenantBox")}</Text>
                </View>
                <View style={[{ flexDirection: "row", alignItems: "center", gap: 6 }, isRTL && S.rowRev]}>
                  <Text style={S.tapHint}>{t("tapToSearch")}</Text>
                  <Text style={[S.tapHint, { fontSize: 16 }]}>›</Text>
                </View>
              </View>
              <View style={[S.tenantStats, isRTL && S.rowRev]}>
                <View style={S.tStat}>
                  <Text style={[S.tStatVal, isDesktop && { fontSize: 26 }]}>{tenantCounts.total}</Text>
                  <Text style={[S.tStatLbl, isDesktop && { fontSize: 12 }]}>{t("total")}</Text>
                </View>
                <View style={S.tStatDivider} />
                <View style={S.tStat}>
                  <Text style={[S.tStatVal, { color: "#22C55E" }, isDesktop && { fontSize: 26 }]}>{tenantCounts.active}</Text>
                  <Text style={[S.tStatLbl, isDesktop && { fontSize: 12 }]}>{t("active")}</Text>
                </View>
                <View style={S.tStatDivider} />
                <View style={S.tStat}>
                  <Text style={[S.tStatVal, { color: "#EF4444" }, isDesktop && { fontSize: 26 }]}>{tenantCounts.expired}</Text>
                  <Text style={[S.tStatLbl, isDesktop && { fontSize: 12 }]}>{t("expired")}</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Occupancy Card */}
            <TouchableOpacity style={[S.occupancyCard, isWide && { flex: 1, marginHorizontal: 0, marginBottom: 12 }]} onPress={() => setOccModal(true)} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel={`${t("occupancyRate")}: ${occupancyPct}%, ${occupiedUnits}/${totalUnits} ${t("unitsOccupied")}`}>
              <View style={[S.occupancyTop, isRTL && S.rowRev]}>
                <Text style={[S.occupancyTitle, isDesktop && { fontSize: 16 }]}>{t("occupancyRate")}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[S.occupancyPct, isDesktop && { fontSize: 26 }]}>{occupancyPct}%</Text>
                  <Text style={S.tapHint}>▼</Text>
                </View>
              </View>
              <View style={[S.progressBg, isDesktop && { height: 10 }, isRTL && { transform: [{ scaleX: -1 }] }]}>
                <View style={[S.progressFill, { width: `${occupancyPct}%` as any }]} />
              </View>
              <View style={[S.occStats, isRTL && S.rowRev]}>
                <Text style={[S.occMeta, isDesktop && { fontSize: 13 }]}>🏢 {propertyOccs.length} {t("properties")}</Text>
                <Text style={[S.occMeta, isDesktop && { fontSize: 13 }]}>🏠 {occupiedUnits}/{totalUnits} {t("unitsOccupied")}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Vacancy Cost Card */}
          {vacancyCost > 0 && (
            <View style={[S.statsRow, { marginBottom: 12 }]}>
              <View style={[S.statCardFull, isDesktop && S.statCardDesktop, { borderTopColor: "#F97316" }]}>
                <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, isRTL && S.rowRev]}>
                  <Text style={{ fontSize: isDesktop ? 24 : 20, marginBottom: 4 }}>{"\uD83C\uDFDA\uFE0F"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[S.statLabel, { fontSize: isDesktop ? 14 : 12 }]}>{t("vacancyCost")}</Text>
                    <Text style={[S.statValLg, { color: "#F97316" }, isDesktop && { fontSize: 28 }]}>{Math.round(vacancyCost).toLocaleString()}</Text>
                    <Text style={[S.statSub, isDesktop && { fontSize: 12 }]}>
                      {t("sar")} - {totalUnits - occupiedUnits} {t("vacantUnitsCount")}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Maintenance Requests Card */}
          {openMaintenanceCount > 0 && (
            <TouchableOpacity
              style={{ backgroundColor: isDark ? "#1E293B" : "#EFF6FF", borderRadius: radii.lg, marginHorizontal: spacing.md, marginBottom: 12, padding: spacing.md, borderWidth: 1, borderColor: isDark ? "#334155" : "#BFDBFE" }}
              onPress={() => router.push("/maintenance")}
              activeOpacity={0.75}
            >
              <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, isRTL && S.rowRev]}>
                <Text style={{ fontSize: 20 }}>{"🔧"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: 14, fontWeight: "700", color: isDark ? "#93C5FD" : "#1E40AF" }, isRTL && { textAlign: "right" }]}>
                    {openMaintenanceCount} {t("openRequests")}
                  </Text>
                  <Text style={[{ fontSize: 12, color: isDark ? "#60A5FA" : "#3B82F6", marginTop: 2 }, isRTL && { textAlign: "right" }]}>
                    {t("viewMaintenanceRequests")} {"›"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* Lease Expiry Warning */}
          {expiringLeaseCount > 0 && (
            <TouchableOpacity
              style={S.leaseExpiryCard}
              onPress={() => router.push({ pathname: "/tenant-search", params: { leaseExpiring: "true" } })}
              activeOpacity={0.75}
            >
              <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, isRTL && S.rowRev]}>
                <Text style={{ fontSize: 20 }}>{"⏰"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[S.leaseExpiryTitle, isRTL && { textAlign: "right" }]}>
                    {expiringLeaseCount} {t("leaseExpiringSoon")}
                  </Text>
                  <Text style={[S.leaseExpiryHint, isRTL && { textAlign: "right" }]}>
                    {t("leaseExpiring")} {"›"}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* Recent Updates */}
          <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }]}>{t("recentUpdates")}</Text>
          {updates.length === 0 ? (
            <Text style={S.emptyText}>{t("noUpdates")}</Text>
          ) : updates.map((u) => {
            const isExpanded = expandedUpdateId === u.id;
            return (
              <TouchableOpacity
                key={u.id}
                style={[S.updateRow, isExpanded && S.updateRowExpanded]}
                onPress={() => setExpandedUpdateId(isExpanded ? null : u.id)}
                activeOpacity={0.75}
              >
                <View style={[S.updateIconWrap, { backgroundColor: u.color + "20" }]}>
                  <Text style={{ fontSize: 18 }}>{u.icon}</Text>
                </View>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={[S.updateTitle, isRTL && { textAlign: "right" }]}>{u.title}</Text>
                  <Text style={[S.updateSub, isRTL && { textAlign: "right" }]}>{u.sub}</Text>
                  {isExpanded && (
                    <View style={S.expandedContent}>
                      {u.detail ? (
                        <Text style={S.expandedDetail}>📝 {u.detail}</Text>
                      ) : null}
                      {u.propertyName ? (
                        <Text style={S.expandedDetail}>🏠 {u.propertyName}{u.unitNumber ? ` · ${t("unit")} ${u.unitNumber}` : ""}</Text>
                      ) : null}
                      <Text style={S.expandedDate}>🕐 {formatFullDate(u.time, lang)}</Text>
                    </View>
                  )}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  {u.amount !== undefined && (
                    <Text style={[S.updateAmount, { color: u.color }]}>{u.amount.toLocaleString()} {t("sar")}</Text>
                  )}
                  <Text style={S.updateTime}>{timeAgo(u.time, isRTL)}</Text>
                  <Text style={[S.expandChevron, { color: u.color }]}>{isExpanded ? "▲" : "▼"}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {updates.length >= 5 && (
            <TouchableOpacity
              style={S.showMoreBtn}
              onPress={() => router.push("/recent-updates")}
              activeOpacity={0.7}
              accessibilityRole="link"
              accessibilityLabel={t("allUpdates")}
            >
              <Text style={S.showMoreText}>{t("allUpdates")} ›</Text>
            </TouchableOpacity>
          )}
          <View style={{ height: 100 }} />
        </>)}
        </WebContainer>
      </ScrollView>

      {/* Occupancy Modal — each property clickable */}
      <Modal visible={occModal} transparent animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={() => setOccModal(false)}>
        <ModalOverlay style={S.modalOverlay} onDismiss={() => setOccModal(false)}>
          <View style={[S.modalBox, { maxHeight: "70%" }]} {...webContentClickStop}>
            <View style={[S.modalHeader, isRTL && S.rowRev]}>
              <Text style={S.modalTitle}>{t("occupancyDetails")}</Text>
              <TouchableOpacity onPress={() => setOccModal(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={{ fontSize: 18, color: C.textMuted, padding: 4 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={true} bounces={false}>
              {propertyOccs.map((p) => {
                const pct = p.total_units > 0 ? Math.round((p.occupied / p.total_units) * 100) : 0;
                const col = pct >= 80 ? "#22C55E" : pct >= 50 ? "#F59E0B" : "#EF4444";
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={S.propOccRow}
                    onPress={() => handleOccPropertyPress(p)}
                    activeOpacity={0.75}
                  >
                    <View style={[S.rowBetween, isRTL && S.rowRev]}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={[S.propOccName, isRTL && { textAlign: "right" }]}>{p.name}</Text>
                        <Text style={[S.propOccArrow, isRTL && { transform: [{ scaleX: -1 }] }]}>›</Text>
                      </View>
                      <Text style={[S.propOccPct, { color: col }]}>{pct}%</Text>
                    </View>
                    <View style={[S.progressBg, isRTL && { transform: [{ scaleX: -1 }] }]}>
                      <View style={[S.progressFill, { width: `${pct}%` as any, backgroundColor: col }]} />
                    </View>
                    <Text style={[S.propOccSub, isRTL && { textAlign: "right" }]}>
                      {p.occupied} / {p.total_units} {t("unitsOccupied")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={[S.closeBtn, { backgroundColor: C.accent }]} onPress={() => setOccModal(false)}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{t("close")}</Text>
            </TouchableOpacity>
          </View>
        </ModalOverlay>
      </Modal>

      {/* ── Calendar Modal ── */}
      <Modal visible={calendarModal} animationType={Platform.OS === 'web' ? 'fade' : 'slide'} transparent onRequestClose={() => setCalendarModal(false)}>
        <ModalOverlay style={S.modalOverlay} onDismiss={() => { setCalendarModal(false); setSelectedCalDate(null); }}>
          <View style={[S.modalBox, { maxHeight: "80%" }]} {...webContentClickStop}>
            {/* Month nav + Today */}
            <View style={[S.calHeader, isRTL && S.rowRev]}>
              <TouchableOpacity onPress={() => { setCalendarDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)); setSelectedCalDate(null); }} style={S.calNavBtn}>
                <Text style={S.calNavTxt}>‹</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setCalendarDate(new Date()); setSelectedCalDate(null); }}>
                <Text style={S.calMonthTitle}>
                  {formatMonthDual(`${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, "0")}`, lang, showHijri)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setCalendarDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)); setSelectedCalDate(null); }} style={S.calNavBtn}>
                <Text style={S.calNavTxt}>›</Text>
              </TouchableOpacity>
            </View>
            {/* Today pill */}
            {(calendarDate.getMonth() !== new Date().getMonth() || calendarDate.getFullYear() !== new Date().getFullYear()) && (
              <TouchableOpacity
                style={S.calTodayPill}
                onPress={() => { setCalendarDate(new Date()); setSelectedCalDate(null); }}
              >
                <Text style={S.calTodayPillText}>{t("todayLabel")}</Text>
              </TouchableOpacity>
            )}

            {/* Day headers */}
            <View style={[S.calWeekRow, isRTL && S.rowRev]}>
              {[t("calSun"), t("calMon"), t("calTue"), t("calWed"), t("calThu"), t("calFri"), t("calSat")].map((d, i) => (
                <Text key={i} style={S.calDayHeader}>{d}</Text>
              ))}
            </View>

            {/* Calendar grid */}
            {(() => {
              const year = calendarDate.getFullYear();
              const month = calendarDate.getMonth();
              const firstDay = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const today = new Date();
              const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
              const cells: (number | null)[] = Array(firstDay).fill(null);
              for (let i = 1; i <= daysInMonth; i++) cells.push(i);
              while (cells.length % 7 !== 0) cells.push(null);
              const weeks: (number | null)[][] = [];
              for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
              return weeks.map((week, wi) => (
                <View key={wi} style={[S.calWeekRow, isRTL && S.rowRev]}>
                  {week.map((day, di) => {
                    if (!day) return <View key={di} style={S.calCell} />;
                    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                    const evts = calendarEvents[dateStr] ?? [];
                    const hasLease = evts.some(e => e.type === "lease");
                    const hasPaymentDue = evts.some(e => e.type === "due");
                    const hasPayment = evts.some(e => e.type === "payment");
                    const isToday = dateStr === todayStr;
                    const isSelected = selectedCalDate === dateStr && evts.length > 0;
                    return (
                      <TouchableOpacity
                        key={di}
                        style={[S.calCell, isToday && S.calTodayCell, isSelected && S.calSelectedCell]}
                        onPress={() => evts.length > 0 && setSelectedCalDate(selectedCalDate === dateStr ? null : dateStr)}
                        activeOpacity={evts.length > 0 ? 0.65 : 1}
                      >
                        <Text style={[S.calDayText, isToday && S.calTodayText, isSelected && S.calSelectedText]}>{day}</Text>
                        <View style={S.calDots}>
                          {hasLease && <View style={[S.calDot, { backgroundColor: "#EF4444" }]} />}
                          {hasPaymentDue && <View style={[S.calDot, { backgroundColor: "#F59E0B" }]} />}
                          {hasPayment && <View style={[S.calDot, { backgroundColor: "#22C55E" }]} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ));
            })()}

            {/* Legend */}
            <View style={[S.calLegend, isRTL && S.rowRev]}>
              <View style={S.calLegendItem}><View style={[S.calDot, { backgroundColor: "#EF4444" }]} /><Text style={S.calLegendText}>{t("leaseEndLabel")}</Text></View>
              <View style={S.calLegendItem}><View style={[S.calDot, { backgroundColor: "#F59E0B" }]} /><Text style={S.calLegendText}>{t("rentDueReminders")}</Text></View>
              <View style={S.calLegendItem}><View style={[S.calDot, { backgroundColor: "#22C55E" }]} /><Text style={S.calLegendText}>{t("paid")}</Text></View>
            </View>

            {/* Event Detail Panel */}
            {selectedCalDate && calendarEvents[selectedCalDate]?.length > 0 && (
              <View style={S.calEventPanel}>
                <Text style={S.calEventDate}>
                  {formatDualDate(selectedCalDate, lang, showHijri)}
                </Text>
                {calendarEvents[selectedCalDate].map((ev, i) => (
                  <View key={i} style={[S.calEventRow, isRTL && S.rowRev]}>
                    <Text style={{ fontSize: 16 }}>
                      {ev.type === "lease" ? "🔴" : ev.type === "due" ? "🟠" : "🟢"}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[S.calEventLabel, isRTL && { textAlign: "right" }]}>{ev.label}</Text>
                      <Text style={[S.calEventType, isRTL && { textAlign: "right" }]}>
                        {ev.type === "lease"
                          ? t("calLeaseEnd")
                          : ev.type === "due"
                          ? t("calRentDue")
                          : t("calPaymentRecorded")}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity style={[S.closeBtn, { backgroundColor: C.accent, marginTop: 12 }]} onPress={() => { setCalendarModal(false); setSelectedCalDate(null); }}>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{t("close")}</Text>
            </TouchableOpacity>
          </View>
        </ModalOverlay>
      </Modal>

      {/* ── Broadcast Message Modal ── */}
      <Modal visible={broadcastModal} animationType={Platform.OS === 'web' ? 'fade' : 'slide'} transparent onRequestClose={() => setBroadcastModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ModalOverlay style={S.broadcastOverlay} onDismiss={() => setBroadcastModal(false)}>
          <View style={[S.modalBox, { flex: Platform.OS === "web" ? undefined : 1, maxHeight: Platform.OS === "web" ? "80%" : undefined, marginTop: Platform.OS === "web" ? 0 : Platform.OS === "ios" ? 56 : 40, borderTopLeftRadius: 24, borderTopRightRadius: 24 }]} {...webContentClickStop}>
            {/* Header */}
            <View style={[S.modalHeader, isRTL && S.rowRev]}>
              <Text style={S.modalTitle}>🔔 {t("broadcastMessage")}</Text>
              <TouchableOpacity onPress={() => setBroadcastModal(false)}>
                <Text style={{ fontSize: 22, color: C.textMuted }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Filter tabs */}
            <View style={[S.bcFilterRow, isRTL && S.rowRev]}>
              {(["all", "overdue", "expiring"] as const).map((f) => {
                const count = f === "all" ? broadcastTenants.length
                  : f === "overdue" ? broadcastTenants.filter(bt => bt.isOverdue).length
                  : broadcastTenants.filter(bt => bt.isExpiring).length;
                const active = broadcastFilter === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[S.bcFilterTab, active && { backgroundColor: C.accent }]}
                    onPress={() => { setBroadcastFilter(f); setBroadcastSelected(null); }}
                  >
                    <Text style={[S.bcFilterText, active && { color: "#fff" }]}>
                      {f === "all" ? t("filterAll") : f === "overdue" ? t("filterOverdue") : t("filterExpiring")} ({count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Message type selector */}
            <Text style={{ fontSize: 12, fontWeight: "600", color: C.textMuted, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
              {t("messageType")}
            </Text>
            <View style={[S.bcFilterRow, isRTL && S.rowRev]}>
              {(["auto", "custom"] as const).map((mt) => {
                const active = broadcastMsgType === mt;
                return (
                  <TouchableOpacity
                    key={mt}
                    style={[S.bcFilterTab, active && { backgroundColor: C.accent }]}
                    onPress={() => setBroadcastMsgType(mt)}
                  >
                    <Text style={[S.bcFilterText, active && { color: "#fff" }]}>
                      {mt === "auto" ? t("autoMessage") : t("customMessage")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {broadcastMsgType === "custom" && (
              <TextInput
                style={[S.bcCustomInput, isRTL && { textAlign: "right" }]}
                placeholder={t("writeYourMessage")}
                placeholderTextColor={C.textMuted}
                value={broadcastCustomMsg}
                onChangeText={setBroadcastCustomMsg}
                multiline
                numberOfLines={3}
              />
            )}

            {/* Tenant list */}
            {(() => {
              const filtered = broadcastFilter === "all" ? broadcastTenants
                : broadcastFilter === "overdue" ? broadcastTenants.filter(bt => bt.isOverdue)
                : broadcastTenants.filter(bt => bt.isExpiring);
              return (
                <>
                  <FlatList
                    data={filtered}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    style={{ flex: 1 }}
                    renderItem={({ item }) => {
                      const hasPhone = !!item.phone;
                      const selected = broadcastSelected === item.id;
                      return (
                        <Pressable
                          style={[S.bcTenantRow, !hasPhone && { opacity: 0.45 }, selected && { backgroundColor: C.accentSoft, borderColor: C.accent }, isRTL && S.rowRev]}
                          onPress={() => {
                            if (!hasPhone) return;
                            setBroadcastSelected(item.id);
                          }}
                        >
                          {/* Radio */}
                          <View style={[S.bcCheckbox, { borderRadius: 12 }, selected && { backgroundColor: C.accent, borderColor: C.accent }]}>
                            {selected && <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>✓</Text>}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[S.bcTenantName, isRTL && { textAlign: "right" }]}>{item.name}</Text>
                            <Text style={[S.bcTenantSub, isRTL && { textAlign: "right" }]}>
                              {item.propertyName} · {t("unit")} {item.unitNumber}
                            </Text>
                          </View>
                          <View style={{ alignItems: isRTL ? "flex-start" : "flex-end" }}>
                            {item.isOverdue && <View style={[S.bcTag, { backgroundColor: "#FEE2E2" }]}><Text style={{ fontSize: 10, color: "#DC2626", fontWeight: "700" }}>{t("filterOverdue")}</Text></View>}
                            {item.isExpiring && <View style={[S.bcTag, { backgroundColor: "#FEF3C7" }]}><Text style={{ fontSize: 10, color: "#D97706", fontWeight: "700" }}>{t("filterExpiring")}</Text></View>}
                            {!hasPhone && <Text style={{ fontSize: 10, color: C.textMuted }}>{t("noPhoneNumber")}</Text>}
                          </View>
                        </Pressable>
                      );
                    }}
                    ListEmptyComponent={<Text style={S.emptyText}>{t("noTenantsShort")}</Text>}
                  />

                  {/* Send button */}
                  {broadcastSelected && (broadcastMsgType === "auto" || broadcastCustomMsg.trim().length > 0) && (
                    <TouchableOpacity
                      style={S.bcSendBtn}
                      onPress={async () => {
                        const tenant = broadcastTenants.find(bt => bt.id === broadcastSelected && bt.phone);
                        if (!tenant) return;

                        const doSend = async () => {
                          const phone = tenant.phone!;
                          const intlPhone = phone.startsWith("0") ? "966" + phone.slice(1) : phone;
                          let message: string;
                          if (broadcastMsgType === "custom") {
                            message = broadcastCustomMsg.replace("%name%", tenant.name);
                          } else if (tenant.isOverdue) {
                            message = t("reminderMessage").replace("%name%", tenant.name).replace("%amount%", tenant.monthlyRent.toLocaleString());
                          } else if (tenant.isExpiring) {
                            message = t("leaseRenewalMessage").replace("%name%", tenant.name);
                          } else {
                            message = t("reminderMessage").replace("%name%", tenant.name).replace("%amount%", tenant.monthlyRent.toLocaleString());
                          }
                          const url = Platform.OS === "web"
                            ? `https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`
                            : `whatsapp://send?phone=${intlPhone}&text=${encodeURIComponent(message)}`;
                          try { await Linking.openURL(url); } catch {}
                          setBroadcastModal(false);
                        };

                        crossAlert(
                          t("broadcastMessage"),
                          t("broadcastConfirm"),
                          [
                            { text: t("cancel"), style: "cancel" },
                            { text: t("sendViaWhatsApp"), style: "default", onPress: doSend },
                          ]
                        );
                      }}
                    >
                      <Text style={S.bcSendBtnText}>💬 {t("sendViaWhatsApp")}</Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}
          </View>
        </ModalOverlay>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Notification Center ── */}
      <NotificationCenter visible={notifCenterOpen} onClose={() => setNotifCenterOpen(false)} />

      {/* ── Onboarding Walkthrough ── */}
      <Onboarding visible={showOnboarding} onComplete={completeOnboarding} />
    </View>
  );
}

const styles = (C: any, shadow: any) => StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.lg },
  headerDesktop: { paddingHorizontal: spacing.xl, paddingVertical: 20 },
  rowRev: { flexDirection: "row-reverse" },
  greeting: { fontSize: 24, fontWeight: "800", color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: C.textMuted, marginTop: 3 },
  // Quick Actions
  quickActionsRow: { paddingHorizontal: spacing.md, gap: 10, paddingBottom: 4 },
  quickActionsDesktop: { flexDirection: "row", paddingHorizontal: spacing.md, gap: 12, marginBottom: 12 },
  quickActionCard: { backgroundColor: C.surface, borderRadius: radii.lg, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center", minWidth: 90, ...shadow, borderWidth: 1, borderColor: C.border },
  quickActionCardDesktop: { flex: 1, paddingVertical: 18, paddingHorizontal: 20, borderRadius: radii.lg, ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'transform 0.2s ease, box-shadow 0.2s ease' } as any : {}) },
  quickActionEmoji: { fontSize: 22, marginBottom: 6 },
  quickActionLabel: { fontSize: 11, fontWeight: "600", color: C.text, textAlign: "center" },
  // Stats
  statsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.md, gap: 8, marginBottom: 8 },
  statsRow: { flexDirection: "row", paddingHorizontal: spacing.md, gap: 8, marginBottom: 8 },
  statCard: { flexBasis: "48%", flexGrow: 1, backgroundColor: C.surface, borderRadius: radii.lg, padding: 14, borderTopWidth: 3, alignItems: "center", ...shadow, borderWidth: 1, borderColor: C.border } as any,
  statCardDesktop: { padding: 20, borderTopWidth: 4, ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'transform 0.2s ease, box-shadow 0.2s ease' } as any : {}) },
  statCardWide: { flexBasis: "22%", minWidth: 180 },
  statCardHover: Platform.OS === 'web' ? { transform: [{ translateY: -2 }], shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12 } : {},
  quickActionHover: Platform.OS === 'web' ? { transform: [{ translateY: -2 }], shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12 } : {},
  statCardFull: { flex: 1, backgroundColor: C.surface, borderRadius: radii.lg, padding: 14, borderTopWidth: 3, alignItems: "center", ...shadow } as any,
  statLabel: { fontSize: 11, color: C.textMuted, marginBottom: 2, textAlign: "center" },
  statVal: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  statValLg: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  statSub: { fontSize: 10, color: C.textMuted, marginTop: 2, textAlign: "center" },
  // Wide row for side-by-side cards
  wideRow: { flexDirection: "row", paddingHorizontal: spacing.md, gap: 12, marginBottom: 12 },
  tenantsCard: { backgroundColor: C.surface, borderRadius: radii.lg, marginHorizontal: spacing.md, marginBottom: 12, padding: spacing.md, ...shadow },
  tenantsTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  tenantsIcon: { fontSize: 20 },
  tenantsTitle: { fontSize: 15, fontWeight: "700", color: C.text },
  tapHint: { fontSize: 12, color: C.textMuted },
  tenantStats: { flexDirection: "row", justifyContent: "space-around" },
  tStat: { alignItems: "center" },
  tStatVal: { fontSize: 22, fontWeight: "700", color: C.accent },
  tStatLbl: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  tStatDivider: { width: 1, backgroundColor: C.border },
  occupancyCard: { backgroundColor: C.surface, borderRadius: radii.lg, marginHorizontal: spacing.md, marginBottom: 20, padding: spacing.md, ...shadow },
  occupancyTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  occupancyTitle: { fontSize: 15, fontWeight: "600", color: C.text },
  occupancyPct: { fontSize: 22, fontWeight: "700", color: C.accent },
  progressBg: { height: 8, backgroundColor: C.border, borderRadius: 4, overflow: "hidden", marginBottom: 10 },
  progressFill: { height: "100%", backgroundColor: C.accent, borderRadius: 4 },
  occStats: { flexDirection: "row", justifyContent: "space-between" },
  occMeta: { fontSize: 12, color: C.textMuted },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: C.text, paddingHorizontal: spacing.md, marginBottom: 10 },
  // Update rows
  updateRow: { flexDirection: "row", alignItems: "flex-start", backgroundColor: C.surface, borderRadius: radii.lg, marginHorizontal: spacing.md, marginBottom: 8, padding: spacing.md, ...shadow, borderWidth: 1, borderColor: C.border },
  updateRowExpanded: { borderWidth: 1, borderColor: C.border },
  updateIconWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center", marginTop: 2 },
  updateTitle: { fontSize: 14, fontWeight: "600", color: C.text },
  updateSub: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  updateAmount: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  updateTime: { fontSize: 11, color: C.textMuted },
  expandChevron: { fontSize: 16, marginTop: 2, opacity: 0.7 },
  // Expanded content
  expandedContent: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border, gap: 5 },
  expandedDetail: { fontSize: 12, color: C.text },
  expandedDate: { fontSize: 11, color: C.textMuted },
  emptyText: { textAlign: "center", color: C.textMuted, marginTop: 20, fontSize: 14, marginBottom: 20 },
  showMoreBtn: { marginHorizontal: spacing.md, marginBottom: 12, padding: 14, backgroundColor: C.surface, borderRadius: radii.lg, alignItems: "center", borderWidth: 1, borderColor: C.border },
  showMoreText: { color: C.accent, fontWeight: "600", fontSize: 13 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  // Occupancy modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", ...(Platform.OS === 'web' ? { justifyContent: 'center', paddingHorizontal: 16, backdropFilter: 'blur(8px)' } as any : {}) },
  broadcastOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end", ...(Platform.OS === 'web' ? { justifyContent: 'center', paddingHorizontal: 16, backdropFilter: 'blur(8px)' } as any : {}) },
  modalBox: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 30, ...(Platform.OS === 'web' ? { maxWidth: 560, width: '100%', borderRadius: 20, alignSelf: 'center', paddingBottom: spacing.lg, zIndex: 1 } : {}) },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: C.text },
  propOccRow: { backgroundColor: C.background, borderRadius: radii.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  propOccName: { fontSize: 15, fontWeight: "600", color: C.text },
  propOccArrow: { fontSize: 16, color: C.textMuted },
  propOccPct: { fontSize: 18, fontWeight: "700" },
  propOccSub: { fontSize: 12, color: C.textMuted },
  closeBtn: { borderRadius: radii.md, padding: 14, alignItems: "center", marginTop: 12 },
  // Header additions
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  calBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.border },
  calBtnText: { fontSize: 17 },
  // Calendar modal
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  calNavBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surface, alignItems: "center", justifyContent: "center" },
  calNavTxt: { fontSize: 20, color: C.accent, fontWeight: "700" },
  calMonthTitle: { fontSize: 16, fontWeight: "700", color: C.text },
  calWeekRow: { flexDirection: "row", marginBottom: 4 },
  calDayHeader: { flex: 1, textAlign: "center", fontSize: 10, fontWeight: "700", color: C.textMuted, paddingVertical: 4 },
  calCell: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 5, minHeight: 48 },
  calTodayCell: { backgroundColor: C.accentSoft, borderRadius: 10, borderWidth: 1.5, borderColor: C.accent },
  calDayText: { fontSize: 14, color: C.text },
  calTodayText: { color: C.accent, fontWeight: "800" },
  calDots: { flexDirection: "row", gap: 3, marginTop: 3 },
  calDot: { width: 6, height: 6, borderRadius: 3 },
  calLegend: { flexDirection: "row", gap: 16, marginTop: 12, justifyContent: "center" },
  calLegendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  calLegendText: { fontSize: 11, color: C.textMuted },
  // Selected date cell
  calSelectedCell: { backgroundColor: C.primary + "22", borderRadius: 8, borderWidth: 1.5, borderColor: C.primary },
  calSelectedText: { color: C.primary, fontWeight: "700" },
  // Event detail panel
  calEventPanel: { marginTop: 12, backgroundColor: C.background, borderRadius: radii.md, padding: 12, borderWidth: 1, borderColor: C.border },
  calEventDate: { fontSize: 12, fontWeight: "700", color: C.text, marginBottom: 10 },
  calEventRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  calEventDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0 },
  calEventLabel: { fontSize: 13, fontWeight: "600", color: C.text },
  calEventType: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  calEventHint: { fontSize: 10, color: C.accent, marginTop: 3, fontStyle: "italic" },
  // Today pill
  calTodayPill: { alignSelf: "center", backgroundColor: C.accent, borderRadius: radii.pill, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 8 },
  calTodayPillText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  // Broadcast modal
  bcFilterRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  bcFilterTab: { flex: 1, paddingVertical: 8, borderRadius: radii.md, backgroundColor: C.background, alignItems: "center", borderWidth: 1, borderColor: C.border },
  bcFilterText: { fontSize: 12, fontWeight: "600", color: C.text },
  bcSelectAll: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 4 },
  bcSelectAllText: { fontSize: 13, fontWeight: "600", color: C.accent },
  bcTenantRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: radii.md, borderWidth: 1, borderColor: C.border, marginBottom: 6, backgroundColor: C.surface },
  bcCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  bcTenantName: { fontSize: 14, fontWeight: "600", color: C.text },
  bcTenantSub: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  bcTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginBottom: 2 },
  bcCustomInput: { borderWidth: 1, borderColor: C.border, borderRadius: radii.md, padding: 12, fontSize: 14, color: C.text, backgroundColor: C.background, minHeight: 80, textAlignVertical: "top", marginBottom: 8 },
  bcSendBtn: { backgroundColor: "#25D366", borderRadius: radii.md, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  bcSendBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  // Lease expiry warning
  leaseExpiryCard: { backgroundColor: "#FEF3C7", borderRadius: radii.lg, marginHorizontal: spacing.md, marginBottom: 16, padding: spacing.md, borderWidth: 1, borderColor: "#FDE68A" },
  leaseExpiryTitle: { fontSize: 14, fontWeight: "700", color: "#92400E" },
  leaseExpiryHint: { fontSize: 12, color: "#B45309", marginTop: 2 },
});
