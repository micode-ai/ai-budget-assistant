import { Context } from 'telegraf';

export interface TelegramUserState {
  userId: string;
  accountId: string;
  conversationId: string | null;
  currencyCode: string;
  language: string;
  telegramUserId: string;
}

export interface BotContext extends Context {
  userState?: TelegramUserState;
}
