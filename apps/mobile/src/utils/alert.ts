import { Alert, Platform, type AlertButton, type AlertOptions } from 'react-native';
import { useAlertDialogStore } from '@/stores/alertDialogStore';

/**
 * Cross-platform alert.
 *
 * react-native-web (0.21) ships a stubbed `Alert` whose `alert()` is a complete
 * no-op (`class Alert { static alert() {} }`). That means every `Alert.alert(...)`
 * call silently does nothing on the web build — validation messages never show,
 * and buttons that rely on an alert for feedback (e.g. "Save expense" when a
 * required field is empty) appear completely dead. This wrapper renders an in-app
 * dialog on web (via `alertDialogStore` + `AlertDialogHost`) while delegating to
 * the real native `Alert.alert` everywhere else.
 *
 * The web path used to call `window.alert`/`window.confirm`. Those block the
 * renderer until answered, which froze the whole tab and ignored the app's
 * theme; more importantly they made web behave differently from native, where
 * `Alert.alert` has always returned immediately and delivered the answer
 * through `onPress`. Both platforms are now non-blocking, so no call site can
 * depend on code after `showAlert(...)` running only once the user answered —
 * such a call site was already broken on native.
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

  useAlertDialogStore.getState().show({
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
  });
}
