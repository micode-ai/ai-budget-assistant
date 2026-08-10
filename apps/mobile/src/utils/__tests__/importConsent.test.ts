import { isAiConsentLoop } from '../importConsent';

describe('isAiConsentLoop', () => {
  it('is false when consent was never granted this session', () => {
    expect(isAiConsentLoop(null, 'acc-1')).toBe(false);
  });

  it('is false when no account is selected, even if a grant is recorded', () => {
    expect(isAiConsentLoop('acc-1', null)).toBe(false);
  });

  it('is false when both are null (never granted, no account)', () => {
    expect(isAiConsentLoop(null, null)).toBe(false);
  });

  it('is false when the grant was for a different account', () => {
    expect(isAiConsentLoop('acc-1', 'acc-2')).toBe(false);
  });

  it('is true when the current account already granted consent this session', () => {
    expect(isAiConsentLoop('acc-1', 'acc-1')).toBe(true);
  });
});
