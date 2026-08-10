import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ColumnMapping } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

export type MappingRole =
  | 'date' | 'amount' | 'debit' | 'credit' | 'description' | 'currency' | 'counterparty';

export interface MappingEntry {
  role: MappingRole;
  column: string;
}

/**
 * Flatten a ColumnMapping into display order. `amount` is either one column or
 * a debit/credit pair, never both, so the pair replaces it rather than joining
 * it. Optional columns appear only when the file actually had them — an absent
 * currency column is meaningful (see `currencyAssumed`) and must not be shown
 * as an empty chip.
 */
export function describeMapping(mapping: ColumnMapping): MappingEntry[] {
  const entries: MappingEntry[] = [{ role: 'date', column: mapping.date }];

  if (typeof mapping.amount === 'string') {
    entries.push({ role: 'amount', column: mapping.amount });
  } else {
    entries.push({ role: 'debit', column: mapping.amount.debit });
    entries.push({ role: 'credit', column: mapping.amount.credit });
  }

  entries.push({ role: 'description', column: mapping.description });
  if (mapping.currency) entries.push({ role: 'currency', column: mapping.currency });
  if (mapping.counterparty) entries.push({ role: 'counterparty', column: mapping.counterparty });

  return entries;
}

const ROLE_KEY: Record<MappingRole, string> = {
  date: 'bankImport.aiRoleDate',
  amount: 'bankImport.aiRoleAmount',
  debit: 'bankImport.aiRoleDebit',
  credit: 'bankImport.aiRoleCredit',
  description: 'bankImport.aiRoleDescription',
  currency: 'bankImport.aiRoleCurrency',
  counterparty: 'bankImport.aiRoleCounterparty',
};

interface Props {
  mapping: ColumnMapping;
  bankLabel?: string;
  onEdit: () => void;
}

export default function AiMappingChips({ mapping, bankLabel, onEdit }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <TouchableOpacity style={styles.card} onPress={onEdit} activeOpacity={0.7}>
      <View style={styles.header}>
        <Ionicons name="sparkles-outline" size={16} color={theme.colors.primary} />
        <Text style={styles.headerText}>{t('bankImport.aiInferredBy')}</Text>
        <Text style={styles.editText}>{t('bankImport.aiInferredEdit')}</Text>
      </View>

      {bankLabel ? (
        <Text style={styles.bankGuess}>{t('bankImport.aiBankGuess', { bank: bankLabel })}</Text>
      ) : null}

      <View style={styles.chips}>
        {describeMapping(mapping).map((e) => (
          <View key={`${e.role}:${e.column}`} style={styles.chip}>
            <Text style={styles.chipText}>
              {t(ROLE_KEY[e.role])} → {e.column}
            </Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    marginHorizontal: theme.spacing[4],
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[3],
    gap: theme.spacing[2],
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  headerText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  editText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.primary,
  },
  bankGuess: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  chips: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  chip: {
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 4,
  },
  chipText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
  },
});
