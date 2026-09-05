import { Modal, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { DrillDownView, type DrillDownPrefill } from '@/components/analytics/DrillDownView';

/** Only one instance of this dialog is ever mounted at a time (`AnalyticsDesktop`
 *  conditionally renders it from a single boolean slot), so a fixed id is
 *  safe here too — same reasoning as `ExpenseDialog.tsx`'s `TITLE_ID`, just a
 *  distinct string. */
const TITLE_ID = 'drill-down-dialog-title';

interface Props {
  params: DrillDownPrefill;
  onClose: () => void;
}

/**
 * Desktop drill-down dialog (design decision 4: the Spending Trend drill-down
 * is a detail *of this screen*, so it opens over it rather than navigating
 * away). A sibling of `ExpenseDialog.tsx`/`CreateDialog.tsx`, built the same
 * way and for the same reasons (read `ExpenseDialog.tsx`'s header comment
 * first): RN's own `Modal` (role="dialog", aria-modal, Esc, focus trap and
 * restoration), a raw, deliberately un-tabbable `<div>` scrim rather than a
 * `Pressable` (a `Pressable` always emits a tabindex and would become the
 * trap's first focus target ahead of the real content), `theme.colors.overlay`,
 * and `aria-labelledby` pointing at the header title via `nativeID`.
 *
 * Hosts `DrillDownView` — the entire body of `app/analytics/drill-down.tsx`,
 * moved to `src/` unchanged (Task 7) — so the drill-down chart and
 * transaction list are defined in exactly one place; the mobile route hosts
 * the same component. `AnalyticsDesktop`'s own tap targets (the two summary
 * tiles, the trend chart bars) open this dialog with `params` computed from
 * `useAnalyticsScreenData`'s new `drillDownParams` — the exact same
 * `startDate`/`endDate`/`currencyCode`/`level` values `openDrillDown` (still
 * used by mobile, unchanged) would have pushed as route params.
 *
 * The header title is static, from the same i18n key
 * (`drillDown.title`) the route's own `Stack.Screen` in `app/_layout.tsx`
 * already uses — `DrillDownView`'s content has no heading of its own to
 * anchor `aria-labelledby` to (unlike `ProductDetailSheet`, which supplies
 * its own), so this dialog supplies one, mirroring `CreateDialog`'s header.
 *
 * **A definite `height`, not `ExpenseDialog`'s shrink-to-fit `maxHeight`** —
 * same reasoning as `CreateDialog.tsx`'s file comment: `DrillDownView`'s root
 * is `SafeAreaView(flex:1) > ScrollView(flex:1)`, exactly the shape
 * `CreateDialog` documents needing a definite-height ancestor, not a second
 * auto-height `ScrollView` wrapped around it (which would collapse the inner
 * one toward zero height). So `DrillDownView` is rendered directly as the
 * panel's second flex child, no extra `ScrollView` wrapper here.
 *
 * Tapping a transaction row still calls `router.push('/expense/{id}')`
 * un-nested inside `DrillDownView` itself — a different screen, not a detail
 * of this dialog (see that file's own comment); out of scope for this task.
 */
export function DrillDownDialog({ params, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} aria-labelledby={TITLE_ID}>
      {/* Deliberately a raw <div>, not a themed RN View/Pressable — see
          `ExpenseDialog.tsx`'s file-level comment for why it must carry no
          tabindex at all. */}
      <div
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.overlay,
          padding: 24,
        }}
      >
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text nativeID={TITLE_ID} style={styles.title} numberOfLines={1}>
              {t('drillDown.title')}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('expensesDesktop.dialogClose')}
              style={styles.iconButton}
            >
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <DrillDownView initial={params} />
        </View>
      </div>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    width: '90%' as const,
    maxWidth: 680,
    // A definite height, not `ExpenseDialog`'s `maxHeight` — see the
    // file-level comment for why `DrillDownView` needs one.
    height: '85%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden' as const,
    ...theme.shadows.xl,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  iconButton: {
    padding: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
});
