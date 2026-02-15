const BASE_URL = 'https://micode-ai.github.io/ai-budget-assistant';
const SUPPORTED_LEGAL_LANGS = ['en', 'pl'] as const;

function getLegalLang(lang: string): string {
  const short = lang.split('-')[0];
  return (SUPPORTED_LEGAL_LANGS as readonly string[]).includes(short) ? short : 'en';
}

export function getLegalUrls(language: string) {
  const lang = getLegalLang(language);
  return {
    privacyPolicy: `${BASE_URL}/${lang}/privacy.html`,
    termsOfService: `${BASE_URL}/${lang}/terms.html`,
    support: 'mailto:perevertkinma@gmail.com',
  };
}

/** @deprecated Use getLegalUrls(language) instead */
export const LEGAL_URLS = {
  privacyPolicy: `${BASE_URL}/en/privacy.html`,
  termsOfService: `${BASE_URL}/en/terms.html`,
  support: 'mailto:perevertkinma@gmail.com',
};
