import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

/**
 * The consent page's back arrow when there is no history to go back to — on web it is usually
 * opened in a fresh tab by a third-party site. It goes to the app's home, never to the third
 * party (the only way back there is Allow/Deny, through the server's `redirectTo`).
 */
export function HeaderHomeBack({ tintColor }: { tintColor?: string }) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={() => router.replace('/(tabs)' as never)}
      accessibilityRole="button"
      accessibilityLabel={t('oauthConsent.goHome')}
      hitSlop={8}
      style={{ paddingHorizontal: 8 }}
    >
      <Ionicons name="arrow-back" size={24} color={tintColor} />
    </TouchableOpacity>
  );
}
