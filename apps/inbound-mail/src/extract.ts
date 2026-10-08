import { createHash } from 'crypto';
import { convert } from 'html-to-text';
import { simpleParser, type Attachment, type ParsedMail } from 'mailparser';
import {
  MAX_ATTACHMENTS_INSPECTED,
  MAX_HTML_INPUT_CHARS,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_TEXT_CHARS,
  MIN_IMAGE_BYTES,
} from './config';
import { extractGmailVerificationCode } from './gmailVerification';
import { addressesIn, hasDuplicateIdentityHeaders, topLevelHeaders } from './headers';
import { pickDocument, type Candidate } from './pickDocument';
import { authPayload, type AuthSummary } from './policy';
import { sniffMagic } from './sniff';
import type { InboundMailHandoffPayload } from './types';

export interface ExtractContext {
  remoteIp: string;
  helo: string;
  envelopeFrom: string;
  auth: AuthSummary;
  /** Raw RCPT TO addresses of this transaction (a verification must be addressed to one of them). */
  recipients?: string[];
  /** Clock override for tests (epoch ms). */
  now?: number;
}

/** A Gmail verification mail is minted seconds before it reaches us; an old one is a replay. */
export const VERIFICATION_MAX_AGE_MS = 30 * 60_000;

export type ExtractedMessage = Omit<InboundMailHandoffPayload, 'token'>;

const PARSER_OPTIONS = {
  skipHtmlToText: true,
  skipImageLinks: true,
  skipTextToHtml: true,
  skipTextLinks: true,
  maxHtmlLengthToParse: MAX_HTML_INPUT_CHARS,
} as const;

function htmlToPlain(html: string): string {
  return convert(html.slice(0, MAX_HTML_INPUT_CHARS), {
    wordwrap: false,
    // Links and images are dropped, never fetched, so a tracking pixel cannot fire and a
    // URL cannot reach the model as an instruction target.
    selectors: [
      { selector: 'a', options: { ignoreHref: true } },
      { selector: 'img', format: 'skip' },
    ],
  }).slice(0, MAX_TEXT_CHARS);
}

function bodyTextOf(parsed: ParsedMail): string | null {
  if (typeof parsed.html === 'string' && parsed.html.trim()) {
    const t = htmlToPlain(parsed.html).trim();
    if (t) return t;
  }
  const plain = (parsed.text ?? '').slice(0, MAX_TEXT_CHARS).trim();
  return plain || null;
}

function isDecorativeInline(att: Attachment): boolean {
  return att.related === true || (att.contentDisposition === 'inline' && Boolean(att.cid));
}

interface Collected {
  candidates: Candidate[];
  total: number;
  nestedBody: string | null;
}

async function collect(attachments: Attachment[], allowNested: boolean): Promise<Collected> {
  const out: Collected = { candidates: [], total: 0, nestedBody: null };
  const inspected = attachments.slice(0, MAX_ATTACHMENTS_INSPECTED);
  out.total += attachments.length - inspected.length;
  for (const att of inspected) {
    const content = att.content as Buffer | undefined;
    if (!content || !Buffer.isBuffer(content)) {
      out.total += 1;
      continue;
    }
    // Outlook "forward as attachment": re-parse ONE level only. Deeper nesting is ignored.
    if (att.contentType === 'message/rfc822' && allowNested) {
      const nested = await simpleParser(content, PARSER_OPTIONS);
      out.nestedBody = out.nestedBody ?? bodyTextOf(nested);
      const inner = await collect(nested.attachments ?? [], false);
      out.candidates.push(...inner.candidates);
      out.total += inner.total;
      continue;
    }
    out.total += 1;
    const sniffed = sniffMagic(content);
    if (!sniffed) continue; // archives, docx, ics, exe...: never opened
    if (sniffed.kind === 'image' && (isDecorativeInline(att) || content.length < MIN_IMAGE_BYTES)) continue;
    if (content.length > (sniffed.kind === 'pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES)) continue;
    out.candidates.push({ sniffed, filename: att.filename || undefined, content });
  }
  return out;
}

export async function extractMessage(raw: Buffer, ctx: ExtractContext): Promise<ExtractedMessage> {
  const parsed = await simpleParser(raw, PARSER_OPTIONS);
  const collected = await collect(parsed.attachments ?? [], true);
  const bodyText = bodyTextOf(parsed) ?? collected.nestedBody;

  const fromAddress = (parsed.from?.value?.[0]?.address ?? ctx.envelopeFrom ?? '').toLowerCase().slice(0, 320);
  const subject = parsed.subject ? parsed.subject.slice(0, 2000) : null;
  const date = parsed.date && !Number.isNaN(parsed.date.getTime()) ? parsed.date.toISOString() : null;

  const base = {
    remoteIp: ctx.remoteIp,
    helo: ctx.helo.slice(0, 255),
    envelopeFrom: ctx.envelopeFrom.slice(0, 320),
    auth: authPayload(ctx.auth),
    fromAddress,
    subject,
    date,
  };

  // Verification is the one path that writes a security-relevant value on a user's behalf, so it
  // needs more than a matching From: no repeated From/Subject/Date, the Date fresh, and the mail
  // addressed (To / Delivered-To / body) to the very RCPT token address it arrived on.
  const headers = topLevelHeaders(raw);
  const parsedMs = parsed.date && !Number.isNaN(parsed.date.getTime()) ? parsed.date.getTime() : null;
  const fresh = parsedMs !== null && Math.abs((ctx.now ?? Date.now()) - parsedMs) <= VERIFICATION_MAX_AGE_MS;
  const rcpt = (ctx.recipients ?? []).map((r) => r.toLowerCase());
  const lowerBody = (bodyText ?? '').toLowerCase();
  const addressed = rcpt.some(
    (r) =>
      addressesIn(headers.get('to')).includes(r) ||
      addressesIn(headers.get('delivered-to')).includes(r) ||
      lowerBody.includes(r),
  );
  const code =
    !hasDuplicateIdentityHeaders(headers) && fresh && addressed
      ? extractGmailVerificationCode(fromAddress, ctx.auth, subject, bodyText)
      : null;
  if (code) {
    return {
      ...base,
      messageIdHash: messageIdHash(parsed.messageId, fromAddress, date, subject, ''),
      kind: 'forwarding_verification',
      verificationCode: code,
      ignoredAttachmentCount: 0,
    };
  }

  const document = pickDocument(collected.candidates, bodyText);
  const fromAttachment = document && document.kind !== 'text' ? 1 : 0;
  return {
    ...base,
    messageIdHash: messageIdHash(parsed.messageId, fromAddress, date, subject, document?.contentHash ?? ''),
    kind: 'receipt',
    ...(document ? { document } : {}),
    ignoredAttachmentCount: Math.min(1000, Math.max(0, collected.total - fromAttachment)),
  };
}

export function messageIdHash(
  messageId: string | undefined,
  from: string,
  date: string | null,
  subject: string | null,
  contentHash: string,
): string {
  const id = messageId?.trim().toLowerCase();
  const seed = id ? id : `${from}|${date ?? ''}|${subject ?? ''}|${contentHash}`;
  return createHash('sha256').update(seed).digest('hex');
}
