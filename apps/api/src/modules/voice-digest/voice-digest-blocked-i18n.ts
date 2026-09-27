import type { VoiceDigestChannel } from '@budget/shared-types';

/**
 * Localized copy for the push sent when a channel permanently rejects the
 * weekly digest (`DigestBlockedError` — the user blocked the bot / removed
 * the app / deactivated the workspace). Kept in this module rather than the
 * shared `notifications/notification-i18n.ts` dictionary because it belongs
 * to exactly one feature and nothing outside voice-digest sends it.
 */

const CHANNEL_LABELS: Record<VoiceDigestChannel, string> = {
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  slack: 'Slack',
};

interface BlockedMessages {
  title: string;
  body: (channelLabel: string) => string;
}

const MESSAGES: Record<string, BlockedMessages> = {
  en: {
    title: 'Voice digest paused',
    body: (ch) => `We couldn't reach you in ${ch}. Turn it back on in Settings → Chat bots.`,
  },
  pl: {
    title: 'Cotygodniowe podsumowanie głosowe wstrzymane',
    body: (ch) => `Nie udało się dotrzeć do Ciebie przez ${ch}. Włącz je ponownie w Ustawienia → Boty czatu.`,
  },
  de: {
    title: 'Sprachzusammenfassung pausiert',
    body: (ch) => `Wir konnten dich über ${ch} nicht erreichen. Schalte sie in Einstellungen → Chat-Bots wieder ein.`,
  },
  es: {
    title: 'Resumen de voz en pausa',
    body: (ch) => `No pudimos contactarte por ${ch}. Vuelve a activarlo en Ajustes → Bots de chat.`,
  },
  fr: {
    title: 'Résumé vocal en pause',
    body: (ch) => `Nous n'avons pas pu vous joindre sur ${ch}. Réactivez-le dans Paramètres → Bots de chat.`,
  },
  ru: {
    title: 'Голосовой дайджест приостановлен',
    body: (ch) => `Не удалось связаться с вами через ${ch}. Включите его снова в Настройки → Чат-боты.`,
  },
  ua: {
    title: 'Голосовий дайджест призупинено',
    body: (ch) => `Не вдалося зв'язатися з вами через ${ch}. Увімкніть його знову в Налаштування → Чат-боти.`,
  },
  be: {
    title: 'Галасавы дайджэст прыпынены',
    body: (ch) => `Не ўдалося звязацца з вамі праз ${ch}. Уключыце яго зноў у Налады → Чат-боты.`,
  },
  nl: {
    title: 'Spraaksamenvatting gepauzeerd',
    body: (ch) => `We konden je niet bereiken via ${ch}. Zet het weer aan in Instellingen → Chatbots.`,
  },
};

function messagesFor(lang: string): BlockedMessages {
  return MESSAGES[lang] ?? MESSAGES.en;
}

export function blockedDigestPushTitle(lang: string): string {
  return messagesFor(lang).title;
}

export function blockedDigestPushBody(lang: string, channel: VoiceDigestChannel): string {
  return messagesFor(lang).body(CHANNEL_LABELS[channel]);
}
