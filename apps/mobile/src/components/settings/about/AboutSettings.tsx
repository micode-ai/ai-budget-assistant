import React from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getLegalUrls } from '@/constants/legal';
import Constants from 'expo-constants';

import { displayVersion } from '@/features/about/displayVersion';
import { SettingsScreenScroll } from '../SettingsScreenScroll';

/**
 * The about screen's body: app version, and the way out to help, support and
 * the two legal documents.
 *
 * Lifted out of `app/settings/about.tsx` unchanged so the desktop settings shell
 * can host it - `src/` may not import from `app/`, so a route file is not
 * somewhere a pane can render from. The route is now a thin wrapper around
 * `SettingsRoute`, which is the one file that decides mobile vs desktop.
 *
 * Two differences from the original body, both mechanical and both required by
 * that hosting: the outer `SafeAreaView` is gone (`SettingsScreenFrame` supplies
 * it on the full-page path, with the same `edges={[]}` and the same
 * background), and the root `ScrollView` is `SettingsScreenScroll` - the same
 * `ScrollView` full-page, a plain `View` in a pane, because the shell owns the
 * page scroll and a nested scroller would be the second scrollbar the language
 * forbids.
 *
 * **A pane that navigates out of the shell.** The help row is a plain
 * `router.push('/help')`, which leaves settings entirely rather than swapping
 * the right pane - correct, because help is not a settings destination and the
 * registry has no entry for it. The other three rows are `Linking.openURL` to
 * the hosted legal pages, which on web opens in the same tab. Neither is
 * changed by the move: both were already navigation out of a screen, and a
 * screen is a screen whether a route or a pane renders it.
 */
export function AboutSettings() {
  const { t, i18n } = useTranslation();
  const legalUrls = getLegalUrls(i18n.language);
  const theme = useTheme();
  const styles = useStyles(createStyles);

  // `+<sha>` on web only, where `EXPO_PUBLIC_BUILD_SHA` is set by
  // `web-deploy.yml`; native ships no sha and shows the bare version. See
  // `displayVersion` for why the web needs a build id at all.
  const appVersion = displayVersion(
    Constants.expoConfig?.version || '1.0.0',
    process.env.EXPO_PUBLIC_BUILD_SHA,
  );

  return (
    <SettingsScreenScroll style={styles.scrollView} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>{t('settings.version')}</Text>
          <Text style={styles.fieldValue}>{appVersion}</Text>
        </View>
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.fieldRow}
          onPress={() => router.push('/help' as any)}
        >
          <View style={styles.fieldValueRow}>
            <Ionicons name="help-circle-outline" size={18} color={theme.colors.textSecondary} />
            <Text style={styles.fieldLabel}>{t('help.title')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.fieldRow}
          onPress={() => Linking.openURL(legalUrls.support)}
        >
          <Text style={styles.fieldLabel}>{t('settings.support')}</Text>
          <Ionicons name="mail-outline" size={18} color={theme.colors.textTertiary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.fieldRow}
          onPress={() => Linking.openURL(legalUrls.privacyPolicy)}
        >
          <View style={styles.fieldValueRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.textSecondary} />
            <Text style={styles.fieldLabel}>{t('legal.privacyPolicy')}</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={theme.colors.textTertiary} />
        </TouchableOpacity>
        <View style={styles.divider} />
        <TouchableOpacity
          style={styles.fieldRow}
          onPress={() => Linking.openURL(legalUrls.termsOfService)}
        >
          <View style={styles.fieldValueRow}>
            <Ionicons name="document-text-outline" size={18} color={theme.colors.textSecondary} />
            <Text style={styles.fieldLabel}>{t('legal.termsOfService')}</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={theme.colors.textTertiary} />
        </TouchableOpacity>
      </View>
    </SettingsScreenScroll>
  );
}

const createStyles = (theme: Theme) => ({
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  fieldRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: 32,
  },
  fieldLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },
  fieldValue: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  fieldValueRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[3],
  },
});
