import { View, Text, Modal, Pressable, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { BenchmarkPoint } from '@/hooks/usePortfolioAnalytics';

export type FormulaType = 'performance' | 'allocation' | 'gainers' | 'benchmark';

interface Props {
  type: FormulaType;
  onClose: () => void;
  earliestValue: number;
  latestValue: number;
  periodReturn: number;
  benchmarkComparison: BenchmarkPoint[];
}

export function FormulaModal({ type, onClose, earliestValue, latestValue, periodReturn, benchmarkComparison }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const formulas: Record<FormulaType, { title: string; description: string; formula: string; example: string }> = {
    performance: {
      title: t('investments.formulas.performanceTitle'),
      description: t('investments.formulas.performanceDesc'),
      formula: 'Return % = ((End Value - Start Value) / Start Value) × 100',
      example: t('investments.formulas.performanceExample', {
        start: earliestValue.toFixed(2),
        end: latestValue.toFixed(2),
        result: periodReturn.toFixed(2),
      }),
    },
    allocation: {
      title: t('investments.formulas.allocationTitle'),
      description: t('investments.formulas.allocationDesc'),
      formula: 'Allocation % = (Asset Type Value / Total Portfolio Value) × 100',
      example: t('investments.formulas.allocationExample'),
    },
    gainers: {
      title: t('investments.formulas.gainersTitle'),
      description: t('investments.formulas.gainersDesc'),
      formula: 'P&L % = ((Current Price - Avg Cost) / Avg Cost) × 100',
      example: t('investments.formulas.gainersExample'),
    },
    benchmark: {
      title: t('investments.formulas.benchmarkTitle'),
      description: t('investments.formulas.benchmarkDesc'),
      formula: 'Difference = Portfolio Return % - Benchmark Return %',
      example: benchmarkComparison.length > 0
        ? t('investments.formulas.benchmarkExample', {
            portfolio: benchmarkComparison[0].portfolioReturn.toFixed(2),
            benchmark: benchmarkComparison[0].benchmarkReturn.toFixed(2),
            diff: (benchmarkComparison[0].portfolioReturn - benchmarkComparison[0].benchmarkReturn).toFixed(2),
          })
        : '',
    },
  };

  const current = formulas[type];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Ionicons name="calculator-outline" size={24} color={theme.colors.primary} />
            <Text style={styles.title}>{current.title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.close}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>{current.description}</Text>

          <View style={styles.formulaBox}>
            <Text style={styles.formulaLabel}>{t('investments.formulas.formula')}</Text>
            <Text style={styles.formulaText}>{current.formula}</Text>
          </View>

          {current.example ? (
            <View style={styles.exampleBox}>
              <Text style={styles.exampleLabel}>{t('investments.formulas.example')}</Text>
              <Text style={styles.exampleText}>{current.example}</Text>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[4],
  },
  content: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    width: '100%' as const,
    maxWidth: 400,
    ...theme.shadows.lg,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  close: {
    padding: theme.spacing[1],
  },
  description: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[4],
    lineHeight: 22,
  },
  formulaBox: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  formulaLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1],
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  formulaText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
    fontFamily: 'monospace',
  },
  exampleBox: {
    backgroundColor: theme.colors.success + '10',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.success,
  },
  exampleLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.success,
    marginBottom: theme.spacing[1],
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  exampleText: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
});
