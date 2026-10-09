import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { isGroupLinkCode } from '@/features/groups/groupLink';
import {
  mergeGroupLink,
  processGroupLink,
  stashPendingGroupLink,
  type GroupLinkMergeOffer,
} from '@/features/groups/processGroupLink';
import { GroupButton } from './GroupButton';

/**
 * Target of the guest page's "Open in the app" / "Continue in the browser app" button
 * (`/groups/link?code=...`). Signed in: spend the code and open the group. Signed out: keep the
 * code, send the person to create an account, and let `useGroupLinkDeepLink` finish once they are in.
 *
 * ABA-657: when the person is ALREADY in that group under their app account, the screen offers to
 * merge the browser name into it (the server put the unspent code back for exactly that). The same
 * centred transient screen serves the phone and desktop web.
 */
export function GroupLinkView({ code }: { code?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const valid = isGroupLinkCode(code);
  const [offer, setOffer] = useState<GroupLinkMergeOffer | null>(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    if (!valid || !code) return;
    if (isAuthenticated) {
      void processGroupLink(code, 'replace', setOffer);
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

  if (offer && code) {
    const merge = async () => {
      setMerging(true);
      try {
        await mergeGroupLink(code);
      } finally {
        setMerging(false);
      }
    };
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.centered}>
          <Text style={styles.title}>{t('groups.linkMergeTitle')}</Text>
          <Text style={styles.text}>
            {t('groups.linkMergeBody', { guest: offer.guestName, me: offer.myName })}
          </Text>
          {offer.guestBalance !== undefined && offer.currencyCode ? (
            <Text style={styles.text}>
              {t('groups.linkMergeBalance', {
                guest: offer.guestName,
                balance: formatCurrency(offer.guestBalance, offer.currencyCode),
              })}
            </Text>
          ) : null}
          <Text style={styles.warning}>{t('groups.mergeIrreversible')}</Text>
          <GroupButton
            label={t('groups.linkMergeAction', { guest: offer.guestName })}
            onPress={merge}
            loading={merging}
            write
            style={styles.button}
          />
          <GroupButton
            label={t('groups.linkMergeNotNow')}
            onPress={() => router.replace('/groups' as never)}
            variant="secondary"
            disabled={merging}
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
    // Desktop web: a readable column instead of full-window buttons; no effect at phone width.
    width: '100%' as const,
    maxWidth: 480,
    alignSelf: 'center' as const,
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  text: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  warning: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
  button: {
    alignSelf: 'stretch' as const,
  },
});
