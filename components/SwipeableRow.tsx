import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { I18nManager, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

const SINGLE_ACTION_WIDTH = 70;
const SWIPE_THRESHOLD = 50;

interface Props {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  onMarkPaid?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  markPaidLabel?: string;
  markPaidIcon?: string;
  markPaidColor?: string;
  borderRadius?: number;
  onSwipeOpen?: () => void;
  onSwipeClose?: () => void;
  showHint?: boolean;
  isRTL?: boolean;
}

export interface SwipeableRowRef {
  close: () => void;
}

export const SwipeableRow = forwardRef<SwipeableRowRef, Props>(
  function SwipeableRow(
    {
      children,
      onEdit,
      onDelete,
      onMarkPaid,
      editLabel = "Edit",
      deleteLabel = "Delete",
      markPaidLabel = "Paid",
      markPaidIcon = "✅",
      markPaidColor = "#22C55E",
      borderRadius = 12,
      onSwipeOpen,
      onSwipeClose,
      showHint = false,
      isRTL = false,
    },
    ref,
  ) {
    const actionCount = (onMarkPaid ? 1 : 0) + (onEdit ? 1 : 0) + (onDelete ? 1 : 0);
    const ACTION_WIDTH = actionCount * SINGLE_ACTION_WIDTH;
    const translateX = useSharedValue(0);
    const startX = useSharedValue(0);
    const isOpen = useSharedValue(false);
    const hasPlayedHint = useRef(false);

    // Direction multiplier: LTR slides left (-1), RTL slides right (+1)
    const dir = isRTL ? 1 : -1;

    const SPRING = { damping: 22, stiffness: 220, mass: 0.4 };

    // Swipe hint animation: briefly slide and back on mount
    useEffect(() => {
      if (showHint && !hasPlayedHint.current) {
        hasPlayedHint.current = true;
        translateX.value = withDelay(
          500,
          withSequence(
            withSpring(dir * 40, { damping: 14, stiffness: 200, mass: 0.4 }),
            withSpring(0, SPRING),
          ),
        );
      }
    }, [showHint]);

    const closeRow = useCallback(() => {
      translateX.value = withSpring(0, SPRING);
      isOpen.value = false;
    }, []);

    const triggerLightHaptic = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, []);

    const triggerMediumHaptic = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, []);

    useImperativeHandle(ref, () => ({ close: closeRow }), [closeRow]);

    const pan = Gesture.Pan()
      .activeOffsetX([-10, 10])
      .failOffsetY([-5, 5])
      .onStart(() => {
        startX.value = translateX.value;
      })
      .onUpdate((e) => {
        const raw = startX.value + e.translationX;
        if (isRTL) {
          // RTL: slide right to reveal actions on the left
          if (raw < 0) {
            translateX.value = raw * 0.15;
          } else if (raw > ACTION_WIDTH) {
            const over = raw - ACTION_WIDTH;
            translateX.value = ACTION_WIDTH + over * 0.15;
          } else {
            translateX.value = raw;
          }
        } else {
          // LTR: slide left to reveal actions on the right
          if (raw > 0) {
            translateX.value = raw * 0.15;
          } else if (raw < -ACTION_WIDTH) {
            const over = raw + ACTION_WIDTH;
            translateX.value = -ACTION_WIDTH + over * 0.15;
          } else {
            translateX.value = raw;
          }
        }
      })
      .onEnd((e) => {
        const projected = startX.value + e.translationX;
        const vx = e.velocityX;

        if (isRTL) {
          if (!isOpen.value) {
            if (projected > SWIPE_THRESHOLD || vx > 500) {
              translateX.value = withSpring(ACTION_WIDTH, SPRING);
              isOpen.value = true;
              runOnJS(triggerLightHaptic)();
              if (onSwipeOpen) runOnJS(onSwipeOpen)();
            } else {
              translateX.value = withSpring(0, SPRING);
            }
          } else {
            if (projected < ACTION_WIDTH - SWIPE_THRESHOLD || vx < -500) {
              translateX.value = withSpring(0, SPRING);
              isOpen.value = false;
              if (onSwipeClose) runOnJS(onSwipeClose)();
            } else {
              translateX.value = withSpring(ACTION_WIDTH, SPRING);
            }
          }
        } else {
          if (!isOpen.value) {
            if (projected < -SWIPE_THRESHOLD || vx < -500) {
              translateX.value = withSpring(-ACTION_WIDTH, SPRING);
              isOpen.value = true;
              runOnJS(triggerLightHaptic)();
              if (onSwipeOpen) runOnJS(onSwipeOpen)();
            } else {
              translateX.value = withSpring(0, SPRING);
            }
          } else {
            if (
              projected > -ACTION_WIDTH + SWIPE_THRESHOLD ||
              vx > 500
            ) {
              translateX.value = withSpring(0, SPRING);
              isOpen.value = false;
              if (onSwipeClose) runOnJS(onSwipeClose)();
            } else {
              translateX.value = withSpring(-ACTION_WIDTH, SPRING);
            }
          }
        }
      })
      .onFinalize((_e, success) => {
        if (!success) {
          if (isRTL) {
            if (translateX.value > ACTION_WIDTH / 2) {
              translateX.value = withSpring(ACTION_WIDTH, SPRING);
              isOpen.value = true;
            } else {
              translateX.value = withSpring(0, SPRING);
              isOpen.value = false;
            }
          } else {
            if (translateX.value < -ACTION_WIDTH / 2) {
              translateX.value = withSpring(-ACTION_WIDTH, SPRING);
              isOpen.value = true;
            } else {
              translateX.value = withSpring(0, SPRING);
              isOpen.value = false;
            }
          }
        }
      });

    const contentStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
    }));

    // Fade + scale action buttons as the card reveals them
    const actionsStyle = useAnimatedStyle(() => {
      const progress = interpolate(
        isRTL ? translateX.value : -translateX.value,
        [0, ACTION_WIDTH * 0.3, ACTION_WIDTH],
        [0, 0.5, 1],
        "clamp",
      );
      return {
        opacity: progress,
        transform: [
          { scale: interpolate(progress, [0, 1], [0.65, 1], "clamp") },
        ],
      };
    });

    return (
      <View style={[styles.outer, { borderRadius }]}>
        {/* Action buttons — fade/scale in as card slides */}
        <Animated.View style={[
          styles.actions,
          {
            borderRadius,
            width: ACTION_WIDTH,
            // I18nManager auto-mirrors left/right when isRTL, so we must
            // counteract: if both isRTL and I18nManager.isRTL are true,
            // setting left:0 gets mirrored to right:0 — use right:0 instead
            // so it gets mirrored back to left:0 (where we want it).
            flexDirection: "row",
            ...(isRTL
              ? I18nManager.isRTL
                ? { right: 0 }   // gets auto-mirrored to left:0 ✓
                : { left: 0 }
              : I18nManager.isRTL
                ? { left: 0 }    // gets auto-mirrored to right:0 ✓
                : { right: 0 }),
          },
          actionsStyle,
        ]}>
          {onMarkPaid && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: markPaidColor }]}
              onPress={() => {
                triggerMediumHaptic();
                closeRow();
                setTimeout(onMarkPaid, 200);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.actionIcon}>{markPaidIcon}</Text>
              <Text style={styles.actionLabel}>{markPaidLabel}</Text>
            </TouchableOpacity>
          )}
          {onEdit && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: "#0284C7" }]}
              onPress={() => {
                triggerMediumHaptic();
                closeRow();
                setTimeout(onEdit, 200);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.actionIcon}>✏️</Text>
              <Text style={styles.actionLabel}>{editLabel}</Text>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: "#DC2626",
                  ...(isRTL
                    ? { borderTopLeftRadius: borderRadius, borderBottomLeftRadius: borderRadius }
                    : { borderTopRightRadius: borderRadius, borderBottomRightRadius: borderRadius }),
                },
              ]}
              onPress={() => {
                triggerMediumHaptic();
                closeRow();
                setTimeout(onDelete, 200);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.actionIcon}>🗑️</Text>
              <Text style={styles.actionLabel}>{deleteLabel}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Sliding content */}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.content, contentStyle]}>
            {children}
          </Animated.View>
        </GestureDetector>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  outer: {
    overflow: "hidden",
    position: "relative",
  },
  actions: {
    position: "absolute",
    top: 0,
    bottom: 0,
    overflow: "hidden",
  },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionIcon: { fontSize: 17 },
  actionLabel: { color: "#fff", fontSize: 11, fontWeight: "700" },
  content: {},
});
