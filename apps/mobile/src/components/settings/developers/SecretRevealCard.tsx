import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SheetDialog } from '@/components/SheetDialog';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { RevealedSecret } from '@/stores/developerAppsStore';
import { CopyField } from './CopyField';

const TITLE_ID = 'developer-app-secret-title';

interface Props {
  secret: RevealedSecret | null;
  onAcknowledge: () => void;
}

/**
 * The client secret, shown exactly once after a create or a rotate.
 *
 * Deliberately undismissable except by its own "I've saved it" button — the same treatment as the
 * E2EE recovery key in `SecuritySettings`: `dismissable={false}` turns off Esc / Android back / the
 * desktop outside click, and `dismissOnScrimPress={false}` the phone scrim. The secret cannot be
 * recovered once this closes, so it must not close by accident. `SheetDialog` adds `insets.bottom`
 * (ABA-483), so the button never sits under the system navigation bar.
 *
 * The value comes from `developerAppsStore.revealedSecret` (memory only) and is never logged.
 */
export function SecretRevealCard({ secret, onAcknowledge }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <SheetDialog
      visible={secret !== null}
      onClose={onAcknowledge}
      titleId={TITLE_ID}
      dismissable={false}
      dismissOnScrimPress={false}
    >
      {secret && (
        <View style={styles.body}>
          <View style={styles.header}>
            <Ionicons name="key-outline" size={22} color={theme.colors.warning} />
            <Text nativeID={TITLE_ID} style={styles.title} accessibilityRole="header">
              {t('developerApps.secret.title')}
            </Text>
          </View>
          {secret.appName ? <Text style={styles.appName}>{secret.appName}</Text> : null}
          <Text style={styles.warning}>{t('developerApps.secret.body')}</Text>
          {secret.clientId ? <CopyField label={t('developerApps.clientId')} value={secret.clientId} /> : null}
          <CopyField label={t('developerApps.clientSecret')} value={secret.clientSecret} />
          <TouchableOpacity style={styles.primaryButton} onPress={onAcknowledge} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>{t('developerApps.secret.saved')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SheetDialog>
  );
}

const createStyles = (theme: Theme) => ({
  body: { gap: theme.spacing[4] },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2] },
  title: { ...theme.textStyles.h3, color: theme.colors.textPrimary, flex: 1 },
  appName: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  warning: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.warningLight,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.spacing[4],
  },
  primaryButtonText: { ...theme.textStyles.button, color: theme.colors.textInverse },
});
