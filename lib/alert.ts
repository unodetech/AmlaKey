/**
 * Cross-platform alert helpers.
 * On native: uses React Native's Alert.alert (supports buttons, cancel styles, etc.)
 * On web: uses window.alert / window.confirm since RN Alert.alert does not work on web.
 */
import { Alert, Platform } from "react-native";

const isWeb = Platform.OS === "web";

interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

/**
 * Show a simple informational alert (OK button only).
 */
export function showAlert(title: string, message?: string, onDismiss?: () => void): void {
  if (isWeb) {
    window.alert(message ? `${title}\n\n${message}` : title);
    onDismiss?.();
  } else {
    Alert.alert(title, message, [{ text: "OK", onPress: onDismiss }]);
  }
}

/**
 * Show a confirmation dialog (OK / Cancel).
 * Returns a promise that resolves to true if confirmed, false if cancelled.
 */
export function showConfirm(
  title: string,
  message?: string,
): Promise<boolean> {
  if (isWeb) {
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "OK", onPress: () => resolve(true) },
    ]);
  });
}

/**
 * Full cross-platform alert with custom buttons.
 * On web, falls back to window.alert (single button) or window.confirm (two+ buttons).
 * The last non-cancel button's onPress is called on confirm; cancel button's onPress on dismiss.
 */
export function crossAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
): void {
  if (!isWeb) {
    Alert.alert(title, message, buttons);
    return;
  }

  // Web fallback
  if (!buttons || buttons.length <= 1) {
    window.alert(message ? `${title}\n\n${message}` : title);
    buttons?.[0]?.onPress?.();
    return;
  }

  // Find the cancel button and the primary action button
  const cancelBtn = buttons.find((b) => b.style === "cancel");
  const actionBtn = buttons.find((b) => b.style !== "cancel") ?? buttons[buttons.length - 1];

  const confirmed = window.confirm(message ? `${title}\n\n${message}` : title);
  if (confirmed) {
    actionBtn?.onPress?.();
  } else {
    cancelBtn?.onPress?.();
  }
}
