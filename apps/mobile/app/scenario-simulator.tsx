import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Share,
} from 'react-native';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PercentSlider } from '@/components/PercentSlider';
import { useTranslation } from 'react-i18next';
import { LineChart } from 'react-native-gifted-charts';
import { Dimensions } from 'react-native';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@budget/shared-utils';
import {
  useScenarioProjection,
  type ExtraIncome,
} from '@/features/scenario/useScenarioProjection';
import { useScenarioChartData } from '@/features/scenario/useScenarioChartData';
import { ScenarioManager } from '@/components/scenario/ScenarioManager';
import { type SavedScenario } from '@/stores/scenarioStore';
import { generateUUID } from '@budget/shared-utils';

const { width: screenWidth } = Dimensions.get('window');

type Horizon = 3 | 6 | 12;
const HORIZONS: Horizon[] = [3, 6, 12];

export default function ScenarioSimulatorScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuthStore();

  const [expenseAdj, setExpenseAdj] = useState<Record<string, number>>({});
  const [incomeAdj, setIncomeAdj] = useState<Record<string, number>>({});
  const [extraIncomes, setExtraIncomes] = useState<ExtraIncome[]>([]);
  const [horizon, setHorizon] = useState<Horizon>(6);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const projection = useScenarioProjection(expenseAdj, incomeAdj, extraIncomes, horizon);
  const { chartData, chartData2 } = useScenarioChartData(projection.projectionPoints);

  const currency = projection.baseCurrency || user?.currencyCode || 'USD';
  const fmt = (amount: number) => formatCurrency(Math.abs(amount), currency as never);
  const fmtSigned = (amount: number) => `${amount >= 0 ? '+' : '−'}${fmt(amount)}`;

  const handleExpenseSlider = useCallback((catId: string | null, value: number) => {
    setExpenseAdj(prev => ({ ...prev, [catId ?? 'null']: Math.round(value) }));
  }, []);

  const handleIncomeSlider = useCallback((catId: string | null, value: number) => {
    setIncomeAdj(prev => ({ ...prev, [catId ?? 'null']: Math.round(value) }));
  }, []);

  const handleAddExtraIncome = useCallback(() => {
    setExtraIncomes(prev => [...prev, { id: generateUUID(), description: '', amount: 0 }]);
  }, []);

  const handleExtraIncomeChange = useCallback((id: string, field: 'description' | 'amount', value: string) => {
    setExtraIncomes(prev =>
      prev.map(e =>
        e.id === id
          ? { ...e, [field]: field === 'amount' ? parseFloat(value) || 0 : value }
          : e,
      ),
    );
  }, []);

  const handleRemoveExtraIncome = useCallback((id: string) => {
    setExtraIncomes(prev => prev.filter(e => e.id !== id));
  }, []);

  const handleReset = useCallback(() => {
    setExpenseAdj({});
    setIncomeAdj({});
    setExtraIncomes([]);
  }, []);

  const handleLoadScenario = useCallback((scenario: SavedScenario) => {
    setExpenseAdj(scenario.expenseAdj);
    setIncomeAdj(scenario.incomeAdj);
    setExtraIncomes(scenario.extraIncomes);
    setHorizon(scenario.horizon);
  }, []);

  const handleShare = useCallback(async () => {
    const savingsDiff = projection.monthlySavingsDiff;
    const horizonTotal = projection.horizonTotals[horizon];
    const message = [
      `📊 ${t('scenarioSimulator.projectionTitle')}`,
      '',
      `${t('scenarioSimulator.currentSavings')}: ${fmtSigned(projection.currentMonthlySavings)}${t('scenarioSimulator.perMonth')}`,
      `${t('scenarioSimulator.scenarioSavings')}: ${fmtSigned(projection.scenarioMonthlySavings)}${t('scenarioSimulator.perMonth')}`,
      `Δ ${savingsDiff >= 0 ? '+' : '−'}${fmt(savingsDiff)}${t('scenarioSimulator.perMonth')}`,
      '',
      `${horizon} ${t('scenarioSimulator.months')}: ${fmtSigned(horizonTotal.scenario)} (${savingsDiff >= 0 ? '+' : '−'}${fmt(horizonTotal.diff)})`,
    ].join('\n');

    try {
      await Share.share({ message });
    } catch {
      // user cancelled or error — silently ignore
    }
  }, [projection, horizon, t, fmt, fmtSigned]);

  const chartWidth = screenWidth - 64;
  const savingsDiff = projection.monthlySavingsDiff;
  const diffIsPositive = savingsDiff >= 0;

  if (!projection.hasData) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.emptyContainer}>
          <Ionicons name="flask-outline" size={56} color={theme.colors.textDisabled} />
          <Text style={styles.emptyTitle}>{t('scenarioSimulator.noData')}</Text>
          <Text style={styles.emptySubtext}>{t('scenarioSimulator.noDataHint')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScenarioManager
          expenseAdj={expenseAdj}
          incomeAdj={incomeAdj}
          extraIncomes={extraIncomes}
          horizon={horizon}
          onLoad={handleLoadScenario}
        />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={scrollEnabled}
        >
          {/* ── Summary Card ── */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryHalf}>
              <Text style={styles.summaryLabel}>{t('scenarioSimulator.currentSavings')}</Text>
              <Text style={styles.summaryAmount}>{fmtSigned(projection.currentMonthlySavings)}</Text>
              <Text style={styles.summarySubLabel}>{t('scenarioSimulator.perMonth')}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryHalf}>
              <Text style={styles.summaryLabel}>{t('scenarioSimulator.scenarioSavings')}</Text>
              <Text style={[styles.summaryAmount, { color: diffIsPositive ? theme.colors.success : theme.colors.danger }]}>
                {fmtSigned(projection.scenarioMonthlySavings)}
              </Text>
              <Text style={[styles.summarySubLabel, { color: diffIsPositive ? theme.colors.success : theme.colors.danger }]}>
                {diffIsPositive ? '↑' : '↓'} {fmt(savingsDiff)} {t('scenarioSimulator.perMonth')}
              </Text>
            </View>
          </View>

          {/* ── Horizon Selector ── */}
          <View style={styles.horizonRow}>
            {HORIZONS.map(h => (
              <TouchableOpacity
                key={h}
                style={[styles.horizonChip, horizon === h && styles.horizonChipActive]}
                onPress={() => setHorizon(h)}
              >
                <Text style={[styles.horizonChipText, horizon === h && styles.horizonChipTextActive]}>
                  {h} {t('scenarioSimulator.months')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Projection Chart ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('scenarioSimulator.projectionTitle')}</Text>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.colors.textTertiary }]} />
                <Text style={styles.legendLabel}>{t('scenarioSimulator.currentPath')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
                <Text style={styles.legendLabel}>{t('scenarioSimulator.scenarioPath')}</Text>
              </View>
            </View>
            {chartData.length > 0 && (
              <LineChart
                data={chartData}
                data2={chartData2}
                width={chartWidth}
                height={160}
                color1={theme.colors.textTertiary}
                color2={theme.colors.primary}
                dataPointsColor1={theme.colors.textTertiary}
                dataPointsColor2={theme.colors.primary}
                thickness1={2}
                thickness2={2}
                curved
                areaChart
                startFillColor1={theme.colors.textTertiary}
                startFillColor2={theme.colors.primary}
                startOpacity1={0.15}
                startOpacity2={0.25}
                endOpacity1={0}
                endOpacity2={0}
                xAxisColor={theme.colors.border}
                yAxisColor={theme.colors.border}
                yAxisTextStyle={{ color: theme.colors.textSecondary, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: theme.colors.textSecondary, fontSize: 10 }}
                noOfSections={4}
                spacing={chartWidth / Math.max(chartData.length, 1) - 4}
                initialSpacing={8}
                hideRules
                yAxisLabelWidth={44}
              />
            )}
          </View>

          {/* ── Horizon Totals ── */}
          <View style={styles.horizonTotalsRow}>
            {HORIZONS.map(h => {
              const ht = projection.horizonTotals[h];
              const isPos = ht.diff >= 0;
              return (
                <View key={h} style={[styles.horizonTotalCard, horizon === h && styles.horizonTotalCardActive]}>
                  <Text style={styles.horizonTotalLabel}>{h} {t('scenarioSimulator.months')}</Text>
                  <Text style={[styles.horizonTotalScenario, { color: isPos ? theme.colors.success : theme.colors.danger }]}>
                    {fmtSigned(ht.scenario)}
                  </Text>
                  <Text style={styles.horizonTotalCurrent}>{fmtSigned(ht.current)}</Text>
                  <Text style={[styles.horizonTotalDiff, { color: isPos ? theme.colors.success : theme.colors.danger }]}>
                    {isPos ? '+' : '−'}{fmt(ht.diff)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* ── Expense Adjustments ── */}
          <Text style={styles.groupTitle}>{t('scenarioSimulator.expenseAdjustments')}</Text>
          <View style={styles.card}>
            {projection.expenseCategories.map((cat, idx) => {
              const key = cat.categoryId ?? 'null';
              const pct = expenseAdj[key] ?? 0;
              return (
                <View key={key} style={[styles.categoryRow, idx > 0 && styles.categoryRowBorder]}>
                  <View style={styles.categoryHeader}>
                    <View style={[styles.categoryDot, { backgroundColor: cat.color ?? theme.colors.primary }]} />
                    <Text style={styles.categoryName} numberOfLines={1}>{cat.name}</Text>
                    <Text style={styles.categoryBase}>{fmt(cat.currentMonthly)}{t('scenarioSimulator.perMonth')}</Text>
                  </View>
                  <PercentSlider
                    value={pct}
                    onValueChange={val => handleExpenseSlider(cat.categoryId, val)}
                    trackColorFilled={pct < 0 ? theme.colors.success : pct > 0 ? theme.colors.danger : theme.colors.border}
                    trackColorEmpty={theme.colors.border}
                    thumbColor={theme.colors.primary}
                    onDragStart={() => setScrollEnabled(false)}
                    onDragEnd={() => setScrollEnabled(true)}
                  />
                  <View style={styles.categoryFooter}>
                    <Text style={[
                      styles.categoryPct,
                      pct < 0 && { color: theme.colors.success },
                      pct > 0 && { color: theme.colors.danger },
                    ]}>
                      {pct === 0 ? t('scenarioSimulator.unchanged') : `${pct > 0 ? '+' : ''}${pct}%`}
                    </Text>
                    {pct !== 0 && (
                      <Text style={styles.categoryResult}>
                        → {fmt(cat.adjustedMonthly)}{t('scenarioSimulator.perMonth')}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {/* ── Income Adjustments ── */}
          <Text style={styles.groupTitle}>{t('scenarioSimulator.incomeAdjustments')}</Text>
          <View style={styles.card}>
            {projection.incomeCategories.map((cat, idx) => {
              const key = cat.categoryId ?? 'null';
              const pct = incomeAdj[key] ?? 0;
              return (
                <View key={key} style={[styles.categoryRow, idx > 0 && styles.categoryRowBorder]}>
                  <View style={styles.categoryHeader}>
                    <View style={[styles.categoryDot, { backgroundColor: cat.color ?? theme.colors.success }]} />
                    <Text style={styles.categoryName} numberOfLines={1}>{cat.name}</Text>
                    <Text style={styles.categoryBase}>{fmt(cat.currentMonthly)}{t('scenarioSimulator.perMonth')}</Text>
                  </View>
                  <PercentSlider
                    value={pct}
                    onValueChange={val => handleIncomeSlider(cat.categoryId, val)}
                    trackColorFilled={pct > 0 ? theme.colors.success : pct < 0 ? theme.colors.danger : theme.colors.border}
                    trackColorEmpty={theme.colors.border}
                    thumbColor={theme.colors.primary}
                    onDragStart={() => setScrollEnabled(false)}
                    onDragEnd={() => setScrollEnabled(true)}
                  />
                  <View style={styles.categoryFooter}>
                    <Text style={[
                      styles.categoryPct,
                      pct > 0 && { color: theme.colors.success },
                      pct < 0 && { color: theme.colors.danger },
                    ]}>
                      {pct === 0 ? t('scenarioSimulator.unchanged') : `${pct > 0 ? '+' : ''}${pct}%`}
                    </Text>
                    {pct !== 0 && (
                      <Text style={styles.categoryResult}>
                        → {fmt(cat.adjustedMonthly)}{t('scenarioSimulator.perMonth')}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Extra income rows */}
            {extraIncomes.map((extra) => (
              <View key={extra.id} style={[styles.categoryRow, styles.categoryRowBorder]}>
                <View style={styles.extraIncomeRow}>
                  <TextInput
                    style={[styles.extraInput, { flex: 1, marginRight: theme.spacing[2] }]}
                    placeholder={t('scenarioSimulator.extraIncomeDescription')}
                    placeholderTextColor={theme.colors.textTertiary}
                    value={extra.description}
                    onChangeText={val => handleExtraIncomeChange(extra.id, 'description', val)}
                  />
                  <TextInput
                    style={[styles.extraInput, { width: 100, textAlign: 'right' }]}
                    placeholder="0"
                    placeholderTextColor={theme.colors.textTertiary}
                    keyboardType="decimal-pad"
                    value={extra.amount ? String(extra.amount) : ''}
                    onChangeText={val => handleExtraIncomeChange(extra.id, 'amount', val)}
                  />
                  <TouchableOpacity onPress={() => handleRemoveExtraIncome(extra.id)} style={styles.removeBtn}>
                    <Ionicons name="close-circle" size={20} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.extraLabel}>{t('scenarioSimulator.extraIncomeAmount')}</Text>
              </View>
            ))}

            <TouchableOpacity style={styles.addExtraBtn} onPress={handleAddExtraIncome}>
              <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.addExtraBtnText}>{t('scenarioSimulator.addExtraIncome')}</Text>
            </TouchableOpacity>
          </View>

          {/* ── Bottom Actions ── */}
          <View style={styles.bottomActionsRow}>
            <TouchableOpacity style={[styles.bottomBtn, { flex: 1 }]} onPress={handleReset}>
              <Ionicons name="refresh-outline" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.bottomBtnText}>{t('scenarioSimulator.resetAll')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.bottomBtn, styles.shareBtn]} onPress={handleShare}>
              <Ionicons name="share-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.bottomBtnText, { color: theme.colors.primary }]}>{t('scenarioSimulator.shareScenario')}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: theme.spacing[8],
    gap: theme.spacing[3],
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  emptySubtext: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    flexDirection: 'row' as const,
    marginBottom: theme.spacing[3],
    ...theme.shadows.sm,
  },
  summaryHalf: {
    flex: 1,
    alignItems: 'center' as const,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing[3],
  },
  summaryLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
    textAlign: 'center' as const,
  },
  summaryAmount: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
  },
  summarySubLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
    textAlign: 'center' as const,
  },
  horizonRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  horizonChip: {
    flex: 1,
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center' as const,
  },
  horizonChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  horizonChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  horizonChipTextActive: {
    color: '#fff',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
    ...theme.shadows.sm,
    overflow: 'hidden' as const,
  },
  sectionTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  legendRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  legendItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  horizonTotalsRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  horizonTotalCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  horizonTotalCardActive: {
    borderColor: theme.colors.primary,
  },
  horizonTotalLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[1],
  },
  horizonTotalScenario: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.success,
  },
  horizonTotalCurrent: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  horizonTotalDiff: {
    ...theme.textStyles.caption,
    color: theme.colors.success,
    marginTop: 2,
  },
  groupTitle: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  categoryRow: {
    paddingVertical: theme.spacing[3],
  },
  categoryRowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  categoryHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryName: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  categoryBase: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  categoryFooter: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
  },
  categoryPct: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    minWidth: 60,
  },
  categoryResult: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  extraIncomeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  extraInput: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
  extraLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  removeBtn: {
    padding: theme.spacing[1],
    marginLeft: theme.spacing[2],
  },
  addExtraBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    marginTop: theme.spacing[2],
  },
  addExtraBtnText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  bottomActionsRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  bottomBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  shareBtn: {
    borderColor: theme.colors.primaryLight,
    backgroundColor: theme.colors.primaryLight,
  },
  bottomBtnText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
});
