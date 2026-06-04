/**
 * Per-message state assembled by the dispatcher from the SlackLink row.
 * Mirrors WhatsAppUserState but keyed by Slack user id; `channel` is the IM
 * channel we reply into (carried on every inbound event).
 */
export interface SlackUserState {
  userId: string;
  accountId: string;
  accountRole: 'owner' | 'editor' | 'viewer';
  conversationId: string | null;
  currencyCode: string;
  language: string;
  slackUserId: string;
  slackTeamId: string;
  channel: string;
}

/** A file shared in a Slack message (voice / image / document). */
export interface SlackFile {
  id: string;
  mimetype: string;
  filetype?: string;
  name?: string;
  url_private_download?: string;
}

/** Inbound `message` event (DM). Subset we use. */
export interface SlackMessageEvent {
  type: 'message';
  subtype?: string;
  channel: string;
  channel_type?: string; // 'im' for DMs
  user?: string;
  bot_id?: string;
  text?: string;
  ts: string;
  files?: SlackFile[];
}

/** Top-level Events API envelope for event callbacks. */
export interface SlackEventCallback {
  type: 'event_callback';
  team_id: string;
  event_id: string;
  event: SlackMessageEvent;
  authorizations?: Array<{ user_id: string; is_bot: boolean }>;
}

/** URL-verification handshake Slack POSTs once on setup. */
export interface SlackUrlVerification {
  type: 'url_verification';
  challenge: string;
}

export type SlackWebhookBody = SlackEventCallback | SlackUrlVerification;

/** Block Kit interactivity payload (button taps). */
export interface SlackBlockActionsPayload {
  type: 'block_actions';
  user: { id: string; team_id: string };
  channel?: { id: string };
  actions: Array<{ action_id: string; value?: string }>;
}

export const SLACK_REDIS = 'SLACK_REDIS';
