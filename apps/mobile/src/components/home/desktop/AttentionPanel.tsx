import { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  type LayoutChangeEvent,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { getIntlLocale } from '@/i18n';
import { showAlert } from '@/utils/alert';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAlertStore } from '@/stores/alertStore';
import { useInvitationStore } from '@/stores/invitationStore';
import { useAccountStore } from '@/stores/accountStore';
import { useBudgetStore } from '@/stores/budgetStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useUserSubscriptionStore } from '@/stores/userSubscriptionStore';
import { usePurchaseRequestStore } from '@/stores/purchaseRequestStore';
import { InvitationCard } from '@/components/alerts/InvitationCard';
import { ExpenseDialog } from '@/components/expenses/desktop/ExpenseDialog';
import { renderAlertBody, TYPE_ICON } from '@/features/alerts/alertPresentation';
import { useAlertTapThrough } from '@/hooks/useAlertTapThrough';
import {
  ALL_ATTENTION_ROWS,
  buildAttentionItems,
  type AttentionItem,
} from '@/features/dashboard/attentionItems';
import { alertAction, buildMarkRecurringUpdate } from '@/features/dashboard/attentionActions';
import { resolveAttentionEnrichment } from '@/features/dashboard/attentionEnrichment';

/**
 * Below this MEASURED panel width a row's action buttons drop under its text
 * instead of sitting beside it. The design's own figure: "the attention
 * panel's rows wrap their action buttons under the text below ~700px of
 * focus-column width".
 *
 * It used to be imported from `FirstRunPanel`'s grid threshold, because the
 * design named one number for both. That coupling is gone with the first-run
 * grid: the first-run state no longer uses the focus/rail split, so its cards
 * are measured against the FULL content width while this panel is still
 * measured against a focus column narrowed by one or two rails. Two different
 * containers, so two independent thresholds — sharing one now would mean a
 * change made for the wide composition silently re-wrapping this panel.
 *
 * Measured with `onLayout` on the panel, **not** `useContentWidth()`: that
 * hook reports the window, which is right for a single-column screen and
 * wrong here.
 */
const ATTENTION_ROW_STACK_WIDTH = 700;

type IconName = keyof typeof Ionicons.glyphMap;

const KIND_ICON: Record<Exclude<AttentionItem['kind'], 'invitation' | 'alert'>, IconName> = {
  purchaseRequests: 'cart-outline',
  budget: 'pie-chart-outline',
  renewal: 'repeat-outline',
};

interface Props {
  /** Viewers may read every row but write none of them, so the two inline
   *  resolutions (accept/decline, track, dismiss) are hidden for them —
   *  the server blocks all three with `ViewerBlockGuard` and a button that
   *  can only fail is worse than no button. */
  canEdit: boolean;
}

/**
 * "Needs your attention" — the ONE block on the desktop dashboard that is ever
 * allowed to demand something, and the reason the screen is worth staying on
 * (`docs/design/2026-09-05-dashboard-web.md`'s "One card, not five" and "What
 * a click does").
 *
 * ## One block, three rows, and it hides when empty
 *
 * Five separate cards would put five differently-shaped urgencies in five
 * places and reintroduce the "which number matters" problem the focus column
 * exists to solve. Composition, ordering and the cap are NOT decided here —
 * they are `features/dashboard/attentionItems.ts`, tested, because a wrong
 * ordering renders perfectly. This file only draws what that module returns,
 * in the array order it returns it, and shows the `+N more` row only when
 * `overflowCount > 0`.
 *
 * On most days the list is empty and this draws nothing at all. That is the
 * correct dashboard, not a failure.
 *
 * ## `+N more` expands in place; it does not navigate
 *
 * The cap governs the RESTING state — three rows until the user asks
 * otherwise. Asking shows the rest **here**, in the same panel: the overflow
 * can hold a budget or a renewal, and neither of those appears on `/alerts`,
 * so sending a person there sends them somewhere their item is not. It is also
 * the thesis of the whole screen — navigating away is the leaving this feature
 * exists to prevent, so the overflow control of all things must not be the one
 * that navigates. Same expand/collapse shape `FacetRail` already uses on the
 * transactions screen, down to the two i18n keys.
 *
 * ## Resolving in place is the whole point
 *
 * **Navigating away IS the user leaving.** So every row whose action changes
 * state rather than subject resolves without a navigation:
 *
 * | Row | Resolves in place | How |
 * |---|---|---|
 * | Invitation | **yes** | hosts `InvitationCard`, `invitationStore.respond` |
 * | Alert referencing an expense | **yes** | hosts `ExpenseDialog` |
 * | `recurring_suggestion` | **yes** | inline Track button → `createSubscription`, then dismiss; PLUS a "Mark as recurring" button → `expenseStore.updateExpense`, then dismiss (`recurring-bill-detection-nudge`) |
 * | Alert dismiss (x) | **yes** | `alertStore.dismiss`, optimistic |
 * | `+N more` | **yes** | expands the panel; see below |
 * | `possible_merge` | no | a two-expense merge is a real screen with real choices |
 * | Purchase requests | no | voting needs the full context |
 * | Renewal | no | `/subscriptions` |
 * | Budget | no | the Budgets tab, which HAS a desktop treatment |
 *
 * Every one of the four in-place resolutions HOSTS an existing component or
 * store action; none reimplements one. `ExpenseDialog` in particular is the
 * same dialog the transactions screen opens, hosting the same
 * `ExpenseDetailsCard` through the same ref handle — so what an edit does is
 * defined in exactly one place, and the alert path cannot drift from it.
 *
 * ## The expense-resolution quirk is reused, never rewritten
 *
 * An alert deep-links by the expense's SERVER PK while a locally-created row
 * is keyed by its clientId until a pull backfills `serverId`. The four-way
 * match, the one forced `loadExpenses({ force: true })` retry and the
 * `alerts.alreadyResolved*` fallback all live in
 * `features/alerts/resolveAlertExpense.ts` and are called from here unchanged.
 * Rewriting them is how "the expense won't open from the alert" comes back.
 */
export function AttentionPanel({ canEdit }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [panelWidth, setPanelWidth] = useState(0);
  const stacked = panelWidth > 0 && panelWidth < ATTENTION_ROW_STACK_WIDTH;

  /**
   * Screen-local UI state, deliberately NOT a store field and NOT a persisted
   * preference: the cap is the default and the expansion is a deliberate act
   * each time, so collapsing on remount is the correct behaviour rather than
   * something to fix. `FacetRail` holds its own equivalent the same way.
   */
  const [expanded, setExpanded] = useState(false);

  const invitations = useInvitationStore((s) => s.invitations);
  const respond = useInvitationStore((s) => s.respond);
  const alerts = useAlertStore((s) => s.alerts);
  const dismiss = useAlertStore((s) => s.dismiss);
  const budgets = useBudgetStore((s) => s.budgets);
  const getBudgetProgress = useBudgetStore((s) => s.getBudgetProgress);
  // `getBudgetProgress` reads the expense and category stores through a plain
  // `.getState()` snapshot rather than a subscription, so neither `budgets`
  // nor the function identity changes when an expense is added. Both stores
  // are therefore real memo dependencies — see `FocusColumn.tsx`'s long note
  // on the same hazard, which was a reproduced bug there, not a theory.
  const expenses = useExpenseStore((s) => s.expenses);
  const categories = useCategoryStore((s) => s.categories);

  // The two Phase B kinds. `DashboardDesktop` issues both reads (see its own
  // note on why they are not in `useHomeScreenData`); this panel only reads
  // whatever landed, exactly as it does for alerts and invitations. Neither
  // store is ever empty in an error sense — both simply hold less — so there
  // is nothing here to branch on.
  const pendingPurchaseRequestCount = usePurchaseRequestStore((s) => s.pendingCount);
  const subscriptions = useUserSubscriptionStore((s) => s.subscriptions);

  // Declared here rather than beside the dialog state below because the memo
  // needs it: it is the account whose rows this panel is entitled to show.
  const currentAccount = useAccountStore((s) => s.currentAccount());

  /**
   * `hiddenCount` is ALWAYS read off the capped reading, never off the expanded
   * one — an uncapped call drops nothing and so reports `overflowCount: 0` by
   * construction. Deriving it in one place keeps the number on the label and
   * the number of rows actually withheld the same quantity, which is the trap
   * `attentionItems.ts`'s own header warns about: two expressions of one number
   * both render, and only one of them is right.
   *
   * The second, uncapped call is made only when the user has actually expanded
   * AND something was actually hidden, so the common (collapsed, calm) path
   * still composes the list exactly once.
   */
  const { visible, hiddenCount } = useMemo(() => {
    // The two Phase B inputs cross into the tested rules through
    // `resolveAttentionEnrichment` and nowhere else — it is the one place that
    // decides whether the purchase-request count applies to this account,
    // whether these subscriptions are this account's, and whether each one
    // carries a day count that can honestly be compared against the horizon.
    // It returns exactly the two optional fields of `AttentionInputs` and
    // nothing else, so the spread cannot reach the four Phase A keys above it.
    const inputs = {
      invitations,
      alerts,
      budgets,
      getBudgetProgress,
      ...resolveAttentionEnrichment({
        accountId: currentAccount?.id,
        accountType: currentAccount?.type,
        pendingPurchaseRequestCount,
        subscriptions,
      }),
    };
    const capped = buildAttentionItems(inputs);
    if (!expanded || capped.overflowCount === 0) {
      return { visible: capped.items, hiddenCount: capped.overflowCount };
    }
    return {
      visible: buildAttentionItems(inputs, ALL_ATTENTION_ROWS).items,
      hiddenCount: capped.overflowCount,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    invitations,
    alerts,
    budgets,
    getBudgetProgress,
    expenses,
    categories,
    expanded,
    pendingPurchaseRequestCount,
    subscriptions,
    // The two fields, not the object. `currentAccount()` re-finds its element
    // in whatever `accounts` array the store currently holds, so any reload of
    // the account list hands back a fresh identity; depending on the object
    // would recompose the whole list on every such refresh, while these two
    // are exactly what the enrichment reads.
    currentAccount?.id,
    currentAccount?.type,
  ]);

  // ---- Tapping an alert -------------------------------------------------
  //
  // The whole flow — resolving the target, the forced-pull spinner, the
  // `markRead`-only-on-success ordering rule, and the `ExpenseDialog` this
  // panel hosts — moved into `useAlertTapThrough` when the top bar's alerts
  // panel needed exactly the same behaviour. Two hand-written copies of a
  // flow whose correctness depends on WHEN one call happens is the drift this
  // layer exists to prevent; the hook's own doc comment states the rule.
  const alertTap = useAlertTapThrough({ canEdit });
  const { resolvingId } = alertTap;

  const handleAccept = async (id: string) => {
    try {
      await respond(id, 'accept');
      await useAccountStore.getState().loadAccounts();
    } catch (e) {
      // `showAlert`, never `Alert.alert` — react-native-web stubs the latter
      // to a no-op, so the dialog would simply never appear on the one
      // platform this component runs on.
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleDecline = async (id: string) => {
    try {
      await respond(id, 'decline');
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  /**
   * The panel hides when empty; the dialog does NOT live inside it.
   *
   * That is not tidiness — it is a bug fixed. Opening an alert marks it read,
   * which removes it from `items`; if it was the last row, an early
   * `if (items.length === 0) return null` would unmount the dialog in the same
   * commit that opened it, so the expense would flash and vanish. Hoisting the
   * dialog out of the conditional makes the panel's own emptiness and the
   * dialog's lifetime independent, which they are.
   */
  return (
    <>
      {visible.length > 0 && (
        <View
          style={styles.panel}
          onLayout={(e: LayoutChangeEvent) => setPanelWidth(e.nativeEvent.layout.width)}
        >
          <Text style={styles.heading}>{t('budgetsDesktop.needsAttention')}</Text>

          {visible.map((item) => {
            switch (item.kind) {
              case 'invitation':
                return (
                  // Hosts the component `app/alerts/index.tsx` already uses,
                  // including its own copy and its own Accept/Decline buttons —
                  // a second invitation renderer is exactly the drift this whole
                  // desktop layer is built to avoid.
                  <InvitationCard
                    key={item.key}
                    invitation={item.invitation}
                    onAccept={() => handleAccept(item.invitation.id)}
                    onDecline={() => handleDecline(item.invitation.id)}
                  />
                );

              case 'purchaseRequests':
                return (
                  <AttentionRow
                    key={item.key}
                    icon={KIND_ICON.purchaseRequests}
                    title={t('purchaseRequests.title')}
                    // Label-then-count, never "{{count}} requests": this i18n
                    // setup does Slavic plural agreement only through explicit
                    // `_one`/`_few`/`_many` keys, and none exist for this. Same
                    // shape the bots' price-check line uses for the same reason.
                    body={`${t('purchaseRequests.pending')}: ${item.count}`}
                    onPress={() => router.push('/purchase-requests' as never)}
                    stacked={stacked}
                  />
                );

              case 'alert': {
                const { title, body } = renderAlertBody(item.alert, t);
                const action = alertAction(item.alert, canEdit);
                // `recurring_suggestion` is the one alert with TWO write
                // actions on it — Track (a UserSubscription) and Mark as
                // recurring (this expense's own `isRecurring` flag). Gated on
                // `canEdit` directly rather than through `alertAction`, which
                // already returns 'none' for a viewer on this type — the
                // `buildMarkRecurringUpdate` null-check is what actually
                // decides whether the button renders.
                const canMarkRecurring =
                  action === 'track' && !!buildMarkRecurringUpdate(item.alert);
                return (
                  <AttentionRow
                    key={item.key}
                    icon={TYPE_ICON[item.alert.type] || 'alert-circle-outline'}
                    title={title}
                    body={body}
                    onPress={action === 'track' || action === 'none'
                      ? undefined
                      : () => alertTap.onAlertPress(item.alert)}
                    actionLabel={action === 'track' ? t('fatFinder.trackSubscription') : undefined}
                    onAction={action === 'track' ? () => void alertTap.onTrack(item.alert) : undefined}
                    secondaryActionLabel={canMarkRecurring ? t('alerts.markAsRecurring') : undefined}
                    onSecondaryAction={
                      canMarkRecurring ? () => alertTap.onMarkRecurring(item.alert) : undefined
                    }
                    onDismiss={canEdit ? () => dismiss(item.alert.id) : undefined}
                    busy={resolvingId === item.alert.id}
                    stacked={stacked}
                  />
                );
              }

              case 'budget':
                return (
                  <AttentionRow
                    key={item.key}
                    icon={KIND_ICON.budget}
                    title={item.budget.name}
                    // One sentence, already chosen — the panel never re-decides
                    // between the exceeded/projected/dateless keys, or the
                    // dashboard and the budgets grid could quote one budget two
                    // ways.
                    body={t(item.projection.i18nKey, {
                      amount: formatCurrency(item.projection.amount, item.budget.currencyCode),
                      date: item.projection.date
                        ? item.projection.date.toLocaleDateString(getIntlLocale(), {
                            month: 'short',
                            day: 'numeric',
                          })
                        : '',
                    })}
                    onPress={() => router.push('/(tabs)/budgets')}
                    stacked={stacked}
                  />
                );

              case 'renewal':
                return (
                  <AttentionRow
                    key={item.key}
                    icon={KIND_ICON.renewal}
                    title={item.subscription.name}
                    // `i18nKey` + `days` are resolved upstream; branching on the
                    // number here would be a second copy of the today/tomorrow/
                    // in-N-days rule.
                    body={t(item.i18nKey, { count: item.days })}
                    onPress={() => router.push('/subscriptions' as never)}
                    stacked={stacked}
                  />
                );
            }
          })}

          {hiddenCount > 0 && (
            <Pressable
              style={styles.moreRow}
              onPress={() => setExpanded((e) => !e)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
            >
              <Text style={styles.moreText}>
                {/* The existing pair `FacetRail` uses for the identical
                    gesture, in all nine locales — no key was minted for this.
                    See the report: `dashboard.attentionMore` was found to be a
                    near-duplicate of `expensesDesktop.showMore` and removed. */}
                {expanded
                  ? t('expensesDesktop.showLess')
                  : t('expensesDesktop.showMore', { count: hiddenCount })}
              </Text>
              {/* Down/up, never `chevron-forward`: a forward chevron promises a
                  navigation, and this control deliberately performs none. */}
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={theme.colors.textLink}
              />
            </Pressable>
          )}
        </View>
      )}

      {/* One line, identical on both alert surfaces: the hook decided every
          prop in here, trip context included. */}
      {alertTap.dialogProps && <ExpenseDialog {...alertTap.dialogProps} />}
    </>
  );
}

interface RowProps {
  icon: IconName;
  title: string;
  body?: string;
  /** Absent when the row has nothing to open — the row then renders as plain
   *  content with no press feedback, rather than a dead click target. */
  onPress?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  /** A second, independent write action — currently only `recurring_suggestion`'s
   *  "Mark as recurring", beside its own "Track" (`actionLabel`/`onAction`). */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  onDismiss?: () => void;
  busy?: boolean;
  stacked: boolean;
}

function AttentionRow({
  icon,
  title,
  body,
  onPress,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  onDismiss,
  busy,
  stacked,
}: RowProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      style={[
        styles.row,
        stacked && styles.rowStacked,
        hovered && onPress ? styles.rowHovered : null,
      ]}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={styles.rowMain}>
        <View style={styles.iconBox}>
          <Ionicons name={icon} size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{title}</Text>
          {!!body && <Text style={styles.rowBody}>{body}</Text>}
        </View>
      </View>
      <View style={[styles.rowActions, stacked && styles.rowActionsStacked]}>
        {!!actionLabel && !!onAction && (
          <Pressable style={styles.actionButton} onPress={onAction} accessibilityRole="button">
            <Text style={styles.actionButtonText}>{actionLabel}</Text>
          </Pressable>
        )}
        {!!secondaryActionLabel && !!onSecondaryAction && (
          <Pressable
            style={styles.secondaryActionButton}
            onPress={onSecondaryAction}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryActionButtonText}>{secondaryActionLabel}</Text>
          </Pressable>
        )}
        {busy ? (
          <ActivityIndicator size="small" color={theme.colors.primary} />
        ) : (
          !!onDismiss && (
            <Pressable
              style={styles.dismissButton}
              onPress={onDismiss}
              hitSlop={8}
              accessibilityRole="button"
              // Borrowed rather than minted: `insights.dismiss` is "Dismiss"
              // in all nine locales and means exactly this.
              accessibilityLabel={t('insights.dismiss')}
            >
              <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
            </Pressable>
          )
        )}
      </View>
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    borderWidth: 2,
    // The one block on the screen allowed to demand something, so it carries
    // the accent rather than the neutral card border every other slot uses.
    borderColor: theme.colors.primary,
    padding: theme.spacing[5],
    marginBottom: theme.spacing[4],
    gap: theme.spacing[2],
  },
  heading: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[1],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.background,
  },
  rowStacked: {
    flexDirection: 'column' as const,
    alignItems: 'stretch' as const,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  rowMain: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    flexShrink: 1,
    flexGrow: 1,
    // Without this a long body pushes the actions off the row instead of
    // wrapping — the standard RN-web flex-row gotcha `DashboardDesktop`'s own
    // focus column already guards against.
    minWidth: 0,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.primaryLight,
  },
  rowText: {
    flexShrink: 1,
    gap: 2,
    minWidth: 0,
  },
  rowTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  rowBody: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
  },
  rowActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  rowActionsStacked: {
    justifyContent: 'flex-end' as const,
    marginTop: theme.spacing[2],
  },
  actionButton: {
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
  },
  actionButtonText: {
    ...theme.textStyles.bodySmMedium,
    // On a `primary` fill this is the accent-derived on-accent colour, which
    // is what `textInverse` is for. A semantic fill would need `onSemantic`.
    color: theme.colors.textInverse,
  },
  // Outlined rather than filled: two filled `primary` buttons side by side
  // would read as equally weighted, but Track (a subscription) and Mark as
  // recurring (this expense's own flag) are alternatives, not a pair — the
  // outline keeps Track as the visually primary suggestion.
  secondaryActionButton: {
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  secondaryActionButtonText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  dismissButton: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  moreRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[2],
  },
  moreText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textLink,
    fontWeight: '600' as const,
  },
});
