import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { api } from './api';
import { useAccountStore } from '@/stores/accountStore';

// Configure foreground notification display (native only — expo-notifications
// throws "not available on web" for the handler API).
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications are not supported on web.
  if (Platform.OS === 'web') {
    return null;
  }
  try {
    if (!Device.isDevice) {
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    // Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4ECDC4',
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    if (!projectId) {
      console.warn('[Notifications] No EAS projectId found, skipping push token registration. Configure EAS to enable push notifications.');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Send token to server
    try {
      await api.updatePushToken(token);
    } catch (e) {
      console.error('[Notifications] Failed to send token to server:', e);
    }

    return token;
  } catch (e) {
    // Gracefully handle errors (e.g., Expo Go doesn't support push notifications since SDK 53)
    console.warn('[Notifications] Registration failed:', e);
    return null;
  }
}

export async function unregisterPushNotifications(): Promise<void> {
  try {
    await api.updatePushToken(null);
  } catch (e) {
    console.error('[Notifications] Failed to clear token:', e);
  }
}

export function handleNotificationResponse(
  response: Notifications.NotificationResponse,
): void {
  const data = response.notification.request.content.data;
  if (!data?.type) return;

  switch (data.type) {
    case 'budget_alert':
      if (data.budgetId) {
        router.push(`/budget/${data.budgetId}`);
      }
      break;
    case 'shared_expense':
      router.push('/(tabs)/expenses');
      break;
    case 'chat_mention': {
      const conversationId = data.conversationId ? String(data.conversationId) : undefined;
      const accountId = data.accountId ? String(data.accountId) : undefined;
      // The mentioned conversation belongs to `accountId`; switch to it so the
      // chat screen loads under the right account context.
      if (accountId) {
        const accountStore = useAccountStore.getState();
        if (accountStore.currentAccountId !== accountId && accountStore.accounts.some((a) => a.id === accountId)) {
          accountStore.switchAccount(accountId);
        }
      }
      router.push(
        conversationId
          ? { pathname: '/(tabs)/chat', params: { conversationId } }
          : '/(tabs)/chat',
      );
      break;
    }
    case 'spending_anomaly':
      router.push('/alerts' as any);
      break;
    default:
      break;
  }
}

export function setupNotificationListeners(): () => void {
  // Web no-op — listener APIs throw on web.
  if (Platform.OS === 'web') {
    return () => {};
  }

  const notificationSub = Notifications.addNotificationReceivedListener((_notification) => {
    // foreground notification received — no debug logging needed
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener(
    handleNotificationResponse,
  );

  return () => {
    notificationSub.remove();
    responseSub.remove();
  };
}
