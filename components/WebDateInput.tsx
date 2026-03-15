import React from "react";
import { Platform, TouchableOpacity, Text, View, StyleSheet } from "react-native";

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
  ? (StyleSheet.absoluteFill as any)
  : { flex: 1 };
