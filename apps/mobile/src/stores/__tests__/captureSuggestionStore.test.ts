jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string | number | boolean>();
  return {
    MMKV: jest.fn().mockImplementation(() => ({
      getNumber: (k: string) => (typeof store.get(k) === 'number' ? (store.get(k) as number) : undefined),
      getBoolean: (k: string) => (typeof store.get(k) === 'boolean' ? (store.get(k) as boolean) : undefined),
      set: (k: string, v: string | number | boolean) => store.set(k, v),
    })),
  };
});

import { useCaptureSuggestionStore } from '../captureSuggestionStore';
import { MANUAL_SAVES_THRESHOLD } from '@/features/captureSuggestion/captureSuggestion';

describe('captureSuggestionStore', () => {
  it('becomes due on the threshold save, then never again once shown', () => {
    const { recordManualSave } = useCaptureSuggestionStore.getState();
    for (let i = 0; i < MANUAL_SAVES_THRESHOLD - 1; i += 1) recordManualSave(false);
    expect(useCaptureSuggestionStore.getState().isPending).toBe(false);

    recordManualSave(false);
    expect(useCaptureSuggestionStore.getState().isPending).toBe(true);

    useCaptureSuggestionStore.getState().markShown();
    recordManualSave(false);
    expect(useCaptureSuggestionStore.getState()).toMatchObject({ isPending: false, shown: true });
  });
});
