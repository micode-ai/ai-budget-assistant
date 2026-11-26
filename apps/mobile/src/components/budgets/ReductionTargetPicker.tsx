import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useStyles, type Theme } from '@/theme';
import {
  applyReduction,
  computeReductionBaseline,
  type ReductionBaseline,
} from '@/features/budgets/reductionTarget';

const PERCENTS = [10, 20, 30];
const BASELINES: ReductionBaseline[] = ['lastMonth', 'avg3Months', 'lastYearSameMonth'];

interface Props {
  categoryId: string;
  /** The budget's currency; only expenses in it form the baseline. */
  currencyCode: string;
  /** Receives the target amount; the form puts it in the Amount field. */
  onApply: (amount: number) => void;
}

/** "Reduce by 10/20/30%" shortcut: a budget created from the category's own history. */
export function ReductionTargetPicker({ categoryId, currencyCode, onApply }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const expenses = useExpenseStore((s) => s.expenses);
  const [baseline, setBaseline] = useState<ReductionBaseline>('lastMonth');
  const [percent, setPercent] = useState<number | null>(null);

  const base = useMemo(
    () => computeReductionBaseline(expenses, categoryId, baseline, new Date(), currencyCode),
    [expenses, categoryId, baseline, currencyCode],
  );

  const apply = (p: number, b: number | null) => {
    setPercent(p);
    if (b === null) return;
    const target = applyReduction(b, p);
    if (target > 0) onApply(target);
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{t('budgetNew.reduce.title')}</Text>
      <View style={styles.row}>
        {BASELINES.map((b) => (
          <TouchableOpacity
            key={b}
            style={[styles.chip, baseline === b && styles.chipActive]}
            onPress={() => {
              setBaseline(b);
              if (percent) apply(percent, computeReductionBaseline(expenses, categoryId, b, new Date(), currencyCode));
            }}
          >
            <Text style={[styles.chipText, baseline === b && styles.chipTextActive]}>
              {t(`budgetNew.reduce.baseline.${b}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.row}>
        {PERCENTS.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.chip, percent === p && styles.chipActive]}
            onPress={() => apply(p, base)}
          >
            <Text style={[styles.chipText, percent === p && styles.chipTextActive]}>
              {t('budgetNew.reduce.percent', { percent: p })}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.hint}>
        {base === null
          ? t('budgetNew.reduce.notEnoughHistory')
          : base > 0
          ? percent
            ? t('budgetNew.reduce.result', {
                baseline: base.toFixed(2),
                target: applyReduction(base, percent).toFixed(2),
              })
            : t('budgetNew.reduce.baselineIs', { baseline: base.toFixed(2) })
          : t('budgetNew.reduce.noHistory')}
      </Text>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  box: { marginTop: theme.spacing[3], gap: theme.spacing[2] },
  title: { fontSize: 14, fontWeight: '600' as const, color: theme.colors.textPrimary },
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[2] },
  chip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 13, color: theme.colors.textPrimary },
  chipTextActive: { color: theme.colors.textInverse, fontWeight: '600' as const },
  hint: { fontSize: 12, color: theme.colors.textSecondary },
});
