import type { AnomalyAlert } from '@budget/shared-types';
import type { MyInvitation } from '@/services/accounts.api';
import { selectUnreadAlerts } from './alertPresentation';

/** One row of the top bar's alerts panel. */
export type AlertsPanelItem =
  | { kind: 'invitation'; key: string; invitation: MyInvitation }
  | { kind: 'alert'; key: string; alert: AnomalyAlert };

export interface AlertsPanelInputs {
  /** `invitationStore.invitations` — pending only, as the store holds them. */
  invitations: MyInvitation[];
  /** `alertStore.alerts` — `GET /alerts` verbatim, read ones included. */
  alerts: AnomalyAlert[];
}

/**
 * The bell panel's single list: **invitations first, then unread alerts.**
 *
 * ## Why one list and not two tabs
 *
 * Stretched half-viewport tabs are the defect that was reported on the
 * `/alerts` page, and a tab control compressed into a 400px panel is that same
 * idiom made smaller. The two lists also do not warrant a switch: invitations
 * are usually zero or one, alerts a handful.
 *
 * ## Why invitations lead, and why that is not a preference
 *
 * It is the same order the dashboard's attention panel already uses. Both
 * surfaces are fed by `selectUnreadAlerts`, and both put a person waiting
 * ahead of a machine-generated notice — an invitation has another human on the
 * other end of it and expires, an alert does not. Had this been ordered
 * independently, the two surfaces could have come to disagree about what is
 * most urgent while both being "right" locally.
 *
 * ## What it is NOT
 *
 * Not capped and not truncated. The attention panel caps at three rows because
 * it competes for dashboard space with nine other cards; this is an inbox
 * opened deliberately, so withholding rows behind a "+N more" would be hiding
 * the very thing the badge summoned the user to read. The panel scrolls
 * instead.
 *
 * Pure, so the ordering and the unread filter are pinned by tests rather than
 * living in a component nothing in this repo's CI can render.
 */
export function buildAlertsPanelItems({
  invitations,
  alerts,
}: AlertsPanelInputs): AlertsPanelItem[] {
  return [
    ...invitations.map((invitation) => ({
      kind: 'invitation' as const,
      key: `invitation:${invitation.id}`,
      invitation,
    })),
    ...selectUnreadAlerts(alerts).map((alert) => ({
      kind: 'alert' as const,
      key: `alert:${alert.id}`,
      alert,
    })),
  ];
}

/**
 * The bell's badge count.
 *
 * `WebTopBar` read only `unreadCount`, while `useHomeScreenData` — the phone's
 * own header — has always summed both. So on web a pending invitation lit no
 * badge at all, and once the panel LEADS with invitations that is a person
 * waiting behind an unlit bell. Same sum, one place, so the badge and the
 * panel's own first row can never contradict each other.
 */
export function alertsBadgeCount({
  unreadCount,
  invitationCount,
}: {
  unreadCount: number;
  invitationCount: number;
}): number {
  return unreadCount + invitationCount;
}
