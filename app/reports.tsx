import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { showAlert, crossAlert } from "../lib/alert";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { useLanguage, TKey } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, radii } from "../constants/theme";
import * as XLSX from "xlsx";
import { useSubscription } from "../context/SubscriptionContext";
import { isPaymentDueInMonth } from "../lib/dateUtils";

const isWeb = Platform.OS === "web";

// Native-only imports (crash on web at module level)
let FileSystem: typeof import("expo-file-system/legacy") | null = null;
let Sharing: typeof import("expo-sharing") | null = null;
let Print: typeof import("expo-print") | null = null;
let Asset: typeof import("expo-asset").Asset | null = null;
if (!isWeb) {
  FileSystem = require("expo-file-system/legacy");
  Sharing = require("expo-sharing");
  Print = require("expo-print");
  Asset = require("expo-asset").Asset;
}

type ReportType = "revenue" | "expenses" | "full";

/** Build month labels from JS Intl so we get localised names for free */
function getMonthLabels(lang: string): { month: number; label: string }[] {
  const locale = lang === "ar" ? "ar-SA-u-ca-gregory" : "en-US";
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: new Date(2026, i, 1).toLocaleDateString(locale, { month: "long" }),
  }));
}

const REPORT_TYPES: { key: ReportType; labelKey: TKey; icon: string; color: string }[] = [
  { key: "revenue", labelKey: "revenueReport", icon: "📈", color: "#22C55E" },
  { key: "expenses", labelKey: "expenseReport", icon: "🧾", color: "#EF4444" },
  { key: "full", labelKey: "fullReport", icon: "📊", color: "#0EA5E9" },
];

function getDateRange(monthIndex: number) {
  const y = new Date().getFullYear();
  const m = monthIndex - 1; // 0-based
  const end = new Date(y, m + 1, 0);
  const monthYear = `${y}-${String(monthIndex).padStart(2, "0")}`;
  return {
    startDate: `${y}-${String(monthIndex).padStart(2, "0")}-01`,
    endDate: `${y}-${String(monthIndex).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`,
    monthYear,
  };
}

/** Amount due from a tenant in a given month — matches dashboard logic */
function amountDueInMonth(tn: any, monthStr: string): number {
  if (!tn.lease_start || !tn.monthly_rent) return 0;
  if (!isPaymentDueInMonth(tn.lease_start, tn.lease_end, tn.payment_frequency, monthStr)) return 0;
  const rent = tn.monthly_rent ?? 0;
  if (tn.payment_frequency === "semi_annual") return rent / 2;
  return rent;
}

interface ReportData {
  properties: { id: string; name: string }[];
  payments: any[];
  expenses: any[];
  tenants: any[];
  totalRevenue: number;
  totalCollected: number;
  totalExpenses: number;
  netIncome: number;
}

export default function ReportsScreen() {
  const { t, isRTL, lang } = useLanguage();
  const { colors: C, shadow } = useTheme();
  const { hasFeature } = useSubscription();
  const insets = useSafeAreaInsets();
  const S = useMemo(() => styles(C, shadow), [C, shadow]);

  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [reportType, setReportType] = useState<ReportType>("full");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { fetchData(); }, [selectedMonth]);

  async function fetchData() {
    setLoading(true);
    try {
      const { startDate, endDate, monthYear } = getDateRange(selectedMonth);
      const [{ data: props }, { data: payments }, { data: expenses }, { data: tenants }] = await Promise.all([
        supabase.from("properties").select("id, name"),
        supabase.from("payments").select("*").gte("payment_date", startDate).lte("payment_date", endDate),
        supabase.from("expenses").select("*").gte("date", startDate).lte("date", endDate),
        supabase.from("tenants").select("id, name, monthly_rent, property_id, lease_start, lease_end, payment_frequency, status").eq("status", "active"),
      ]);

      const allPayments = payments || [];
      const allExpenses = expenses || [];
      const allTenants = tenants || [];
      // Calculate revenue for selected month, respecting lease period and payment frequency
      const totalRevenue = allTenants.reduce(
        (s: number, tn: any) => s + amountDueInMonth(tn, monthYear), 0
      );
      const totalCollected = allPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
      const totalExp = allExpenses.reduce((s: number, e: any) => s + (e.amount || 0), 0);

      setData({
        properties: props || [],
        payments: allPayments,
        expenses: allExpenses,
        tenants: allTenants,
        totalRevenue,
        totalCollected,
        totalExpenses: totalExp,
        netIncome: totalCollected - totalExp,
      });
    } catch (e) {
      if (__DEV__) console.error(e);
      showAlert(t("error"), t("failedToLoadData"));
    }
    setLoading(false);
  }

  function buildCSV(): string {
    if (!data) return "";
    const lines: string[] = [];
    const header = t("reportTitle");
    const periodLabel = getMonthLabels(lang).find(ml => ml.month === selectedMonth)?.label ?? "";

    lines.push(`${header} - ${periodLabel}`);
    lines.push("");

    if (reportType === "revenue" || reportType === "full") {
      lines.push(`=== ${t("sectionRevenue")} ===`);
      lines.push(`${t("totalCollected")},${data.totalCollected}`);
      lines.push(`${t("expectedRevenue")},${data.totalRevenue}`);
      lines.push("");
      lines.push(`${t("columnTenant")},${t("columnMonthlyRent")},${t("columnProperty")}`);
      data.tenants.forEach((ten: any) => {
        const prop = data.properties.find(p => p.id === ten.property_id);
        lines.push(`${ten.name},${ten.monthly_rent},${prop?.name || ""}`);
      });
      lines.push("");
    }

    if (reportType === "expenses" || reportType === "full") {
      lines.push(`=== ${t("sectionExpenses")} ===`);
      lines.push(`${t("totalExpensesLabel")},${data.totalExpenses}`);
      lines.push("");
      lines.push(`${t("columnDescription")},${t("columnAmount")},${t("columnCategory")},${t("columnDate")}`);
      data.expenses.forEach((exp: any) => {
        lines.push(`${exp.description || ""},${exp.amount},${exp.category || ""},${exp.date || ""}`);
      });
      lines.push("");
    }

    if (reportType === "full") {
      lines.push(`=== ${t("sectionSummary")} ===`);
      lines.push(`${t("totalCollected")},${data.totalCollected}`);
      lines.push(`${t("totalExpensesLabel")},${data.totalExpenses}`);
      lines.push(`${t("netIncomeLabel")},${data.netIncome}`);
    }

    return lines.join("\n");
  }

  async function exportSpreadsheet() {
    if (!hasFeature("export_reports")) {
      crossAlert(t("upgradeRequired"), t("upgradeToUnlock"), [
        { text: t("upgrade"), onPress: () => router.push("/paywall" as any) },
        { text: t("later"), style: "cancel" },
      ]);
      return;
    }
    if (!data) return;
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();
      const periodLabel = getMonthLabels(lang).find(ml => ml.month === selectedMonth)?.label ?? "";
      const reportDate = new Date().toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { month: "long", year: "numeric" });

      if (reportType === "revenue" || reportType === "full") {
        const rows: any[][] = [
          [t("revenueReportTitle"), periodLabel, reportDate],
          [],
          [t("totalCollected"), data.totalCollected],
          [t("expectedRevenue"), data.totalRevenue],
          [],
          [t("columnTenant"), t("columnMonthlyRent"), t("columnProperty")],
        ];
        data.tenants.forEach((ten: any) => {
          const prop = data.properties.find(p => p.id === ten.property_id);
          rows.push([ten.name, ten.monthly_rent, prop?.name || ""]);
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws["!cols"] = [{ wch: 25 }, { wch: 18 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(wb, ws, t("sectionRevenue"));
      }

      if (reportType === "expenses" || reportType === "full") {
        const rows: any[][] = [
          [t("expensesReportTitle"), periodLabel, reportDate],
          [],
          [t("totalExpensesLabel"), data.totalExpenses],
          [],
          [t("columnDescription"), t("columnAmount"), t("columnCategory"), t("columnDate")],
        ];
        data.expenses.forEach((exp: any) => {
          rows.push([exp.description || "", exp.amount, exp.category || "", exp.date || ""]);
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws["!cols"] = [{ wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, ws, t("sectionExpenses"));
      }

      if (reportType === "full") {
        const rows: any[][] = [
          [t("reportSummaryTitle"), periodLabel, reportDate],
          [],
          [t("totalCollected"), data.totalCollected],
          [t("totalExpensesLabel"), data.totalExpenses],
          [t("netIncomeLabel"), data.netIncome],
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws["!cols"] = [{ wch: 25 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws, t("sectionSummary"));
      }

      if (isWeb) {
        // Web: use XLSX.writeFile which triggers browser download
        const filename = `amlakey_report_${selectedMonth}_${Date.now()}.xlsx`;
        XLSX.writeFile(wb, filename);
      } else {
        const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
        const filename = `amlakey_report_${selectedMonth}_${Date.now()}.xlsx`;
        const path = `${FileSystem!.cacheDirectory}${filename}`;
        await FileSystem!.writeAsStringAsync(path, wbout, { encoding: FileSystem!.EncodingType.Base64 });
        await Sharing!.shareAsync(path, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          UTI: "org.openxmlformats.spreadsheetml.sheet",
        });
      }
    } catch (e: any) {
      showAlert(t("error"), e.message);
    }
    setExporting(false);
  }

  function buildHTML(logoBase64?: string): string {
    if (!data) return "";
    const periodLabel = getMonthLabels(lang).find(ml => ml.month === selectedMonth)?.label ?? "";
    const dir = isRTL ? "rtl" : "ltr";
    const align = isRTL ? "right" : "left";

    let html = `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"/>
    <style>
      body { font-family: -apple-system, Arial, sans-serif; padding: 32px; direction: ${dir}; color: #1a1a1a; }
      .header-row { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
      .logo { width: 56px; height: 56px; border-radius: 12px; }
      .header-text h1 { font-size: 22px; margin: 0 0 2px 0; }
      .header-text .subtitle { color: #6B7280; font-size: 13px; margin: 0; }
      h2 { font-size: 16px; color: #6B7280; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #E5E7EB; padding-bottom: 6px; }
      .stats { display: flex; gap: 12px; margin-bottom: 20px; }
      .stat { flex: 1; background: #F9FAFB; border-radius: 8px; padding: 12px; text-align: center; border-top: 3px solid #0EA5E9; }
      .stat-value { font-size: 20px; font-weight: 800; }
      .stat-label { font-size: 11px; color: #6B7280; margin-top: 4px; }
      .green { color: #22C55E; border-top-color: #22C55E; }
      .red { color: #EF4444; border-top-color: #EF4444; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th { background: #F3F4F6; text-align: ${align}; padding: 8px 10px; font-size: 12px; color: #6B7280; }
      td { padding: 8px 10px; border-bottom: 1px solid #F3F4F6; font-size: 13px; }
      .footer { margin-top: 32px; text-align: center; color: #9CA3AF; font-size: 11px; }
    </style></head><body>`;

    // Header with logo
    html += `<div class="header-row">`;
    if (logoBase64) {
      html += `<img class="logo" src="data:image/png;base64,${logoBase64}" />`;
    }
    html += `<div class="header-text">`;
    html += `<h1>${t("reportTitle")}</h1>`;
    html += `<div class="subtitle">${periodLabel}</div>`;
    const reportDate = new Date().toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US", { month: "long", year: "numeric" });
    html += `<div class="subtitle">${reportDate}</div>`;
    html += `</div></div>`;

    // Stats
    html += `<div class="stats">`;
    if (reportType === "revenue" || reportType === "full") {
      html += `<div class="stat green"><div class="stat-value green">${data.totalCollected.toLocaleString()}</div><div class="stat-label">${t("totalCollected")}</div></div>`;
    }
    if (reportType === "expenses" || reportType === "full") {
      html += `<div class="stat red"><div class="stat-value red">${data.totalExpenses.toLocaleString()}</div><div class="stat-label">${t("totalExpensesLabel")}</div></div>`;
    }
    if (reportType === "full") {
      const nc = data.netIncome >= 0 ? "green" : "red";
      html += `<div class="stat ${nc}"><div class="stat-value ${nc}">${data.netIncome.toLocaleString()}</div><div class="stat-label">${t("netIncomeLabel")}</div></div>`;
    }
    html += `</div>`;

    // Tenants table
    if ((reportType === "revenue" || reportType === "full") && data.tenants.length > 0) {
      html += `<h2>${t("activeTenants")}</h2>`;
      html += `<table><tr><th>${t("columnTenant")}</th><th>${t("columnProperty")}</th><th>${t("columnRent")}</th></tr>`;
      data.tenants.forEach((ten: any) => {
        const prop = data.properties.find(p => p.id === ten.property_id);
        html += `<tr><td>${ten.name}</td><td>${prop?.name || ""}</td><td>${ten.monthly_rent.toLocaleString()} ${t("sar")}</td></tr>`;
      });
      html += `</table>`;
    }

    // Expenses table
    if ((reportType === "expenses" || reportType === "full") && data.expenses.length > 0) {
      html += `<h2>${t("expenses")}</h2>`;
      html += `<table><tr><th>${t("columnDescription")}</th><th>${t("columnCategory")}</th><th>${t("columnDate")}</th><th>${t("columnAmount")}</th></tr>`;
      data.expenses.forEach((exp: any) => {
        html += `<tr><td>${exp.description || "—"}</td><td>${exp.category || ""}</td><td>${exp.date || ""}</td><td>${exp.amount.toLocaleString()} ${t("sar")}</td></tr>`;
      });
      html += `</table>`;
    }

    html += `<div class="footer">${t("reportFooter")}</div>`;
    html += `</body></html>`;
    return html;
  }

  async function exportPDF() {
    if (!hasFeature("export_reports")) {
      crossAlert(t("upgradeRequired"), t("upgradeToUnlock"), [
        { text: t("upgrade"), onPress: () => router.push("/paywall" as any) },
        { text: t("later"), style: "cancel" },
      ]);
      return;
    }
    if (!data) return;
    setExporting(true);
    try {
      if (isWeb) {
        // Web: open HTML in new window and trigger print dialog
        const html = buildHTML();
        const printWindow = window.open("", "_blank");
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.onload = () => printWindow.print();
        }
      } else {
        // Native: use expo-print + expo-sharing
        let logoBase64: string | undefined;
        try {
          const asset = Asset!.fromModule(require("../assets/images/splash-icon.png"));
          await asset.downloadAsync();
          if (asset.localUri) {
            logoBase64 = await FileSystem!.readAsStringAsync(asset.localUri, { encoding: FileSystem!.EncodingType.Base64 });
          }
        } catch (_) { /* logo is optional */ }

        const html = buildHTML(logoBase64);
        const { uri } = await Print!.printToFileAsync({ html });
        await Sharing!.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } catch (e: any) {
      showAlert(t("error"), e.message);
    }
    setExporting(false);
  }

  const activeReport = REPORT_TYPES.find(r => r.key === reportType)!;

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
          <Text style={S.headerTitle}>{t("reports")}</Text>
        </View>
        <View style={S.headerSide} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>

        {/* Report type selector */}
        <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }]}>{t("selectReportType")}</Text>
        <View style={[S.typeRow, isRTL && S.rowRev]}>
          {REPORT_TYPES.map(rt => {
            const active = reportType === rt.key;
            return (
              <TouchableOpacity
                key={rt.key}
                style={[S.typeCard, active && { borderColor: rt.color, borderWidth: 2 }]}
                onPress={() => setReportType(rt.key)}
                activeOpacity={0.7}
              >
                <Text style={S.typeIcon}>{rt.icon}</Text>
                <Text style={[S.typeLabel, active && { color: rt.color, fontWeight: "700" }]}>
                  {t(rt.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Month filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          <View style={[S.pillRow, isRTL && S.rowRev]}>
            {getMonthLabels(lang).map(ml => {
              const active = selectedMonth === ml.month;
              return (
                <TouchableOpacity
                  key={ml.month}
                  style={[S.pill, active && S.pillActive]}
                  onPress={() => setSelectedMonth(ml.month)}
                >
                  <Text style={[S.pillText, active && S.pillTextActive]}>{ml.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Summary */}
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: "center" }}>
            <ActivityIndicator color={C.accent} size="large" />
          </View>
        ) : data ? (
          <>
            {/* Stats cards */}
            <View style={[S.statsGrid, isRTL && S.rowRev]}>
              {(reportType === "revenue" || reportType === "full") && (
                <View style={[S.statCard, { borderTopColor: "#22C55E" }]}>
                  <Text style={S.statIcon}>💰</Text>
                  <Text style={[S.statValue, { color: "#22C55E" }]}>{data.totalCollected.toLocaleString()}</Text>
                  <Text style={S.statLabel}>{t("totalCollected")}</Text>
                </View>
              )}
              {(reportType === "expenses" || reportType === "full") && (
                <View style={[S.statCard, { borderTopColor: "#EF4444" }]}>
                  <Text style={S.statIcon}>🧾</Text>
                  <Text style={[S.statValue, { color: "#EF4444" }]}>{data.totalExpenses.toLocaleString()}</Text>
                  <Text style={S.statLabel}>{t("totalExpensesLabel")}</Text>
                </View>
              )}
              {reportType === "full" && (
                <View style={[S.statCard, { borderTopColor: data.netIncome >= 0 ? "#0EA5E9" : "#EF4444" }]}>
                  <Text style={S.statIcon}>💵</Text>
                  <Text style={[S.statValue, { color: data.netIncome >= 0 ? "#0EA5E9" : "#EF4444" }]}>
                    {data.netIncome.toLocaleString()}
                  </Text>
                  <Text style={S.statLabel}>{t("netIncomeLabel")}</Text>
                </View>
              )}
            </View>

            {/* Details */}
            {(reportType === "revenue" || reportType === "full") && data.tenants.length > 0 && (
              <View style={S.detailCard}>
                <Text style={[S.detailTitle, isRTL && { textAlign: "right" }]}>
                  {t("activeTenants")} ({data.tenants.length})
                </Text>
                {data.tenants.map((ten: any, i: number) => {
                  const prop = data.properties.find(p => p.id === ten.property_id);
                  return (
                    <View key={ten.id}>
                      {i > 0 && <View style={S.detailDivider} />}
                      <View style={[S.detailRow, isRTL && S.rowRev]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[S.detailName, isRTL && { textAlign: "right" }]}>{ten.name}</Text>
                          <Text style={[S.detailSub, isRTL && { textAlign: "right" }]}>{prop?.name || ""}</Text>
                        </View>
                        <Text style={S.detailAmount}>{ten.monthly_rent.toLocaleString()} {t("sar")}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {(reportType === "expenses" || reportType === "full") && data.expenses.length > 0 && (
              <View style={S.detailCard}>
                <Text style={[S.detailTitle, isRTL && { textAlign: "right" }]}>
                  {t("expenses")} ({data.expenses.length})
                </Text>
                {data.expenses.slice(0, 20).map((exp: any, i: number) => (
                  <View key={exp.id || i}>
                    {i > 0 && <View style={S.detailDivider} />}
                    <View style={[S.detailRow, isRTL && S.rowRev]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[S.detailName, isRTL && { textAlign: "right" }]}>{exp.description || exp.category || "—"}</Text>
                        <Text style={[S.detailSub, isRTL && { textAlign: "right" }]}>{exp.date || ""}</Text>
                      </View>
                      <Text style={[S.detailAmount, { color: "#EF4444" }]}>{exp.amount.toLocaleString()} {t("sar")}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Export buttons */}
            <View style={{ marginTop: 24, gap: 12 }}>
              <TouchableOpacity
                style={[S.exportBtn, { backgroundColor: "#EF4444" }]}
                onPress={exportPDF}
                disabled={exporting}
                activeOpacity={0.7}
              >
                <Text style={S.exportIcon}>📄</Text>
                <Text style={S.exportText}>{t("exportAsPdf")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.exportBtn, { backgroundColor: "#22C55E" }]}
                onPress={exportSpreadsheet}
                disabled={exporting}
                activeOpacity={0.7}
              >
                <Text style={S.exportIcon}>📊</Text>
                <Text style={S.exportText}>{t("exportAsSpreadsheet")}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}

      </ScrollView>
    </View>
  );
}

const styles = (C: any, shadow: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: "row", alignItems: "center",
      paddingBottom: 12, paddingHorizontal: spacing.md,
      backgroundColor: C.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
    },
    headerSide: { width: 60 },
    headerCenter: { flex: 1, alignItems: "center" },
    headerTitle: { fontSize: 17, fontWeight: "700", color: C.text },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.background, alignItems: "center", justifyContent: "center" },
    backArrow: { fontSize: 22, fontWeight: "700", color: C.text, marginTop: -2 },
    rowRev: { flexDirection: "row-reverse" },

    sectionTitle: { fontSize: 13, fontWeight: "600", color: C.textMuted, marginBottom: 10, textTransform: "uppercase" },

    typeRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
    typeCard: {
      flex: 1, backgroundColor: C.surface, borderRadius: radii.lg,
      padding: 14, alignItems: "center", gap: 6,
      borderWidth: 1, borderColor: C.border, ...shadow,
    },
    typeIcon: { fontSize: 24 },
    typeLabel: { fontSize: 12, color: C.text, fontWeight: "500", textAlign: "center" },

    pillRow: { flexDirection: "row", gap: 8 },
    pill: {
      paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: 20, backgroundColor: C.surface,
      borderWidth: 1, borderColor: C.border,
    },
    pillActive: { backgroundColor: C.accent, borderColor: C.accent },
    pillText: { fontSize: 13, color: C.text, fontWeight: "500" },
    pillTextActive: { color: "#fff", fontWeight: "700" },

    statsGrid: { flexDirection: "row", gap: 10, marginBottom: 20, flexWrap: "wrap" },
    statCard: {
      flex: 1, minWidth: 100, backgroundColor: C.surface,
      borderRadius: radii.lg, padding: 16, alignItems: "center",
      borderTopWidth: 3, ...shadow,
    },
    statIcon: { fontSize: 22, marginBottom: 4 },
    statValue: { fontSize: 20, fontWeight: "800" },
    statLabel: { fontSize: 11, color: C.textMuted, marginTop: 4, textAlign: "center" },

    detailCard: {
      backgroundColor: C.surface, borderRadius: radii.lg,
      overflow: "hidden", marginBottom: 16, ...shadow,
    },
    detailTitle: { fontSize: 15, fontWeight: "700", color: C.text, padding: 16, paddingBottom: 8 },
    detailRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
    detailDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: 16 },
    detailName: { fontSize: 14, color: C.text, fontWeight: "500" },
    detailSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
    detailAmount: { fontSize: 14, fontWeight: "700", color: "#22C55E" },

    exportBtn: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 10, paddingVertical: 16, borderRadius: radii.lg,
    },
    exportIcon: { fontSize: 20 },
    exportText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  });
