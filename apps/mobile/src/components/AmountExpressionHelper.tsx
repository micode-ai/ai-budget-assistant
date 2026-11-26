import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { evaluateAmountExpression } from '@budget/shared-utils';
import { useStyles, type Theme } from '@/theme';

const OPERATORS = ['+', '-', '*', '/', '(', ')'] as const;
const LABELS: Record<string, string> = { '*': '×', '/': '÷', '-': '−' };

interface Props {
  value: string;
  onChange: (next: string) => void;
}

/**
 * Sits under an amount field: an operator row (decimal-pad has no operator keys),
 * a live "= result" preview for a real expression, and a hint when it is invalid.
 * Forms store the evaluated number, never this text.
 */
export function AmountExpressionHelper({ value, onChange }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const result = evaluateAmountExpression(value);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {OPERATORS.map((op) => (
          <TouchableOpacity
            key={op}
            style={styles.key}
            onPress={() => onChange(value + op)}
            accessibilityLabel={op}
          >
            <Text style={styles.keyText}>{LABELS[op] ?? op}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {result.ok && result.isExpression ? (
        <Text style={styles.preview}>{t('amountCalc.result', { value: result.value })}</Text>
      ) : null}
      {!result.ok && result.reason !== 'empty' ? (
        <Text style={styles.hint}>
          {result.reason === 'divide_by_zero' ? t('amountCalc.divideByZero') : t('amountCalc.invalid')}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  wrap: {
    alignItems: 'center' as const,
    marginTop: -theme.spacing[4],
    marginBottom: theme.spacing[6],
    gap: theme.spacing[2],
  },
  row: { flexDirection: 'row' as const, gap: theme.spacing[2] },
  key: {
    minWidth: 40,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  keyText: { fontSize: 18, fontWeight: '600' as const, color: theme.colors.textPrimary },
  preview: { fontSize: 16, color: theme.colors.textSecondary },
  hint: { fontSize: 14, color: theme.colors.danger },
});
