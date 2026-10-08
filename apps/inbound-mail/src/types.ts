/**
 * Local copy of `InboundMailHandoffPayload` from packages/shared-types. This container is
 * built without the shared packages, so it declares the shape itself; `types.drift.spec.ts`
 * fails the build if the two ever stop being mutually assignable.
 */
export type InboundReceiptKind = 'receipt' | 'forwarding_verification';
export type InboundDocumentKind = 'pdf' | 'image' | 'text';

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
