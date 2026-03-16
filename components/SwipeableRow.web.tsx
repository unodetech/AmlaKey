import React, { forwardRef, useCallback, useImperativeHandle, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

const SINGLE_ACTION_WIDTH = 70;

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

/**
 * Web fallback for SwipeableRow.
 * Shows action buttons on hover instead of swipe gestures.
 */
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
      markPaidIcon = "\u2705",
      markPaidColor = "#22C55E",
      borderRadius = 12,
      onSwipeOpen,
      onSwipeClose,
      showHint: _showHint = false,
      isRTL = false,
    },
    ref,
  ) {
    const [hovered, setHovered] = useState(false);
    const actionCount = (onMarkPaid ? 1 : 0) + (onEdit ? 1 : 0) + (onDelete ? 1 : 0);
    const ACTION_WIDTH = actionCount * SINGLE_ACTION_WIDTH;

    const close = useCallback(() => {
      setHovered(false);
    }, []);

    useImperativeHandle(ref, () => ({ close }), [close]);

    if (actionCount === 0) {
      return <View style={{ borderRadius, overflow: "hidden" }}>{children}</View>;
    }

    return (
      <View
        style={[styles.outer, { borderRadius }]}
        // @ts-ignore - web-only event handlers
        onMouseEnter={() => {
          setHovered(true);
          onSwipeOpen?.();
        }}
        onMouseLeave={() => {
          setHovered(false);
          onSwipeClose?.();
        }}
      >
        {/* Action buttons - shown on hover */}
        {hovered && (
          <View
            style={[
              styles.actions,
              {
                borderRadius,
                width: ACTION_WIDTH,
                ...(isRTL ? { left: 0 } : { right: 0 }),
              },
            ]}
          >
            {onMarkPaid && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: markPaidColor }]}
                onPress={onMarkPaid}
                activeOpacity={0.85}
              >
                <Text style={styles.actionIcon}>{markPaidIcon}</Text>
                <Text style={styles.actionLabel}>{markPaidLabel}</Text>
              </TouchableOpacity>
            )}
            {onEdit && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: "#0284C7" }]}
                onPress={onEdit}
                activeOpacity={0.85}
              >
                <Text style={styles.actionIcon}>{"\u270F\uFE0F"}</Text>
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
                onPress={onDelete}
                activeOpacity={0.85}
              >
                <Text style={styles.actionIcon}>{"\uD83D\uDDD1\uFE0F"}</Text>
                <Text style={styles.actionLabel}>{deleteLabel}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Content */}
        <View
          style={[
            styles.content,
            hovered && {
              transform: [{ translateX: isRTL ? ACTION_WIDTH : -ACTION_WIDTH }],
            },
            { transition: "transform 0.2s ease" } as any,
          ]}
        >
          {children}
        </View>
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
    flexDirection: "row",
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
