import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { api } from '@/services/api';

export interface ReceiptItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice: number;
}

export interface ScannedReceipt {
  amount: number;
  currencyCode: string;
  description: string;
  categoryId: string | null;
  categorySuggestion: string | null;
  merchant: string | null;
  date: string | null;
  confidence: number;
  receiptItems: ReceiptItem[];
}

export interface ReceiptScannerState {
  isProcessing: boolean;
  error: string | null;
  imageUri: string | null;
  scannedReceipt: ScannedReceipt | null;
}

export function useReceiptScanner() {
  const [state, setState] = useState<ReceiptScannerState>({
    isProcessing: false,
    error: null,
    imageUri: null,
    scannedReceipt: null,
  });

  const pickFromCamera = useCallback(async (): Promise<ScannedReceipt | null> => {
    try {
      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setState((s) => ({ ...s, error: 'Camera permission denied' }));
        return null;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [3, 4],
      });

      if (result.canceled || !result.assets[0]) {
        return null;
      }

      const imageUri = result.assets[0].uri;
      return processImage(imageUri);
    } catch (error) {
      console.error('Failed to capture image:', error);
      setState((s) => ({
        ...s,
        error: error instanceof Error ? error.message : 'Failed to capture image',
      }));
      return null;
    }
  }, []);

  const pickFromGallery = useCallback(async (): Promise<ScannedReceipt | null> => {
    try {
      // Request media library permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setState((s) => ({ ...s, error: 'Gallery permission denied' }));
        return null;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        allowsEditing: true,
        aspect: [3, 4],
      });

      if (result.canceled || !result.assets[0]) {
        return null;
      }

      const imageUri = result.assets[0].uri;
      return processImage(imageUri);
    } catch (error) {
      console.error('Failed to pick image:', error);
      setState((s) => ({
        ...s,
        error: error instanceof Error ? error.message : 'Failed to pick image',
      }));
      return null;
    }
  }, []);

  const processImage = async (imageUri: string): Promise<ScannedReceipt | null> => {
    setState((s) => ({
      ...s,
      isProcessing: true,
      error: null,
      imageUri,
      scannedReceipt: null,
    }));

    try {
      // Read image as base64
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Send to API for OCR
      const scannedReceipt = await api.scanReceipt(base64);

      setState((s) => ({
        ...s,
        isProcessing: false,
        scannedReceipt,
      }));

      return scannedReceipt;
    } catch (error) {
      console.error('Failed to process receipt:', error);
      setState((s) => ({
        ...s,
        isProcessing: false,
        error: error instanceof Error ? error.message : 'Failed to process receipt',
      }));
      return null;
    }
  };

  const processExistingImage = useCallback(
    async (imageUri: string): Promise<ScannedReceipt | null> => {
      return processImage(imageUri);
    },
    [],
  );

  const reset = useCallback(() => {
    setState({
      isProcessing: false,
      error: null,
      imageUri: null,
      scannedReceipt: null,
    });
  }, []);

  return {
    ...state,
    pickFromCamera,
    pickFromGallery,
    processExistingImage,
    reset,
  };
}
