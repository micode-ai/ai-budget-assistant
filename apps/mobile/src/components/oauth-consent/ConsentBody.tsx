import React from 'react';
import { ActivityIndicator, Image, Linking, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ConsentState } from '@/features/oauth-consent/useConsent';
import { hostnameOf, safeExternalUrl, scopeIcon, scopeLabelKey } from '@/features/oauth-consent/consentDisplay';
import type { OAuthConsentAccount } from '@/services/oauth.api';

interface ConsentBodyProps {
  consent: ConsentState;
  /** Desktop web: Allow/Deny side by side; phone: stacked, Allow on top. */
  desktop: boolean;
}

function goHome() {
  router.replace('/(tabs)' as never);
}

/**
 * Everything the consent page shows, shared by the phone layout and the desktop card. It never
 * renders a link built from the request's `redirect_uri`: the only way out to the third party is
 * Allow/Deny, which navigate to the server's `redirectTo`.
 */
export function ConsentBody({ consent, desktop }: ConsentBodyProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  if (consent.status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.muted}>{t('oauthConsent.loading')}</Text>
      </View>
    );
  }

  if (consent.status === 'error') {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={40} color={theme.colors.danger} />
        <Text style={styles.title}>{t('oauthConsent.errorTitle')}</Text>
        <Text style={styles.bodyCentered}>{t(`oauthConsent.errors.${consent.error ?? 'generic'}`)}</Text>
        <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={goHome} accessibilityRole="button">
          <Text style={[styles.buttonText, { color: theme.colors.primary }]}>{t('oauthConsent.goHome')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const app = consent.app;
  if (!app) return null;

  if (consent.status === 'done') {
    return (
      <View style={styles.centered}>
        <Ionicons name="checkmark-circle-outline" size={40} color={theme.colors.success} />
        <Text style={styles.title}>{t('oauthConsent.doneTitle')}</Text>
        <Text style={styles.bodyCentered}>{t('oauthConsent.doneBody', { app: app.name })}</Text>
        <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={goHome} accessibilityRole="button">
          <Text style={[styles.buttonText, { color: theme.colors.primary }]}>{t('oauthConsent.goHome')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const submitting = consent.status === 'submitting';
  const hasSelectable = consent.accounts.some((a) => a.selectable);
  const nothingTicked = consent.selectedAccountIds.length === 0;
  const homepageUrl = safeExternalUrl(app.homepageUrl);
  const homepage = homepageUrl ? hostnameOf(homepageUrl) : null;
  const privacyUrl = safeExternalUrl(app.privacyPolicyUrl);

  const allowButton = (
    <TouchableOpacity
      key="allow"
      style={[styles.button, styles.buttonPrimary, desktop && styles.buttonDesktop, (nothingTicked || submitting) && styles.inactive]}
      onPress={() => void consent.allow()}
      disabled={nothingTicked || submitting}
      accessibilityRole="button"
      accessibilityState={{ disabled: nothingTicked || submitting }}
    >
      {consent.pendingDecision === 'allow' ? (
        <ActivityIndicator color={theme.colors.textInverse} />
      ) : (
        <Text style={[styles.buttonText, { color: theme.colors.textInverse }]}>{t('oauthConsent.allow')}</Text>
      )}
    </TouchableOpacity>
  );
  const denyButton = (
    <TouchableOpacity
      key="deny"
      style={[styles.button, styles.buttonSecondary, desktop && styles.buttonDesktop, submitting && styles.inactive]}
      onPress={() => void consent.deny()}
      disabled={submitting}
      accessibilityRole="button"
      accessibilityState={{ disabled: submitting }}
    >
      {consent.pendingDecision === 'deny' ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        <Text style={[styles.buttonText, { color: theme.colors.primary }]}>{t('oauthConsent.deny')}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.content}>
      <View style={styles.appHeader}>
        {app.logoUrl ? (
          <Image source={{ uri: app.logoUrl }} style={styles.logo} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.logo, styles.logoFallback]}>
            <Text style={styles.logoLetter}>{app.name.trim().charAt(0).toUpperCase() || '?'}</Text>
          </View>
        )}
        <Text style={styles.title}>{app.name}</Text>
        <View style={[styles.badge, app.isVerified ? styles.badgeVerified : styles.badgeUnverified]}>
          <Ionicons
            name={app.isVerified ? 'shield-checkmark' : 'warning'}
            size={app.isVerified ? 14 : 16}
            color={app.isVerified ? theme.colors.success : theme.colors.warning}
          />
          {/* Unverified must stand out (M2): warning colour on the icon and border, primary text so it stays readable. */}
          <Text
            style={[
              styles.badgeText,
              app.isVerified ? { color: theme.colors.success } : styles.badgeTextUnverified,
            ]}
          >
            {app.isVerified ? t('oauthConsent.verified') : t('oauthConsent.notVerified')}
          </Text>
        </View>
        {app.developerName ? (
          <Text style={styles.muted}>{t('oauthConsent.byDeveloper', { name: app.developerName })}</Text>
        ) : null}
        <View style={styles.links}>
          {homepage && homepageUrl ? (
            <TouchableOpacity onPress={() => void Linking.openURL(homepageUrl)} accessibilityRole="link">
              <Text style={styles.link}>{homepage}</Text>
            </TouchableOpacity>
          ) : null}
          {privacyUrl ? (
            <TouchableOpacity onPress={() => void Linking.openURL(privacyUrl)} accessibilityRole="link">
              <Text style={styles.link}>{t('oauthConsent.privacyPolicy')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('oauthConsent.wantsTo', { app: app.name })}</Text>
        {consent.scopes.map((scope) => (
          <View key={scope} style={styles.scopeRow}>
            <Ionicons name={scopeIcon(scope)} size={18} color={theme.colors.primary} />
            <Text style={styles.body}>{t(scopeLabelKey(scope))}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('oauthConsent.accountTitle')}</Text>
        {consent.isReconsent ? <Text style={styles.warning}>{t('oauthConsent.reconsentNote')}</Text> : null}
        {consent.accounts.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            selected={consent.selectedAccountIds.includes(account.id)}
            disabled={submitting}
            onSelect={consent.toggle}
          />
        ))}
        {!hasSelectable ? (
          <Text style={styles.warning}>{t('oauthConsent.noSelectable')}</Text>
        ) : nothingTicked ? (
          <Text style={styles.warning}>{t('oauthConsent.accountsHint')}</Text>
        ) : null}
      </View>

      {consent.submitError ? (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={18} color={theme.colors.danger} />
          <Text style={[styles.body, { color: theme.colors.danger }]}>{t(`oauthConsent.errors.${consent.submitError}`)}</Text>
        </View>
      ) : null}

      <View style={[styles.actions, desktop && styles.actionsDesktop]}>
        {desktop ? [denyButton, allowButton] : [allowButton, denyButton]}
      </View>

      <Text style={styles.footer}>{t('oauthConsent.footer', { app: app.name })}</Text>
    </View>
  );
}

interface AccountRowProps {
  account: OAuthConsentAccount;
  selected: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
}

function AccountRow({ account, selected, disabled, onSelect }: AccountRowProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const blocked = !account.selectable;
  const reason =
    account.reason === 'viewer'
      ? t('oauthConsent.reasonViewer')
      : account.reason === 'encrypted'
        ? t('oauthConsent.reasonEncrypted')
        : null;

  return (
    <TouchableOpacity
      style={[styles.accountRow, selected && styles.accountRowSelected, blocked && styles.accountRowBlocked]}
      onPress={blocked || disabled ? undefined : () => onSelect(account.id)}
      activeOpacity={blocked ? 1 : 0.7}
      disabled={blocked || disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: blocked || disabled }}
    >
      <Ionicons
        name={blocked ? 'lock-closed-outline' : selected ? 'checkbox' : 'square-outline'}
        size={20}
        color={blocked ? theme.colors.textDisabled : selected ? theme.colors.primary : theme.colors.textSecondary}
      />
      <View style={styles.accountText}>
        <Text style={[styles.accountName, blocked && { color: theme.colors.textTertiary }]} numberOfLines={1}>
          {account.name}
        </Text>
        <Text style={styles.caption}>
          {t(`accounts.types.${account.type}`)} · {t(`accounts.roles.${account.role}`)}
        </Text>
        {reason ? <Text style={styles.caption}>{reason}</Text> : null}
        {account.selectable && account.readOnly ? (
          <Text style={[styles.caption, { color: theme.colors.warning }]}>{t('oauthConsent.readOnlyEncrypted')}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  content: {
    gap: theme.spacing[5],
  },
  centered: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[4],
    paddingVertical: theme.spacing[10],
  },
  appHeader: {
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: theme.borderRadius.lg,
  },
  logoFallback: {
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  logoLetter: {
    ...theme.textStyles.h2,
    color: theme.colors.primaryDark,
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  badge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2.5],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
  },
  badgeVerified: {
    backgroundColor: theme.colors.successLight,
  },
  badgeUnverified: {
    backgroundColor: theme.colors.warningLight,
    borderWidth: 1.5,
    borderColor: theme.colors.warning,
    paddingVertical: theme.spacing[1.5],
  },
  badgeText: {
    ...theme.textStyles.bodySmMedium,
  },
  badgeTextUnverified: {
    color: theme.colors.textPrimary,
    fontWeight: '700' as const,
  },
  links: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[4],
  },
  link: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textLink,
  },
  section: {
    gap: theme.spacing[2.5],
  },
  sectionTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  scopeRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[3],
  },
  body: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  bodyCentered: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  muted: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  caption: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  warning: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  accountRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  accountRowSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  accountRowBlocked: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  accountText: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  errorBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.dangerLight,
  },
  actions: {
    gap: theme.spacing[3],
  },
  actionsDesktop: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
  },
  button: {
    minHeight: 48,
    paddingHorizontal: theme.spacing[5],
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    alignSelf: 'stretch' as const,
  },
  buttonDesktop: {
    flex: 1,
    minHeight: 44,
  },
  buttonPrimary: {
    backgroundColor: theme.colors.primary,
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: 'transparent',
  },
  buttonText: {
    ...theme.textStyles.button,
  },
  inactive: {
    opacity: 0.5,
  },
  footer: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
});
