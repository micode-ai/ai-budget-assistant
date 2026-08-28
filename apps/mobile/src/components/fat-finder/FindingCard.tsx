import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, LayoutAnimation } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import type { Currency, FatFinderFinding } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import {
  TYPE_ICONS,
  SEVERITY_LABELS,
  getSeverityColor,
  getSeverityBgColor,
  formatFatFinderDate,
} from '@/features/fat-finder/fatFinderDisplay';

interface FindingCardProps {
  finding: FatFinderFinding;
  currency: Currency;
  canEdit: boolean;
}

export function FindingCard({ finding, currency, canEdit }: FindingCardProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isExpensesExpanded, setIsExpensesExpanded] = useState(false);

  const toggleDescription = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDescExpanded((prev) => !prev);
  }, []);

  const toggleExpenses = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpensesExpanded((prev) => !prev);
  }, []);

  const severityColor = getSeverityColor(theme, finding.severity);
  const severityBgColor = getSeverityBgColor(theme, finding.severity);
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
      <TouchableOpacity activeOpacity={0.7} onPress={toggleDescription}>
        <Text style={styles.findingDescription} numberOfLines={isDescExpanded ? undefined : 2}>
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

      {/* Track this subscription */}
      {finding.type === 'subscription' && canEdit && (
        <TouchableOpacity
          style={styles.trackButton}
          activeOpacity={0.7}
          onPress={() => {
            const detectedFrom = finding.relatedExpenses?.[0]?.description || '';
            router.push({
              pathname: '/subscriptions/new' as any,
              params: {
                name: finding.title,
                amount: String(finding.currentMonthly),
                detectedFrom,
              },
            });
          }}
        >
          <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.trackButtonText}>{t('fatFinder.trackSubscription')}</Text>
        </TouchableOpacity>
      )}

      {/* Related expenses (collapsible) */}
      {finding.relatedExpenses && finding.relatedExpenses.length > 0 && (
        <View style={styles.relatedSection}>
          <TouchableOpacity style={styles.relatedToggle} activeOpacity={0.7} onPress={toggleExpenses}>
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
                    <Text style={styles.relatedExpenseDate}>{formatFatFinderDate(expense.date)}</Text>
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
}

const createStyles = (theme: Theme) => ({
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

  // Track subscription button
  trackButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  trackButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
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
});
