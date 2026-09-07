import { useState, useCallback, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import { uriToBase64 } from '@/utils/fileBase64';
import { api } from '@/services/api';
import i18n from '@/i18n';

export interface VoiceInputState {
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
  transcription: string | null;
  parsedExpense: ParsedExpense | null;
}

export interface ParsedExpense {
  amount: number;
  currencyCode: string;
  description: string;
  categoryId?: string;
  categorySuggestion: string;
  confidence: number;
  merchant?: string;
}

export function useVoiceInput() {
  const [state, setState] = useState<VoiceInputState>({
    isRecording: false,
    isProcessing: false,
    error: null,
    transcription: null,
    parsedExpense: null,
  });

  const recordingRef = useRef<Audio.Recording | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setState((s) => ({ ...s, error: i18n.t('errors.micPermissionDenied') }));
        return false;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );

      recordingRef.current = recording;
      setState((s) => ({
        ...s,
        isRecording: true,
        error: null,
        transcription: null,
        parsedExpense: null,
      }));

      return true;
    } catch (err) {
      console.error('[VoiceInput] Failed to start recording:', err);
      setState((s) => ({
        ...s,
        error: i18n.t('errors.startRecordingFailed'),
        isRecording: false,
      }));
      return false;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<ParsedExpense | null> => {
    if (!recordingRef.current) {
      return null;
    }

    setState((s) => ({ ...s, isRecording: false, isProcessing: true }));

    try {
      // Stop recording
      await recordingRef.current.stopAndUnloadAsync();

      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      // Get recording URI
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        throw new Error('No recording URI');
      }

      // Read the recording file as base64 string
      const base64Audio = await uriToBase64(uri);

      // Transcribe audio
      const transcriptionResult = await api.transcribeAudio(base64Audio);
      const transcription = transcriptionResult.text;

      setState((s) => ({ ...s, transcription }));

      // Parse the transcription into expense data
      const parsedExpense = await api.parseExpense(transcription);

      setState((s) => ({
        ...s,
        isProcessing: false,
        parsedExpense,
      }));

      return parsedExpense;
    } catch (err) {
      console.error('Failed to process recording:', err);
      setState((s) => ({
        ...s,
        isProcessing: false,
        error: err instanceof Error ? err.message : i18n.t('errors.processRecordingFailed'),
      }));
      return null;
    }
  }, []);

  const cancelRecording = useCallback(async () => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {
        // Ignore errors when canceling
      }
      recordingRef.current = null;
      /**
       * `startRecording` puts the session into recording mode, and only
       * `stopRecording`'s SUCCESS path ever put it back — so cancelling (and,
       * before the unmount cleanup below, simply leaving the screen while
       * recording) left `allowsRecordingIOS: true` behind on iOS. Restoring it
       * here rather than in each caller makes the invariant unconditional:
       * after `cancelRecording`, the microphone is released AND the audio
       * session is back to normal, whichever path got us here.
       */
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      } catch {
        // Ignore: the recording itself is already released either way.
      }
    }

    setState({
      isRecording: false,
      isProcessing: false,
      error: null,
      transcription: null,
      parsedExpense: null,
    });
  }, []);

  /**
   * Release the microphone when whatever is hosting this hook goes away.
   *
   * Nothing used to do this: `recordingRef` was only ever released by an
   * explicit `stopRecording()`/`cancelRecording()` button press, so navigating
   * away (or dismissing the modal route) mid-recording left the mic open and
   * the iOS audio session in recording mode indefinitely. Nobody chose that —
   * it is a bug, not a behaviour anyone relied on, and it gets much easier to
   * hit once this flow is hosted in a dialog that closes on a scrim click.
   *
   * `cancelRecording` is `useCallback(..., [])` and therefore referentially
   * stable, so this dependency list never changes and the cleanup runs on
   * unmount ONLY. A `[]` list here would be equally correct today but would
   * silently go stale if `cancelRecording` ever gained a dependency; listing
   * the function keeps the two facts tied together.
   *
   * The `setState` at the end of `cancelRecording` lands after unmount. That is
   * a deliberate no-op under React 18+ (the "can't update an unmounted
   * component" warning was removed precisely because cleanup like this is
   * legitimate), and it is worth reusing the one real teardown path rather than
   * maintaining a second one that can drift from it.
   */
  useEffect(() => {
    return () => {
      void cancelRecording();
    };
  }, [cancelRecording]);

  const reset = useCallback(() => {
    setState({
      isRecording: false,
      isProcessing: false,
      error: null,
      transcription: null,
      parsedExpense: null,
    });
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    cancelRecording,
    reset,
  };
}
