import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, I18nManager, Linking, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { showAlert, crossAlert } from "../../lib/alert";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import { useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../../context/ThemeContext";
import { useAuth } from "../../context/AuthContext";
import { spacing, radii } from "../../constants/theme";
import { NotificationSettingsModal } from "../../components/NotificationSettingsModal";
import { exportAllData, importAllData, getLastBackupDate } from "../../lib/backup";
import { userKey, PERSONAL_INFO_KEY, BIOMETRIC_LOCK_KEY } from "../../lib/storage";
import { useSubscription } from "../../context/SubscriptionContext";
import WebContainer, { useResponsive } from "../../components/WebContainer";

const isWeb = Platform.OS === "web";

// Lazy-load expo-local-authentication only on native
let LocalAuthentication: typeof import("expo-local-authentication") | null = null;
if (!isWeb) {
  LocalAuthentication = require("expo-local-authentication");
}
interface PersonalInfo {
  fullName: string;
  phone: string;
  city: string;
  company: string;
}

export default function ProfileScreen() {
  const { t, lang, toggle, isRTL } = useLanguage();
  const { colors: C, isDark, toggleTheme, shadow } = useTheme();
  const { user, signOut } = useAuth();
  const { isPro, hasFeature } = useSubscription();
  const { isDesktop, isWide } = useResponsive();
  const S = useMemo(() => styles(C, shadow, isDark, isRTL), [C, shadow, isDark, isRTL]);

  // Personal info
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>({ fullName: "", phone: "", city: "", company: "" });

  // Notifications
  const [notifModal, setNotifModal] = useState(false);

  // Backup state
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  // Biometric lock state
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  useEffect(() => {
    if (isWeb || !LocalAuthentication) return;
    LocalAuthentication.hasHardwareAsync().then((has) => {
      if (has) LocalAuthentication!.isEnrolledAsync().then(setBiometricAvailable);
    });
    if (user) {
      AsyncStorage.getItem(userKey(user.id, BIOMETRIC_LOCK_KEY)).then((v) =>
        setBiometricEnabled(v === "true")
      );
    }
  }, [user]);

  const toggleBiometric = async () => {
    if (isWeb || !LocalAuthentication) return;
    if (!biometricEnabled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t("biometricVerify"),
      });
      if (!result.success) return;
    }
    const newVal = !biometricEnabled;
    setBiometricEnabled(newVal);
    if (user) await AsyncStorage.setItem(userKey(user.id, BIOMETRIC_LOCK_KEY), String(newVal));
  };

  const storageKey = user ? userKey(user.id, PERSONAL_INFO_KEY) : null;

  const loadPersonalInfo = useCallback(() => {
    if (!storageKey) return;
    AsyncStorage.getItem(storageKey).then(val => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          setPersonalInfo({ fullName: parsed.fullName || "", phone: parsed.phone || "", city: parsed.city || "", company: parsed.company || "" });
        } catch {}
      }
    });
    if (user?.id) getLastBackupDate(user.id).then(setLastBackup);
  }, [storageKey]);

  useEffect(() => { loadPersonalInfo(); }, []);
  useFocusEffect(useCallback(() => { loadPersonalInfo(); }, [loadPersonalInfo, storageKey]));

  const handleLanguageToggle = () => {
    const switchingToArabic = lang === "en";
    toggle();
    if (isWeb) {
      document.documentElement.dir = switchingToArabic ? "rtl" : "ltr";
      document.documentElement.lang = switchingToArabic ? "ar" : "en";
    } else {
      I18nManager.allowRTL(switchingToArabic);
      I18nManager.forceRTL(switchingToArabic);
    }
    setTimeout(() => {
      showAlert(t("langChanged"), t("langChangedMsg"));
    }, 100);
  };

  const firstName = personalInfo.fullName ? personalInfo.fullName.split(" ")[0] : "";

  const Row = ({ icon, label, right, onPress, danger }: { icon: string; label: string; right?: React.ReactNode; onPress?: () => void; danger?: boolean }) => {
    const content = (
      <View style={[S.row, isRTL && S.rowRev]}>
        <View style={[S.rowIconWrap, danger && { backgroundColor: isDark ? "#7F1D1D" : "#FEE2E2" }]}>
          <Text style={S.rowIcon}>{icon}</Text>
        </View>
        <Text style={[S.rowLabel, isRTL && { textAlign: "right", flex: 1 }, danger && { color: "#EF4444", fontWeight: "600" }]}>{label}</Text>
        {right}
        {onPress && !right && <Text style={S.rowChevron}>{isRTL ? "‹" : "›"}</Text>}
      </View>
    );
    if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}>{content}</TouchableOpacity>;
    return <View accessible={true} accessibilityLabel={label}>{content}</View>;
  };

  const Divider = () => <View style={S.divider} />;

  return (
    <ScrollView style={S.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <WebContainer maxWidth={isDesktop ? 1200 : 768}>

      {/* ══════════════ PROFILE HEADER ══════════════ */}
      <View style={S.headerBg}>
        <View style={[S.profileRow, isRTL && { flexDirection: "row-reverse" }]}>
          <View style={S.avatarRing}>
            <View style={S.avatarCircle}>
              <Text style={S.avatarLetter}>{firstName ? firstName.charAt(0).toUpperCase() : "👤"}</Text>
            </View>
          </View>
          <View style={{ flex: 1, marginHorizontal: 16 }}>
            <Text style={[S.profileName, isRTL && { textAlign: "right" }]}>
              {personalInfo.fullName || t("addYourName")}
            </Text>
            {!!user?.email && (
              <Text style={[S.profileEmail, isRTL && { textAlign: "right" }]}>{user.email}</Text>
            )}
            {!!personalInfo.company && (
              <Text style={[S.profileCompany, isRTL && { textAlign: "right" }]}>{personalInfo.company}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Two-column layout on desktop */}
      <View style={isDesktop ? { flexDirection: isRTL ? "row-reverse" : "row", gap: 20, paddingHorizontal: 16, marginTop: 8 } : {}}>
      {/* Left column */}
      <View style={isDesktop ? { flex: 3 } : {}}>

      {/* ── Subscription Banner ── */}
      <TouchableOpacity
        style={[S.perfBanner, { backgroundColor: isPro ? "#10B981" : C.accent }, isRTL && { flexDirection: "row-reverse" }]}
        onPress={() => router.push("/paywall" as any)}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 22 }}>{isPro ? "✅" : "💰"}</Text>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={[{ fontSize: 15, fontWeight: "700", color: "#FFF" }, isRTL && { textAlign: "right" }]}>
            {t("currentPlan")}: {isPro ? t("proPlan") : t("freePlan")}
          </Text>
          <Text style={[{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2 }, isRTL && { textAlign: "right" }]}>
            {isPro ? t("subscriptionManage") : t("upgradeToUnlock")}
          </Text>
        </View>
        <Text style={{ color: "#FFF", fontSize: 18 }}>{isRTL ? "‹" : "›"}</Text>
      </TouchableOpacity>

      {/* ══════════════ GENERAL ══════════════ */}
      <View style={[S.card, isDesktop && { marginTop: 16 }]}>
        <Row icon="👤" label={t("personalInfo")} onPress={() => router.push("/personal-info")} />
        <Divider />
        <Row icon="🔔" label={t("notificationSettings")} onPress={() => setNotifModal(true)} />
        <Divider />
        <Row
          icon="🌐"
          label={lang === "en" ? "English" : "العربية"}
          right={
            <TouchableOpacity style={S.langToggle} onPress={handleLanguageToggle} accessibilityRole="button" accessibilityLabel={lang === "en" ? "Switch to Arabic" : "التبديل إلى الإنجليزية"}>
              <Text style={S.langToggleText}>{lang === "en" ? "🇸🇦 AR" : "🇺🇸 EN"}</Text>
            </TouchableOpacity>
          }
        />
        <Divider />
        <TouchableOpacity onPress={() => toggleTheme()} activeOpacity={0.7} accessibilityRole="switch" accessibilityLabel={isDark ? t("darkMode") : t("lightMode")} accessibilityState={{ checked: isDark }}>
          <View style={[S.row, isRTL && S.rowRev]}>
            <View style={S.rowIconWrap}>
              <Text style={S.rowIcon}>{isDark ? "🌙" : "☀️"}</Text>
            </View>
            <Text style={[S.rowLabel, isRTL && { textAlign: "right", flex: 1 }]}>
              {isDark ? t("darkMode") : t("lightMode")}
            </Text>
            <View style={[S.togglePill, isDark && S.togglePillActive]}>
              <View style={[S.toggleDot, isDark && S.toggleDotActive]} />
            </View>
          </View>
        </TouchableOpacity>
        {biometricAvailable && (
          <>
            <Divider />
            <TouchableOpacity onPress={toggleBiometric} activeOpacity={0.7} accessibilityRole="switch" accessibilityLabel={t("biometricLock")} accessibilityState={{ checked: biometricEnabled }}>
              <View style={[S.row, isRTL && S.rowRev]}>
                <View style={S.rowIconWrap}>
                  <Text style={S.rowIcon}>🔐</Text>
                </View>
                <Text style={[S.rowLabel, isRTL && { textAlign: "right", flex: 1 }]}>
                  {t("biometricLock")}
                </Text>
                <View style={[S.togglePill, biometricEnabled && S.togglePillActive]}>
                  <View style={[S.toggleDot, biometricEnabled && S.toggleDotActive]} />
                </View>
              </View>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ══════════════ DATA ══════════════ */}
      <View style={[S.card, { marginTop: 20 }]}>
        <Row
          icon="📦"
          label={t("exportData")}
          right={exporting ? <ActivityIndicator color={C.accent} size="small" /> : undefined}
          onPress={exporting ? undefined : async () => {
            setExporting(true);
            try {
              await exportAllData(user?.id ?? "");
              const d = await getLastBackupDate(user?.id ?? "");
              setLastBackup(d);
              showAlert("✅", t("exportSuccess"));
            } catch (e: any) {
              showAlert(t("error"), e.message);
            }
            setExporting(false);
          }}
        />
        <Divider />
        <Row
          icon="📥"
          label={t("restoreData")}
          right={importing ? <ActivityIndicator color={C.accent} size="small" /> : undefined}
          onPress={importing ? undefined : () => {
            crossAlert(
              t("importWarning"),
              t("importConfirm"),
              [
                { text: t("cancel"), style: "cancel" },
                {
                  text: t("restoreData"),
                  onPress: async () => {
                    setImporting(true);
                    try {
                      const counts = await importAllData();
                      showAlert("✅", t("importSuccess") + `\n\n${counts.properties} ${t("properties")}, ${counts.tenants} ${t("tenants")}, ${counts.payments} ${t("payments")}, ${counts.expenses} ${t("expenses")}`);
                    } catch (e: any) {
                      if (e.message === "cancelled") { /* user cancelled picker */ }
                      else if (e.message === "invalid_json" || e.message === "invalid_format") {
                        showAlert(t("error"), t("invalidBackupFile"));
                      } else {
                        showAlert(t("error"), e.message);
                      }
                    }
                    setImporting(false);
                  },
                },
              ]
            );
          }}
        />
        {lastBackup && (
          <Text style={[S.backupFooter, isRTL && { textAlign: "right" }]}>
            {t("lastBackup")}: {new Date(lastBackup).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </Text>
        )}
      </View>

      </View>{/* End left column */}

      {/* Right column */}
      <View style={isDesktop ? { flex: 2 } : {}}>

      {/* ── Performance & Reports Banners ── */}
      <TouchableOpacity
        style={[S.perfBanner, isRTL && { flexDirection: "row-reverse" }]}
        onPress={() => router.push("/performance")}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t("performance")}
      >
        <Text style={{ fontSize: 20 }}>📊</Text>
        <Text style={[S.perfText, isRTL && { textAlign: "right" }]}>{t("performance")}</Text>
        <Text style={{ fontSize: 16, color: C.textMuted }}>{isRTL ? "‹" : "›"}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[S.perfBanner, isRTL && { flexDirection: "row-reverse" }, { marginTop: 8 }]}
        onPress={() => router.push("/reports")}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t("reports")}
      >
        <Text style={{ fontSize: 20 }}>📋</Text>
        <Text style={[S.perfText, isRTL && { textAlign: "right" }]}>{t("reports")}</Text>
        <Text style={{ fontSize: 16, color: C.textMuted }}>{isRTL ? "‹" : "›"}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[S.perfBanner, isRTL && { flexDirection: "row-reverse" }, { marginTop: 8 }]}
        onPress={() => {
          if (!hasFeature("vault" as any)) {
            crossAlert(t("upgradeRequired"), t("upgradeToUnlock"), [
              { text: t("upgrade"), onPress: () => router.push("/paywall" as any) },
              { text: t("later"), style: "cancel" },
            ]);
            return;
          }
          router.push("/vault" as any);
        }}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t("vault")}
      >
        <Text style={{ fontSize: 20 }}>📁</Text>
        <View style={{ flex: 1 }}>
          <Text style={[S.perfText, isRTL && { textAlign: "right" }]}>{t("vault")}</Text>
        </View>
        {!isPro && <Text style={{ fontSize: 10, color: C.accent, fontWeight: "700", marginRight: isRTL ? 0 : 8, marginLeft: isRTL ? 8 : 0 }}>PRO</Text>}
        <Text style={{ fontSize: 16, color: C.textMuted }}>{isRTL ? "‹" : "›"}</Text>
      </TouchableOpacity>

      {/* ══════════════ ABOUT & HELP ══════════════ */}
      <View style={[S.card, { marginTop: 16 }]}>
        <Row icon="📄" label={t("termsOfService")} onPress={() => router.push("/terms" as any)} />
        <Divider />
        <Row icon="🔒" label={t("privacyPolicy")} onPress={() => router.push("/privacy" as any)} />
        <Divider />
        <Row icon="📧" label={t("contactUs")} onPress={() => Linking.openURL("mailto:support@amlakeyapp.com")} />
        <Divider />
        <Row icon="📱" label={t("appVersion")} right={<Text style={S.rowValue}>1.0.0</Text>} />
      </View>

      {/* ══════════════ SIGN OUT ══════════════ */}
      <TouchableOpacity
        style={S.signOutBtn}
        activeOpacity={0.7}
        onPress={() => {
          crossAlert(
            t("signOut") ?? "Sign Out",
            t("signOutConfirm") ?? "Are you sure you want to sign out?",
            [
              { text: t("cancel"), style: "cancel" },
              { text: t("signOut") ?? "Sign Out", style: "destructive", onPress: signOut },
            ]
          );
        }}
        accessibilityRole="button"
        accessibilityLabel={t("signOut") ?? "Sign Out"}
      >
        <Text style={S.signOutIcon}>🚪</Text>
        <Text style={S.signOutText}>{t("signOut") ?? "Sign Out"}</Text>
      </TouchableOpacity>

      </View>{/* End right column */}
      </View>{/* End two-column layout */}

      <Text style={S.footer}>{t("footerText")}</Text>

      {/* ── Notification Settings Modal ── */}
      <NotificationSettingsModal visible={notifModal} onClose={() => setNotifModal(false)} />
      </WebContainer>

    </ScrollView>
  );
}

const styles = (C: any, shadow: any, isDark: boolean, isRTL: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },

    // ── Header ──
    headerBg: {
      backgroundColor: C.accent,
      paddingTop: 60,
      paddingBottom: 24,
      paddingHorizontal: spacing.md,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      marginBottom: 12,
    },
    profileRow: { flexDirection: "row", alignItems: "center" },
    avatarRing: {
      width: 72, height: 72, borderRadius: 36,
      borderWidth: 3, borderColor: "rgba(255,255,255,0.4)",
      alignItems: "center", justifyContent: "center",
    },
    avatarCircle: {
      width: 64, height: 64, borderRadius: 32,
      backgroundColor: "rgba(255,255,255,0.25)",
      justifyContent: "center", alignItems: "center",
    },
    avatarLetter: { fontSize: 28, color: "#fff", fontWeight: "700" },
    profileName: { fontSize: 20, fontWeight: "700", color: "#fff" },
    profileEmail: { fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 2 },
    profileCompany: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 },

    // ── Performance Banner ──
    perfBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginHorizontal: 16,
      marginTop: -1,
      marginBottom: 8,
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: C.surface,
      borderRadius: radii.lg,
      ...shadow,
    },
    perfText: { flex: 1, fontSize: 15, fontWeight: "600", color: C.text },

    // ── Cards & Rows ──
    card: {
      backgroundColor: C.surface,
      marginHorizontal: 16,
      borderRadius: radii.lg,
      overflow: "hidden",
    },
    row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
    rowRev: { flexDirection: "row-reverse" },
    rowIconWrap: {
      width: 34, height: 34, borderRadius: 10,
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : C.background,
      alignItems: "center", justifyContent: "center",
      marginRight: isRTL ? 0 : 12,
      marginLeft: isRTL ? 12 : 0,
    },
    rowIcon: { fontSize: 18 },
    rowLabel: { flex: 1, fontSize: 15, color: C.text },
    rowValue: { fontSize: 14, color: C.textMuted },
    rowChevron: { fontSize: 20, color: C.textMuted, fontWeight: "600" },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: isRTL ? 0 : 62, marginRight: isRTL ? 62 : 0 },

    // ── Custom Toggle Pill ──
    togglePill: {
      width: 48, height: 28, borderRadius: 14,
      backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "#E5E7EB",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    togglePillActive: {
      backgroundColor: C.accent,
    },
    toggleDot: {
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: "#fff",
      ...shadow,
    },
    toggleDotActive: {
      alignSelf: "flex-end",
    },

    // ── Language Toggle ──
    langToggle: { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : C.accentSoft, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 6 },
    langToggleText: { color: C.accent, fontWeight: "700", fontSize: 13 },

    // ── Backup footer ──
    backupFooter: {
      fontSize: 11,
      color: C.textMuted,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      [isRTL ? "marginRight" : "marginLeft"]: 0,
    },

    // ── Sign Out ──
    signOutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginHorizontal: 16,
      marginTop: 24,
      paddingVertical: 15,
      borderRadius: radii.lg,
      backgroundColor: isDark ? "#7F1D1D" : "#FEE2E2",
      borderWidth: 1,
      borderColor: isDark ? "#991B1B" : "#FECACA",
    },
    signOutIcon: { fontSize: 18 },
    signOutText: { fontSize: 15, fontWeight: "700", color: "#EF4444" },

    // ── Footer ──
    footer: {
      textAlign: "center",
      fontSize: 11,
      color: C.textMuted,
      marginTop: 16,
      marginBottom: 20,
    },

  });
