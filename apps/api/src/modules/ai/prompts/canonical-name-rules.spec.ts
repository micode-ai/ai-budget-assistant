import { readFileSync } from 'fs';
import { join } from 'path';
import { CANONICAL_NAME_RULES } from './canonical-name-rules';

describe('CANONICAL_NAME_RULES', () => {
  it('keeps the canonicalName rules text and OCR uses the constant', () => {
    expect(CANONICAL_NAME_RULES).toContain('"MLEKO 3,2% ŁACIATE 1L 6SZT"       → "Mleko Łaciate 3,2% 1L"');
    const src = readFileSync(join(__dirname, '../services/ocr.service.ts'), 'utf8');
    expect(src).toContain('CANONICAL_NAME_RULES');
    expect(src).not.toContain('canonicalName rules — brand/product name'); // no second inline copy
  });
});
