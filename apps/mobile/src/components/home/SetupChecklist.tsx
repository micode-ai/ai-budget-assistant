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
}

/**
 * The setup checklist (`docs/design/…dashboard-web.md`'s "Rail — the setup
 * checklist"): three real steps, each with a live tick derived from data the
 * dashboard has already loaded.
 *
 * **Deliberately NOT under `desktop/`.** Both the first-run rail and the
 * ordinary rail render it — in first-run it replaces the fixed quick-action
 * list and is the whole of that rail, and afterwards it moves to sit
 * directly BELOW that list (taking no `WidgetKey` and no slot, exactly as
 * `InvestmentCard` already does) and stays while any step is outstanding.
 * The position is per-state and belongs to the caller: `DashboardRail` owns
 * it, this component has no opinion about where it is rendered.
 *
 * **Purely presentational.** Every `done` flag arrives as a prop, so the two
 * callers cannot hold different opinions about what is finished; the rule
 * itself lives in `resolveSetupSteps`, and whether to render the card at all
 * (all steps done, or dismissed) belongs to the caller.
 *
 * Nothing on mobile renders this today.
 */
export function SetupChecklist({ steps, onDismiss, title }: SetupChecklistProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

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

      {steps.map((step) => (
        <SetupChecklistRow key={step.id} step={step} />
      ))}
    </View>
  );
}

/**
 * One row. A finished step renders as a plain `View`, not a button: it has
 * nothing left to ask for, and keeping it tappable would send a user who
 * already has wallet balances to the set-balance form to be told so.
 */
function SetupChecklistRow({ step }: { step: SetupStep }) {
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
        <Text style={[styles.rowTitle, step.done && styles.rowTitleDone]} numberOfLines={1}>
          {t(step.titleKey)}
        </Text>
        {!step.done ? (
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

  if (step.done) {
    return <View style={styles.row}>{body}</View>;
  }

  return (
    <TouchableOpacity
      style={styles.row}
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
