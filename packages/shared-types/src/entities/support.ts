export type SupportThreadStatus = 'open' | 'closed';

export type SupportMessageAuthor = 'user' | 'developer';

export type SupportMessageVia = 'app' | 'admin' | 'telegram';

export interface SupportContext {
  appVersion: string;
  buildSha?: string;
  platform: 'android' | 'ios' | 'web';
  osVersion?: string;
  locale: string;
  tier?: string;
  accountType?: string;
  fromRoute?: string;
}

export interface SupportMessageView {
  id: string;
  author: SupportMessageAuthor;
  body: string;
  bodyLang: string;
  translatedBody: string | null;
  translatedLang: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface SupportThreadView {
  id: string | null;
  autoTranslate: boolean;
  userUnreadCount: number;
  messages: SupportMessageView[];
  hasMore: boolean;
}

export interface AdminSupportMessageView extends SupportMessageView {
  via: SupportMessageVia;
  context: SupportContext | null;
}

export interface AdminSupportThreadSummary {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userLanguage: string;
  status: SupportThreadStatus;
  muted: boolean;
  developerUnreadCount: number;
  lastMessageAt: string;
  lastMessagePreview: string;
}
