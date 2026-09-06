// Pins the microphone teardown in `useVoiceInput` (see the hook's own comments
// for what was leaking): a recording used to be released only by an explicit
// stop/cancel button press, so leaving the screen mid-recording held the mic
// open and left the iOS audio session in `allowsRecordingIOS: true`.
//
// This drives the real hook through `react-test-renderer`, which is a direct
// runtime dependency of `jest-expo` (version-pinned to the same 19.1.0 as
// `react`), so it is always installed wherever this suite can run. That is a
// deliberate, narrow exception to this repo's "nothing renders in CI" norm and
// it is NOT a move toward component tests: `Probe` renders `null`, there is no
// UI, no snapshot and no assertion about anything drawn. It is here because
// both ways this fix goes wrong are lifecycle facts — a cleanup that runs but
// releases nothing, and a cleanup with the wrong dependency list — and neither
// is observable without real mount/re-render/unmount semantics. A hand-rolled
// fake of `useEffect` would only prove the fake agreed with itself.

const mockStopAndUnload = jest.fn<Promise<void>, []>();
const mockGetURI = jest.fn(() => 'file:///recording.m4a');
const mockSetAudioMode = jest.fn<Promise<void>, [unknown]>();
const mockRequestPermissions = jest.fn();
const mockCreateAsync = jest.fn();

jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
    setAudioModeAsync: (...args: [unknown]) => mockSetAudioMode(...args),
    Recording: { createAsync: (...args: unknown[]) => mockCreateAsync(...args) },
    RecordingOptionsPresets: { HIGH_QUALITY: {} },
  },
}));
jest.mock('@/utils/fileBase64', () => ({ uriToBase64: jest.fn().mockResolvedValue('base64') }));
jest.mock('@/services/api', () => ({
  api: {
    transcribeAudio: jest.fn().mockResolvedValue({ text: 'coffee three fifty' }),
    parseExpense: jest.fn().mockResolvedValue({
      amount: 3.5,
      currencyCode: 'USD',
      description: 'coffee',
      categorySuggestion: 'Food',
      confidence: 0.9,
    }),
  },
}));
jest.mock('@/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));

import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useVoiceInput } from '../useVoiceInput';

type Hook = ReturnType<typeof useVoiceInput>;

/** Minimal hook driver — `Probe` exists only to give the hook a render to live in. */
function renderVoiceInput() {
  let hook!: Hook;
  function Probe() {
    hook = useVoiceInput();
    return null;
  }
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(Probe));
  });
  return {
    get current(): Hook {
      return hook;
    },
    rerender: async () => {
      await act(async () => {
        renderer.update(createElement(Probe));
      });
    },
    unmount: async () => {
      await act(async () => {
        renderer.unmount();
      });
    },
  };
}

async function startRecording(view: ReturnType<typeof renderVoiceInput>) {
  await act(async () => {
    await view.current.startRecording();
  });
}

const RECORDING_OFF = { allowsRecordingIOS: false };

beforeEach(() => {
  jest.clearAllMocks();
  mockStopAndUnload.mockResolvedValue(undefined);
  mockSetAudioMode.mockResolvedValue(undefined);
  mockRequestPermissions.mockResolvedValue({ status: 'granted' });
  mockCreateAsync.mockResolvedValue({
    recording: { stopAndUnloadAsync: mockStopAndUnload, getURI: mockGetURI },
  });
});

describe('useVoiceInput teardown', () => {
  // Catches: the unmount cleanup calling `reset()` instead of `cancelRecording()`.
  // The two are one word apart and look interchangeable — `reset` clears the
  // hook's state and touches neither the recording nor the audio session, so
  // that swap leaves a cleanup that runs on every unmount and releases nothing.
  it('releases the recording and restores the audio mode when unmounted mid-recording', async () => {
    const view = renderVoiceInput();
    await startRecording(view);
    expect(view.current.isRecording).toBe(true);
    expect(mockStopAndUnload).not.toHaveBeenCalled();

    await view.unmount();

    expect(mockStopAndUnload).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenLastCalledWith(RECORDING_OFF);
  });

  // Catches: `}, [cancelRecording]);` losing its dependency array entirely, or
  // being given a value that changes each render (`[state]`). Either way the
  // cleanup fires on re-render rather than only on unmount — and `startRecording`
  // itself sets state, so the very first re-render would tear down the recording
  // the user just started, while still mounted and still showing "listening".
  it('does not release the recording on a re-render', async () => {
    const view = renderVoiceInput();
    await startRecording(view);

    await view.rerender();
    await view.rerender();

    expect(mockStopAndUnload).not.toHaveBeenCalled();
    expect(view.current.isRecording).toBe(true);
  });

  // Catches: deleting the `setAudioModeAsync({ allowsRecordingIOS: false })`
  // added to `cancelRecording`. Before it, only `stopRecording`'s SUCCESS path
  // restored the session, so the Cancel button released the mic but left the
  // session in recording mode.
  it('restores the audio mode when the recording is cancelled', async () => {
    const view = renderVoiceInput();
    await startRecording(view);
    mockSetAudioMode.mockClear();

    await act(async () => {
      await view.current.cancelRecording();
    });

    expect(mockStopAndUnload).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).toHaveBeenCalledWith(RECORDING_OFF);
    expect(view.current.isRecording).toBe(false);
  });

  // Catches: hoisting the teardown out of the `if (recordingRef.current)` guard.
  // Unmounting a screen nobody recorded on would then fire a native audio-session
  // call every time, and unmounting after a completed stop would call
  // `stopAndUnloadAsync` a second time on an already-unloaded recording.
  it('does nothing on unmount when no recording is in flight', async () => {
    const view = renderVoiceInput();

    await view.unmount();

    expect(mockStopAndUnload).not.toHaveBeenCalled();
    expect(mockSetAudioMode).not.toHaveBeenCalled();
  });

  it('does not release a second time when the recording was already stopped', async () => {
    const view = renderVoiceInput();
    await startRecording(view);
    await act(async () => {
      await view.current.stopRecording();
    });
    expect(mockStopAndUnload).toHaveBeenCalledTimes(1);
    mockSetAudioMode.mockClear();

    await view.unmount();

    expect(mockStopAndUnload).toHaveBeenCalledTimes(1);
    expect(mockSetAudioMode).not.toHaveBeenCalled();
  });
});
