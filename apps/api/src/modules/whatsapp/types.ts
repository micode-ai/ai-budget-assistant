/**
 * Per-message state assembled by the dispatcher from the WhatsAppLink row.
 * Mirrors `TelegramUserState` but keyed by E.164 phone number instead of telegram id.
 */
export interface WhatsAppUserState {
  userId: string;
  accountId: string;
  accountRole: 'owner' | 'editor' | 'viewer';
  conversationId: string | null;
  currencyCode: string;
  language: string;
  waPhoneNumber: string;
}

/**
 * Minimal subset of WhatsApp Cloud API inbound payload types we use.
 * Full schema: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */
export interface WaTextMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text';
  text: { body: string };
}

export interface WaButtonReply {
  type: 'button_reply';
  button_reply: { id: string; title: string };
}

export interface WaListReply {
  type: 'list_reply';
  list_reply: { id: string; title: string; description?: string };
}

export interface WaInteractiveMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'interactive';
  interactive: WaButtonReply | WaListReply;
}

export interface WaMediaRef {
  id: string;
  mime_type: string;
  sha256?: string;
  filename?: string;
}

export interface WaMediaMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'audio' | 'voice' | 'image' | 'document';
  audio?: WaMediaRef;
  voice?: WaMediaRef;
  image?: WaMediaRef;
  document?: WaMediaRef;
  context?: { referred_product?: unknown };
}

export type WaMessage = WaTextMessage | WaInteractiveMessage | WaMediaMessage;

export interface WaContact {
  profile: { name: string };
  wa_id: string;
}

export interface WaWebhookBody {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: WaContact[];
        messages?: WaMessage[];
        statuses?: unknown[];
      };
      field: 'messages';
    }>;
  }>;
}

export const WA_REDIS = 'WA_REDIS';
