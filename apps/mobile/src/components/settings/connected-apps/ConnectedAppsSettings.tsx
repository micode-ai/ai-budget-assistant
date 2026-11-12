import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { getIntlLocale } from '@/i18n';
import type { ConnectedApp } from '@/services/developerApps.api';
import { useConnectedAppsStore } from '@/stores/connectedAppsStore';
import { useDeveloperAppsStore } from '@/stores/developerAppsStore';
import { connectedAppWebsiteUrl, scopeIcon, scopeLabelKey } from '@/features/oauth-consent/consentDisplay';
import { SettingsScreenScroll } from '../SettingsScreenScroll';
import { useSettingsPane } from '../SettingsPaneContext';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(getIntlLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Settings → Connected apps (Public API phase 1): third-party apps connected to the user's accounts,
 * one card per app listing its accounts, with their permissions and a Disconnect action.
 *
 * The server lists only accounts where the caller is owner or editor, so a viewer never sees a row
 * they could not revoke — no client-side role gating is needed or wanted here. Permission lines
 * reuse the consent screen's `oauthConsent.scopes.*` keys, so the user reads the same words they
 * agreed to. Confirmations go through `showAlert` (the in-app dialog on web).
 */
export function ConnectedAppsSettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { bottomInset } = useSettingsPane();

  const availability = useDeveloperAppsStore((s) => s.availability);
  const items = useConnectedAppsStore((s) => s.items);
  const loaded = useConnectedAppsStore((s) => s.loaded);
  const isLoading = useConnectedAppsStore((s) => s.isLoading);
  const error = useConnectedAppsStore((s) => s.error);
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void useConnectedAppsStore.getState().load();
    }, []),
  );

  const confirmDisconnect = (item: ConnectedApp) =>
    showAlert(
      t('connectedApps.disconnectConfirmTitle', { app: item.app.name }),
      item.isGrantor
        ? t('connectedApps.disconnectConfirmBody', { app: item.app.name })
        : t('connectedApps.disconnectSharedConfirmMessage', { app: item.app.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('connectedApps.disconnect'),
          style: 'destructive',
          onPress: () => void disconnect(item.grantId),
        },
      ],
    );

  const accountLabel = (name: string | null) => name ?? t('connectedApps.accountGone');

  const confirmRemoveAccount = (item: ConnectedApp, account: ConnectedApp['accounts'][number]) =>
    showAlert(
      t('connectedApps.removeAccountConfirmTitle', { account: accountLabel(account.name) }),
      t('connectedApps.removeAccountConfirmMessage', { app: item.app.name, account: accountLabel(account.name) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('connectedApps.removeAccount'),
          style: 'destructive',
          onPress: () => void removeAccount(item.grantId, account.id),
        },
      ],
    );

  const removeAccount = async (grantId: string, accountId: string) => {
    setBusyId(grantId);
    try {
      await useConnectedAppsStore.getState().removeAccount(grantId, accountId);
    } catch {
      showAlert(t('common.error'), t('connectedApps.disconnectError'));
    } finally {
      setBusyId(null);
    }
  };

  const disconnect = async (grantId: string) => {
    setBusyId(grantId);
    try {
      await useConnectedAppsStore.getState().disconnect(grantId);
    } catch {
      showAlert(t('common.error'), t('connectedApps.disconnectError'));
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = (item: ConnectedApp) => {
    const busy = busyId === item.grantId;
    const website = connectedAppWebsiteUrl(item.app);
    return (
      <View key={item.grantId} style={styles.card}>
        <View style={styles.appHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.app.name.trim().charAt(0).toUpperCase() || '?'}</Text>
          </View>
          <View style={styles.appTitleCol}>
            <Text style={styles.appName} numberOfLines={2}>
              {item.app.name}
            </Text>
            <View style={styles.badges}>
              {item.app.isVerified && (
                <Text style={[styles.badge, styles.badgeSuccess]}>{t('connectedApps.verified')}</Text>
              )}
              {item.app.status === 'blocked' && (
                <Text style={[styles.badge, styles.badgeDanger]}>{t('connectedApps.blocked')}</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.scopes}>
          <Text style={styles.label}>{t('connectedApps.permissions')}</Text>
          {item.scopes.map((scope) => (
            <View key={scope} style={styles.scopeRow}>
              <Ionicons name={scopeIcon(scope)} size={16} color={theme.colors.textSecondary} />
              <Text style={styles.scopeText}>{t(scopeLabelKey(scope))}</Text>
            </View>
          ))}
        </View>

        <View style={styles.scopes}>
          <Text style={styles.label}>{t('connectedApps.accountsLabel')}</Text>
          {item.accounts.map((account) => (
            <View key={account.id} style={styles.accountRow}>
              <View style={styles.accountInfo}>
                <Text style={styles.scopeText} numberOfLines={2}>
                  {accountLabel(account.name)} · {t(`accounts.types.${account.type}`)}
                </Text>
                {!account.active && (account.reason === 'role' || account.reason === 'encrypted') && (
                  <Text style={styles.meta}>{t(`connectedApps.accountUnavailable.${account.reason}`)}</Text>
                )}
              </View>
              {item.accounts.length > 1 && (
                <TouchableOpacity
                  disabled={busy}
                  onPress={() => confirmRemoveAccount(item, account)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('connectedApps.removeAccount')}: ${accountLabel(account.name)}`}
                  style={styles.removeBtn}
                >
                  <Ionicons name="close-circle-outline" size={20} color={theme.colors.danger} />
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>

        <Text style={styles.meta}>
          {t('connectedApps.connectedBy', { name: item.connectedBy.name, date: formatDate(item.connectedAt) })}
        </Text>
        <Text style={styles.meta}>
          {item.lastUsedAt
            ? t('connectedApps.lastUsed', { date: formatDate(item.lastUsedAt) })
            : t('connectedApps.neverUsed')}
        </Text>

        <View style={styles.actionsRow}>
          {website && (
            <TouchableOpacity
              style={styles.action}
              onPress={() => void Linking.openURL(website)}
              accessibilityRole="link"
            >
              <Ionicons name="open-outline" size={18} color={theme.colors.primary} />
              <Text style={[styles.actionText, { color: theme.colors.primary }]}>{t('connectedApps.website')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.action}
            disabled={busy}
            onPress={() => confirmDisconnect(item)}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator size="small" color={theme.colors.danger} />
            ) : (
              <Ionicons name="unlink-outline" size={18} color={theme.colors.danger} />
            )}
            <Text style={[styles.actionText, { color: theme.colors.danger }]}>{t('connectedApps.disconnect')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const body = () => {
    if (availability === 'unavailable') {
      return <Text style={styles.muted}>{t('connectedApps.unavailable')}</Text>;
    }
    if (!loaded) {
      return isLoading || !error ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.muted}>{t('connectedApps.loadError')}</Text>
          <TouchableOpacity
            style={styles.retry}
            onPress={() => void useConnectedAppsStore.getState().load()}
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (items.length === 0) {
      return (
        <View style={[styles.card, styles.emptyCard]}>
          <Ionicons name="apps-outline" size={28} color={theme.colors.textTertiary} />
          <Text style={styles.muted}>{t('connectedApps.empty')}</Text>
        </View>
      );
    }
    return items.map(renderItem);
  };

  return (
    <SettingsScreenScroll
      style={styles.scrollView}
      contentContainerStyle={[styles.content, { paddingBottom: theme.spacing[10] + bottomInset }]}
    >
      <Text style={styles.intro}>{t('connectedApps.intro')}</Text>
      {body()}
    </SettingsScreenScroll>
  );
}

const createStyles = (theme: Theme) => ({
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4], gap: theme.spacing[4] },
  centered: { alignItems: 'center' as const, justifyContent: 'center' as const, minHeight: 80 },
  intro: { ...theme.textStyles.body, color: theme.colors.textSecondary },
  muted: { ...theme.textStyles.body, color: theme.colors.textTertiary, textAlign: 'center' as const },
  accountRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2] },
  accountInfo: { flex: 1 },
  removeBtn: { minWidth: 36, minHeight: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
  label: { ...theme.textStyles.label, color: theme.colors.textTertiary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  emptyCard: { alignItems: 'center' as const, paddingVertical: theme.spacing[6] },
  appHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[3] },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  avatarText: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.primary },
  appTitleCol: { flex: 1, gap: theme.spacing[1] },
  appName: { ...theme.textStyles.bodyLargeMedium, color: theme.colors.textPrimary },
  badges: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[1.5] },
  badge: {
    ...theme.textStyles.caption,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    overflow: 'hidden' as const,
  },
  badgeSuccess: { color: theme.colors.success, backgroundColor: theme.colors.successLight },
  badgeDanger: { color: theme.colors.danger, backgroundColor: theme.colors.dangerLight },
  scopes: { gap: theme.spacing[1.5] },
  scopeRow: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: theme.spacing[2] },
  scopeText: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary, flex: 1 },
  meta: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary },
  actionsRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    paddingTop: theme.spacing[3],
  },
  action: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[1.5], minHeight: 36 },
  actionText: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  retry: { alignSelf: 'center' as const, minHeight: 36, justifyContent: 'center' as const },
  linkText: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
});
