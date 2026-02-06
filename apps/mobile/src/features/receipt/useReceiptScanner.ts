import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system/next';
import { api } from '@/services/api';
import i18n from '@/i18n';

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
        setState((s) => ({ ...s, error: i18n.t('errors.cameraPermissionDenied') }));
        return null;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
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
        error: error instanceof Error ? error.message : i18n.t('errors.captureImageFailed'),
      }));
      return null;
    }
  }, []);

  const pickFromGallery = useCallback(async (): Promise<ScannedReceipt | null> => {
    try {
      // Request media library permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setState((s) => ({ ...s, error: i18n.t('errors.galleryPermissionDenied') }));
        return null;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
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
        error: error instanceof Error ? error.message : i18n.t('errors.pickImageFailed'),
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
      const file = new File(imageUri);
      const base64 = await file.base64();

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
        error: error instanceof Error ? error.message : i18n.t('errors.processReceiptFailed'),
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
