import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useFinancialHealthScore, type HealthScoreComponent, type HealthColorKey } from '@/features/analytics/useFinancialHealthScore';

const GAUGE_SIZE = 88;
const STROKE = 8;
const RADIUS = (GAUGE_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function CircularGauge({ score, colorKey }: { score: number; colorKey: HealthColorKey }) {
  const theme = useTheme();
  const fill = colorKey === 'green'
    ? theme.colors.success
    : colorKey === 'yellow'
      ? theme.colors.warning
      : theme.colors.danger;

  const progress = Math.max(0, Math.min(score, 100)) / 100;
  const arcLength = CIRCUMFERENCE * progress;
  const gap = CIRCUMFERENCE - arcLength;

  return (
    <View style={{ width: GAUGE_SIZE, height: GAUGE_SIZE, alignItems: 'center', justifyContent: 'center' }}>
      {/* Track arc */}
      <View
        style={{
          position: 'absolute',
          width: GAUGE_SIZE,
          height: GAUGE_SIZE,
          borderRadius: GAUGE_SIZE / 2,
          borderWidth: STROKE,
          borderColor: theme.colors.progressTrack,
        }}
      />
      {/* Filled arc using border trick: rotate so arc starts at top */}
      {progress > 0 && (
        <View
          style={{
            position: 'absolute',
            width: GAUGE_SIZE,
            height: GAUGE_SIZE,
            borderRadius: GAUGE_SIZE / 2,
            borderWidth: STROKE,
            borderColor: 'transparent',
            borderTopColor: fill,
            borderRightColor: progress > 0.25 ? fill : 'transparent',
            borderBottomColor: progress > 0.5 ? fill : 'transparent',
            borderLeftColor: progress > 0.75 ? fill : 'transparent',
            transform: [{ rotate: '-90deg' }],
          }}
        />
      )}
      <Text style={{ fontSize: 22, fontWeight: '800', color: fill }}>{score}</Text>
    </View>
  );
}

const COMPONENT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  budgetAdherence: 'wallet-outline',
  savingsRate: 'trending-up-outline',
  goalProgress: 'flag-outline',
  debtHealth: 'shield-checkmark-outline',
};

function ComponentRow({ component }: { component: HealthScoreComponent }) {
  const { t } = useTranslation();
  const theme = useTheme();

  const fillColor = !component.included
    ? theme.colors.textDisabled
    : component.points === 25
      ? theme.colors.success
      : component.points >= 15
        ? theme.colors.warning
        : theme.colors.danger;

  const icon: keyof typeof Ionicons.glyphMap = component.points === 25 && component.included
    ? 'checkmark-circle'
    : component.included
      ? 'warning'
      : 'remove-circle-outline';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, gap: 12 }}>
      <Ionicons name={COMPONENT_ICONS[component.key] ?? 'ellipse-outline'} size={20} color={fillColor} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ ...theme.textStyles.bodySmMedium, color: theme.colors.textPrimary }}>
          {t(`healthScore.component.${component.key}`)}
        </Text>
        <Text style={{ ...theme.textStyles.caption, color: theme.colors.textSecondary, marginTop: 2 }}>
          {component.included
            ? t(component.detailKey, component.detailParams)
            : t(component.detailKey)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name={icon} size={16} color={fillColor} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: fillColor }}>
          {component.included ? `${component.points}/25` : '—'}
        </Text>
      </View>
    </View>
  );
}

export function FinancialHealthWidget() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [sheetOpen, setSheetOpen] = useState(false);

  const healthScore = useFinancialHealthScore();
  const { score, hasEnoughData, colorKey, components } = healthScore;

  const scoreColor = colorKey === 'green'
    ? theme.colors.success
    : colorKey === 'yellow'
      ? theme.colors.warning
      : theme.colors.danger;

  return (
    <>
      <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => setSheetOpen(true)}>
        <View style={styles.chevronHint}>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
        </View>
        <View style={styles.row}>
          <View style={styles.textSide}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{t('healthScore.title')}</Text>
            </View>
            {hasEnoughData ? (
              <>
                <Text style={[styles.scoreLabel, { color: scoreColor }]}>
                  {t(`healthScore.label.${colorKey}`)}
                </Text>
                <Text style={styles.subtitle}>{t('healthScore.tapForDetails')}</Text>
              </>
            ) : (
              <Text style={styles.noData}>{t('healthScore.notEnoughData')}</Text>
            )}
          </View>
          {hasEnoughData ? (
            <CircularGauge score={score} colorKey={colorKey} />
          ) : (
            <View style={[styles.gaugeEmpty, { borderColor: theme.colors.progressTrack }]}>
              <Ionicons name="help-outline" size={28} color={theme.colors.textDisabled} />
            </View>
          )}
        </View>
      </TouchableOpacity>

      <Modal
        visible={sheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            {hasEnoughData ? (
              <View style={styles.sheetScoreRow}>
                <CircularGauge score={score} colorKey={colorKey} />
                <View style={styles.sheetScoreText}>
                  <Text style={styles.sheetTitle}>{t('healthScore.title')}</Text>
                  <Text style={[styles.sheetScoreNumber, { color: scoreColor }]}>{score}</Text>
                  <Text style={[styles.sheetScoreLabel, { color: scoreColor }]}>
                    {t(`healthScore.label.${colorKey}`)}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.sheetTitle}>{t('healthScore.title')}</Text>
            )}
          </View>
          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent}>
            <Text style={styles.sheetSectionLabel}>{t('healthScore.breakdown')}</Text>
            {components.map((c, i) => (
              <View key={c.key}>
                <ComponentRow component={c} />
                {i < components.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
            <Text style={styles.sheetNote}>{t('healthScore.note')}</Text>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
  },
  chevronHint: {
    position: 'absolute' as const,
    top: theme.spacing[3],
    right: theme.spacing[3],
    zIndex: 1,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[4],
  },
  textSide: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  title: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  scoreLabel: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '700' as const,
    fontSize: 15,
  },
  subtitle: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
  },
  noData: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  gaugeEmpty: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%' as const,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center' as const,
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  sheetScoreRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[5],
  },
  sheetScoreText: {
    gap: 2,
  },
  sheetTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  sheetScoreNumber: {
    fontSize: 36,
    fontWeight: '900' as const,
    lineHeight: 40,
  },
  sheetScoreLabel: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '600' as const,
  },
  sheetScroll: {
    flex: 1,
  },
  sheetScrollContent: {
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
  sheetSectionLabel: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: theme.spacing[2],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
  },
  sheetNote: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[4],
    textAlign: 'center' as const,
  },
});
