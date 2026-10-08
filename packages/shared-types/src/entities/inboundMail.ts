import type { ReceiptDuplicateMatch } from '../dto/expense';

/** Lifecycle of a forwarded e-mail (ABA-644). Only `pending` is shown for confirmation. */
export type InboundReceiptStatus =
  | 'received'
  | 'processing'
  | 'pending'
  | 'confirmed'
  | 'dismissed'
  | 'duplicate'
  | 'not_a_receipt'
  | 'quota_exceeded'
  | 'unsupported'
  | 'failed';

export type InboundReceiptKind = 'receipt' | 'forwarding_verification';

export type InboundDocumentKind = 'pdf' | 'image' | 'text';

export interface InboundMailAddressResponse {
  /** `<token>@<INBOUND_MAIL_DOMAIN>` */
  address: string;
  targetAccountId: string;
  /** The server feature flag; when false the app hides the whole surface. */
  enabled: boolean;
  /** Newest Gmail forwarding-verification code received in the last 24 h. */
  pendingVerification?: { code: string; receivedAt: string };
}

export interface InboundReceiptListItem {
  id: string;
  status: InboundReceiptStatus;
  kind: InboundReceiptKind;
  fromAddress: string;
  fromDomain: string;
  subject: string | null;
  /** Extracted total, when extraction ran. */
  total: number | null;
  currencyCode: string | null;
  merchant: string | null;
  date: string | null;
  documentKind: InboundDocumentKind | null;
  errorCode: string | null;
  verificationCode: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface InboundReceiptDetail extends InboundReceiptListItem {
  /** The stored ReceiptExpense extraction (minus possibleDuplicate); null until extracted. */
  extraction: Record<string, unknown> | null;
  /** Recomputed at read time, no AI. */
  possibleDuplicate: ReceiptDuplicateMatch | null;
  /** False once the document was nulled (confirm/dismiss/expiry). */
  hasDocument: boolean;
  documentMimeType: string | null;
  expenseId: string | null;
  /** True only when the sender passed an aligned DMARC check; the app shows an "unverified sender" hint otherwise. */
  senderVerified: boolean;
}

export interface InboundReceiptCountResponse {
  pending: number;
}

/**
 * Body the SMTP container POSTs to `/api/v1/internal/inbound-mail/messages`.
 * Type-only: the container and the API each validate it with their own code.
 */
export interface InboundMailHandoffPayload {
  token: string;
  remoteIp: string;
  helo: string;
  envelopeFrom: string;
  auth: { spf: string; dkim: string[]; dmarc: string; arc: string };
  messageIdHash: string;
  fromAddress: string;
  subject: string | null;
  date: string | null;
  kind: InboundReceiptKind;
  verificationCode?: string;
  document?: {
    kind: InboundDocumentKind;
    mimeType: string;
    filename?: string;
    base64?: string;
    text?: string;
    contentHash: string;
  };
  ignoredAttachmentCount: number;
}

export type InboundRcptResult = 'accept' | 'unknown' | 'limited';
