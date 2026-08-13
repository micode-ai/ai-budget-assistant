import { proposedKey, isProposedKey, proposedName } from '../proposedCategory';

describe('proposed category keys', () => {
  it('round-trips a name through a key', () => {
    const key = proposedKey('Chemia gospodarcza');
    expect(isProposedKey(key)).toBe(true);
    expect(proposedName(key)).toBe('Chemia gospodarcza');
  });

  it('does not mistake a real category id for a proposal', () => {
    expect(isProposedKey('4c6595d1-a2a5-4c7a-8573-6931474f4194')).toBe(false);
    expect(isProposedKey(null)).toBe(false);
    expect(isProposedKey(undefined)).toBe(false);
  });

  it('keeps a name containing a colon intact', () => {
    expect(proposedName(proposedKey('Dom: chemia'))).toBe('Dom: chemia');
  });
});
