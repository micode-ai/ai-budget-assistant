export interface TelegramLinkCodeResponse {
  code: string;
  expiresAt: string;
  botUsername: string;
}

export interface TelegramLinkStatusResponse {
  linked: boolean;
  telegramUsername?: string;
  linkedAt?: string;
}
