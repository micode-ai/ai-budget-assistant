import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import type { ChartDataPoint } from '@budget/shared-types';

// Compact per-point label (design round 3, designer correction): a short
// signed integer with a locale thousands separator, no currency symbol and
// no decimals - `+1 240`, not `+1 240,07 zl`. Six full currency strings
// read as a wall; six short integers read as annotation. The full,
// currency-formatted value is still what the press tooltip shows
// (`formatValue`, unchanged) - this is only for the small in-plot labels.
function formatCompactPointLabel(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : '';
  return sign + rounded.toLocaleString(getIntlLocale());
}

interface InteractiveLineChartProps {
  data: ChartDataPoint[];
  height?: number;
  onPointPress?: (item: ChartDataPoint, index: number) => void;
  formatValue?: (value: number) => string;
  animate?: boolean;
  lineColor?: string;
  areaChart?: boolean;
  /**
   * Sparkline mode (dashboard desktop hero, docs/design/2026-09-05-
   * dashboard-web.md, revised in round 3 against MEASURED, not assumed,
   * dimensions - see the three fixes below, each verified empirically).
   * Defaults to `false` - every existing call site (mobile
   * `NetProfitWidget`, `ProductDetailSheet`, `ChartRenderer`, the
   * investment screens) passes nothing and is UNCHANGED by every one of
   * these; each is gated on `compact` specifically because the underlying
   * mismatch it fixes exists for every caller, and fixing it unconditionally
   * would change what mobile currently renders, which this component may not
   * do.
   *
   * - Hides the Y-axis numeric labels and the horizontal dashed rule lines
   *   (gifted-charts' own `hideAxesAndRules`), and reclaims the label
   *   gutter (`yAxisLabelWidth`) so the line uses the full container width.
   *   The X-axis rule line stays ON in compact too (designer correction) -
   *   with per-point labels present it is the baseline a signed value is
   *   read against. X-axis MONTH labels and the tappable per-point dots are
   *   unaffected either way. Per-point VALUE labels are kept too (the
   *   product owner's standing direction: this screen is meant to carry
   *   abundant information) but shown as a short, currency-less, signed
   *   integer (designer correction: `+1 240`, not `+1 240,07 zl`) in a
   *   smaller, more muted colour - six full currency strings read as a
   *   wall, six short integers read as annotation.
   * - `height` becomes a TRUE DRAWN TOTAL instead of a library input that
   *   gets inflated by however negative the data happens to be (see the
   *   `libraryHeight` computation below) - confirmed empirically to hold
   *   across k=1..4 (noOfSectionsBelowXAxis), not just the specific dataset
   *   first measured against.
   * - The `spacing` prop is computed against the library's ACTUAL per-point
   *   accumulation (`data.length` units, not `data.length - 1` gaps - see
   *   the `spacing` prop below), so the rendered chart no longer overflows
   *   its own container - confirmed to hold at 3, 6 and 12 points, not just
   *   the 6-point case first measured.
   */
  compact?: boolean;
}

export function InteractiveLineChart({
  data,
  height = 200,
  onPointPress,
  formatValue = (v) => v.toFixed(0),
  animate = true,
  lineColor,
  areaChart = true,
  compact = false,
}: InteractiveLineChartProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [containerWidth, setContainerWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const resolvedLineColor = lineColor ?? theme.colors.primary;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  const handlePointPress = useCallback(
    (item: ChartDataPoint, index: number) => {
      setSelectedIndex(index);
      onPointPress?.(item, index);
    },
    [onPointPress],
  );

  if (data.length === 0) {
    return (
      <View style={[styles.container, { height }]} onLayout={handleLayout}>
        <Text style={styles.emptyText}>{t('drillDown.noDataAvailable')}</Text>
      </View>
    );
  }

  // y-axis label area is ~50px wide; subtract it so the SVG fits exactly in the container.
  // Compact mode hides that area entirely (see the `compact` prop doc above), so the
  // line gets the full container width instead of leaving the gutter blank.
  const yAxisLabelWidth = compact ? 0 : 50;
  const chartWidth = containerWidth > 0 ? containerWidth - yAxisLabelWidth : 0;

  const lineData = data.map((point, index) => ({
    value: point.value,
    label: point.label,
    // The product owner's standing direction for this screen ("the
    // dashboard... is meant to carry abundant information") overrides the
    // earlier round-3 plan to drop these in compact mode - kept in BOTH
    // modes. Compact uses a short, currency-less integer (designer
    // correction - see `formatCompactPointLabel` above) plus a smaller,
    // more muted colour (`textFontSize`/`textColor` below), since six full
    // currency strings inside a much shorter plot read as a wall.
    dataPointText: compact ? formatCompactPointLabel(point.value) : formatValue(point.value),
    customDataPoint: () => (
      <TouchableOpacity
        onPress={() => handlePointPress(point, index)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.dataPoint,
            {
              backgroundColor:
                selectedIndex === index
                  ? theme.colors.primaryDark
                  : resolvedLineColor,
            },
          ]}
        />
      </TouchableOpacity>
    ),
  }));

  // When the data contains negative values, gifted-charts renders an extra region BELOW
  // the x-axis whose height is (noOfSectionsBelowXAxis * height / noOfSections) — i.e. it
  // extends the chart *beyond* `height`. The wrapper is auto-height (see chartClip) so that
  // region is shown, not vertically clipped. Keep the below-axis sections proportional to
  // the most-negative point (1..noOfSections) so the card is only as tall as the data needs.
  const noOfSections = 4;
  const hasNegative = data.some((d) => d.value < 0);
  const maxDataAbs = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  const minDataValue = hasNegative ? Math.min(...data.map((d) => d.value)) : 0;
  const maxValue = maxDataAbs * 1.15;
  const mostNegativeValue = hasNegative ? minDataValue * 1.15 : undefined;
  const stepValue = maxValue / noOfSections;
  const noOfSectionsBelowXAxis =
    hasNegative && mostNegativeValue !== undefined
      ? Math.min(noOfSections, Math.max(1, Math.ceil(Math.abs(mostNegativeValue) / stepValue)))
      : undefined;

  // `overflowTop` is real headroom, not decoration: `textShiftY={-8}` draws
  // each per-point label ABOVE its point, so with none, a point near the top
  // of the band clips its own label. Compact keeps a smaller ~12 (no y-axis
  // labels to make room for, per `hideAxesAndRules`) rather than 16.
  const overflowTopValue = compact ? 12 : 16;

  // `height` is the PROP gifted-charts takes, not the drawn total. TWO
  // things inflate it beyond that prop, verified by reading gifted-charts-
  // core's own source (`getExtendedContainerHeightWithPadding`,
  // `fourthQuadrantHeight`), not assumed:
  //   drawn = height * (noOfSections + k) / noOfSections + overflowTop + 10
  // (1) a hardcoded `+ 10` padding baked into EVERY render regardless of
  //     data, and (2) the below-axis region, `(k / noOfSections) * height`
  //     (the trap documented above) — DATA-DEPENDENT: unfixed, the same 140
  //     prop draws ~215 at today's k=2, or ~220 at a deeper k=4, right back
  //     where this started. Compact mode inverts the WHOLE formula so its
  //     `height` prop becomes what it names — a true drawn TOTAL, invariant
  //     to k, with `overflowTopValue` and the fixed 10 already accounted
  //     for (so the caller's target height genuinely includes the labels'
  //     headroom, not silently adding it on top) — confirmed empirically
  //     across k=0..4. Gated on `compact`: this mismatch exists for every
  //     InteractiveLineChart caller, but correcting it for the non-compact
  //     path would change what mobile (and every other existing consumer)
  //     currently renders, which this fix must not do.
  // A further ~18px shows up in every measurement regardless of k OR data
  // length, ON TOP of the source-derived formula above - not traced to a
  // specific line in gifted-charts-core (candidates: the tappable dot's own
  // radius, or headroom the library reserves near the plot's own top/bottom
  // edge for the per-point label's glyph height beyond `overflowTop`), so
  // this is an EMPIRICAL correction, verified by measuring the rendered
  // result against the target across k=1..4 and n=3/6/12 - not a value read
  // out of the source the way the `10` above was.
  const EMPIRICAL_CHROME = 18;

  const libraryHeight = compact
    ? Math.round(
        ((height - overflowTopValue - 10 - EMPIRICAL_CHROME) * noOfSections) /
          (noOfSections + (noOfSectionsBelowXAxis ?? 0)),
      )
    : height;

  return (
    <View style={styles.container} onLayout={handleLayout}>
      {selectedIndex !== null && data[selectedIndex] && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipLabel}>{data[selectedIndex].label}</Text>
          <Text style={styles.tooltipValue}>
            {formatValue(data[selectedIndex].value)}
          </Text>
        </View>
      )}
      {/* Auto-height wrapper: overflow:hidden still trims any horizontal spill past the
          right edge (the old bug), but no fixed height — so the below-x-axis negative
          region (which gifted-charts draws beyond `height`) is shown, not clipped. */}
      <View style={styles.chartClip}>
        {chartWidth > 0 && (
          <LineChart
            data={lineData}
            width={chartWidth}
            height={libraryHeight}
            overflowTop={overflowTopValue}
            isAnimated={animate}
            animationDuration={600}
            curved
            maxValue={maxValue}
            noOfSections={noOfSections}
            mostNegativeValue={mostNegativeValue}
            noOfSectionsBelowXAxis={noOfSectionsBelowXAxis}
            yAxisThickness={0}
            // Stays 1 in compact too (designer correction): with the
            // per-point labels present, the axis rule is the baseline a
            // signed value like -340 is read against.
            xAxisThickness={1}
            xAxisColor={theme.colors.border}
            yAxisTextStyle={styles.axisText}
            xAxisLabelTextStyle={styles.axisText}
            rulesColor={theme.colors.borderLight}
            rulesType="dashed"
            color={resolvedLineColor}
            thickness={2}
            dataPointsColor={resolvedLineColor}
            dataPointsRadius={4}
            areaChart={areaChart}
            startFillColor={resolvedLineColor}
            startOpacity={0.2}
            endFillColor={resolvedLineColor}
            endOpacity={0.02}
            textShiftY={-8}
            textShiftX={-4}
            textFontSize={compact ? 9 : 10}
            textColor={compact ? theme.colors.textTertiary : theme.colors.textSecondary}
            hideDataPoints={false}
            initialSpacing={8}
            endSpacing={8}
            // gifted-charts sums ONE `spacing` unit per DATA POINT (data.length
            // times), not per gap between points (data.length - 1) - its own
            // `totalWidth = initialSpacing + spacing * data.length + endSpacing`
            // (gifted-charts-core/dist/LineChart/index.js). Dividing by
            // `data.length - 1` (as if N points had N-1 gaps, the natural
            // reading) under-counts by one whole `spacing` unit, so the
            // library renders roughly 20% WIDER than the `chartWidth` we
            // measured and asked for - confirmed empirically (a 1497px
            // container rendered a 1806px chart). Fixed for `compact` only:
            // this is a pre-existing mismatch in EVERY InteractiveLineChart
            // caller, and correcting it for the non-compact path would change
            // what mobile (and every other existing consumer) currently
            // renders, which this fix must not do.
            spacing={
              data.length > 1
                ? Math.max(30, (chartWidth - 16) / (compact ? data.length : data.length - 1))
                : chartWidth
            }
            hideAxesAndRules={compact}
            yAxisLabelWidth={compact ? 0 : undefined}
          />
        )}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    width: '100%' as const,
  },
  // Explicit clip wrapper — only the chart SVG is clipped, not the card itself
  chartClip: {
    width: '100%' as const,
    overflow: 'hidden' as const,
  },
  emptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginVertical: theme.spacing[5],
  },
  tooltip: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    marginBottom: theme.spacing[2],
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tooltipLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  tooltipValue: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[0.5],
  },
  dataPoint: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  axisText: {
    ...theme.textStyles.caption,
    fontSize: 10,
    color: theme.colors.textTertiary,
  },
});
