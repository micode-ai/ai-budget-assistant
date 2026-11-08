import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccountStore } from '@/stores/accountStore';
import { isDemoAccountId } from '@/features/demo/demoAccount';
import { exitDemo } from '@/features/demo/demoSession';
import { useStyles, type Theme } from '@/theme';

/** Persistent strip shown while the user is viewing local-only sample data. Renders nothing otherwise. */
export function DemoBanner() {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const isDemo = useAccountStore((s) => isDemoAccountId(s.currentAccountId));
  const [busy, setBusy] = useState(false);
  if (!isDemo) return null;

  const startFresh = async () => {
    setBusy(true);
    try {
      await exitDemo();
      router.replace('/get-started');
    } catch (e) {
      console.warn('Failed to leave sample data', e);
      setBusy(false);
    }
  };

  return (
    <View style={styles.bar} accessibilityRole="alert">
      <Text style={styles.text} numberOfLines={2}>{t('demo.banner')}</Text>
      <TouchableOpacity onPress={startFresh} disabled={busy} accessibilityRole="button">
        {busy ? <ActivityIndicator size="small" /> : <Text style={styles.action}>{t('demo.startFresh')}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  bar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.warning + '26',
  },
  text: { flex: 1, ...theme.textStyles.caption, color: theme.colors.textPrimary },
  action: { ...theme.textStyles.caption, fontFamily: theme.fonts.bold, color: theme.colors.primary },
});
