import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';
import { APP_CONNECTED_LANGS } from './app-connected-email-i18n';

function build() {
  const svc = new MailService({ get: () => undefined } as unknown as ConfigService);
  const sendMail = jest.spyOn(svc, 'sendMail').mockResolvedValue(true);
  return { svc, sendMail };
}

const base = {
  to: 'a@x.pl',
  appName: 'AI Accounting',
  accountNames: ['Business'],
  connectedByName: 'Anna',
  manageUrl: 'https://app.ai-budget.pl/settings/connected-apps',
};

describe('MailService.sendAppConnectedEmail', () => {
  it('covers every app language', () => {
    expect([...APP_CONNECTED_LANGS].sort()).toEqual(['be', 'br', 'de', 'en', 'es', 'fr', 'nl', 'pl', 'pt', 'ru', 'ua']);
  });

  it('localizes by the recipient language', async () => {
    const { svc, sendMail } = build();
    await svc.sendAppConnectedEmail({ ...base, lang: 'pl' });
    const [to, subject, html] = sendMail.mock.calls[0];
    expect(to).toBe('a@x.pl');
    expect(subject).toContain('AI Accounting');
    expect(subject).toContain('połączona');
    expect(html).toContain('Zarządzaj połączonymi aplikacjami');
    expect(html).toContain('href="https://app.ai-budget.pl/settings/connected-apps"');
  });

  it('falls back to English for an unknown or missing language', async () => {
    const { svc, sendMail } = build();
    await svc.sendAppConnectedEmail({ ...base, lang: 'xx' });
    await svc.sendAppConnectedEmail({ ...base, lang: null });
    expect(sendMail.mock.calls[0][2]).toContain('Manage connected apps');
    expect(sendMail.mock.calls[1][2]).toContain('Manage connected apps');
  });

  it('HTML-escapes developer-controlled values', async () => {
    const { svc, sendMail } = build();
    await svc.sendAppConnectedEmail({ ...base, lang: 'en', appName: '<script>x</script>', accountNames: ['A&B', 'C'] });
    const html = sendMail.mock.calls[0][2];
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('A&amp;B');
    expect(html).toContain('C');
  });

  it('joins names with the conjunction of the selected copy language (ua -> uk, unknown -> en)', async () => {
    const { svc, sendMail } = build();
    await svc.sendAppConnectedEmail({ ...base, lang: 'ua', accountNames: ['A', 'B'] });
    await svc.sendAppConnectedEmail({ ...base, lang: 'xx', accountNames: ['A', 'B'] });
    expect(sendMail.mock.calls[0][2]).toContain('«A» і «B»');
    expect(sendMail.mock.calls[1][2]).toContain('“A” and “B”');
  });

  it('lists several accounts in the plural wording and one in the singular', async () => {
    const { svc, sendMail } = build();
    await svc.sendAppConnectedEmail({ ...base, lang: 'en', accountNames: ['Personal', 'Business'] });
    await svc.sendAppConnectedEmail({ ...base, lang: 'en', accountNames: ['Personal'] });
    expect(sendMail.mock.calls[0][2]).toContain('to the accounts “Personal” and “Business”');
    expect(sendMail.mock.calls[1][2]).toContain('to the account “Personal”');
  });
});

describe('MailService.sendSupportReplyEmail', () => {
  const params = {
    to: 'a@x.pl', lang: 'en', name: 'Ann',
    replies: [{ text: 'Hi <b>there</b>', original: 'Привет & пока' }, { text: 'Second', original: null }],
    ctaUrl: 'https://app.ai-budget.pl/support?a=1&b=2',
    unsubscribeUrl: 'https://api.ai-budget.pl/api/v1/mail/unsubscribe/support?u=1&t=2',
  };

  it('sends the localized subject and passes the unsubscribe URL as List-Unsubscribe', async () => {
    const { svc, sendMail } = build();
    await svc.sendSupportReplyEmail({ ...params, lang: 'pl' });
    const [to, subject, html, unsub] = sendMail.mock.calls[0];
    expect(to).toBe('a@x.pl');
    expect(subject).toBe('Odpowiedź od dewelopera');
    expect(html).toContain('Otwórz rozmowę');
    expect(unsub).toBe(params.unsubscribeUrl);
  });

  it('HTML-escapes user and developer text and URLs, and shows the original only when present', async () => {
    const { svc, sendMail } = build();
    await svc.sendSupportReplyEmail({ ...params, name: '<img src=x>' });
    const html = sendMail.mock.calls[0][2];
    expect(html).not.toContain('<b>there</b>');
    expect(html).not.toContain('<img');
    expect(html).toContain('Hi &lt;b&gt;there&lt;/b&gt;');
    expect(html).toContain('Привет &amp; пока');
    expect(html).toContain('href="https://app.ai-budget.pl/support?a=1&amp;b=2"');
    expect(html.match(/Original/g)?.length).toBe(1);
  });
});
