import React, { useMemo } from "react";
import {
  FlatList, I18nManager, Modal, SafeAreaView, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { crossAlert } from "../lib/alert";
import { useNotification, NotificationItem, NotificationType } from "../context/NotificationContext";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { spacing, radii } from "../constants/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const TYPE_CONFIG: Record<NotificationType, { icon: string; color: string }> = {
  rent_due_reminder: { icon: "🔔", color: "#3B82F6" },
  overdue_rent: { icon: "⚠️", color: "#EF4444" },
  lease_expiry_warning: { icon: "📋", color: "#F59E0B" },
  payment_received: { icon: "✅", color: "#10B981" },
};

function relativeTime(ts: number, t: (k: any) => string): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return t("today");
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString();
}

function groupLabel(ts: number, t: (k: any) => string): string {
  const now = new Date();
  const d = new Date(ts);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  if (ts >= todayStart) return t("today");
  if (ts >= yesterdayStart) return t("yesterday");
  return t("earlier");
}

export function NotificationCenter({ visible, onClose }: Props) {
  const { notifications, markAsRead, markAllAsRead, clearAll, unreadCount } = useNotification();
  const { t, isRTL } = useLanguage();
  const { colors: C, shadow } = useTheme();
  const S = useMemo(() => styles(C, shadow), [C, shadow]);

  // Group notifications
  const sections = useMemo(() => {
    const groups: { label: string; data: NotificationItem[] }[] = [];
    let currentLabel = "";
    for (const n of notifications) {
      const label = groupLabel(n.timestamp, t);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, data: [] });
      }
      groups[groups.length - 1].data.push(n);
    }
    return groups;
  }, [notifications, t]);

  const handleClear = () => {
    crossAlert(t("clearAllNotifications"), t("clearAllConfirm"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("clearAllNotifications"), style: "destructive", onPress: clearAll },
    ]);
  };

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const cfg = TYPE_CONFIG[item.type];
    return (
      <TouchableOpacity
        style={[S.item, !item.read && S.itemUnread]}
        onPress={() => markAsRead(item.id)}
        activeOpacity={0.7}
      >
        <View style={[S.iconCircle, { backgroundColor: cfg.color + "18" }]}>
          <Text style={S.itemIcon}>{cfg.icon}</Text>
        </View>
        <View style={[S.itemContent, isRTL && { alignItems: "flex-end" }]}>
          <Text style={[S.itemTitle, isRTL && { textAlign: "right" }, !item.read && { fontWeight: "700" }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[S.itemBody, isRTL && { textAlign: "right" }]} numberOfLines={1}>
            {item.body}
          </Text>
        </View>
        <View style={S.itemRight}>
          <Text style={S.itemTime}>{relativeTime(item.timestamp, t)}</Text>
          {!item.read && <View style={S.unreadDot} />}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = (label: string) => (
    <Text style={[S.sectionLabel, isRTL && { textAlign: "right" }]}>{label}</Text>
  );

  // Flatten with section headers
  const flatData = useMemo(() => {
    const result: (NotificationItem | { _header: string })[] = [];
    for (const section of sections) {
      result.push({ _header: section.label });
      result.push(...section.data);
    }
    return result;
  }, [sections]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={S.container}>
        {/* Header */}
        <View style={[S.header, isRTL && { flexDirection: "row-reverse" }]}>
          <Text style={S.headerTitle}>{t("notifications")}</Text>
          <View style={[S.headerActions, isRTL && { flexDirection: "row-reverse" }]}>
            {unreadCount > 0 && (
              <TouchableOpacity onPress={markAllAsRead} style={S.headerBtn}>
                <Text style={[S.headerBtnText, { color: C.primary }]}>{t("markAllRead")}</Text>
              </TouchableOpacity>
            )}
            {notifications.length > 0 && (
              <TouchableOpacity onPress={handleClear} style={S.headerBtn}>
                <Text style={[S.headerBtnText, { color: "#EF4444" }]}>{t("clearAllNotifications")}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={S.closeBtn}>
              <Text style={S.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* List */}
        {notifications.length === 0 ? (
          <View style={S.empty}>
            <Text style={S.emptyIcon}>🔔</Text>
            <Text style={S.emptyText}>{t("noNotifications")}</Text>
          </View>
        ) : (
          <FlatList
            data={flatData}
            keyExtractor={(item, i) => ("_header" in item ? `h_${i}` : item.id)}
            renderItem={({ item }) =>
              "_header" in item
                ? renderSectionHeader(item._header)
                : renderItem({ item })
            }
            contentContainerStyle={S.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
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
    headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    headerBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    headerBtnText: { fontSize: 13, fontWeight: "600" },
    closeBtn: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: C.surface, alignItems: "center", justifyContent: "center",
    },
    closeBtnText: { fontSize: 16, color: C.textMuted, fontWeight: "600" },
    list: { paddingBottom: 40 },
    sectionLabel: {
      fontSize: 13, fontWeight: "600", color: C.textMuted,
      paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 4,
      textTransform: "uppercase",
    },
    item: {
      flexDirection: I18nManager.isRTL ? "row-reverse" : "row",
      alignItems: "center",
      paddingHorizontal: spacing.md, paddingVertical: 12,
      gap: 12,
    },
    itemUnread: { backgroundColor: C.primary + "08" },
    iconCircle: {
      width: 40, height: 40, borderRadius: 20,
      alignItems: "center", justifyContent: "center",
    },
    itemIcon: { fontSize: 18 },
    itemContent: { flex: 1 },
    itemTitle: { fontSize: 14, fontWeight: "500", color: C.text, marginBottom: 2 },
    itemBody: { fontSize: 12, color: C.textMuted },
    itemRight: { alignItems: "center", gap: 4 },
    itemTime: { fontSize: 11, color: C.textMuted },
    unreadDot: {
      width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary,
    },
    empty: { flex: 1, alignItems: "center", justifyContent: "center" },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyText: { fontSize: 16, color: C.textMuted },
  });
