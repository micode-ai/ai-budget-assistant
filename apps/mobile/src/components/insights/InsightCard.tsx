import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles, type Theme } from '@/theme';
import { ChartRenderer } from '@/components/interactive-charts';
import type { AIInsightChart } from '@budget/shared-types';

interface InsightCardProps {
  insight: AIInsightChart;
  width: number;
  onDismiss?: (id: string) => void;
}

const SEVERITY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  info: 'information-circle',
  warning: 'warning',
  critical: 'alert-circle',
};

export function InsightCard({ insight, width, onDismiss }: InsightCardProps) {
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const severityIcon = SEVERITY_ICONS[insight.severity] || 'information-circle';

  const severityColor =
    insight.severity === 'critical'
      ? theme.colors.danger
      : insight.severity === 'warning'
        ? theme.colors.warning
        : theme.colors.info;

  const severityBgColor =
    insight.severity === 'critical'
      ? theme.colors.dangerLight
      : insight.severity === 'warning'
        ? theme.colors.warningLight
        : theme.colors.primaryLight;

  return (
    <View style={[styles.card, { width }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.severityBadge, { backgroundColor: severityBgColor }]}>
          <Ionicons name={severityIcon} size={16} color={severityColor} />
          <Text style={[styles.severityText, { color: severityColor }]}>
            {insight.severity.charAt(0).toUpperCase() + insight.severity.slice(1)}
          </Text>
        </View>
        {onDismiss && (
          <TouchableOpacity
            onPress={() => onDismiss(insight.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.dismissButton}
          >
            <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Title & Description */}
      <Text style={styles.title} numberOfLines={2}>
        {insight.title}
      </Text>
      <Text style={styles.description} numberOfLines={3}>
        {insight.description}
      </Text>

      {/* Chart */}
      {insight.chartConfig && (
        <View style={styles.chartContainer}>
          <ChartRenderer config={insight.chartConfig} height={160} />
        </View>
      )}

      {/* Action Suggestion */}
      {insight.actionSuggestion && (
        <View style={styles.actionContainer}>
          <Ionicons name="bulb-outline" size={14} color={theme.colors.primary} />
          <Text style={styles.actionText} numberOfLines={2}>
            {insight.actionSuggestion}
          </Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    marginHorizontal: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.md,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  severityBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    gap: theme.spacing[1],
  },
  severityText: {
    ...theme.textStyles.caption,
    fontFamily: theme.fonts.semiBold,
  },
  dismissButton: {
    padding: theme.spacing[1],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[1.5],
  },
  description: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: theme.spacing[3],
  },
  chartContainer: {
    marginBottom: theme.spacing[3],
  },
  actionContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[2],
  },
  actionText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
});
