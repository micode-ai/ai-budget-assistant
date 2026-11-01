import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { showAlert } from '@/utils/alert';
import { getApiBaseUrl } from '@/services/api';
import type { DeveloperApp } from '@/services/developerApps.api';
import { getIntlLocale } from '@/i18n';
import { useDeveloperAppsStore } from '@/stores/developerAppsStore';
import {
  developerAppErrorKey,
  publicApiDocsUrl,
  MAX_APPS_PER_DEVELOPER,
} from '@/features/developers/developerApps';
import { SettingsScreenScroll } from '../SettingsScreenScroll';
import { useSettingsPane } from '../SettingsPaneContext';
import { AppFormSheet } from './AppFormSheet';
import { SecretRevealCard } from './SecretRevealCard';
import { CopyField } from './CopyField';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(getIntlLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Settings → Developers (Public API phase 1): the user's registered OAuth apps — create, edit,
 * rotate the secret, delete; the client id with copy; the docs link in the UI language.
 *
 * Hosted by `SettingsRoute`: a `form`-width pane on desktop web, a full page elsewhere. Apps belong
 * to the user, not an account, so nothing here reacts to an account switch, and there is no viewer
 * gating — any signed-in user may register apps. Confirmations go through `showAlert`, which is the
 * in-app dialog on web (never `window.alert`).
 */
export function DevelopersSettings() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { bottomInset } = useSettingsPane();

  const availability = useDeveloperAppsStore((s) => s.availability);
  const apps = useDeveloperAppsStore((s) => s.apps);
  const loaded = useDeveloperAppsStore((s) => s.loaded);
  const isLoading = useDeveloperAppsStore((s) => s.isLoading);
  const error = useDeveloperAppsStore((s) => s.error);
  const revealedSecret = useDeveloperAppsStore((s) => s.revealedSecret);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DeveloperApp | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void useDeveloperAppsStore.getState().loadApps();
    }, []),
  );

  const docsUrl = publicApiDocsUrl(i18n.language, getApiBaseUrl());

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (app: DeveloperApp) => {
    setEditing(app);
    setFormOpen(true);
  };

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
    } catch (e) {
      showAlert(t('common.error'), t(developerAppErrorKey(e)));
    } finally {
      setBusyId(null);
    }
  };

  const confirmRotate = (app: DeveloperApp) =>
    showAlert(t('developerApps.rotateConfirmTitle'), t('developerApps.rotateConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('developerApps.rotate'),
        style: 'destructive',
        onPress: () => void run(app.id, () => useDeveloperAppsStore.getState().rotateSecret(app.id)),
      },
    ]);

  const confirmDelete = (app: DeveloperApp) =>
    showAlert(t('developerApps.deleteConfirmTitle', { name: app.name }), t('developerApps.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => void run(app.id, () => useDeveloperAppsStore.getState().deleteApp(app.id)),
      },
    ]);

  const atLimit = apps.length >= MAX_APPS_PER_DEVELOPER;

  const renderApp = (app: DeveloperApp) => {
    const busy = busyId === app.id;
    return (
      <View key={app.id} style={styles.card}>
        <View style={styles.appHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{app.name.trim().charAt(0).toUpperCase() || '?'}</Text>
          </View>
          <View style={styles.appTitleCol}>
            <Text style={styles.appName} numberOfLines={2}>
              {app.name}
            </Text>
            <View style={styles.badges}>
              <Text style={styles.badge}>
                {t(app.isConfidential ? 'developerApps.typeConfidential' : 'developerApps.typePublic')}
              </Text>
              {app.isVerified && (
                <Text style={[styles.badge, styles.badgeSuccess]}>{t('developerApps.verified')}</Text>
              )}
              {app.status === 'blocked' && (
                <Text style={[styles.badge, styles.badgeDanger]}>{t('developerApps.blocked')}</Text>
              )}
            </View>
          </View>
          {busy && <ActivityIndicator color={theme.colors.primary} />}
        </View>

        {app.status === 'blocked' && app.blockedReason ? (
          <Text style={styles.blockedText}>{t('developerApps.blockedReason', { reason: app.blockedReason })}</Text>
        ) : null}
        {app.description ? <Text style={styles.description}>{app.description}</Text> : null}

        <CopyField label={t('developerApps.clientId')} value={app.clientId} />

        <Text style={styles.meta}>
          {t('developerApps.redirectUrisCount', { count: app.redirectUris.length })}
          {' · '}
          {t('developerApps.connections', { count: app.connectedUsers ?? 0 })}
          {' · '}
          {app.lastUsedAt
            ? t('developerApps.lastUsed', { date: formatDate(app.lastUsedAt) })
            : t('developerApps.neverUsed')}
        </Text>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.action} disabled={busy} onPress={() => openEdit(app)} accessibilityRole="button">
            <Ionicons name="create-outline" size={18} color={theme.colors.textPrimary} />
            <Text style={styles.actionText}>{t('common.edit')}</Text>
          </TouchableOpacity>
          {app.isConfidential && (
            <TouchableOpacity
              style={styles.action}
              disabled={busy}
              onPress={() => confirmRotate(app)}
              accessibilityRole="button"
            >
              <Ionicons name="refresh-outline" size={18} color={theme.colors.textPrimary} />
              <Text style={styles.actionText}>{t('developerApps.rotateSecret')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.action} disabled={busy} onPress={() => confirmDelete(app)} accessibilityRole="button">
            <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
            <Text style={[styles.actionText, { color: theme.colors.danger }]}>{t('common.delete')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const body = () => {
    if (availability === 'unavailable') {
      return <Text style={styles.muted}>{t('developerApps.unavailable')}</Text>;
    }
    if (!loaded) {
      return isLoading || !error ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.muted}>{t('developerApps.loadError')}</Text>
          <TouchableOpacity
            style={styles.retry}
            onPress={() => void useDeveloperAppsStore.getState().loadApps()}
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <>
        <TouchableOpacity
          style={[styles.primaryButton, atLimit && styles.disabled]}
          disabled={atLimit}
          onPress={openCreate}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={20} color={theme.colors.textInverse} />
          <Text style={styles.primaryButtonText}>{t('developerApps.createApp')}</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>{t('developerApps.limitNote', { max: MAX_APPS_PER_DEVELOPER })}</Text>

        {apps.length === 0 ? (
          <View style={[styles.card, styles.emptyCard]}>
            <Ionicons name="code-slash-outline" size={28} color={theme.colors.textTertiary} />
            <Text style={styles.muted}>{t('developerApps.empty')}</Text>
          </View>
        ) : (
          apps.map(renderApp)
        )}
      </>
    );
  };

  return (
    <>
      <SettingsScreenScroll
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: theme.spacing[10] + bottomInset }]}
      >
        <Text style={styles.intro}>{t('developerApps.intro')}</Text>
        <TouchableOpacity
          style={styles.docsLink}
          onPress={() => void Linking.openURL(docsUrl)}
          accessibilityRole="link"
        >
          <Ionicons name="book-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.docsLinkText}>{t('developerApps.docsLink')}</Text>
          <Ionicons name="open-outline" size={18} color={theme.colors.textTertiary} />
        </TouchableOpacity>
        {body()}
      </SettingsScreenScroll>

      <AppFormSheet visible={formOpen} app={editing} onClose={() => setFormOpen(false)} />
      {/* Never stacked over the form: it opens once the form has closed. */}
      <SecretRevealCard
        secret={formOpen ? null : revealedSecret}
        onAcknowledge={() => useDeveloperAppsStore.getState().acknowledgeSecret()}
      />
    </>
  );
}

const createStyles = (theme: Theme) => ({
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4], gap: theme.spacing[3] },
  centered: { alignItems: 'center' as const, justifyContent: 'center' as const, minHeight: 80 },
  intro: { ...theme.textStyles.body, color: theme.colors.textSecondary },
  muted: { ...theme.textStyles.body, color: theme.colors.textTertiary, textAlign: 'center' as const },
  hint: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginBottom: theme.spacing[2] },
  docsLink: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  docsLinkText: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary, flex: 1 },
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
    color: theme.colors.textSecondary,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    overflow: 'hidden' as const,
  },
  badgeSuccess: { color: theme.colors.success, backgroundColor: theme.colors.successLight },
  badgeDanger: { color: theme.colors.danger, backgroundColor: theme.colors.dangerLight },
  blockedText: { ...theme.textStyles.bodySm, color: theme.colors.danger },
  description: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary },
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
  primaryButton: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    minHeight: 48,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.spacing[4],
  },
  primaryButtonText: { ...theme.textStyles.button, color: theme.colors.textInverse },
  disabled: { opacity: 0.5 },
  retry: { alignSelf: 'center' as const, minHeight: 36, justifyContent: 'center' as const },
  linkText: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
});
