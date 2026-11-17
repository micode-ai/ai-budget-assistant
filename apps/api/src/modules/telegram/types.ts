import { Context } from 'telegraf';

export interface TelegramUserState {
  userId: string;
  accountId: string;
  accountRole: 'owner' | 'editor' | 'viewer';
  conversationId: string | null;
  currencyCode: string;
  language: string;
  telegramUserId: string;
  /** The linked account's name, shown under every write (ABA-812). */
  accountName?: string;
  /** The user belongs to more than one account; only then is the account shown. */
  multiAccount?: boolean;
}

export interface BotContext extends Context {
  userState?: TelegramUserState;
}
