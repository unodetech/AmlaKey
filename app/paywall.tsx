import React, { useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { showAlert } from "../lib/alert";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { useSubscription } from "../context/SubscriptionContext";

const { width: SW } = Dimensions.get("window");

const PRO_FEATURES = [
  { icon: "🏢", key: "featureUnlimitedProperties", descKey: "featureUnlimitedPropertiesDesc" },
  { icon: "🏠", key: "featureUnlimitedUnits", descKey: "featureUnlimitedUnitsDesc" },
  { icon: "📊", key: "featureExportReports", descKey: "featureExportReportsDesc" },
  { icon: "📁", key: "featureVault", descKey: "featureVaultDesc" },
] as const;

const FREE_FEATURES = [
  { icon: "🏠", key: "freeProperties" },
  { icon: "🔢", key: "freeUnits" },
  { icon: "💰", key: "freePaymentTracking" },
  { icon: "🔔", key: "freeNotifications" },
  { icon: "📋", key: "freeEjarImport" },
] as const;

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { colors: C } = useTheme();
  const { t, isRTL } = useLanguage();
  const { packages, purchasePackage, restorePurchases, isPro } = useSubscription();
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("annual");
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const monthlyPrice = "14.99";
  const annualPrice = "89";
  const currency = t("sar");

  const isWeb = Platform.OS === "web";

  async function handlePurchase() {
    if (isWeb) {
      showAlert(
        t("subscribePro"),
        isRTL ? "الاشتراكات متاحة عبر تطبيق الجوال. قم بتحميل أملاكي من App Store للاشتراك." : "Subscriptions are available through the mobile app. Download Amlakey from the App Store to subscribe.",
      );
      return;
    }
    // Find matching package
    const pkg = packages.find((p) =>
      selectedPlan === "annual"
        ? p.packageType === "ANNUAL"
        : p.packageType === "MONTHLY"
    );
    if (!pkg) {
      showAlert(
        t("subscribePro"),
        isRTL ? "الاشتراك سيكون متاحاً قريباً." : "Subscription will be available soon.",
      );
      return;
    }
    setPurchasing(true);
    const success = await purchasePackage(pkg);
    setPurchasing(false);
    if (success) {
      showAlert("🎉", t("subscriptionActive"), () => router.back());
    }
  }

  async function handleRestore() {
    if (isWeb) {
      showAlert("ℹ️", isRTL ? "استعادة المشتريات متاحة فقط على تطبيق الجوال." : "Restore purchases is only available on the mobile app.");
      return;
    }
    setRestoring(true);
    const success = await restorePurchases();
    setRestoring(false);
    showAlert(
      success ? "✅" : "ℹ️",
      success ? t("restoreSuccess") : t("restoreNone"),
      success ? () => router.back() : undefined,
    );
  }

  if (isPro) {
    return (
      <View style={[S.container, { backgroundColor: C.background, paddingTop: insets.top }]}>
        <View style={S.activeContainer}>
          <Text style={{ fontSize: 48 }}>✅</Text>
          <Text style={[S.activeTitle, { color: C.text }]}>{t("subscriptionActive")}</Text>
          <TouchableOpacity style={[S.backButton, { backgroundColor: C.accent }]} onPress={() => router.back()}>
            <Text style={S.backButtonText}>{t("ok")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[S.container, { backgroundColor: C.background }]}>
      {/* Header */}
      <View style={[S.header, { paddingTop: insets.top + 10, backgroundColor: C.accent }]}>
        <TouchableOpacity style={S.closeBtn} onPress={() => router.back()}>
          <Text style={S.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={S.crown}>💰</Text>
        <Text style={S.headerTitle}>{t("subscriptionTitle")}</Text>
        <Text style={S.headerSubtitle}>{t("upgradeToUnlock")}</Text>
      </View>

      <ScrollView style={S.body} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
        {/* Plan toggle */}
        <View style={[S.planToggle, { backgroundColor: C.surface }]}>
          <TouchableOpacity
            style={[S.planOption, selectedPlan === "monthly" && { backgroundColor: C.accent }]}
            onPress={() => setSelectedPlan("monthly")}
          >
            <Text style={[S.planOptionText, { color: selectedPlan === "monthly" ? "#FFF" : C.text }]}>
              {t("proMonthly")}
            </Text>
            <Text style={[S.planPrice, { color: selectedPlan === "monthly" ? "#FFF" : C.text }]}>
              {monthlyPrice} {currency}{t("proPriceMonth")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[S.planOption, selectedPlan === "annual" && { backgroundColor: C.accent }]}
            onPress={() => setSelectedPlan("annual")}
          >
            <View style={S.saveBadge}>
              <Text style={S.saveBadgeText}>{t("savePercent")}</Text>
            </View>
            <Text style={[S.planOptionText, { color: selectedPlan === "annual" ? "#FFF" : C.text }]}>
              {t("proAnnual")}
            </Text>
            <Text style={[S.planPrice, { color: selectedPlan === "annual" ? "#FFF" : C.text }]}>
              {annualPrice} {currency}{t("proPriceYear")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Pro features */}
        <View style={[S.section, { backgroundColor: C.surface }]}>
          <Text style={[S.sectionTitle, { color: C.text }, isRTL && { textAlign: "right" }]}>
            💰 {t("proFeatures")}
          </Text>
          {PRO_FEATURES.map((f) => (
            <View key={f.key} style={[S.featureRow, isRTL && S.featureRowRTL]}>
              <Text style={S.featureIcon}>{f.icon}</Text>
              <View style={S.featureTextWrap}>
                <Text style={[S.featureName, { color: C.text }, isRTL && { textAlign: "right" }]}>
                  {t(f.key)}
                </Text>
                <Text style={[S.featureDesc, { color: C.textMuted }, isRTL && { textAlign: "right" }]}>
                  {t(f.descKey)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Free features */}
        <View style={[S.section, { backgroundColor: C.surface }]}>
          <Text style={[S.sectionTitle, { color: C.text }, isRTL && { textAlign: "right" }]}>
            ✅ {t("freeIncludes")}
          </Text>
          {FREE_FEATURES.map((f) => (
            <View key={f.key} style={[S.featureRow, isRTL && S.featureRowRTL]}>
              <Text style={S.featureIcon}>{f.icon}</Text>
              <Text style={[S.freeFeatureText, { color: C.textMuted }, isRTL && { textAlign: "right" }]}>
                {t(f.key)}
              </Text>
            </View>
          ))}
        </View>

        {/* Restore */}
        <TouchableOpacity style={S.restoreBtn} onPress={handleRestore} disabled={restoring}>
          {restoring ? (
            <ActivityIndicator color={C.accent} size="small" />
          ) : (
            <Text style={[S.restoreText, { color: C.accent }]}>{t("restorePurchases")}</Text>
          )}
        </TouchableOpacity>

        <Text style={[S.cancelNote, { color: C.textMuted }, isRTL && { textAlign: "right" }]}>
          {t("cancelAnytime")}
        </Text>
      </ScrollView>

      {/* CTA */}
      <View style={[S.cta, { paddingBottom: insets.bottom + 16, backgroundColor: C.background }]}>
        <TouchableOpacity
          style={[S.ctaBtn, { backgroundColor: C.accent }]}
          onPress={handlePurchase}
          disabled={purchasing}
        >
          {purchasing ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={S.ctaBtnText}>
              {t("subscribePro")} — {selectedPlan === "annual" ? `${annualPrice} ${currency}${t("proPriceYear")}` : `${monthlyPrice} ${currency}${t("proPriceMonth")}`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: "center",
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  closeBtn: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  closeBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  crown: { fontSize: 48, marginBottom: 8 },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#FFF", marginBottom: 4 },
  headerSubtitle: { fontSize: 14, color: "rgba(255,255,255,0.85)", fontWeight: "500" },
  body: { flex: 1, paddingHorizontal: 16 },
  planToggle: {
    flexDirection: "row",
    borderRadius: 14,
    marginTop: 20,
    padding: 4,
    gap: 4,
  },
  planOption: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    position: "relative",
  },
  planOptionText: { fontSize: 14, fontWeight: "700", marginBottom: 2 },
  planPrice: { fontSize: 12, fontWeight: "500" },
  saveBadge: {
    position: "absolute",
    top: -8,
    right: 8,
    backgroundColor: "#F59E0B",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  saveBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "700" },
  section: {
    marginTop: 16,
    borderRadius: 14,
    padding: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 12 },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 12,
  },
  featureRowRTL: { flexDirection: "row-reverse" },
  featureIcon: { fontSize: 20, marginTop: 2 },
  featureTextWrap: { flex: 1 },
  featureName: { fontSize: 14, fontWeight: "600", marginBottom: 2 },
  featureDesc: { fontSize: 12, lineHeight: 16 },
  freeFeatureText: { fontSize: 14, fontWeight: "500", flex: 1, paddingTop: 2 },
  restoreBtn: {
    alignItems: "center",
    paddingVertical: 16,
    marginTop: 8,
  },
  restoreText: { fontSize: 14, fontWeight: "600" },
  cancelNote: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 20,
    lineHeight: 16,
  },
  cta: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  ctaBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaBtnText: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  activeContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  activeTitle: { fontSize: 20, fontWeight: "700" },
  backButton: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  backButtonText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
});
