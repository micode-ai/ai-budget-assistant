import { useState, useCallback, useRef } from 'react';
import { Audio } from 'expo-av';
import { api } from '@/services/api';

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
      // Request permissions
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setState((s) => ({ ...s, error: 'Microphone permission denied' }));
        return false;
      }

      // Configure audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Create and start recording
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
    } catch (error) {
      console.error('Failed to start recording:', error);
      setState((s) => ({
        ...s,
        error: 'Failed to start recording',
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

      // Read the file and create blob for upload
      const response = await fetch(uri);
      const blob = await response.blob();

      // Transcribe audio
      const transcriptionResult = await api.transcribeAudio(blob);
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
    } catch (error) {
      console.error('Failed to process recording:', error);
      setState((s) => ({
        ...s,
        isProcessing: false,
        error: error instanceof Error ? error.message : 'Failed to process recording',
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
