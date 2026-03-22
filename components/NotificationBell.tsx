import React from "react";
import { I18nManager, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNotification } from "../context/NotificationContext";
import { useTheme } from "../context/ThemeContext";

interface Props {
  onPress: () => void;
}

export function NotificationBell({ onPress }: Props) {
  const { unreadCount } = useNotification();
  const { colors: C } = useTheme();
  const isRTL = I18nManager.isRTL;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.btn, { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }]}
      activeOpacity={0.7}
    >
      <Text style={styles.icon}>🔔</Text>
      {unreadCount > 0 && (
        <View style={[styles.badge, { [isRTL ? "left" : "right"]: -4 }]}>
          <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 18 },
  badge: {
    position: "absolute",
    top: -4,
    backgroundColor: "#FF3B30",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
});
