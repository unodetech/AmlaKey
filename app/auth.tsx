import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useResponsive } from "../components/WebContainer";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { spacing, radii } from "../constants/theme";
import { userKey, PERSONAL_INFO_KEY } from "../lib/storage";

type Mode = "login" | "signup";

export default function AuthScreen() {
  const { signIn, signUp, resetPassword } = useAuth();
  const { colors: C, shadow } = useTheme();
  const { t, isRTL, lang, toggle } = useLanguage();
  const { isDesktop } = useResponsive();
  const isWeb = Platform.OS === "web";
  const S = useMemo(() => styles(C, shadow, isDesktop, isWeb), [C, shadow, isDesktop, isWeb]);

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resetCooldown, setResetCooldown] = useState(0);

  const handleForgotPassword = async () => {
    setError("");
    setSuccess("");
    if (!email.trim()) {
      setError(t("authEnterEmail"));
      return;
    }
    if (resetCooldown > 0) {
      setError(isRTL ? `انتظر ${resetCooldown} ثانية قبل المحاولة مرة أخرى` : `Wait ${resetCooldown}s before trying again`);
      return;
    }
    setLoading(true);
    const err = await resetPassword(email.trim());
    if (err) {
      setError(err);
    } else {
      setSuccess(t("authResetSent"));
      // 60-second cooldown to prevent spam
      setResetCooldown(60);
      const interval = setInterval(() => {
        setResetCooldown((prev) => {
          if (prev <= 1) { clearInterval(interval); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    setError("");
    setSuccess("");

    if (!email.trim() || !password.trim()) {
      setError(t("authEnterBoth"));
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError(t("authInvalidEmail"));
      return;
    }
    if (mode === "signup") {
      if (!firstName.trim()) {
        setError(t("authFirstNameRequired"));
        return;
      }
      if (!lastName.trim()) {
        setError(t("authLastNameRequired"));
        return;
      }
      if (phone.trim() && !/^05\d{8}$/.test(phone.trim())) {
        setError(t("authPhoneInvalid"));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("authPasswordMismatch"));
        return;
      }
    }
    if (password.length < 6) {
      setError(t("authPasswordMin"));
      return;
    }

    setLoading(true);
    let errMsg: string | null;
    if (mode === "login") {
      errMsg = await signIn(email.trim(), password);
    } else {
      const result = await signUp(email.trim(), password);
      errMsg = result.error;
      if (!errMsg && result.userId) {
        // Save name & phone with user-scoped key
        const key = userKey(result.userId, PERSONAL_INFO_KEY);
        const existing = await AsyncStorage.getItem(key);
        let parsed = {};
        try { if (existing) parsed = JSON.parse(existing); } catch {}
        await AsyncStorage.setItem(key, JSON.stringify({
          ...parsed,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          fullName: `${firstName.trim()} ${lastName.trim()}`,
          phone: phone.trim(),
        }));
        setSuccess(t("authAccountCreated"));
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setFirstName("");
        setLastName("");
        setPhone("");
        setLoading(false);
        return;
      }
    }
    if (errMsg) setError(errMsg);
    setLoading(false);
  };

  return (
    <View style={S.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={S.kav}
      >
        <ScrollView
          contentContainerStyle={S.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Gradient Hero — web desktop only */}
          {isWeb && isDesktop && (
            <View style={S.hero}>
              <Image
                source={require("../assets/images/splash-icon.png")}
                style={S.heroLogo}
                resizeMode="contain"
              />
              <Text style={S.heroTitle}>
                {isRTL ? "أملاكي" : "Amlakey"}
              </Text>
              <Text style={S.heroSubtitle}>
                {isRTL ? "مدير أملاكك الذكي" : "Your Smart Property Manager"}
              </Text>
              {/* Curved bottom edge */}
              <View style={S.heroCurve} />
            </View>
          )}

          {/* Language toggle */}
          <TouchableOpacity
            style={S.langBtn}
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={lang === "ar" ? "Switch to English" : "التبديل إلى العربية"}
          >
            <Text style={S.langBtnText}>
              {lang === "ar" ? "🇺🇸 English" : "🇸🇦 العربية"}
            </Text>
          </TouchableOpacity>

          {/* Logo — mobile / non-desktop only */}
          {!(isWeb && isDesktop) && (
            <View style={S.logoWrap}>
              <Image
                source={require("../assets/images/splash-icon.png")}
                style={S.logoImg}
                resizeMode="contain"
              />
              <Text style={S.appSub}>{t("authPropertyMgmt")}</Text>
            </View>
          )}

          {/* Card */}
          <View style={S.cardOuter}>
          <View style={S.card}>
            {/* Mode toggle */}
            <View style={S.toggle}>
              <TouchableOpacity
                style={[S.toggleBtn, mode === "login" && S.toggleBtnActive]}
                onPress={() => { setMode("login"); setError(""); setSuccess(""); }}
                accessibilityRole="button"
                accessibilityLabel={t("authLogin")}
                accessibilityState={{ selected: mode === "login" }}
              >
                <Text style={[S.toggleText, mode === "login" && S.toggleTextActive]}>
                  {t("authLogin")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.toggleBtn, mode === "signup" && S.toggleBtnActive]}
                onPress={() => { setMode("signup"); setError(""); setSuccess(""); }}
                accessibilityRole="button"
                accessibilityLabel={t("authSignUp")}
                accessibilityState={{ selected: mode === "signup" }}
              >
                <Text style={[S.toggleText, mode === "signup" && S.toggleTextActive]}>
                  {t("authSignUp")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Error / Success */}
            {!!error && (
              <View style={S.errorBox}>
                <Text style={S.errorText}>⚠️ {error}</Text>
              </View>
            )}
            {!!success && (
              <View style={S.successBox}>
                <Text style={S.successText}>✅ {success}</Text>
              </View>
            )}

            {/* Name & Phone (signup only) */}
            {mode === "signup" && (
              <>
                <Text style={S.label}>{t("authFirstName")}</Text>
                <TextInput
                  style={[S.input, { textAlign: isRTL ? "right" : "left" }]}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder={t("enterFirstName")}
                  placeholderTextColor={C.textMuted}
                  accessibilityLabel={t("authFirstName")}
                />

                <Text style={S.label}>{t("authLastName")}</Text>
                <TextInput
                  style={[S.input, { textAlign: isRTL ? "right" : "left" }]}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder={t("enterLastName")}
                  placeholderTextColor={C.textMuted}
                  accessibilityLabel={t("authLastName")}
                />

                <Text style={S.label}>{t("authPhone")}</Text>
                <TextInput
                  style={[S.input, { textAlign: isRTL ? "right" : "left" }]}
                  value={phone}
                  onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
                  placeholder="05XXXXXXXX"
                  placeholderTextColor={C.textMuted}
                  keyboardType="number-pad"
                  maxLength={10}
                  accessibilityLabel={t("authPhone")}
                />
              </>
            )}

            {/* Fields */}
            <Text style={S.label}>{t("authEmail")}</Text>
            <TextInput
              style={S.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={C.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t("authEmail")}
            />

            <Text style={S.label}>{t("authPassword")}</Text>
            <TextInput
              style={S.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={C.textMuted}
              secureTextEntry
              accessibilityLabel={t("authPassword")}
            />

            {mode === "login" && (
              <TouchableOpacity onPress={handleForgotPassword} disabled={resetCooldown > 0} style={{ alignSelf: isRTL ? "flex-start" : "flex-end", marginTop: 8, opacity: resetCooldown > 0 ? 0.5 : 1 }} accessibilityRole="button" accessibilityLabel={t("authForgotPassword")}>
                <Text style={{ color: C.primary, fontSize: 13, fontWeight: "600" }}>
                  {resetCooldown > 0 ? `${t("authForgotPassword")} (${resetCooldown}s)` : t("authForgotPassword")}
                </Text>
              </TouchableOpacity>
            )}

            {mode === "signup" && (
              <>
                <Text style={S.label}>{t("authConfirmPassword")}</Text>
                <TextInput
                  style={S.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••••"
                  placeholderTextColor={C.textMuted}
                  secureTextEntry
                  accessibilityLabel={t("authConfirmPassword")}
                />
              </>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[S.submitBtn, loading && S.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={mode === "login" ? t("authLogin") : t("authSignUp")}
              accessibilityState={{ disabled: loading }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={S.submitText}>
                  {mode === "login" ? t("authLogin") : t("authSignUp")}
                </Text>
              )}
            </TouchableOpacity>

            {/* Terms note — signup only */}
            {mode === "signup" && (
              <Text style={[S.termsNote, isRTL && { textAlign: "right" }]}>
                {t("bySigningUp")}{" "}
                <Text style={S.termsLink} onPress={() => router.push("/terms" as any)}>
                  {t("termsOfService")}
                </Text>{" "}
                {t("andWord")}{" "}
                <Text style={S.termsLink} onPress={() => router.push("/privacy" as any)}>
                  {t("privacyPolicy")}
                </Text>
              </Text>
            )}

            {/* Switch hint */}
            <TouchableOpacity
              style={S.switchHint}
              onPress={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setSuccess(""); }}
              accessibilityRole="button"
              accessibilityLabel={mode === "login" ? t("noAccountSignUp") : t("hasAccountLogin")}
            >
              <Text style={S.switchHintText}>
                {mode === "login" ? t("noAccountSignUp") : t("hasAccountLogin")}
              </Text>
            </TouchableOpacity>
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = (C: any, shadow: any, isDesktop: boolean, isWeb: boolean) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.background },
    kav: { flex: 1 },
    scroll: {
      flexGrow: 1,
      justifyContent: isDesktop ? "flex-start" : "center",
      padding: isDesktop ? 0 : spacing.lg,
      paddingTop: isDesktop ? 0 : 60,
    },

    // Hero (web desktop only)
    hero: {
      alignItems: "center",
      paddingTop: 60,
      paddingBottom: 70,
      paddingHorizontal: 24,
      position: "relative",
      overflow: "hidden",
      ...(isWeb && {
        backgroundImage: "linear-gradient(135deg, #0D9488 0%, #0EA5E9 100%)",
      }),
    } as any,
    heroLogo: {
      width: 80,
      height: 80,
      borderRadius: 18,
      marginBottom: 14,
      backgroundColor: "#fff",
    },
    heroTitle: {
      fontSize: 38,
      fontWeight: "800",
      color: "#fff",
      letterSpacing: -1,
      marginBottom: 6,
    },
    heroSubtitle: {
      fontSize: 17,
      color: "rgba(255,255,255,0.9)",
      fontWeight: "500",
    },
    heroCurve: {
      position: "absolute",
      bottom: -2,
      left: 0,
      right: 0,
      height: 40,
      backgroundColor: C.background,
      borderTopLeftRadius: 9999,
      borderTopRightRadius: 9999,
    },

    // Logo (mobile only)
    logoWrap: { alignItems: "center", marginBottom: 36 },
    logoImg: {
      width: 120,
      height: 120,
      borderRadius: 24,
      marginBottom: 12,
    },
    appSub: { fontSize: 13, color: C.textMuted, marginTop: 4 },

    // Card
    cardOuter: {
      ...(isDesktop && {
        maxWidth: 440,
        width: "100%" as any,
        alignSelf: "center" as any,
        paddingHorizontal: 24,
        marginTop: -20,
      }),
    },
    card: {
      backgroundColor: C.surface,
      borderRadius: radii.lg,
      padding: isDesktop ? spacing.xl : spacing.lg,
      borderWidth: 1,
      borderColor: C.border,
      ...shadow,
    },

    // Toggle
    toggle: {
      flexDirection: "row",
      backgroundColor: C.surfaceElevated,
      borderRadius: radii.md,
      padding: 4,
      marginBottom: 20,
    },
    toggleBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: radii.sm,
      alignItems: "center",
    },
    toggleBtnActive: { backgroundColor: C.primary },
    toggleText: { fontSize: 14, fontWeight: "600", color: C.textMuted },
    toggleTextActive: { color: "#fff" },

    // Messages
    errorBox: {
      backgroundColor: "rgba(220,38,38,0.1)",
      borderRadius: radii.sm,
      padding: 12,
      marginBottom: 14,
    },
    errorText: { color: C.danger, fontSize: 13 },
    successBox: {
      backgroundColor: "rgba(13,148,136,0.1)",
      borderRadius: radii.sm,
      padding: 12,
      marginBottom: 14,
    },
    successText: { color: C.accent, fontSize: 13 },

    // Fields
    label: { fontSize: 13, color: C.textMuted, marginBottom: 6, marginTop: 12 },
    input: {
      backgroundColor: C.surfaceElevated,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: C.text,
      fontSize: 15,
    },

    // Submit
    submitBtn: {
      backgroundColor: C.primary,
      borderRadius: radii.md,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 22,
      ...shadow,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitText: { color: "#fff", fontWeight: "700", fontSize: 16 },

    termsNote: { fontSize: 12, color: C.textMuted, textAlign: "center", marginTop: 14, lineHeight: 18, paddingHorizontal: 8 },
    termsLink: { color: C.accent, fontWeight: "600", textDecorationLine: "underline" },

    switchHint: { alignItems: "center", marginTop: 16 },
    switchHintText: { color: C.textMuted, fontSize: 13 },

    // Language toggle
    langBtn: {
      alignSelf: "flex-end",
      backgroundColor: C.surfaceElevated,
      borderRadius: radii.md,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: C.border,
      marginBottom: 8,
    },
    langBtnText: { fontSize: 14, fontWeight: "600", color: C.primary },
  });
