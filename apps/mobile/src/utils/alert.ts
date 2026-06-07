import { Alert, Platform, type AlertButton, type AlertOptions } from 'react-native';

/**
 * Cross-platform alert.
 *
 * react-native-web (0.21) ships a stubbed `Alert` whose `alert()` is a complete
 * no-op (`class Alert { static alert() {} }`). That means every `Alert.alert(...)`
 * call silently does nothing on the web build — validation messages never show,
 * and buttons that rely on an alert for feedback (e.g. "Save expense" when a
 * required field is empty) appear completely dead. This wrapper falls back to the
 * browser's native `window.alert` / `window.confirm` on web while delegating to
 * the real native `Alert.alert` everywhere else.
 *
 * Use this instead of `Alert.alert` for any user-facing notice or confirmation
 * that must work on web.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons, options);
    return;
  }

  const text = [title, message].filter(Boolean).join('\n\n');

  // Simple notice (no buttons, or a single acknowledgement button).
  if (!buttons || buttons.length === 0) {
    window.alert(text);
    return;
  }

  if (buttons.length === 1) {
    window.alert(text);
    buttons[0]?.onPress?.();
    return;
  }

  // Confirmation: map OK/Cancel onto window.confirm.
  const cancelButton = buttons.find((b) => b.style === 'cancel');
  const confirmButton =
    buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1];

  if (window.confirm(text)) {
    confirmButton?.onPress?.();
  } else {
    cancelButton?.onPress?.();
  }
}
