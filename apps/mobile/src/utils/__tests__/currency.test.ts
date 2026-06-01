import { applyCurrencyChange } from '../currency';

describe('applyCurrencyChange', () => {
  it('does nothing when the currency is unchanged', () => {
    const applyLocal = jest.fn();
    const persist = jest.fn().mockResolvedValue(undefined);
    applyCurrencyChange('EUR', { currentCurrency: 'EUR', applyLocal, persist });
    expect(applyLocal).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('applies locally then persists when the currency changes', () => {
    const applyLocal = jest.fn();
    const persist = jest.fn().mockResolvedValue(undefined);
    applyCurrencyChange('USD', { currentCurrency: 'EUR', applyLocal, persist });
    expect(applyLocal).toHaveBeenCalledWith('USD');
    expect(persist).toHaveBeenCalledWith('USD');
  });

  it('does not throw and reports when persist rejects', async () => {
    const applyLocal = jest.fn();
    const error = new Error('offline');
    const persist = jest.fn().mockRejectedValue(error);
    const onPersistError = jest.fn();
    applyCurrencyChange('USD', {
      currentCurrency: 'EUR',
      applyLocal,
      persist,
      onPersistError,
    });
    expect(applyLocal).toHaveBeenCalledWith('USD');
    // let the rejected-promise microtask settle
    await Promise.resolve();
    await Promise.resolve();
    expect(onPersistError).toHaveBeenCalledWith(error);
  });
});
