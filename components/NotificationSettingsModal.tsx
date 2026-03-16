import React, { useEffect, useMemo, useState } from "react";
import {
  Modal, Platform, SafeAreaView, ScrollView, StyleSheet, Switch,
  Text, TouchableOpacity, View,
} from "react-native";
const isWeb = Platform.OS === "web";
let Haptics: typeof import("expo-haptics") | null = null;
if (!isWeb) {
  Haptics = require("expo-haptics");
}
import { useNotification, NotificationSettings, DEFAULT_SETTINGS } from "../context/NotificationContext";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { spacing, radii } from "../constants/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const RENT_DAY_OPTIONS = [1, 3, 5, 7];
const LEASE_DAY_OPTIONS = [7, 14, 30];

export function NotificationSettingsModal({ visible, onClose }: Props) {
  const { settings, updateSettings, requestPermission, permissionGranted } = useNotification();
  const { t, isRTL } = useLanguage();
  const { colors: C, shadow } = useTheme();
  const S = useMemo(() => styles(C, shadow), [C, shadow]);

  const [local, setLocal] = useState<NotificationSettings>(settings);

  // Sync local state when modal opens
  useEffect(() => {
    if (visible) setLocal(settings);
  }, [visible, settings]);

  const handleSave = async () => {
    Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (!permissionGranted) await requestPermission();
    await updateSettings(local);
    onClose();
  };

  const toggle = (key: keyof NotificationSettings) => {
    Haptics?.selectionAsync();
    setLocal((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setDays = (key: "rentReminderDaysBefore" | "leaseExpiryDaysBefore", val: number) => {
    Haptics?.selectionAsync();
    setLocal((prev) => ({ ...prev, [key]: val }));
  };

  const ToggleRow = ({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) => (
    <View style={[S.row, isRTL && { flexDirection: "row-reverse" }]}>
      <Text style={[S.rowLabel, isRTL && { textAlign: "right" }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: C.border, true: C.primary + "60" }}
        thumbColor={value ? C.primary : "#fff"}
      />
    </View>
  );

  const ChipSelector = ({ options, selected, onSelect }: { options: number[]; selected: number; onSelect: (v: number) => void }) => (
    <View style={[S.chipRow, isRTL && { flexDirection: "row-reverse" }]}>
      {options.map((v) => {
        const active = v === selected;
        return (
          <TouchableOpacity
            key={v}
            style={[S.chip, active && { backgroundColor: C.primary }]}
            onPress={() => onSelect(v)}
            activeOpacity={0.7}
          >
            <Text style={[S.chipText, active && { color: "#fff" }]}>
              {v} {t("daysLabel")}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <Modal visible={visible} animationType={Platform.OS === 'web' ? 'fade' : 'slide'} presentationStyle={Platform.OS === 'web' ? undefined : 'pageSheet'} transparent={Platform.OS === 'web'} onRequestClose={onClose}>
      {Platform.OS === 'web' ? (
        <View style={S.webOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
          <View style={S.webModalBox}>
            <View style={[S.header, isRTL && { flexDirection: "row-reverse" }]}>
              <Text style={S.headerTitle}>{t("notificationSettings")}</Text>
              <TouchableOpacity onPress={onClose} style={S.closeBtn}>
                <Text style={S.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={S.body} showsVerticalScrollIndicator={false}>
              {!permissionGranted && (
                <View style={S.permBanner}>
                  <Text style={[S.permText, isRTL && { textAlign: "right" }]}>
                    ⚠️ {t("notifPermissionNeeded")}
                  </Text>
                </View>
              )}
              <View style={S.card}>
                <ToggleRow label={`🔔  ${t("rentDueReminders")}`} value={local.rentRemindersEnabled} onToggle={() => toggle("rentRemindersEnabled")} />
                {local.rentRemindersEnabled && (
                  <View style={S.subSection}>
                    <Text style={[S.subLabel, isRTL && { textAlign: "right" }]}>{t("remindDaysBefore")}</Text>
                    <ChipSelector options={RENT_DAY_OPTIONS} selected={local.rentReminderDaysBefore} onSelect={(v) => setDays("rentReminderDaysBefore", v)} />
                  </View>
                )}
              </View>
              <View style={S.card}>
                <ToggleRow label={`⚠️  ${t("overdueAlerts")}`} value={local.overdueAlertsEnabled} onToggle={() => toggle("overdueAlertsEnabled")} />
              </View>
              <View style={S.card}>
                <ToggleRow label={`📋  ${t("leaseExpiryAlerts")}`} value={local.leaseExpiryEnabled} onToggle={() => toggle("leaseExpiryEnabled")} />
                {local.leaseExpiryEnabled && (
                  <View style={S.subSection}>
                    <Text style={[S.subLabel, isRTL && { textAlign: "right" }]}>{t("alertDaysBefore")}</Text>
                    <ChipSelector options={LEASE_DAY_OPTIONS} selected={local.leaseExpiryDaysBefore} onSelect={(v) => setDays("leaseExpiryDaysBefore", v)} />
                  </View>
                )}
              </View>
              <View style={S.card}>
                <ToggleRow label={`✅  ${t("paymentConfirmations")}`} value={local.paymentConfirmationEnabled} onToggle={() => toggle("paymentConfirmationEnabled")} />
              </View>
              <View style={S.card}>
                <ToggleRow label={`🔊  ${t("notificationSound")}`} value={local.soundEnabled} onToggle={() => toggle("soundEnabled")} />
              </View>
              <TouchableOpacity style={[S.saveBtn, { backgroundColor: C.primary }]} onPress={handleSave} activeOpacity={0.8}>
                <Text style={S.saveBtnText}>{t("saveSettings")}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        </View>
      ) : (
      <SafeAreaView style={S.container}>
        {/* Header */}
        <View style={[S.header, isRTL && { flexDirection: "row-reverse" }]}>
          <Text style={S.headerTitle}>{t("notificationSettings")}</Text>
          <TouchableOpacity onPress={onClose} style={S.closeBtn}>
            <Text style={S.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={S.body} showsVerticalScrollIndicator={false}>
          {/* Permission warning */}
          {!permissionGranted && (
            <View style={S.permBanner}>
              <Text style={[S.permText, isRTL && { textAlign: "right" }]}>
                ⚠️ {t("notifPermissionNeeded")}
              </Text>
            </View>
          )}

          {/* Rent Reminders */}
          <View style={S.card}>
            <ToggleRow label={`🔔  ${t("rentDueReminders")}`} value={local.rentRemindersEnabled} onToggle={() => toggle("rentRemindersEnabled")} />
            {local.rentRemindersEnabled && (
              <View style={S.subSection}>
                <Text style={[S.subLabel, isRTL && { textAlign: "right" }]}>{t("remindDaysBefore")}</Text>
                <ChipSelector options={RENT_DAY_OPTIONS} selected={local.rentReminderDaysBefore} onSelect={(v) => setDays("rentReminderDaysBefore", v)} />
              </View>
            )}
          </View>

          {/* Overdue Alerts */}
          <View style={S.card}>
            <ToggleRow label={`⚠️  ${t("overdueAlerts")}`} value={local.overdueAlertsEnabled} onToggle={() => toggle("overdueAlertsEnabled")} />
          </View>

          {/* Lease Expiry */}
          <View style={S.card}>
            <ToggleRow label={`📋  ${t("leaseExpiryAlerts")}`} value={local.leaseExpiryEnabled} onToggle={() => toggle("leaseExpiryEnabled")} />
            {local.leaseExpiryEnabled && (
              <View style={S.subSection}>
                <Text style={[S.subLabel, isRTL && { textAlign: "right" }]}>{t("alertDaysBefore")}</Text>
                <ChipSelector options={LEASE_DAY_OPTIONS} selected={local.leaseExpiryDaysBefore} onSelect={(v) => setDays("leaseExpiryDaysBefore", v)} />
              </View>
            )}
          </View>

          {/* Payment Confirmations */}
          <View style={S.card}>
            <ToggleRow label={`✅  ${t("paymentConfirmations")}`} value={local.paymentConfirmationEnabled} onToggle={() => toggle("paymentConfirmationEnabled")} />
          </View>

          {/* Sound */}
          <View style={S.card}>
            <ToggleRow label={`🔊  ${t("notificationSound")}`} value={local.soundEnabled} onToggle={() => toggle("soundEnabled")} />
          </View>

          {/* Save */}
          <TouchableOpacity style={[S.saveBtn, { backgroundColor: C.primary }]} onPress={handleSave} activeOpacity={0.8}>
            <Text style={S.saveBtnText}>{t("saveSettings")}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
      )}
    </Modal>
  );
}

const styles = (C: any, shadow: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
    },
    headerTitle: { fontSize: 20, fontWeight: "700", color: C.text },
    closeBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: C.surface, alignItems: "center", justifyContent: "center",
    },
    closeBtnText: { fontSize: 16, color: C.textMuted, fontWeight: "600" },
    body: { padding: spacing.md, paddingBottom: 40 },
    permBanner: {
      backgroundColor: "#FEF3C7", borderRadius: radii.md,
      padding: spacing.sm, marginBottom: spacing.md,
    },
    permText: { fontSize: 13, color: "#92400E" },
    card: {
      backgroundColor: C.surface, borderRadius: radii.lg,
      padding: spacing.sm, marginBottom: spacing.sm,
      ...shadow,
    },
    row: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingVertical: 8, paddingHorizontal: 4,
    },
    rowLabel: { fontSize: 15, fontWeight: "500", color: C.text, flex: 1 },
    subSection: { paddingHorizontal: 4, paddingBottom: 8, paddingTop: 4 },
    subLabel: { fontSize: 13, color: C.textMuted, marginBottom: 8 },
    chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
    chip: {
      paddingHorizontal: 14, paddingVertical: 8,
      borderRadius: radii.md, backgroundColor: C.background,
      borderWidth: 1, borderColor: C.border,
    },
    chipText: { fontSize: 13, fontWeight: "600", color: C.text },
    saveBtn: {
      borderRadius: radii.lg, paddingVertical: 14,
      alignItems: "center", marginTop: spacing.md,
    },
    saveBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
    webOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", paddingHorizontal: 16 },
    webModalBox: { maxWidth: 520, width: "100%", maxHeight: "85%" as any, backgroundColor: C.background, borderRadius: 20, overflow: "hidden" },
  });
