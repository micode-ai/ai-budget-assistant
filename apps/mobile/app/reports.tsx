import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useReportStore } from '@/stores/reportStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@budget/shared-utils';
import type { GenerateReportDto, ReportListItem } from '@budget/shared-types';
import type { Currency } from '@budget/shared-types';

type ReportFormat = 'csv' | 'pdf' | 'excel';

export default function ReportsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuthStore();
  const { getCategoryById } = useCategoryStore();

  const {
    reports,
    isGenerating,
    isLoading,
    error,
    digest,
    generateReport,
    loadReports,
    deleteReport,
    shareReport,
    downloadReport,
    loadMonthlyDigest,
  } = useReportStore();

  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>('csv');
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');

  useEffect(() => {
    loadReports();
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    loadMonthlyDigest(month);
  }, [loadReports, loadMonthlyDigest]);

  const getDateRange = useCallback((): { startDate: string; endDate: string } => {
    const now = new Date();
    const end = now.toISOString().split('T')[0];
    let start: Date;

    switch (dateRange) {
      case 'week':
        start = new Date(now);
        start.setDate(now.getDate() - 7);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
    }

    return { startDate: start.toISOString().split('T')[0], endDate: end };
  }, [dateRange]);

  const handleGenerate = async () => {
    const { startDate, endDate } = getDateRange();
    const dto: GenerateReportDto = {
      format: selectedFormat,
      startDate,
      endDate,
      includeExpenses: true,
      includeIncomes: true,
      locale: i18n.language,
    };

    const reportId = await generateReport(dto);
    if (reportId) {
      // Find the newly generated report and open it immediately
      const updatedReports = useReportStore.getState().reports;
      const newReport = updatedReports.find(r => r.id === reportId);
      if (newReport) {
        await shareReport(newReport.id, newReport.fileName);
      }
    }
  };

  const handleShare = async (report: ReportListItem) => {
    await shareReport(report.id, report.fileName);
  };

  const handleDownload = async (report: ReportListItem) => {
    await downloadReport(report.id, report.fileName);
  };

  const handleDelete = (report: ReportListItem) => {
    Alert.alert(
      t('reports.deleteTitle'),
      t('reports.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => deleteReport(report.id),
        },
      ],
    );
  };

  const FORMATS: { key: ReportFormat; label: string; icon: string }[] = [
    { key: 'csv', label: 'CSV', icon: 'document-text-outline' },
    { key: 'pdf', label: 'PDF', icon: 'document-outline' },
    { key: 'excel', label: 'Excel', icon: 'grid-outline' },
  ];

  const DATE_RANGES: { key: typeof dateRange; label: string }[] = [
    { key: 'week', label: t('reports.lastWeek') },
    { key: 'month', label: t('reports.thisMonth') },
    { key: 'quarter', label: t('reports.lastQuarter') },
    { key: 'year', label: t('reports.thisYear') },
  ];

  const currency = ((digest?.digest.currencyCode || user?.currencyCode || 'USD')) as Currency;

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Report Generator */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('reports.generateReport')}</Text>

          {/* Format Selector */}
          <Text style={styles.fieldLabel}>{t('reports.format')}</Text>
          <View style={styles.formatRow}>
            {FORMATS.map((fmt) => (
              <TouchableOpacity
                key={fmt.key}
                style={[styles.formatCard, selectedFormat === fmt.key && styles.formatCardActive]}
                onPress={() => setSelectedFormat(fmt.key)}
              >
                <Ionicons
                  name={fmt.icon as any}
                  size={24}
                  color={selectedFormat === fmt.key ? theme.colors.primary : theme.colors.textTertiary}
                />
                <Text style={[styles.formatLabel, selectedFormat === fmt.key && styles.formatLabelActive]}>
                  {fmt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Date Range */}
          <Text style={[styles.fieldLabel, { marginTop: theme.spacing[4] }]}>{t('reports.dateRange')}</Text>
          <View style={styles.rangeRow}>
            {DATE_RANGES.map((range) => (
              <TouchableOpacity
                key={range.key}
                style={[styles.rangeChip, dateRange === range.key && styles.rangeChipActive]}
                onPress={() => setDateRange(range.key)}
              >
                <Text style={[styles.rangeChipText, dateRange === range.key && styles.rangeChipTextActive]}>
                  {range.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Generate Button */}
          <TouchableOpacity
            style={[styles.generateButton, isGenerating && styles.generateButtonDisabled]}
            onPress={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="download-outline" size={20} color="#FFFFFF" />
            )}
            <Text style={styles.generateButtonText}>
              {isGenerating ? t('reports.generating') : t('reports.generate')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Monthly Digest */}
        {digest && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('reports.monthlyDigest')}</Text>
            <View style={styles.digestCard}>
              <Text style={styles.digestPeriod}>{digest.digest.periodLabel}</Text>
              <View style={styles.digestMetrics}>
                <View style={styles.digestMetric}>
                  <Text style={styles.digestMetricLabel}>{t('reports.income')}</Text>
                  <Text style={[styles.digestMetricValue, { color: theme.colors.success }]}>
                    {formatCurrency(digest.digest.totalIncome, currency)}
                  </Text>
                </View>
                <View style={styles.digestMetric}>
                  <Text style={styles.digestMetricLabel}>{t('reports.expenses')}</Text>
                  <Text style={[styles.digestMetricValue, { color: theme.colors.danger }]}>
                    {formatCurrency(digest.digest.totalExpenses, currency)}
                  </Text>
                </View>
              </View>
              <View style={styles.digestSavings}>
                <Text style={styles.digestSavingsLabel}>{t('reports.savingsRate')}</Text>
                <Text style={[
                  styles.digestSavingsValue,
                  { color: digest.digest.savingsRate >= 0 ? theme.colors.success : theme.colors.danger },
                ]}>
                  {digest.digest.savingsRate.toFixed(1)}%
                </Text>
              </View>
              {digest.digest.topCategories.length > 0 && (
                <View style={styles.digestCategories}>
                  <Text style={styles.digestCategoriesTitle}>{t('reports.topCategories')}</Text>
                  {digest.digest.topCategories.slice(0, 3).map((cat, i) => {
                    const localCat = cat.categoryId ? getCategoryById(cat.categoryId) : null;
                    const displayName = localCat?.name || cat.name || t('common.uncategorized');
                    return (
                    <View key={i} style={styles.digestCategoryRow}>
                      <Text style={styles.digestCategoryName}>{displayName}</Text>
                      <Text style={styles.digestCategoryAmount}>
                        {formatCurrency(cat.amount, currency)}
                      </Text>
                    </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Recent Reports */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('reports.recentReports')}</Text>
          {isLoading ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : reports.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="document-outline" size={40} color={theme.colors.textDisabled} />
              <Text style={styles.emptyText}>{t('reports.noReports')}</Text>
            </View>
          ) : (
            reports.map((report) => (
              <View key={report.id} style={styles.reportItem}>
                <View style={styles.reportIcon}>
                  <Ionicons
                    name={
                      report.format === 'pdf'
                        ? 'document-outline'
                        : report.format === 'excel'
                        ? 'grid-outline'
                        : 'document-text-outline'
                    }
                    size={20}
                    color={theme.colors.primary}
                  />
                </View>
                <View style={styles.reportInfo}>
                  <Text style={styles.reportName} numberOfLines={1}>{report.fileName}</Text>
                  <Text style={styles.reportMeta}>
                    {report.format.toUpperCase()} · {new Date(report.createdAt).toLocaleDateString()}
                    {report.fileSize ? ` · ${(report.fileSize / 1024).toFixed(0)} KB` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleDownload(report)} style={styles.reportAction}>
                  <Ionicons name="download-outline" size={20} color={theme.colors.textTertiary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleShare(report)} style={styles.reportAction}>
                  <Ionicons name="share-outline" size={20} color={theme.colors.textTertiary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(report)} style={styles.reportAction}>
                  <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {error && (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={18} color={theme.colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>
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
    paddingBottom: theme.spacing[8],
  },
  section: {
    marginBottom: theme.spacing[6],
  },
  sectionTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[3],
  },
  fieldLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[2],
    textTransform: 'uppercase' as const,
  },

  // Format selector
  formatRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  formatCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  formatCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  formatLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
  formatLabelActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  tierBadge: {
    position: 'absolute' as const,
    top: theme.spacing[1],
    right: theme.spacing[1],
    backgroundColor: theme.colors.warning,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[1],
    paddingVertical: 1,
  },
  tierBadgeText: {
    fontSize: 9,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },

  // Date range
  rangeRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  rangeChip: {
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rangeChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  rangeChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  rangeChipTextActive: {
    color: '#FFFFFF',
  },

  // Generate button
  generateButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginTop: theme.spacing[5],
  },
  generateButtonDisabled: {
    opacity: 0.7,
  },
  generateButtonText: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: '#FFFFFF',
  },

  // Digest card
  digestCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    ...theme.shadows.sm,
  },
  digestPeriod: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    textAlign: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  digestMetrics: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  digestMetric: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    alignItems: 'center' as const,
  },
  digestMetricLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase' as const,
    marginBottom: theme.spacing[1],
  },
  digestMetricValue: {
    ...theme.textStyles.h3,
    fontWeight: '700' as const,
  },
  digestSavings: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  digestSavingsLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  digestSavingsValue: {
    ...theme.textStyles.h3,
    fontWeight: '700' as const,
  },
  digestCategories: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    paddingTop: theme.spacing[3],
  },
  digestCategoriesTitle: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[2],
  },
  digestCategoryRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: theme.spacing[1.5],
  },
  digestCategoryName: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
  digestCategoryAmount: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },

  // Recent reports
  reportItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3.5],
    marginBottom: theme.spacing[2],
    gap: theme.spacing[3],
  },
  reportIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  reportInfo: {
    flex: 1,
  },
  reportAction: {
    padding: theme.spacing[1],
  },
  reportName: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
  },
  reportMeta: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },

  // Empty / Error
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[8],
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  emptyText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textTertiary,
  },
  errorCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.dangerLight,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[4],
  },
  errorText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    flex: 1,
  },
});
