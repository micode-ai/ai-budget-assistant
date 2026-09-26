import { sharedFileKind } from '../sharedFileKind';

describe('sharedFileKind', () => {
  it('pdf by MIME', () => expect(sharedFileKind('application/pdf', 'x')).toBe('pdf'));
  it('pdf by extension when MIME is generic', () => expect(sharedFileKind('application/octet-stream', 'Faktura.PDF')).toBe('pdf'));
  it('image otherwise', () => expect(sharedFileKind('image/png', 'shot.png')).toBe('image'));
});
