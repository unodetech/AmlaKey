import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useLanguage } from "../context/LanguageContext";
import { spacing, radii } from "../constants/theme";

export default function ResetPasswordScreen() {
  const { clearPasswordRecovery } = useAuth();
  const { colors: C, shadow } = useTheme();
  const { t, isRTL } = useLanguage();
  const S = useMemo(() => styles(C, shadow), [C, shadow]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleReset = async () => {
    setError("");

    if (!password.trim()) {
      setError(isRTL ? "يرجى إدخال كلمة المرور الجديدة" : "Please enter a new password");
      return;
    }
    if (password.length < 6) {
      setError(t("passwordTooShort") || (isRTL ? "كلمة المرور قصيرة جداً (6 أحرف على الأقل)" : "Password too short (min 6 characters)"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("passwordMismatch") || t("authPasswordMismatch") || (isRTL ? "كلمات المرور غير متطابقة" : "Passwords do not match"));
      return;
    }

    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (err) {
      setError(err.message);
    } else {
      setSuccess(true);
      // Clear recovery flag and navigate to main app after a brief delay
      setTimeout(() => {
        clearPasswordRecovery();
        router.replace("/(tabs)");
      }, 2000);
    }
  };

  if (success) {
    return (
      <View style={S.root}>
        <View style={S.centerWrap}>
          <Text style={S.successIcon}>✅</Text>
          <Text style={S.successTitle}>
            {isRTL ? "تم تغيير كلمة المرور بنجاح" : "Password Changed Successfully"}
          </Text>
          <Text style={S.successSub}>
            {isRTL ? "جاري تحويلك..." : "Redirecting..."}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={S.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={S.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={S.card}>
            <Text style={S.title}>
              {isRTL ? "إعادة تعيين كلمة المرور" : "Reset Password"}
            </Text>
            <Text style={S.subtitle}>
              {isRTL ? "أدخل كلمة المرور الجديدة" : "Enter your new password"}
            </Text>

            {!!error && (
              <View style={S.errorBox}>
                <Text style={S.errorText}>⚠️ {error}</Text>
              </View>
            )}

            <Text style={S.label}>{t("newPassword")}</Text>
            <TextInput
              style={[S.input, { textAlign: isRTL ? "right" : "left" }]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={C.textMuted}
              secureTextEntry
              autoFocus
            />

            <Text style={S.label}>{t("confirmPassword")}</Text>
            <TextInput
              style={[S.input, { textAlign: isRTL ? "right" : "left" }]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              placeholderTextColor={C.textMuted}
              secureTextEntry
            />

            <TouchableOpacity
              style={[S.submitBtn, loading && { opacity: 0.6 }]}
              onPress={handleReset}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={S.submitText}>
                  {isRTL ? "تغيير كلمة المرور" : "Change Password"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = (C: any, shadow: any) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.background },
    scroll: {
      flexGrow: 1,
      justifyContent: "center",
      padding: spacing.lg,
    },
    centerWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.lg,
    },
    successIcon: { fontSize: 48, marginBottom: 16 },
    successTitle: {
      fontSize: 22,
      fontWeight: "700",
      color: C.text,
      marginBottom: 8,
      textAlign: "center",
    },
    successSub: {
      fontSize: 15,
      color: C.textMuted,
      textAlign: "center",
    },
    card: {
      backgroundColor: C.surface,
      borderRadius: radii.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: C.border,
      maxWidth: 440,
      width: "100%" as any,
      alignSelf: "center" as any,
      ...shadow,
    },
    title: {
      fontSize: 24,
      fontWeight: "700",
      color: C.text,
      textAlign: "center",
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 14,
      color: C.textMuted,
      textAlign: "center",
      marginBottom: 20,
    },
    errorBox: {
      backgroundColor: "rgba(220,38,38,0.1)",
      borderRadius: radii.sm,
      padding: 12,
      marginBottom: 14,
    },
    errorText: { color: C.danger, fontSize: 13 },
    label: {
      fontSize: 13,
      color: C.textMuted,
      marginBottom: 6,
      marginTop: 12,
    },
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
    submitBtn: {
      backgroundColor: C.primary,
      borderRadius: radii.md,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 24,
      ...shadow,
    },
    submitText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  });
