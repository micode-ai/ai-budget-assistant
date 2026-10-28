const mockStored = new Map<string, string>();
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: (k: string) => mockStored.get(k),
    set: (k: string, v: string) => mockStored.set(k, v),
  })),
}));

function load() {
  let store: typeof import('../locationSettingsStore').useLocationSettingsStore;
  jest.isolateModules(() => {
    store = require('../locationSettingsStore').useLocationSettingsStore;
  });
  return store!;
}

beforeEach(() => mockStored.clear());

describe('locationSettingsStore', () => {
  it('is ON when nothing was ever stored', () => {
    expect(load().getState().captureEnabled).toBe(true);
  });

  it('stays OFF after the user turned it off', () => {
    mockStored.set('captureEnabled', 'false');
    expect(load().getState().captureEnabled).toBe(false);
  });

  it('persists a change', () => {
    load().getState().setCaptureEnabled(false);
    expect(mockStored.get('captureEnabled')).toBe('false');
    expect(load().getState().captureEnabled).toBe(false);
  });
});
