import { useState, useCallback, useRef } from 'react';
import { Audio } from 'expo-av';
import { File } from 'expo-file-system/next';
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
      const file = new File(uri);
      const base64Audio = await file.base64();

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
    }

    setState({
      isRecording: false,
      isProcessing: false,
      error: null,
      transcription: null,
      parsedExpense: null,
    });
  }, []);

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
