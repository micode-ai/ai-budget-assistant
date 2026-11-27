/** Push title for a developer reply, by app locale. Fallback: en. */
const REPLY_TITLES: Record<string, string> = {
  en: 'Reply from the developer',
  de: 'Antwort vom Entwickler',
  es: 'Respuesta del desarrollador',
  fr: 'Réponse du développeur',
  pl: 'Odpowiedź od dewelopera',
  ru: 'Ответ от разработчика',
  ua: 'Відповідь від розробника',
  be: 'Адказ ад распрацоўшчыка',
  nl: 'Antwoord van de ontwikkelaar',
  pt: 'Resposta do programador',
  br: 'Resposta do desenvolvedor',
};

export function supportReplyTitle(lang: string): string {
  return REPLY_TITLES[lang] ?? REPLY_TITLES.en;
}
