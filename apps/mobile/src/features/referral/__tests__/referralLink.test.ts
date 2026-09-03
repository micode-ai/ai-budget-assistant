import {
  buildReferralUrl,
  buildReferralShareMessage,
  REFERRAL_LINK_BASE,
} from '../referralLink';
import { parseReferralCode } from '@/services/attribution.types';

describe('buildReferralUrl', () => {
  it('points at the web app and carries the code', () => {
    const url = buildReferralUrl('AB12CD');
    expect(url.startsWith(`${REFERRAL_LINK_BASE}/?`)).toBe(true);
    expect(new URL(url).searchParams.get('ref')).toBe('AB12CD');
  });

  it('tags the channel so it is attributed instead of reading as direct', () => {
    const params = new URL(buildReferralUrl('AB12CD')).searchParams;
    expect(params.get('src')).toBe('referral');
    expect(params.get('loc')).toBe('share');
  });
});

describe('buildReferralShareMessage', () => {
  it('keeps the code visible in the text, not only inside the link', () => {
    // The Play install path drops the query string, so the printed code is the
    // only way that friend can claim the bonus.
    const msg = buildReferralShareMessage('AB12CD', 'Join with my code AB12CD!');
    expect(msg).toContain('Join with my code AB12CD!');
    expect(msg).toContain('ref=AB12CD');
  });

  it('ends with the URL on its own line so messengers linkify it', () => {
    const msg = buildReferralShareMessage('AB12CD', 'Join with my code AB12CD!');
    const lines = msg.split('\n');
    expect(lines[lines.length - 1]).toBe(buildReferralUrl('AB12CD'));
  });
});

describe('parseReferralCode', () => {
  it('reads and uppercases a code from the query string', () => {
    expect(parseReferralCode('?ref=ab12cd')).toBe('AB12CD');
  });

  it('ignores an absent or empty ref', () => {
    expect(parseReferralCode('?src=landing')).toBeUndefined();
    expect(parseReferralCode('')).toBeUndefined();
  });

  it('drops a hostile value rather than passing it to a text input', () => {
    expect(parseReferralCode('?ref=<script>')).toBeUndefined();
    expect(parseReferralCode(`?ref=${'A'.repeat(64)}`)).toBeUndefined();
    expect(parseReferralCode('?ref=AB')).toBeUndefined();
  });

  it('survives a malformed query string', () => {
    expect(parseReferralCode('%%%')).toBeUndefined();
  });
});
