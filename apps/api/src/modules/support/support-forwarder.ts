import type { SupportThread, SupportMessage } from '@prisma/client';

/** Injection token for the Telegram forwarder (Task 5 provides it). Injected `@Optional()`. */
export const SUPPORT_FORWARDER = 'SUPPORT_FORWARDER';

export interface SupportForwarderUser {
  id: string;
  name: string;
  email: string;
  language: string;
}

export interface SupportForwarder {
  forwardUserMessage(message: SupportMessage, thread: SupportThread, user: SupportForwarderUser): Promise<void>;
}
