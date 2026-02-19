import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ChartConfig, ChartDataPoint } from '@budget/shared-types';
import { InteractiveBarChart } from './InteractiveBarChart';
import { InteractiveLineChart } from './InteractiveLineChart';
import { InteractiveDonutChart } from './InteractiveDonutChart';

interface ChartRendererProps {
  config: ChartConfig;
  onDataPointPress?: (item: ChartDataPoint, index: number) => void;
  height?: number;
  formatValue?: (value: number) => string;
}

const HIGHLIGHT_COLORS: Record<'anomaly' | 'peak' | 'low', string> = {
  anomaly: '#FF6B6B',
  peak: '#F5A623',
  low: '#45B7D1',
};

export function ChartRenderer({
  config,
  onDataPointPress,
  height = 200,
  formatValue,
}: ChartRendererProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const highlightedData = useMemo(() => {
    if (!config.highlights || config.highlights.length === 0) {
      return config.data;
    }

    const highlightMap = new Map(
      config.highlights.map((h) => [h.dataIndex, h]),
    );

    return config.data.map((point, index) => {
      const highlight = highlightMap.get(index);
      if (highlight) {
        return {
          ...point,
          color: HIGHLIGHT_COLORS[highlight.type],
        };
      }
      return point;
    });
  }, [config.data, config.highlights]);

  const renderChart = () => {
    switch (config.chartType) {
      case 'bar':
      case 'grouped_bar':
      case 'stacked_bar':
        return (
          <InteractiveBarChart
            data={highlightedData}
            height={height}
            onBarPress={onDataPointPress}
            formatValue={formatValue}
            showValues={config.formatting?.showValues}
          />
        );

      case 'line':
        return (
          <InteractiveLineChart
            data={highlightedData}
            height={height}
            onPointPress={onDataPointPress}
            formatValue={formatValue}
          />
        );

      case 'donut':
      case 'pie':
        return (
          <InteractiveDonutChart
            data={highlightedData}
            onSectionPress={onDataPointPress}
            formatValue={formatValue}
            showLegend={config.formatting?.showLegend ?? true}
          />
        );

      default:
        return (
          <View style={styles.unsupported}>
            <Text style={styles.unsupportedText}>
              Unsupported chart type: {config.chartType}
            </Text>
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      {(config.title || config.subtitle) && (
        <View style={styles.header}>
          {config.title ? (
            <Text style={styles.title}>{config.title}</Text>
          ) : null}
          {config.subtitle ? (
            <Text style={styles.subtitle}>{config.subtitle}</Text>
          ) : null}
        </View>
      )}

      {renderChart()}

      {config.highlights && config.highlights.length > 0 && (
        <View style={styles.highlightsContainer}>
          {config.highlights.map((highlight, index) => (
            <View
              key={`highlight-${highlight.dataIndex}-${index}`}
              style={[
                styles.highlightBadge,
                {
                  backgroundColor:
                    highlight.type === 'anomaly'
                      ? theme.colors.dangerLight
                      : highlight.type === 'peak'
                        ? theme.colors.warningLight
                        : theme.colors.primaryLight,
                },
              ]}
            >
              <View
                style={[
                  styles.highlightDot,
                  { backgroundColor: HIGHLIGHT_COLORS[highlight.type] },
                ]}
              />
              <Text style={styles.highlightText} numberOfLines={2}>
                {highlight.message}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    width: '100%' as const,
  },
  header: {
    marginBottom: theme.spacing[3],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[1],
  },
  unsupported: {
    paddingVertical: theme.spacing[5],
    alignItems: 'center' as const,
  },
  unsupportedText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  highlightsContainer: {
    marginTop: theme.spacing[3],
    gap: theme.spacing[2],
  },
  highlightBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  highlightDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: theme.spacing[2],
  },
  highlightText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
  },
});
