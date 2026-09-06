import { useEffect } from 'react';
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useTheme, useStyles, type Theme } from '@/theme';
import { getIntlLocale } from '@/i18n';
import { useAlertStore } from '@/stores/alertStore';
import { useInvitationStore } from '@/stores/invitationStore';
import { useAccountStore } from '@/stores/accountStore';
import { InvitationCard } from '@/components/alerts/InvitationCard';
import { renderAlertBody, TYPE_ICON } from '@/features/alerts/alertPresentation';
import { buildAlertsPanelItems } from '@/features/alerts/alertsPanelItems';
import { alertAction } from '@/features/dashboard/attentionActions';
import { useAlertTapThrough } from '@/hooks/useAlertTapThrough';
import { ExpenseDialog } from '@/components/expenses/desktop/ExpenseDialog';
import { TOP_BAR_HEIGHT, WEB_TOP_BAR_PADDING_X } from '@/components/webLayout.constants';

/** Only one instance is ever mounted at a time (`WebTopBar` renders it from a
 *  single boolean slot), so a fixed id is safe — same reasoning as
 *  `ExpenseDialog.tsx`'s `TITLE_ID`, just a distinct string. */
const TITLE_ID = 'alerts-panel-title';


/**
 * 400, where the account menu is 340.
 *
 * That menu lists labels; this one lists a title, a wrapped body line and a
 * date. Two adjacent panels of different widths is fine for the same reason the
 * design language already tolerates the income dialog being thinner than the
 * expense one: it reflects a real content asymmetry, not sloppiness.
 */
const PANEL_WIDTH = 400;

interface Props {
  onClose: () => void;
}

/**
 * The alerts inbox, as a panel anchored to the bell (Addendum 5).
 *
 * The bell used to navigate to `/alerts`, which at 1920 is two tabs stretched
 * to half the viewport each and three cards spanning 1540px. An inbox opens
 * where its badge is; the badge summons the user, so the quality of what it
 * opens is the app's own claim rather than the user's choice to go looking.
 *
 * ## It hosts; it extracts nothing
 *
 * `renderAlertBody`, `TYPE_ICON` and `InvitationCard` were already in `src/`
 * and are already rendered by the dashboard's attention panel, so there is no
 * move here and **no `desktop?` prop on anything shared** — nothing the phone
 * renders changes at all. `InvitationCard` brings its own Accept/Decline, which
 * is the whole reason a panel beats the page: the action resolves without
 * leaving the screen the user was on.
 *
 * ## One list, invitations first
 *
 * No tab control. Stretched half-viewport tabs are the reported defect, and a
 * tab compressed into 400px is that same idiom made smaller; the two lists do
 * not warrant a switch either, being usually zero-or-one invitations and a
 * handful of alerts. The order comes from `buildAlertsPanelItems`, which is fed
 * by the same selector the attention panel uses — see that module for why the
 * ordering is shared rather than re-decided here.
 *
 * ## Tapping a row opens what it references
 *
 * Through `useAlertTapThrough`, the SAME hook the attention panel uses — not a
 * second copy. That flow resolves the alert's target (an alert deep-links by
 * the expense's server PK, which a locally-created row may not carry yet, so it
 * may spend a forced `loadExpenses({ force: true })` round trip and show an
 * inline spinner), then opens `ExpenseDialog` in place or navigates to the
 * merge screen, and marks the alert read ONLY once that has succeeded. That
 * last ordering rule is load-bearing on this surface specifically: the list is
 * built from `selectUnreadAlerts`, so marking read removes the row, and marking
 * up front would delete the row and its spinner mid-action. See the hook.
 *
 * An inbox whose rows cannot be acted on is half an inbox, and `/alerts` is now
 * an archive the badge no longer points at — so without this the app's most
 * attention-demanding control would open a list you can look at and nothing
 * more.
 *
 * ## It loads on open
 *
 * Both stores are populated only by `useHomeScreenData`, i.e. only on the
 * dashboard — so opening the bell from Analytics or Transactions would show a
 * confidently empty inbox. Loading here mirrors `AccountSwitcher`'s own
 * `ensureAccountsLoaded()` on trigger press, one control to the left, for the
 * same reason: an empty state is a claim, and a claim needs a request behind
 * it.
 */
export function AlertsPanel({ onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const alerts = useAlertStore((s) => s.alerts);
  const unreadCount = useAlertStore((s) => s.unreadCount);
  const isLoadingAlerts = useAlertStore((s) => s.isLoading);
  const loadAlerts = useAlertStore((s) => s.loadAlerts);
  const markAllRead = useAlertStore((s) => s.markAllRead);
  const dismiss = useAlertStore((s) => s.dismiss);

  const invitations = useInvitationStore((s) => s.invitations);
  const loadInvitations = useInvitationStore((s) => s.loadInvitations);
  const respond = useInvitationStore((s) => s.respond);

  const canEdit = useAccountStore((s) => s.canEdit());
  const alertTap = useAlertTapThrough({ canEdit });

  useEffect(() => {
    void loadAlerts();
    void loadInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = buildAlertsPanelItems({ invitations, alerts });

  const handleAccept = async (id: string) => {
    try {
      await respond(id, 'accept');
      // The account list is what changes when an invitation is accepted, and
      // this panel is rendered from the very bar that displays it. Same call
      // `AttentionPanel.handleAccept` makes, for the same reason.
      await useAccountStore.getState().loadAccounts();
    } catch (e) {
      // `showAlert`, never `Alert.alert` — react-native-web stubs the latter to
      // a no-op, so on the one platform this renders the dialog would simply
      // never appear.
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

  const handleSeeAll = () => {
    onClose();
    router.push('/alerts' as never);
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      aria-labelledby={TITLE_ID}
    >
      {/* Deliberately a raw <div>, not a themed RN View/Pressable. A
          `Pressable` always emits a tabindex, and ANY tabindex — including -1 —
          makes an element a valid `.focus()` target, which is all RN's
          `ModalFocusTrap` checks when it walks for the first focusable
          descendant. A `Pressable` scrim would therefore be the trap's FIRST
          target (criterion 56). Same construction as `ExpenseDialog` and the
          account menu; `flexDirection: 'column'` is explicit because RN's own
          overlay is a column container, so its `justifyContent` is the vertical
          axis and a raw div's `row` default would silently swap the two. */}
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
          flexDirection: 'column',
          alignItems: 'flex-end',
          justifyContent: 'flex-start',
          paddingTop: TOP_BAR_HEIGHT + 4,
          paddingRight: WEB_TOP_BAR_PADDING_X,
          backgroundColor: theme.colors.overlay,
        }}
      >
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text nativeID={TITLE_ID} style={styles.title} numberOfLines={1}>
              {t('alerts.title')}
            </Text>
            {unreadCount > 0 && (
              <Pressable
                onPress={() => void markAllRead()}
                accessibilityRole="button"
                style={styles.markAll}
              >
                <Text style={styles.markAllText}>{t('alerts.markAllRead')}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('expensesDesktop.dialogClose')}
              style={styles.iconButton}
            >
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {items.length === 0 ? (
              isLoadingAlerts ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.primary}
                  style={styles.spinner}
                />
              ) : (
                /* Criterion 55: an empty state, never a blank box. Both
                   existing keys, because one list standing in for two means
                   "nothing on either side" — the descriptive alerts sentence
                   plus the invitations line say exactly that, and neither key
                   is new. */
                <View style={styles.empty}>
                  <Ionicons
                    name="notifications-off-outline"
                    size={28}
                    color={theme.colors.textTertiary}
                  />
                  <Text style={styles.emptyText}>{t('alerts.empty')}</Text>
                  <Text style={styles.emptySubText}>{t('alerts.invitationsEmpty')}</Text>
                </View>
              )
            ) : (
              items.map((item) =>
                item.kind === 'invitation' ? (
                  <InvitationCard
                    key={item.key}
                    invitation={item.invitation}
                    onAccept={() => void handleAccept(item.invitation.id)}
                    onDecline={() => void handleDecline(item.invitation.id)}
                  />
                ) : (
                  <AlertRow
                    key={item.key}
                    alert={item.alert}
                    canEdit={canEdit}
                    onDismiss={() => void dismiss(item.alert.id)}
                    onPress={
                      alertAction(item.alert, canEdit) === 'track' ||
                      alertAction(item.alert, canEdit) === 'none'
                        ? undefined
                        : () => alertTap.onAlertPress(item.alert)
                    }
                    onTrack={
                      alertAction(item.alert, canEdit) === 'track'
                        ? () => void alertTap.onTrack(item.alert)
                        : undefined
                    }
                    busy={alertTap.resolvingId === item.alert.id}
                  />
                ),
              )
            )}
          </ScrollView>

          <Pressable onPress={handleSeeAll} accessibilityRole="button" style={styles.footer}>
            <Text style={styles.footerText}>{t('dashboard.seeAll')}</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
          </Pressable>
        </View>
      </div>

      {/* One line, identical on both alert surfaces: the hook decided every
          prop in here, trip context included. Rendered INSIDE this panel's
          `Modal` subtree but as its own `Modal`, which react-native-web
          portals independently of where it is declared. */}
      {alertTap.dialogProps && <ExpenseDialog {...alertTap.dialogProps} />}
    </Modal>
  );
}

/**
 * One alert. Hosts `renderAlertBody` and `TYPE_ICON` — the same two pieces the
 * attention panel and the `/alerts` page render from, so all three quote an
 * alert identically.
 *
 * `onPress` is absent when the alert has nothing to open (a viewer, or a
 * `track` row whose own button owns the action) — the row then renders as
 * plain content with no press feedback, rather than a dead click target. Same
 * rule `AttentionRow` states for itself.
 *
 * No chevron. It means "this leaves" everywhere in this app, and the common
 * case here opens a dialog in place. (A `possible_merge` row does navigate to
 * the merge screen — a real screen with real choices — but one row kind is not
 * worth an affordance that would be a false promise on the other five.)
 */
function AlertRow({
  alert,
  canEdit,
  onDismiss,
  onPress,
  onTrack,
  busy,
}: {
  alert: Parameters<typeof renderAlertBody>[0];
  canEdit: boolean;
  onDismiss: () => void;
  onPress?: () => void;
  onTrack?: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { title, body } = renderAlertBody(alert, t);

  const content = (
    <>
      <View style={styles.rowIcon}>
        <Ionicons
          name={TYPE_ICON[alert.type] || 'alert-circle-outline'}
          size={18}
          color={theme.colors.primary}
        />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {body.length > 0 && <Text style={styles.rowBody}>{body}</Text>}
        <Text style={styles.rowDate}>
          {new Date(alert.createdAt).toLocaleDateString(getIntlLocale(), {
            day: 'numeric',
            month: 'short',
          })}
        </Text>
        {onTrack && (
          <Pressable onPress={onTrack} accessibilityRole="button" style={styles.trackButton}>
            <Text style={styles.trackButtonText}>{t('fatFinder.trackSubscription')}</Text>
          </Pressable>
        )}
      </View>
      {/* The spinner replaces the dismiss button while a forced expense pull
          is in flight — the row must stay on screen and stay explained, which
          is the whole reason `markRead` waits for success. */}
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.primary} style={styles.iconButton} />
      ) : (
        canEdit && (
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('common.delete')}
            style={styles.iconButton}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="close" size={16} color={theme.colors.textTertiary} />
          </Pressable>
        )
      )}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.row}>
      {content}
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    width: PANEL_WIDTH,
    // Same shape as the account menu's: a cap with the list scrolling inside.
    // A modal panel is not the page, so the one-page-scroll rule does not
    // apply here — the precedent is already accepted one control to the left.
    maxHeight: '82%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden' as const,
    ...theme.shadows.lg,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  title: {
    ...theme.textStyles.bodyLargeSemiBold,
    color: theme.colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  markAll: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  markAllText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
  },
  iconButton: {
    padding: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
  list: {
    flexShrink: 1,
  },
  listContent: {
    padding: theme.spacing[3],
    gap: theme.spacing[2],
  },
  spinner: {
    paddingVertical: theme.spacing[8],
  },
  empty: {
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[4],
  },
  emptyText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
  emptySubText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.primaryLight,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
  },
  rowBody: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[0.5],
  },
  rowDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1],
  },
  footer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  footerText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  trackButton: {
    alignSelf: 'flex-start' as const,
    marginTop: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryLight,
  },
  trackButtonText: {
    ...theme.textStyles.caption,
    color: theme.colors.primary,
  },
});
