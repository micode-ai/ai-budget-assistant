import { deepLinkPath, redirectHandedOffLink } from '../handOffDeepLinks';

describe('deepLinkPath', () => {
  it('normalises every form the shortcuts and widgets use', () => {
    expect(deepLinkPath('budget:///expense/new')).toBe('/expense/new');
    expect(deepLinkPath('budget://expense/voice')).toBe('/expense/voice');
    expect(deepLinkPath('/expense/receipt?x=1')).toBe('/expense/receipt');
    expect(deepLinkPath('budget://')).toBeNull();
  });
});

describe('redirectHandedOffLink', () => {
  it('starts at home on a cold start and lets the hook push the target', () => {
    expect(redirectHandedOffLink('budget:///expense/new', true)).toBe('/');
  });
  it('makes the router ignore the link on a warm start', () => {
    expect(redirectHandedOffLink('budget://expense/receipt', false)).toBeNull();
  });
  it('leaves every other link to the router', () => {
    expect(redirectHandedOffLink('budget://groups/link?code=abc', false)).toBe('budget://groups/link?code=abc');
    expect(redirectHandedOffLink('https://ai-budget.pl/authorize?x=1', true)).toBe('https://ai-budget.pl/authorize?x=1');
    expect(redirectHandedOffLink('budget:///expense/123', true)).toBe('budget:///expense/123');
  });
});
