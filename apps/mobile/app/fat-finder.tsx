import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useInsightsStore } from '@/stores/insightsStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@budget/shared-utils';
import type { FatFinderFinding, FatFinderFindingType, Currency } from '@budget/shared-types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TYPE_ICONS: Record<FatFinderFindingType, keyof typeof Ionicons.glyphMap> = {
  subscription: 'repeat',
  recurring_splurge: 'trending-up',
  large_one_off: 'alert-circle',
  category_excess: 'bar-chart',
  service_overuse: 'car',
};

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export default function FatFinderScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { user } = useAuthStore();

  const fatFinderReport = useInsightsStore((s) => s.fatFinderReport);
  const fatFinderLoading = useInsightsStore((s) => s.fatFinderLoading);
  const fatFinderError = useInsightsStore((s) => s.fatFinderError);
  const loadFatFinder = useInsightsStore((s) => s.loadFatFinder);

  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const [expandedExpenses, setExpandedExpenses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!fatFinderReport && !fatFinderLoading) {
      loadFatFinder(i18n.language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currency = (fatFinderReport?.currencyCode || user?.currencyCode || 'USD') as Currency;

  const toggleDescription = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedDescriptions((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleExpenses = useCallback((id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedExpenses((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleRegenerate = () => {
    loadFatFinder(i18n.language, true);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return theme.colors.danger;
      case 'medium':
        return theme.colors.warning;
      default:
        return theme.colors.info;
    }
  };

  const getSeverityBgColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return theme.colors.dangerLight;
      case 'medium':
        return theme.colors.warningLight;
      default:
        return theme.colors.primaryLight;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const renderFinding = ({ item: finding }: { item: FatFinderFinding }) => {
    const severityColor = getSeverityColor(finding.severity);
    const severityBgColor = getSeverityBgColor(finding.severity);
    const isDescExpanded = expandedDescriptions[finding.id] ?? false;
    const isExpensesExpanded = expandedExpenses[finding.id] ?? false;
    const typeIcon = TYPE_ICONS[finding.type] || 'help-circle';

    return (
      <View style={styles.findingCard}>
        {/* Finding header */}
        <View style={styles.findingHeader}>
          <View style={[styles.typeIconContainer, { backgroundColor: theme.colors.primaryLight }]}>
            <Ionicons name={typeIcon} size={20} color={theme.colors.primary} />
          </View>
          <View style={styles.findingTitleContainer}>
            <Text style={styles.findingTitle}>{finding.title}</Text>
            <View style={[styles.severityBadge, { backgroundColor: severityBgColor }]}>
              <Text style={[styles.severityText, { color: severityColor }]}>
                {t(`fatFinder.severity.${finding.severity}`, SEVERITY_LABELS[finding.severity])}
              </Text>
            </View>
          </View>
        </View>

        {/* Description (expandable) */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => toggleDescription(finding.id)}
        >
          <Text
            style={styles.findingDescription}
            numberOfLines={isDescExpanded ? undefined : 2}
          >
            {finding.description}
          </Text>
          {finding.description.length > 80 && (
            <View style={styles.expandHint}>
              <Ionicons
                name={isDescExpanded ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={theme.colors.textTertiary}
              />
            </View>
          )}
        </TouchableOpacity>

        {/* Monthly comparison */}
        <View style={styles.comparisonRow}>
          <View style={styles.comparisonItem}>
            <Text style={styles.comparisonLabel}>{t('fatFinder.currentMonthly')}</Text>
            <Text style={[styles.comparisonValue, { color: theme.colors.danger }]}>
              {formatCurrency(finding.currentMonthly, currency)}
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={theme.colors.textTertiary} />
          <View style={styles.comparisonItem}>
            <Text style={styles.comparisonLabel}>{t('fatFinder.suggestedMonthly')}</Text>
            <Text style={[styles.comparisonValue, { color: theme.colors.success }]}>
              {formatCurrency(finding.suggestedMonthly, currency)}
            </Text>
          </View>
        </View>

        {/* Potential savings */}
        <View style={[styles.savingsHighlight, { backgroundColor: severityBgColor }]}>
          <Ionicons name="trending-down" size={18} color={severityColor} />
          <Text style={styles.savingsHighlightLabel}>{t('fatFinder.potentialSavings')}</Text>
          <Text style={[styles.savingsHighlightAmount, { color: severityColor }]}>
            {formatCurrency(finding.potentialSavings, currency)}
          </Text>
        </View>

        {/* Action suggestion */}
        {finding.actionSuggestion && (
          <View style={styles.actionContainer}>
            <Ionicons name="bulb-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.actionText}>{finding.actionSuggestion}</Text>
          </View>
        )}

        {/* Related expenses (collapsible) */}
        {finding.relatedExpenses && finding.relatedExpenses.length > 0 && (
          <View style={styles.relatedSection}>
            <TouchableOpacity
              style={styles.relatedToggle}
              activeOpacity={0.7}
              onPress={() => toggleExpenses(finding.id)}
            >
              <Ionicons
                name={isExpensesExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.relatedToggleText}>
                {t('fatFinder.relatedExpenses', { count: finding.relatedExpenses.length })}
              </Text>
            </TouchableOpacity>

            {isExpensesExpanded && (
              <View style={styles.relatedList}>
                {finding.relatedExpenses.map((expense, index) => (
                  <View key={index} style={styles.relatedExpenseItem}>
                    <View style={styles.relatedExpenseInfo}>
                      <Text style={styles.relatedExpenseDesc} numberOfLines={1}>
                        {expense.description}
                      </Text>
                      <Text style={styles.relatedExpenseDate}>
                        {formatDate(expense.date)}
                      </Text>
                    </View>
                    <Text style={styles.relatedExpenseAmount}>
                      {formatCurrency(expense.amount, currency)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderHeader = () => {
    if (!fatFinderReport) return null;

    return (
      <View style={styles.headerSection}>
        {/* Summary card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('fatFinder.totalSavings')}</Text>
          <Text style={styles.summaryAmount}>
            {formatCurrency(fatFinderReport.totalPotentialSavings, currency)}
          </Text>
          <Text style={styles.summaryPerMonth}>{t('fatFinder.perMonth')}</Text>
          <View style={styles.summaryPeriod}>
            <Ionicons name="calendar-outline" size={14} color={theme.colors.textTertiary} />
            <Text style={styles.summaryPeriodText}>
              {formatDate(fatFinderReport.periodStart)} - {formatDate(fatFinderReport.periodEnd)}
            </Text>
          </View>
        </View>

        {/* Findings count */}
        <Text style={styles.findingsCountText}>
          {t('fatFinder.findingsCount', { count: fatFinderReport.findings.length })}
        </Text>
      </View>
    );
  };

  const renderFooter = () => (
    <View style={styles.footerSection}>
      {fatFinderReport?.generatedAt && (
        <Text style={styles.generatedAt}>
          {t('fatFinder.generatedAt', {
            time: new Date(fatFinderReport.generatedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          })}
        </Text>
      )}
      <TouchableOpacity
        style={[styles.regenerateButton, fatFinderLoading && styles.regenerateButtonDisabled]}
        onPress={handleRegenerate}
        disabled={fatFinderLoading}
      >
        {fatFinderLoading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          <Ionicons name="refresh-outline" size={18} color={theme.colors.primary} />
        )}
        <Text style={styles.regenerateText}>{t('fatFinder.regenerate')}</Text>
      </TouchableOpacity>
    </View>
  );

  // Loading state
  if (fatFinderLoading && !fatFinderReport) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t('fatFinder.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (fatFinderError && !fatFinderReport) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.colors.danger} />
          <Text style={styles.errorText}>{fatFinderError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => loadFatFinder(i18n.language)}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state
  if (!fatFinderReport || fatFinderReport.findings.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle-outline" size={48} color={theme.colors.success} />
          <Text style={styles.emptyTitle}>{t('fatFinder.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('fatFinder.emptyDescription')}</Text>
          <TouchableOpacity style={styles.regenerateButton} onPress={handleRegenerate}>
            <Ionicons name="refresh-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.regenerateText}>{t('fatFinder.regenerate')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={fatFinderReport.findings}
        keyExtractor={(item) => item.id}
        renderItem={renderFinding}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },

  // Header section
  headerSection: {
    marginBottom: theme.spacing[4],
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    alignItems: 'center' as const,
    ...theme.shadows.sm,
  },
  summaryTitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase' as const,
    marginBottom: theme.spacing[2],
  },
  summaryAmount: {
    ...theme.textStyles.h1,
    color: theme.colors.primary,
    fontWeight: '700' as const,
  },
  summaryPerMonth: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
    marginBottom: theme.spacing[3],
  },
  summaryPeriod: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  summaryPeriodText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  findingsCountText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[1],
  },

  // Finding card
  findingCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  findingHeader: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  typeIconContainer: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  findingTitleContainer: {
    flex: 1,
    gap: theme.spacing[1.5],
  },
  findingTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  severityBadge: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[0.5],
    borderRadius: theme.borderRadius.full,
  },
  severityText: {
    ...theme.textStyles.caption,
    fontFamily: theme.fonts.semiBold,
  },

  // Description
  findingDescription: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: theme.spacing[1],
  },
  expandHint: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[0.5],
    marginBottom: theme.spacing[2],
  },

  // Comparison
  comparisonRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[3],
    gap: theme.spacing[2],
  },
  comparisonItem: {
    flex: 1,
    alignItems: 'center' as const,
  },
  comparisonLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase' as const,
    marginBottom: theme.spacing[1],
    textAlign: 'center' as const,
  },
  comparisonValue: {
    ...theme.textStyles.bodyLargeSemiBold,
    fontWeight: '700' as const,
  },

  // Savings highlight
  savingsHighlight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[3],
    gap: theme.spacing[2],
  },
  savingsHighlightLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  savingsHighlightAmount: {
    ...theme.textStyles.bodyLargeSemiBold,
    fontWeight: '700' as const,
  },

  // Action
  actionContainer: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  actionText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
    lineHeight: 18,
  },

  // Related expenses
  relatedSection: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    paddingTop: theme.spacing[2],
  },
  relatedToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[1],
  },
  relatedToggleText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  relatedList: {
    marginTop: theme.spacing[2],
  },
  relatedExpenseItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: theme.spacing[1.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  relatedExpenseInfo: {
    flex: 1,
    marginRight: theme.spacing[2],
  },
  relatedExpenseDesc: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
  relatedExpenseDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  relatedExpenseAmount: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },

  // Footer
  footerSection: {
    marginTop: theme.spacing[4],
    paddingTop: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  generatedAt: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  regenerateButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  regenerateButtonDisabled: {
    opacity: 0.6,
  },
  regenerateText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  loadingText: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },

  // Error
  errorContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
  },
  errorText: {
    ...theme.textStyles.body,
    color: theme.colors.danger,
    textAlign: 'center' as const,
  },
  retryButton: {
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
  },
  retryText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },

  // Empty
  emptyContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
  },
  emptyTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
});
