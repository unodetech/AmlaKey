import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { showAlert } from "../lib/alert";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, radii } from "../constants/theme";
import { userKey, PERSONAL_INFO_KEY } from "../lib/storage";

interface PersonalInfo {
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  city: string;
  company: string;
}

export default function PersonalInfoScreen() {
  const { t, isRTL } = useLanguage();
  const { colors: C, isDark, shadow } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const S = useMemo(() => styles(C, shadow, isDark), [C, shadow, isDark]);

  const [info, setInfo] = useState<PersonalInfo>({ firstName: "", lastName: "", fullName: "", phone: "", city: "", company: "" });

  // Change password
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const storageKey = user ? userKey(user.id, PERSONAL_INFO_KEY) : null;

  useEffect(() => {
    if (!storageKey) return;
    AsyncStorage.getItem(storageKey).then(val => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          setInfo({
            firstName: parsed.firstName || "",
            lastName: parsed.lastName || "",
            fullName: parsed.fullName || "",
            phone: parsed.phone || "",
            city: parsed.city || "",
            company: parsed.company || "",
          });
        } catch {}
      }
    });
  }, [storageKey]);


  const handleChangePassword = async () => {
    if (newPw.length < 6) { showAlert(t("error"), t("passwordTooShort")); return; }
    if (newPw !== confirmPw) { showAlert(t("error"), t("passwordMismatch")); return; }
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwSaving(false);
    if (error) { showAlert(t("error"), error.message); }
    else {
      showAlert("✅", t("passwordChanged"));
      setNewPw("");
      setConfirmPw("");
    }
  };

  const readOnlyFields: { label: string; value: string }[] = [
    { label: t("firstNameLabel"), value: info.firstName || info.fullName?.split(" ")[0] || "—" },
    { label: t("lastNameLabel"), value: info.lastName || info.fullName?.split(" ").slice(1).join(" ") || "—" },
    { label: t("phoneLabel"), value: info.phone || "—" },
    { label: t("cityLabel"), value: info.city || "—" },
    { label: t("companyLabel"), value: info.company || "—" },
  ];

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
          <Text style={S.headerTitle}>{t("personalInfo")}</Text>
        </View>
        <View style={S.headerSide} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">

        {/* Account info */}
        <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }]}>{t("accountInfo")}</Text>
        <View style={S.card}>
          <View style={[S.infoRow, isRTL && S.rowRev]}>
            <Text style={S.infoLabel}>{t("emailLabel")}</Text>
            <Text style={S.infoValue}>{user?.email || "—"}</Text>
          </View>
        </View>

        {/* Personal fields */}
        <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }, { marginTop: 24 }]}>
          {t("personalInfo")}
        </Text>
        <View style={S.card}>
          {readOnlyFields.map(({ label, value }, idx) => (
            <View key={label}>
              {idx > 0 && <View style={S.divider} />}
              <View style={[S.infoRow, isRTL && S.rowRev]}>
                <Text style={S.infoLabel}>{label}</Text>
                <Text style={[S.infoValue, isRTL && { textAlign: "right" }]}>{value}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Change Password */}
        <Text style={[S.sectionTitle, isRTL && { textAlign: "right" }, { marginTop: 24 }]}>
          {t("changePassword")}
        </Text>
        <View style={S.card}>
          <View style={{ padding: 16 }}>
            <Text style={[S.fieldLabel, isRTL && { textAlign: "right" }]}>{t("newPassword")}</Text>
            <TextInput
              style={[S.input, isRTL && { textAlign: "right" }]}
              value={newPw}
              onChangeText={setNewPw}
              placeholder="••••••"
              placeholderTextColor={C.textMuted}
              secureTextEntry
            />
          </View>
          <View style={S.divider} />
          <View style={{ padding: 16 }}>
            <Text style={[S.fieldLabel, isRTL && { textAlign: "right" }]}>{t("confirmPassword")}</Text>
            <TextInput
              style={[S.input, isRTL && { textAlign: "right" }]}
              value={confirmPw}
              onChangeText={setConfirmPw}
              placeholder="••••••"
              placeholderTextColor={C.textMuted}
              secureTextEntry
            />
          </View>
          <View style={{ padding: 16, paddingTop: 0 }}>
            <TouchableOpacity
              style={[S.pwBtn, pwSaving && { opacity: 0.6 }]}
              onPress={handleChangePassword}
              disabled={pwSaving || (!newPw && !confirmPw)}
              activeOpacity={0.7}
            >
              {pwSaving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={S.pwBtnText}>{t("changePassword")}</Text>}
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = (C: any, shadow: any, isDark: boolean) =>
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

    sectionTitle: { fontSize: 13, fontWeight: "600", color: C.textMuted, marginBottom: 8, marginHorizontal: 4, textTransform: "uppercase" },

    card: {
      backgroundColor: C.surface,
      borderRadius: radii.lg,
      overflow: "hidden",
      ...shadow,
    },
    infoRow: {
      flexDirection: "row", alignItems: "center", padding: 16,
    },
    infoLabel: { fontSize: 14, color: C.textMuted, width: 100 },
    infoValue: { flex: 1, fontSize: 15, color: C.text, fontWeight: "500" },

    divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginLeft: 16 },

    fieldLabel: { fontSize: 12, fontWeight: "600", color: C.textMuted, marginBottom: 6 },
    input: {
      backgroundColor: C.background, borderRadius: radii.sm,
      borderWidth: 1, borderColor: C.border,
      paddingHorizontal: 14, paddingVertical: 11,
      color: C.text, fontSize: 15,
    },
    pwBtn: {
      backgroundColor: C.accent, borderRadius: radii.sm,
      paddingVertical: 13, alignItems: "center", marginTop: 8,
    },
    pwBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  });
