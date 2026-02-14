import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles, type Theme } from '@/theme';
import { ChartRenderer } from '@/components/interactive-charts';
import type { AIInsightChart, ChartConfig } from '@budget/shared-types';

const MAX_CHART_DATA_POINTS = 5;
const MAX_LABEL_LENGTH = 6;
const CHART_HEIGHT = 140;

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
  const [showFullAction, setShowFullAction] = useState(false);

  // Limit chart data points and truncate labels to prevent layout issues
  const limitedChartConfig = useMemo((): ChartConfig | undefined => {
    if (!insight.chartConfig) return undefined;

    const { data, ...rest } = insight.chartConfig;
    if (!data || data.length === 0) return insight.chartConfig;

    // Limit data points for bar/line charts
    let processedData = data;
    if (data.length > MAX_CHART_DATA_POINTS) {
      const sortedData = [...data].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
      processedData = sortedData.slice(0, MAX_CHART_DATA_POINTS);
    }

    // Normalize negative values to absolute for bar charts
    // (the insight title/description already conveys the direction)
    const isBarChart = rest.chartType === 'bar' || rest.chartType === 'grouped_bar' || rest.chartType === 'stacked_bar';
    const hasNegatives = processedData.some((d) => d.value < 0);

    // Truncate long labels and normalize values
    const truncatedData = processedData.map((point) => ({
      ...point,
      value: isBarChart && hasNegatives ? Math.abs(point.value) : point.value,
      label: point.label && point.label.length > MAX_LABEL_LENGTH
        ? point.label.slice(0, MAX_LABEL_LENGTH - 1) + '…'
        : point.label,
    }));

    return {
      ...rest,
      data: truncatedData,
    };
  }, [insight.chartConfig]);

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
      {limitedChartConfig && (
        <View style={styles.chartContainer}>
          <ChartRenderer config={limitedChartConfig} height={CHART_HEIGHT} />
        </View>
      )}

      {/* Action Suggestion */}
      {insight.actionSuggestion && (
        <TouchableOpacity
          style={styles.actionContainer}
          activeOpacity={0.7}
          onPress={() => setShowFullAction(true)}
        >
          <Ionicons name="bulb-outline" size={14} color={theme.colors.primary} />
          <Text style={styles.actionText} numberOfLines={2}>
            {insight.actionSuggestion}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={theme.colors.primary} />
        </TouchableOpacity>
      )}

      {/* Full Action Modal */}
      {showFullAction && insight.actionSuggestion && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setShowFullAction(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowFullAction(false)}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Ionicons name="bulb-outline" size={20} color={theme.colors.primary} />
                <Text style={styles.modalTitle}>{insight.title}</Text>
                <TouchableOpacity onPress={() => setShowFullAction(false)}>
                  <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalActionText}>{insight.actionSuggestion}</Text>
            </Pressable>
          </Pressable>
        </Modal>
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
    overflow: 'hidden' as const,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[4],
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    width: '100%' as const,
    maxWidth: 400,
    ...theme.shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  modalTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  modalActionText: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    lineHeight: 22,
  },
});
