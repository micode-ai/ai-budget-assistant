import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useInflationShield } from '@/features/insights/useInflationShield';

export function InflationShieldWidget() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { data, hasEnoughData } = useInflationShield();

  // Hide the card entirely when there's nothing to show (no rising items AND
  // no realized savings) — nothing to stock up on, nothing to celebrate yet.
  const items = data?.items ?? [];
  const savedSoFar = data?.savedSoFar ?? 0;
  if (!hasEnoughData || (items.length === 0 && savedSoFar <= 0)) return null;

  const currency = data?.baseCurrency ?? 'USD';
  const top = items[0];

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => router.push('/inflation-shield')}
    >
      <View style={styles.chevronHint}>
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      </View>
      <View style={styles.titleRow}>
        <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.title}>{t('inflationShield.title')}</Text>
      </View>
      {savedSoFar > 0 && (
        <Text style={styles.saved}>
          {t('inflationShield.savedSoFar')}: {formatCurrency(savedSoFar, currency)}
          <Text style={styles.estimate}> · {t('inflationShield.estimated')}</Text>
        </Text>
      )}
      {top && (
        <Text style={styles.tip} numberOfLines={1}>
          {t('inflationShield.buyAheadTip', {
            product: top.canonicalName,
            save: formatCurrency(top.projectedSaving, currency),
          })}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },
  chevronHint: { position: 'absolute' as const, top: theme.spacing[3], right: theme.spacing[3] },
  titleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: theme.spacing[2] },
  title: { ...theme.textStyles.bodyMedium, color: theme.colors.textPrimary },
  saved: { ...theme.textStyles.h3, color: theme.colors.success, marginTop: theme.spacing[2] },
  estimate: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary },
  tip: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginTop: theme.spacing[1] },
});
