import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SheetDialog } from '@/components/SheetDialog';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useFinancialHealthScore, type HealthScoreComponent, type HealthColorKey } from '@/features/analytics/useFinancialHealthScore';

const GAUGE_SIZE = 88;
const STROKE = 8;
const RADIUS = (GAUGE_SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Stable accessible-name id for the breakdown panel's title. A fixed id is
 * safe for the same reason `ExpenseDialog.tsx`'s `TITLE_ID` is: only one
 * instance of this widget's panel is ever mounted at a time.
 */
const TITLE_ID = 'financial-health-sheet-title';

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

/**
 * The financial-health score card, and the breakdown panel it opens.
 *
 * That panel's chrome — bottom sheet on a phone, centred dialog on desktop web
 * — is `SheetDialog`'s, and so is its bottom inset. The `desktop?` prop this
 * file used to carry (threaded from `DashboardRail` through
 * `renderHomeWidget`) is gone: the wrapper reads the width itself, so there is
 * no flag left for a third call site to forget.
 *
 * **Its bottom padding is the one place this pass moves a phone pixel.** The
 * shipped sheet padded a flat 32 with no inset at all — it is not among
 * ABA-483's eight, and it is the ninth instance of exactly that bug. Routed
 * through the wrapper it is `max(inset, 32)`: identical on a device with no
 * navigation bar, and on a device with one it grows by at most ~16px, to
 * cover the bar the note underneath was sitting behind.
 */
export interface FinancialHealthWidgetProps {
  /**
   * Whether the transaction pull has answered. `undefined` means ready — the
   * phone renders this widget without the prop, and its SQLite mirror is
   * authoritative offline (`HomeWidgetContext.readiness`).
   *
   * It has to be a real input rather than something the score hook works out
   * for itself, because the score is *wrong in the flattering direction* while
   * expenses are loading: `useFinancialHealthScore` always includes the debt
   * component (no debts = 25/25) and includes budget adherence as soon as
   * budgets land (no expenses = no budget exceeded = another 25/25), so a
   * dashboard mid-load reported **"Great, 100"** on an account it knew nothing
   * about.
   */
  dataReady?: boolean;
}

export function FinancialHealthWidget({ dataReady }: FinancialHealthWidgetProps = {}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [sheetOpen, setSheetOpen] = useState(false);

  const healthScore = useFinancialHealthScore();
  const { score, colorKey, components } = healthScore;
  // An unanswered pull is treated exactly as "not enough data": same `?`
  // gauge, same existing copy, no new i18n key — and, crucially, no score.
  const hasEnoughData = healthScore.hasEnoughData && dataReady !== false;

  const scoreColor = colorKey === 'green'
    ? theme.colors.success
    : colorKey === 'yellow'
      ? theme.colors.warning
      : theme.colors.danger;

  // Shared by both chromes, byte-for-byte — only the wrapper differs.
  const panelContent = (
    <>
      <View style={styles.sheetHeader}>
        {hasEnoughData ? (
          <View style={styles.sheetScoreRow}>
            <CircularGauge score={score} colorKey={colorKey} />
            <View style={styles.sheetScoreText}>
              <Text nativeID={TITLE_ID} style={styles.sheetTitle}>{t('healthScore.title')}</Text>
              <Text style={[styles.sheetScoreNumber, { color: scoreColor }]}>{score}</Text>
              <Text style={[styles.sheetScoreLabel, { color: scoreColor }]}>
                {t(`healthScore.label.${colorKey}`)}
              </Text>
            </View>
          </View>
        ) : (
          <Text nativeID={TITLE_ID} style={styles.sheetTitle}>{t('healthScore.title')}</Text>
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
    </>
  );

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

      <SheetDialog
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        titleId={TITLE_ID}
        // See the note above: the shipped value was a flat 32 with no inset.
        padBottom={0}
        insetFloor={32}
        scrimColor="rgba(0,0,0,0.4)"
        sheetStyle={styles.sheetBox}
        handleStyle={styles.handleBox}
        // `panelContent` already contains its own `ScrollView`; a second one
        // inside the dialog is the scroller the design language forbids.
        desktopScroll={false}
      >
        {panelContent}
      </SheetDialog>
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
  // Deviations from `SheetDialog`'s canonical sheet box, kept so the phone's
  // pixels do not move: this panel is capped at 80% of the screen and its own
  // children (`sheetHeader` / `sheetScrollContent`) carry all the padding, so
  // the sheet itself must have none.
  sheetBox: {
    // No border radii here: the shipped literal was 20, which is exactly what
    // `SheetDialog`'s canonical `borderRadius['2xl']` already resolves to, so
    // dropping the local literal moves nothing today and keeps this sheet on
    // the token if the token ever moves.
    maxHeight: '80%' as const,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  handleBox: {
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
    // NOT flex:1 — the sheet is sized by content (maxHeight only), so flex:1
    // (flexBasis:0 + grow) collapses this ScrollView to height 0 on native and
    // only the header shows (which looks like the widget). flexShrink sizes it
    // to content and still lets it shrink/scroll within the sheet's 80% cap.
    flexShrink: 1,
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
