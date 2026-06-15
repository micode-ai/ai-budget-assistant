import { resolveDismissed } from '../merchantSuggestionStore';

describe('resolveDismissed', () => {
  it('returns an empty set for missing data', () => {
    expect(resolveDismissed(undefined)).toEqual(new Set());
  });
  it('parses a stored JSON array of fingerprints', () => {
    expect(resolveDismissed('["BIEDRONKA","ZABKA"]')).toEqual(new Set(['BIEDRONKA', 'ZABKA']));
  });
  it('ignores non-string entries', () => {
    expect(resolveDismissed('["BIEDRONKA",1,null,true]')).toEqual(new Set(['BIEDRONKA']));
  });
  it('returns an empty set for corrupt or non-array JSON', () => {
    expect(resolveDismissed('not json')).toEqual(new Set());
    expect(resolveDismissed('{"a":1}')).toEqual(new Set());
  });
});
