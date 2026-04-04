import { useState, useCallback, useRef } from 'react';
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
  discountAmount: number | null;
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
  isPdf: boolean;
  scannedReceipt: ScannedReceipt | null;
}

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB

export function useReceiptScanner() {
  const [state, setState] = useState<ReceiptScannerState>({
    isProcessing: false,
    error: null,
    imageUri: null,
    isPdf: false,
    scannedReceipt: null,
  });
  const pickingRef = useRef(false);

  const pickFromCamera = useCallback(async (userPrompt?: string): Promise<ScannedReceipt | null> => {
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
      });

      if (result.canceled || !result.assets[0]) {
        return null;
      }

      const imageUri = result.assets[0].uri;
      return processImage(imageUri, userPrompt);
    } catch (error) {
      console.error('Failed to capture image:', error);
      setState((s) => ({
        ...s,
        error: error instanceof Error ? error.message : i18n.t('errors.captureImageFailed'),
      }));
      return null;
    }
  }, []);

  const pickFromGallery = useCallback(async (userPrompt?: string): Promise<ScannedReceipt | null> => {
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
      });

      if (result.canceled || !result.assets[0]) {
        return null;
      }

      const imageUri = result.assets[0].uri;
      return processImage(imageUri, userPrompt);
    } catch (error) {
      console.error('Failed to pick image:', error);
      setState((s) => ({
        ...s,
        error: error instanceof Error ? error.message : i18n.t('errors.pickImageFailed'),
      }));
      return null;
    }
  }, []);

  const pickPdfDocument = useCallback(async (userPrompt?: string): Promise<ScannedReceipt | null> => {
    if (pickingRef.current) return null;
    pickingRef.current = true;
    try {
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return null;
      }

      const asset = result.assets[0];

      if (asset.size && asset.size > MAX_PDF_SIZE) {
        setState((s) => ({ ...s, error: i18n.t('errors.pdfTooLarge') }));
        return null;
      }

      setState((s) => ({
        ...s,
        isProcessing: true,
        error: null,
        imageUri: null,
        isPdf: true,
        scannedReceipt: null,
      }));

      const file = new File(asset.uri);
      const base64 = await file.base64();

      const scannedReceipt = await api.scanReceipt(base64, userPrompt || undefined, 'application/pdf');

      setState((s) => ({
        ...s,
        isProcessing: false,
        scannedReceipt,
      }));

      return scannedReceipt;
    } catch (error) {
      console.error('[ReceiptScanner] Failed to process PDF:', error);
      setState((s) => ({
        ...s,
        isProcessing: false,
        isPdf: false,
        error: error instanceof Error ? error.message : i18n.t('errors.processReceiptFailed'),
      }));
      return null;
    } finally {
      pickingRef.current = false;
    }
  }, []);

  const processImage = async (imageUri: string, userPrompt?: string): Promise<ScannedReceipt | null> => {
    setState((s) => ({
      ...s,
      isProcessing: true,
      error: null,
      imageUri,
      isPdf: false,
      scannedReceipt: null,
    }));

    try {
      // Read image as base64
      console.log('[ReceiptScanner] Reading image from:', imageUri);
      const file = new File(imageUri);
      const base64 = await file.base64();
      console.log('[ReceiptScanner] Base64 length:', base64.length);

      // Send to API for OCR
      console.log('[ReceiptScanner] Calling api.scanReceipt...');
      const scannedReceipt = await api.scanReceipt(base64, userPrompt || undefined);
      console.log('[ReceiptScanner] Scan result:', JSON.stringify(scannedReceipt).substring(0, 200));

      setState((s) => ({
        ...s,
        isProcessing: false,
        scannedReceipt,
      }));

      return scannedReceipt;
    } catch (error) {
      console.error('[ReceiptScanner] Failed to process receipt:', error);
      setState((s) => ({
        ...s,
        isProcessing: false,
        error: error instanceof Error ? error.message : i18n.t('errors.processReceiptFailed'),
      }));
      return null;
    }
  };

  const processExistingImage = useCallback(
    async (imageUri: string, userPrompt?: string): Promise<ScannedReceipt | null> => {
      return processImage(imageUri, userPrompt);
    },
    [],
  );

  const reset = useCallback(() => {
    setState({
      isProcessing: false,
      error: null,
      imageUri: null,
      isPdf: false,
      scannedReceipt: null,
    });
  }, []);

  return {
    ...state,
    pickFromCamera,
    pickFromGallery,
    pickPdfDocument,
    processExistingImage,
    reset,
  };
}
