import { useState } from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { CHECKLIST_CELL_MAX_WIDTH } from '@/components/webLayout.constants';
import type { SetupStep } from '@/features/onboarding/resolveSetupSteps';

interface SetupChecklistProps {
  /** From `resolveSetupSteps`. Rendered in the order given, ticks and all. */
  steps: SetupStep[];
  /**
   * Open a step's destination. Required, and required on purpose: both callers
   * are desktop-only, every step's route has a dialog, and a step that quietly
   * fell back to `router.push` would be the exact regression this whole change
   * removes — invisible to types, tests and the eye. A compile error is the
   * only thing in this repo that can catch it. A future mobile caller passes an
   * explicit `router.push` closure and says so.
   */
  onOpenStep: (step: SetupStep) => void;
  /**
   * Optional. When supplied a dismiss control is shown; when omitted there is
   * none. The first-run band omits it (the state it lives in ends on its own
   * the moment a transaction lands), the ordinary rail supplies it.
   */
  onDismiss?: () => void;
  /**
   * `'card'` (default) is the rail's vertical card. `'band'` lays the same
   * three steps ACROSS a full-width strip — the first-run composition's fourth
   * block.
   *
   * The caller decides, because only the caller has measured its own width
   * (`resolveEntryRowRegime`); this component takes no measurement of its own
   * and holds no opinion about where it is rendered.
   */
  layout?: 'card' | 'band';
}

/**
 * The setup checklist: three real steps, each with a live tick derived from
 * data the dashboard has already loaded.
 *
 * **Deliberately NOT under `desktop/`.** Two callers render it: the ordinary
 * rail's vertical `'card'`, and the first-run composition's full-width
 * `'band'`. Position and variant are the caller's; this component measures
 * nothing.
 *
 * ## What Addendum 2 changed, and why each part is not a style preference
 *
 * The band was measured at 1640px: three 539px cells holding ~130px of content,
 * each step's chevron pinned ~390px from its own label. The diagnosis was
 * *one void at a card's trailing edge is invisible; three voids between an item
 * and its own chevron are the defect.*
 *
 * - **No chevron, in either variant.** It is a list-row idiom — it exists
 *   because a full-width phone row's target is ambiguous — and in a short cell
 *   it clarifies nothing while causing the whole traverse. More decisively, a
 *   chevron means "this leaves" everywhere in this app, and every step now
 *   opens a dialog over the dashboard, so it advertised navigation and
 *   delivered a dialog.
 * - **The affordance is the cell.** One `Pressable` per step: `cursor: pointer`
 *   comes free on web, plus a hover tint, and it is a real focusable target
 *   reachable by Tab and activated by Enter/Space — which a chevron never was.
 * - **No "N of 3" counter, in either variant.** A small grey string alone in
 *   the top-left occupies the *title slot*, so the band still read as an
 *   untitled card; relocating it only moved the problem. Three visible circles
 *   are the counter. (It used `common.of`, which five other screens still use —
 *   so no key was actually freed, and none was deleted.)
 * - **A completed step stays clickable** but reads as settled: filled circle,
 *   dimmed label. Not disabled — a dead cell in a row of three is worse than a
 *   redundant one, and re-opening the wallet or budget dialog is harmless.
 * - **Cells are `flex: 1` with a cap, left-packed** — not equal thirds. An
 *   equal split of 1640px guarantees ~400px of nothing per cell, and the band
 *   sits directly under the row of three entry cards, so a stretched echo of
 *   that rhythm holding a fifth of the content reads as the same row, broken.
 *   The cap only bites above ~1300px of content width, so 1440 and 1200 fill
 *   naturally and the leftover sits at the band's right edge.
 *
 * **Both variants now show each step's hint**, where the band used to drop it.
 * That was justified by keeping the strip's height independent of how many
 * steps are done; with the chevron gone a cell is a circle and one short label,
 * which is what made a capped cell feel thin. The hint is still hidden once a
 * step is done, because all three hints are imperatives ("Add your first
 * expense to get started") and showing one under a ticked step tells the user
 * to do something they have already done. The cost is that ticking the wallet
 * or budget step reflows the band slightly — which the rail's card variant has
 * always done, and which now happens behind an open dialog.
 *
 * **Purely presentational.** Every `done` flag arrives as a prop, so the two
 * callers cannot hold different opinions about what is finished; the rule
 * lives in `resolveSetupSteps`, and whether to render at all belongs to the
 * caller.
 *
 * Nothing on mobile renders this today.
 */
export function SetupChecklist({
  steps,
  onOpenStep,
  onDismiss,
  layout = 'card',
}: SetupChecklistProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const band = layout === 'band';

  return (
    <View style={styles.card}>
      {/* Only the dismiss control survives in the header — the counter is gone
          and there has never been a title. With neither, the header is not
          rendered at all rather than reserving an empty strip. */}
      {onDismiss ? (
        <View style={styles.header}>
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
        </View>
      ) : null}

      <View style={band ? styles.bandRow : styles.rows}>
        {steps.map((step) => (
          <SetupChecklistRow key={step.id} step={step} band={band} onOpen={onOpenStep} />
        ))}
      </View>
    </View>
  );
}

/**
 * One step, as a single pressable target.
 *
 * A finished step is still pressable (criterion 36) — it just reads as
 * settled. It used to render as a plain `View` on the argument that it had
 * nothing left to ask for; that argument does not survive the step opening a
 * dialog instead of navigating, since re-opening the wallet or budget dialog
 * costs nothing and a dead cell between two live ones is its own defect.
 */
function SetupChecklistRow({
  step,
  band = false,
  onOpen,
}: {
  step: SetupStep;
  band?: boolean;
  onOpen: (step: SetupStep) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  // The established hover pattern on this surface (`BudgetCard`, `FacetRail`,
  // `AnalyticsDesktop`'s summary tiles): explicit state via
  // `onHoverIn`/`onHoverOut`, tinting to `surfaceSecondary`. No-ops on native,
  // where nothing renders this anyway.
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={() => onOpen(step)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={t(step.titleKey)}
      style={[
        styles.row,
        band ? styles.bandCell : null,
        hovered ? styles.rowHovered : null,
      ]}
    >
      <Ionicons
        // `success` is a fixed semantic colour, not accent-derived — a tick
        // that turned orange with the user's accent would stop reading as
        // "done" and start reading as "highlighted".
        name={step.done ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={step.done ? theme.colors.success : theme.colors.textTertiary}
      />
      <View style={styles.rowText}>
        <Text
          style={[styles.rowTitle, step.done && styles.rowTitleDone]}
          numberOfLines={band ? 2 : 1}
        >
          {t(step.titleKey)}
        </Text>
        {!step.done ? (
          <Text style={styles.rowHint} numberOfLines={2}>
            {t(step.hintKey)}
          </Text>
        ) : null}
      </View>
    </Pressable>
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
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
  },
  dismiss: {
    padding: theme.spacing[1],
  },
  // Tighter than the `spacing[2]` that shipped: each row now carries its own
  // vertical padding and a hover background, so the old gap left visible air
  // between three tinted blocks rather than between three lines of text.
  rows: {
    gap: theme.spacing[1],
  },
  // Band: the three steps laid ACROSS, LEFT-PACKED. `flex: 1` with a
  // `maxWidth` on each cell (not `justifyContent: space-between`, not equal
  // thirds) is what puts the leftover space at the band's right edge instead
  // of inside every cell. `alignItems: stretch` so all three share the
  // tallest one's height rather than each sizing to its own label, which
  // would leave the ticks on different baselines.
  bandRow: {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    // Unchanged from what shipped: the addendum specified the cap and the
    // left-packing, not the gap, and with a cap in play a wider gap only moves
    // space from between the cells to the trailing edge.
    gap: theme.spacing[5],
  },
  bandCell: {
    flex: 1,
    minWidth: 0,
    maxWidth: CHECKLIST_CELL_MAX_WIDTH,
    // A little more air than the card's rows: the band is a full-width strip
    // rather than a stack inside a 300px rail.
    paddingVertical: theme.spacing[3],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    // Horizontal padding and a radius exist for the hover tint: without them
    // the tint is a full-bleed strip touching the card's border rather than a
    // block that reads as one target.
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSecondary,
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
    color: theme.colors.textSecondary,
  },
  rowHint: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
});
