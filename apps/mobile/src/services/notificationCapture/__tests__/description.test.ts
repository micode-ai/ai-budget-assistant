import { capturedExpenseDescription } from '../description';

describe('capturedExpenseDescription', () => {
  it('is the merchant alone, with no language-specific suffix', () => {
    expect(capturedExpenseDescription('Sklep Osiedlowy', 'Autozapis')).toBe('Sklep Osiedlowy');
  });

  it('trims the merchant', () => {
    expect(capturedExpenseDescription('  Żabka ', 'Autozapis')).toBe('Żabka');
  });

  it('falls back to the localized label when there is no merchant', () => {
    expect(capturedExpenseDescription(null, 'Autozapis')).toBe('Autozapis');
    expect(capturedExpenseDescription(undefined, 'Auto-captured')).toBe('Auto-captured');
    expect(capturedExpenseDescription('   ', 'Auto-captured')).toBe('Auto-captured');
  });
});
