import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { isGroupLinkCode } from '@/features/groups/groupLink';
import { processGroupLink, stashPendingGroupLink } from '@/features/groups/processGroupLink';
import { GroupButton } from './GroupButton';

/**
 * Target of the guest page's "Open in the app" / "Continue in the browser app" button
 * (`/groups/link?code=...`). Signed in: spend the code and open the group. Signed out: keep the
 * code, send the person to create an account, and let `useGroupLinkDeepLink` finish once they are in.
 */
export function GroupLinkView({ code }: { code?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const valid = isGroupLinkCode(code);

  useEffect(() => {
    if (!valid || !code) return;
    if (isAuthenticated) {
      void processGroupLink(code, 'replace');
      return;
    }
    void stashPendingGroupLink(code)
      .catch((e) => console.warn('[GroupLinkView] stash failed:', e))
      .finally(() => router.replace('/(auth)/register' as never));
  }, [valid, code, isAuthenticated]);

  if (!valid) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.centered}>
          <Text style={styles.text}>{t('groups.linkInvalid')}</Text>
          <GroupButton
            label={t('groups.title')}
            onPress={() => router.replace('/groups' as never)}
            variant="secondary"
            style={styles.button}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.text}>{t('groups.linkWorking')}</Text>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing[6],
    gap: theme.spacing[4],
  },
  text: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  button: {
    alignSelf: 'stretch' as const,
  },
});
