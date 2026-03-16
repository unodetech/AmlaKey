import React from "react";
import { Platform, TouchableOpacity, Text, View, StyleSheet, Keyboard } from "react-native";

/**
 * Web-compatible date input.
 * On web: renders a native HTML <input type="date"> for reliable date selection.
 * On native: renders a button that opens the native DateTimePicker (caller manages picker visibility).
 */

interface WebDateInputProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  label?: string;
  style?: any;
  textColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderRadius?: number;
  error?: boolean;
}

export function WebDateInput({
  value,
  onChange,
  label,
  style,
  textColor = "#fff",
  backgroundColor = "transparent",
  borderColor = "#333",
  borderRadius = 12,
  error,
}: WebDateInputProps) {
  if (Platform.OS === "web") {
    return (
      <View
        style={[
          {
            backgroundColor,
            borderRadius,
            padding: 13,
            borderWidth: 1,
            borderColor: error ? "#EF4444" : borderColor,
            marginBottom: 10,
          },
          style,
        ]}
      >
        {/* @ts-ignore - HTML input element for web platform */}
        <input
          type="date"
          value={value}
          onChange={(e: any) => {
            const val = e.target.value;
            if (val) onChange(val);
          }}
          style={{
            background: "transparent",
            border: "none",
            color: textColor,
            fontSize: 14,
            fontFamily: "inherit",
            width: "100%",
            outline: "none",
            cursor: "pointer",
            padding: 0,
            margin: 0,
            colorScheme: textColor === "#fff" || textColor.startsWith("#f") || textColor.startsWith("#e") || textColor.startsWith("#d") || textColor.startsWith("#c") ? "dark" : "light",
          }}
        />
      </View>
    );
  }

  // Native: just a label, caller manages DateTimePicker visibility
  return null;
}

/**
 * Helper: Returns the right style for modal backdrop based on platform.
 * On web: absolute fill so it doesn't compete with modal content layout.
 * On native: flex: 1 for the bottom-sheet pattern.
 */
export const modalBackdropStyle = Platform.OS === "web"
  ? { ...StyleSheet.absoluteFillObject, zIndex: 0 } as any
  : { flex: 1 };

const isWeb = Platform.OS === "web";

/**
 * Web-safe modal overlay that replaces the backdrop TouchableOpacity pattern.
 * On web: Uses DOM onClick on the overlay for dismiss, no backdrop element needed.
 *         This avoids React Native Web's responder system intercepting clicks on inputs.
 * On native: Uses the classic TouchableOpacity backdrop with absoluteFillObject.
 */
export function ModalOverlay({
  onDismiss,
  style,
  children,
}: {
  onDismiss: () => void;
  style?: any;
  children: React.ReactNode;
}) {
  if (isWeb) {
    return (
      <View style={style} {...{ onClick: onDismiss } as any}>
        {children}
      </View>
    );
  }
  return (
    <View style={style}>
      <TouchableOpacity
        style={{ ...StyleSheet.absoluteFillObject }}
        activeOpacity={1}
        onPress={() => { Keyboard.dismiss(); onDismiss(); }}
      />
      {children}
    </View>
  );
}

/**
 * Props to spread on modal content wrappers on web to stop click propagation
 * (prevents dismiss when clicking inside the modal content).
 */
export const webContentClickStop = isWeb
  ? { onClick: (e: any) => e.stopPropagation() } as any
  : {};
