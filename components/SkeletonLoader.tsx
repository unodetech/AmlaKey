import React, { useEffect, useRef } from "react";
import { Animated, I18nManager, StyleSheet, View, ViewStyle } from "react-native";
import { useTheme } from "../context/ThemeContext";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

function SkeletonBox({ width = "100%", height = 16, borderRadius = 8, style }: SkeletonProps) {
  const { colors: C, isDark } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: isDark ? "#374151" : "#E5E7EB",
          opacity,
        },
        style,
      ]}
    />
  );
}

/** A skeleton card that mimics a property/tenant card */
export function SkeletonCard() {
  const { colors: C, shadow } = useTheme();
  const isRTL = I18nManager.isRTL;
  return (
    <View style={[cardStyles.card, { backgroundColor: C.surface, borderColor: C.border }, shadow]}>
      <View style={cardStyles.row}>
        <SkeletonBox width={40} height={40} borderRadius={20} />
        <View style={{ flex: 1, marginLeft: isRTL ? 0 : 12, marginRight: isRTL ? 12 : 0 }}>
          <SkeletonBox width="60%" height={14} style={{ marginBottom: 8 }} />
          <SkeletonBox width="40%" height={12} />
        </View>
        <SkeletonBox width={60} height={24} borderRadius={12} />
      </View>
    </View>
  );
}

/** Multiple skeleton cards for list loading states */
export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
});

export default SkeletonBox;
