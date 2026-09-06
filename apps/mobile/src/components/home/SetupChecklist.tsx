import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { SetupStep } from '@/features/onboarding/resolveSetupSteps';

interface SetupChecklistProps {
  /** From `resolveSetupSteps`. Rendered in the order given, ticks and all. */
  steps: SetupStep[];
  /**
   * Optional. When supplied a dismiss control is shown; when omitted there is
   * none. The first-run rail omits it (the state it lives in ends on its own
   * the moment a transaction lands), the ordinary rail supplies it.
   */
  onDismiss?: () => void;
  /**
   * Optional heading. There is currently NO i18n key for the card's own title
   * and none was invented here — see the task report. Omitted, the card leads
   * with its progress line, which is built from `common.of` and therefore
   * already translated everywhere.
   */
  title?: string;
  /**
   * `'card'` (default) is the rail's vertical card, byte-identical to what
   * shipped. `'band'` lays the same three steps ACROSS a full-width strip —
   * the first-run composition's fourth block, once that state stopped using
   * the focus/rail split.
   *
   * The caller decides, because only the caller has measured its own width
   * (`resolveEntryRowRegime`); this component takes no measurement of its own
   * and holds no opinion about where it is rendered.
   */
  layout?: 'card' | 'band';
}

/**
 * The setup checklist (`docs/design/…dashboard-web.md`'s "Rail — the setup
 * checklist"): three real steps, each with a live tick derived from data the
 * dashboard has already loaded.
 *
 * **Deliberately NOT under `desktop/`.** Two callers render it. In the
 * ordinary rail it is the vertical `'card'` — sitting directly below the
 * quick-action list, taking no `WidgetKey` and no slot exactly as
 * `InvestmentCard` does, and staying while any step is outstanding. In the
 * first-run composition it is the full-width `'band'`, the fourth of that
 * screen's five blocks. Position and variant are the caller's; this
 * component measures nothing and holds no opinion about where it sits.
 *
 * **The band deliberately drops the per-step hint line.** Not an oversight:
 * it is what makes the strip's height independent of how many steps are
 * done, so ticking one updates in place instead of reflowing everything
 * under it. The three titles are imperatives that already stand alone, and
 * the card variant — which has the vertical room — still shows the hints.
 *
 * **Purely presentational.** Every `done` flag arrives as a prop, so the two
 * callers cannot hold different opinions about what is finished; the rule
 * itself lives in `resolveSetupSteps`, and whether to render the card at all
 * (all steps done, or dismissed) belongs to the caller.
 *
 * Nothing on mobile renders this today.
 */
export function SetupChecklist({ steps, onDismiss, title, layout = 'card' }: SetupChecklistProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const band = layout === 'band';
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {/* Numerals plus the existing `common.of` — "2 of 3" / "2 z 3" /
              "2 из 3". No new key, and it reads as progress rather than as a
              list of chores. */}
          <Text style={styles.progress}>
            {doneCount} {t('common.of')} {steps.length}
          </Text>
        </View>
        {onDismiss ? (
          <TouchableOpacity
            onPress={onDismiss}
            style={styles.dismiss}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('common.done')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* `styles.rows` is not decoration: the card used to lay its header and
          three rows out as direct children of `card`, whose `gap` spaced all
          four. Wrapping the rows costs that gap unless the wrapper carries it,
          which would have silently closed up the rail's checklist. */}
      <View style={band ? styles.bandRow : styles.rows}>
        {steps.map((step) => (
          <SetupChecklistRow key={step.id} step={step} band={band} />
        ))}
      </View>
    </View>
  );
}

/**
 * One row. A finished step renders as a plain `View`, not a button: it has
 * nothing left to ask for, and keeping it tappable would send a user who
 * already has wallet balances to the set-balance form to be told so.
 */
function SetupChecklistRow({ step, band = false }: { step: SetupStep; band?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const body = (
    <>
      <Ionicons
        // `success` is a fixed semantic colour, not accent-derived — a tick
        // that turned orange with the user's accent would stop reading as
        // "done" and start reading as "highlighted".
        name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={step.done ? theme.colors.success : theme.colors.textTertiary}
      />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, step.done && styles.rowTitleDone]} numberOfLines={band ? 2 : 1}>
          {t(step.titleKey)}
        </Text>
        {/* Never in the band — see the component's doc comment: a hint that
            disappears when a step is ticked would change the strip's height
            and reflow the skip link under it. */}
        {!band && !step.done ? (
          <Text style={styles.rowHint} numberOfLines={2}>
            {t(step.hintKey)}
          </Text>
        ) : null}
      </View>
      {!step.done ? (
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      ) : null}
    </>
  );

  const rowStyle = band ? [styles.row, styles.bandCell] : styles.row;

  if (step.done) {
    return <View style={rowStyle}>{body}</View>;
  }

  return (
    <TouchableOpacity
      style={rowStyle}
      onPress={() => router.push(step.route as never)}
      activeOpacity={0.7}
      accessibilityRole="button"
    >
      {body}
    </TouchableOpacity>
  );
}

const createStyles = (theme: Theme) => ({
  // Same shell as the rail's quick-action card, so whichever of the two is
  // first the rail begins the same way.
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[4],
    gap: theme.spacing[2],
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[2],
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
  },
  progress: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
  dismiss: {
    padding: theme.spacing[1],
  },
  rows: {
    gap: theme.spacing[2],
  },
  // Band: the three steps laid ACROSS. `alignItems: stretch` so all three
  // cells share the tallest one's height rather than each sizing to its own
  // label, which would leave the ticks on different baselines.
  bandRow: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    gap: theme.spacing[5],
  },
  bandCell: {
    flex: 1,
    minWidth: 0,
    // A little more air than the card's rows: the band is a full-width strip
    // rather than a stack inside a 300px rail.
    paddingVertical: theme.spacing[3],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  rowTitleDone: {
    color: theme.colors.textTertiary,
  },
  rowHint: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
});
