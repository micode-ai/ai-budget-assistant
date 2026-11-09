import { buildUnsubscribeUrl, signUnsubscribeToken, verifyUnsubscribeToken } from './email-unsubscribe';
import { MailUnsubscribeController } from './mail-unsubscribe.controller';
import { onboardingEmailCopy, ONBOARDING_EMAIL_LANGS } from './onboarding-email-i18n';

const SECRET = 'test-secret';

describe('unsubscribe token', () => {
  it('verifies its own token and rejects a token for another user or a forged one', () => {
    const t = signUnsubscribeToken('u1', SECRET);
    expect(verifyUnsubscribeToken('u1', t, SECRET)).toBe(true);
    expect(verifyUnsubscribeToken('u2', t, SECRET)).toBe(false);
    expect(verifyUnsubscribeToken('u1', t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A'), SECRET)).toBe(false);
    expect(verifyUnsubscribeToken('u1', 'short', SECRET)).toBe(false);
    expect(verifyUnsubscribeToken('u1', t, '')).toBe(false);
  });

  it('builds an absolute link under the API prefix', () => {
    const url = buildUnsubscribeUrl('https://api.example.com/', 'u1', SECRET);
    expect(url.startsWith('https://api.example.com/api/v1/mail/unsubscribe?u=u1&t=')).toBe(true);
  });
});

describe('MailUnsubscribeController', () => {
  function make(updatedCount = 1) {
    const prisma = {
      user: {
        updateMany: jest.fn().mockResolvedValue({ count: updatedCount }),
        findUnique: jest.fn().mockResolvedValue({ language: 'pl' }),
      },
    } as any;
    const config = { get: jest.fn().mockReturnValue(SECRET) } as any;
    return { ctrl: new MailUnsubscribeController(prisma, config), prisma };
  }

  it('turns the flag off for a valid link and answers in the user language', async () => {
    const { ctrl, prisma } = make();
    const html = await ctrl.unsubscribeLink('u1', signUnsubscribeToken('u1', SECRET));
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { onboardingEmailsEnabled: false } });
    expect(html).toContain(onboardingEmailCopy('pl').unsubscribedTitle);
  });

  it('changes nothing for a bad token but answers the same way', async () => {
    const { ctrl, prisma } = make();
    const html = await ctrl.unsubscribeLink('u1', 'forged');
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    // English (no user resolved), HTML-escaped like every string on the page.
    expect(html).toContain(onboardingEmailCopy('en').unsubscribedTitle.replace("'", '&#39;'));
  });

  it('supports RFC 8058 one-click POST', async () => {
    const { ctrl, prisma } = make();
    await expect(ctrl.oneClick('u1', signUnsubscribeToken('u1', SECRET))).resolves.toEqual({ ok: true });
    expect(prisma.user.updateMany).toHaveBeenCalled();
  });
});

describe('onboardingEmailCopy', () => {
  it('covers all nine app languages with distinct copy', () => {
    expect(ONBOARDING_EMAIL_LANGS.sort()).toEqual(['be', 'de', 'en', 'es', 'fr', 'nl', 'pl', 'ru', 'ua']);
    for (const l of ONBOARDING_EMAIL_LANGS) {
      if (l !== 'en') expect(onboardingEmailCopy(l).intro).not.toBe(onboardingEmailCopy('en').intro);
    }
  });

  it('falls back to English for unknown and prototype-key languages', () => {
    for (const l of ['xx', '', null, undefined, 'constructor', '__proto__']) {
      expect(onboardingEmailCopy(l as string)).toBe(onboardingEmailCopy('en'));
    }
  });
});
