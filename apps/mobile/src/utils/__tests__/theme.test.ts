import { applyThemePatch } from '../theme';

describe('applyThemePatch', () => {
  it('always applies locally', () => {
    const applyLocal = jest.fn();
    const persist = jest.fn().mockResolvedValue(undefined);
    applyThemePatch({ themeMode: 'dark' }, { isLoggedIn: false, applyLocal, persist });
    expect(applyLocal).toHaveBeenCalledWith({ themeMode: 'dark' });
  });

  it('does not persist when logged out', () => {
    const persist = jest.fn().mockResolvedValue(undefined);
    applyThemePatch({ accentColor: '#AABBCC' }, { isLoggedIn: false, applyLocal: jest.fn(), persist });
    expect(persist).not.toHaveBeenCalled();
  });

  it('persists when logged in', () => {
    const persist = jest.fn().mockResolvedValue(undefined);
    applyThemePatch({ accentColor: null }, { isLoggedIn: true, applyLocal: jest.fn(), persist });
    expect(persist).toHaveBeenCalledWith({ accentColor: null });
  });

  it('routes a rejected persist to onPersistError (non-fatal)', async () => {
    const err = new Error('offline');
    const persist = jest.fn().mockRejectedValue(err);
    const onPersistError = jest.fn();
    applyThemePatch({ themeMode: 'light' }, { isLoggedIn: true, applyLocal: jest.fn(), persist, onPersistError });
    await Promise.resolve();
    await Promise.resolve();
    expect(onPersistError).toHaveBeenCalledWith(err);
  });
});
