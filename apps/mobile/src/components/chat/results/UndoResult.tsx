import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles } from '@/theme';
import { createSharedResultStyles } from './sharedResultStyles';

/**
 * The result of a successful `undo_last_action`. `data` is whatever
 * `AiToolsService.executeUndoLastAction` returned — either an expense/income/debt entity
 * (`undoneEntityType: 'expense' | 'income'`, `amount`/`currencyCode`/`description`) or a goal
 * balance revert (`undoneEntityType: 'goal'`, `goalName`). Mirrors `CreateSuccessResult`'s shape
 * deliberately — same "what just happened" card, opposite direction.
 */
export function UndoResult({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createSharedResultStyles);

  const kind = String(data.undoneEntityType ?? '');
  const amount = data.amount != null ? Number(data.amount) : null;
  const currencyCode = data.currencyCode ? String(data.currencyCode) : '';
  const description = data.description ? String(data.description) : '';
  const goalName = data.goalName ? String(data.goalName) : '';

  const detail = kind === 'goal'
    ? goalName
    : amount != null
      ? `${amount.toFixed(2)} ${currencyCode}${description ? ` — ${description}` : ''}`
      : '';

  return (
    <View style={[styles.card, styles.successCard]}>
      <View style={styles.header}>
        <Ionicons name="arrow-undo-circle" size={18} color={theme.colors.success} />
        <Text style={[styles.headerText, { color: theme.colors.success }]}>
          {t('chat.resultUndone')}
        </Text>
      </View>
      {detail ? <Text style={styles.successDetail}>{detail}</Text> : null}
    </View>
  );
}
