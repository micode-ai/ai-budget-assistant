import React, { useState } from 'react';
import { View, Text, Switch } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { setTelemetryEnabled } from '@/services/telemetry';
import { isTelemetryEnabled } from '@/services/telemetryPreference';

/**
 * The "Share usage statistics" switch — product telemetry on this device.
 *
 * Device-local, default on, and deliberately NOT viewer-gated: it is a
 * personal preference about this device, not a write to any account's data.
 * Turning it off clears whatever is still queued (see `setTelemetryEnabled`).
 *
 * The copy must never call this "anonymous": events are linked to the
 * signed-in account, as the privacy policy says.
 */
export function UsageStatisticsCard() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [enabled, setEnabled] = useState(isTelemetryEnabled);

  const handleToggle = (value: boolean) => {
    setTelemetryEnabled(value);
    setEnabled(value);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('usageStatistics.sectionTitle')}</Text>
      <View style={styles.card}>
        <View style={styles.fieldRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>{t('usageStatistics.toggle')}</Text>
            <Text style={styles.fieldDesc}>{t('usageStatistics.toggleDesc')}</Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            accessibilityLabel={t('usageStatistics.toggle')}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
          />
        </View>
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  section: {
    marginTop: theme.spacing[6],
  },
  sectionTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
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
    gap: theme.spacing[3],
    minHeight: 32,
  },
  fieldLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },
  fieldDesc: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
});
