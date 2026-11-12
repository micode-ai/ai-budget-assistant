import { useState, useCallback, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { PICKER_TYPES, isPdfAsset } from './pickerTypes';
import { uriToBase64 } from '@/utils/fileBase64';
import { downscaleForOcr } from './receiptImage';
import { api } from '@/services/api';
import i18n from '@/i18n';
import type { InboundReceiptDetail, ReceiptCheckFinding, ReceiptDuplicateMatch } from '@budget/shared-types';
import { computeReceiptFingerprint } from './receiptFingerprint';
import { sharedFileKind } from '@/features/share-intake/sharedFileKind';
import { inboundScannerState } from '@/features/inboundMail/seedFromInbound';
import { capturePhoto } from '@/features/camera/capturePhoto';
import {
  addPart as appendPart,
  removePart as dropPart,
  canScan,
  partsFingerprintInput,
  remainingParts,
  retakeState,
  scanEncodedParts,
  type ScanPart,
} from './receiptParts';

export interface ReceiptItem {
  description: string;
  canonicalName?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice: number;
  /** A discount OCR read against this line, when there was one. */
  lineDiscount?: number;
  /** The category the server classified this line into; `null` id with a name
   * means a category it proposed that does not exist yet. Present even when the
   * receipt produced no money split. */
  categoryId?: string | null;
  categoryName?: string | null;
}

export interface ReceiptCategorySplitItem {
  /** `null` means the server proposed this category and it does not exist yet. */
  categoryId: string | null;
  categoryName: string;
  amount: number;
  percentage: number;
  itemIndexes: number[];
}

export interface ScannedReceipt {
  amount: number;
  discountAmount: number | null;
  depositAmount: number | null;
  currencyCode: string;
  description: string;
  categoryId: string | null;
  categorySuggestion: string | null;
  merchant: string | null;
  date: string | null;
  confidence: number;
  receiptItems: ReceiptItem[];
  location: { lat: number; lng: number; name: string } | null;
  priceFindings?: ReceiptCheckFinding[];
  /** Category groups derived from the receipt's own lines. Always present on
   * the wire (empty when there is nothing to split), optional here for the
   * same defensive-typing reason as `priceFindings` above. */
  categorySplits?: ReceiptCategorySplitItem[];
  /** Fingerprint of the scanned file — handed back on create so a later
   *  re-upload of the same file is caught before OCR (ABA-603). */
  fingerprint?: string;
  /** Short-lived signed token (ABA-642), forwarded once on the first create push, never persisted. */
  scanAttestation?: string;
  /** A saved expense this receipt probably duplicates; a warning, never a block. */
  possibleDuplicate?: ReceiptDuplicateMatch | null;
}

export interface ReceiptScannerOptions {
  /**
   * Stage 1 of the duplicate warning (ABA-603). When given, the scanner checks
   * the file's fingerprint BEFORE uploading it for OCR and, on a match, asks
   * this callback — resolve `true` to scan anyway, `false` to stop. Omitted
   * (income receipts), nothing is checked. A failed check never blocks a scan.
   */
  onDuplicate?: (match: ReceiptDuplicateMatch) => Promise<boolean>;
}

export interface ReceiptScannerState {
  isProcessing: boolean;
  error: string | null;
  imageUri: string | null;
  isPdf: boolean;
  scannedReceipt: ScannedReceipt | null;
  /** HTTP status of the last failed scan (403 = AI limit / tier), else null. */
  errorStatus: number | null;
  /**
   * Long receipt: the photos taken so far, top to bottom (max 4), each already
   * downscaled. Empty in the ordinary single-photo flow, which never touches it.
   */
  parts: ScanPart[];
  /** A part is being downscaled after capture; the part buttons wait. */
  isPreparingPart: boolean;
}

const emptyState = (): ReceiptScannerState => ({
  isProcessing: false,
  error: null,
  imageUri: null,
  isPdf: false,
  scannedReceipt: null,
  errorStatus: null,
  parts: [],
  isPreparingPart: false,
});

/** A 400 code from a multi-part request (`parts_count`...) is not a sentence for the user. */
function scanErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (!message || /^(parts_|image_or_images$)/.test(message)) return i18n.t('errors.processReceiptFailed');
  return message;
}

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB

export function useReceiptScanner(options: ReceiptScannerOptions = {}) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, setState] = useState<ReceiptScannerState>(emptyState);
  const pickingRef = useRef(false);
  const partsRef = useRef(state.parts);
  partsRef.current = state.parts;

  /** `true` = go ahead with OCR. Resets the scanner when the user declines. */
  const passesDuplicateCheck = async (base64: string): Promise<boolean> => {
    const onDuplicate = optionsRef.current.onDuplicate;
    if (!onDuplicate) return true;
    let match: ReceiptDuplicateMatch | null = null;
    try {
      const fingerprint = await computeReceiptFingerprint(base64);
      match = (await api.findReceiptDuplicate(fingerprint)).duplicate;
    } catch (error) {
      console.warn('[ReceiptScanner] duplicate pre-check skipped:', error);
      return true;
    }
    if (!match) return true;
    const proceed = await onDuplicate(match);
    if (!proceed) {
      setState(emptyState());
    }
    return proceed;
  };

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

      const asset = result.assets[0];
      return processImage(asset.uri, userPrompt, asset.width);
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

      const asset = result.assets[0];
      return processImage(asset.uri, userPrompt, asset.width);
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
        type: PICKER_TYPES,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return null;
      }

      const asset = result.assets[0];

      // The web filter deliberately admits more than PDFs (see PICKER_TYPES), and
      // a store's "PDF" receipt is often really an exported photo. Anything that
      // is not a PDF goes down the ordinary image path, which already knows how to
      // preview it, offer to store it, and label the progress text correctly.
      if (!isPdfAsset(asset.mimeType, asset.name)) {
        return processImage(asset.uri, userPrompt);
      }

      return processPdf(asset.uri, asset.size, userPrompt);
    } catch (error) {
      console.error('[ReceiptScanner] Failed to pick PDF:', error);
      setState((s) => ({
        ...s,
        isProcessing: false,
        error: error instanceof Error ? error.message : i18n.t('errors.processReceiptFailed'),
        errorStatus: null,
      }));
      return null;
    } finally {
      pickingRef.current = false;
    }
  }, []);

  /** Uploads a PDF for OCR. Shared by the document picker and share-to-capture. */
  const processPdf = async (
    uri: string,
    size: number | undefined,
    userPrompt?: string,
  ): Promise<ScannedReceipt | null> => {
    if (size && size > MAX_PDF_SIZE) {
      setState((s) => ({ ...s, error: i18n.t('errors.pdfTooLarge'), errorStatus: null }));
      return null;
    }
    try {
      setState((s) => ({
        ...s,
        isProcessing: true,
        error: null,
        errorStatus: null,
        imageUri: null,
        isPdf: true,
        scannedReceipt: null,
      }));

      const base64 = await uriToBase64(uri);
      if (!(await passesDuplicateCheck(base64))) return null;

      const scannedReceipt = await api.scanReceipt(base64, userPrompt || undefined, 'application/pdf');

      setState((s) => ({ ...s, isProcessing: false, scannedReceipt }));
      return scannedReceipt;
    } catch (error) {
      console.error('[ReceiptScanner] Failed to process PDF:', error);
      setState((s) => ({
        ...s,
        isProcessing: false,
        isPdf: false,
        error: error instanceof Error ? error.message : i18n.t('errors.processReceiptFailed'),
        errorStatus: (error as { status?: number }).status ?? null,
      }));
      return null;
    }
  };

  const processImage = async (
    imageUri: string,
    userPrompt?: string,
    sourceWidth?: number,
  ): Promise<ScannedReceipt | null> => {
    setState((s) => ({
      ...s,
      isProcessing: true,
      error: null,
      errorStatus: null,
      imageUri: null,
      isPdf: false,
      scannedReceipt: null,
    }));

    try {
      // Shrink before encoding. The raw camera JPEG is several megabytes, base64
      // adds a third on top, and the request body copies it again — a transient
      // peak of tens of MB per scan. The downscaled file is also what the preview
      // <Image> renders, so no full-resolution bitmap is ever decoded.
      const scanUri = await downscaleForOcr(imageUri, sourceWidth);
      setState((s) => ({ ...s, imageUri: scanUri }));

      const base64 = await uriToBase64(scanUri);
      if (!(await passesDuplicateCheck(base64))) return null;

      // Send to API for OCR
      const scannedReceipt = await api.scanReceipt(base64, userPrompt || undefined);

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
        errorStatus: (error as { status?: number }).status ?? null,
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

  /** Share-to-capture entry: a file:// copy made by ShareIntakeModule. */
  const processSharedFile = useCallback(
    async (uri: string, mimeType: string, name: string, size: number): Promise<ScannedReceipt | null> =>
      sharedFileKind(mimeType, name) === 'pdf' ? processPdf(uri, size) : processImage(uri),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /**
   * E-mail inbox entry (ABA-644): instead of scanning, seed the scanner from an
   * item the server already extracted, so the one confirm card and the one save
   * path serve it. `documentUri` is the downloaded image (null for a PDF or text
   * body). Returns `false` when the item has no usable extraction.
   */
  const seedFromInbound = useCallback((detail: InboundReceiptDetail, documentUri: string | null): boolean => {
    const next = inboundScannerState(detail, documentUri);
    setState({ ...emptyState(), ...next });
    return next.scannedReceipt !== null;
  }, []);

  const reset = useCallback(() => {
    setState(emptyState());
  }, []);

  // -- Long receipt in several photos ------------------------------------
  // Parts are only collected here; nothing is scanned until `scanParts` (the
  // "Read receipt" button) - one scan per receipt, not per part.

  /**
   * Downscales a photo (as every receipt is, `receiptImage.ts`) and appends it
   * as the next part. Returns the URI the part now holds - the original one
   * when the downscale failed - or null when there was no room.
   */
  const addPart = useCallback(async (photo: { uri: string; width?: number }): Promise<string | null> => {
    if (remainingParts(partsRef.current) === 0) return null;
    setState((s) => ({ ...s, isPreparingPart: true, error: null, errorStatus: null }));
    try {
      const uri = await downscaleForOcr(photo.uri, photo.width);
      setState((s) => ({ ...s, parts: appendPart(s.parts, { uri }) }));
      return uri;
    } finally {
      setState((s) => ({ ...s, isPreparingPart: false }));
    }
  }, []);

  /** Camera for the next part. In-page on web (`capturePhoto`), so a reload cannot lose earlier parts. */
  const capturePart = useCallback(async (): Promise<void> => {
    try {
      const shot = await capturePhoto({ shutter: i18n.t('receipt.takePhoto'), cancel: i18n.t('common.cancel') });
      if (shot.status === 'denied') {
        setState((s) => ({ ...s, error: i18n.t('errors.cameraPermissionDenied') }));
        return;
      }
      if (shot.status === 'cancelled') return;
      await addPart(shot.photo);
    } catch (error) {
      console.warn('[ReceiptScanner] part capture failed:', error);
      setState((s) => ({ ...s, error: i18n.t('errors.captureImageFailed') }));
    }
  }, [addPart]);

  /** Gallery (the file chooser on web) for the next parts - several at once, in the order picked. */
  const pickParts = useCallback(async (): Promise<void> => {
    const left = remainingParts(partsRef.current);
    if (left === 0) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setState((s) => ({ ...s, error: i18n.t('errors.galleryPermissionDenied') }));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsMultipleSelection: left > 1,
        selectionLimit: left,
        orderedSelection: true,
      });
      if (result.canceled) return;
      for (const asset of result.assets.slice(0, left)) {
        await addPart({ uri: asset.uri, width: asset.width });
      }
    } catch (error) {
      console.warn('[ReceiptScanner] part pick failed:', error);
      setState((s) => ({ ...s, error: i18n.t('errors.pickImageFailed') }));
    }
  }, [addPart]);

  const removePart = useCallback((index: number) => {
    setState((s) => ({ ...s, parts: dropPart(s.parts, index) }));
  }, []);

  /**
   * "Read receipt": ONE scan over all parts. One part is today's single-image
   * request; 2-4 go through `images`. Part 1 becomes `imageUri`, so the confirm
   * card's preview and the save path treat it exactly like a single photo.
   * A failure keeps the parts, so the user can read them again.
   */
  const scanParts = useCallback(async (userPrompt?: string): Promise<ScannedReceipt | null> => {
    const parts = partsRef.current;
    if (!canScan(parts)) return null;
    setState((s) => ({
      ...s,
      isProcessing: true,
      error: null,
      errorStatus: null,
      imageUri: parts[0].uri,
      isPdf: false,
      scannedReceipt: null,
    }));
    try {
      const base64Parts: string[] = [];
      for (const p of parts) base64Parts.push(await uriToBase64(p.uri));
      if (!(await passesDuplicateCheck(partsFingerprintInput(base64Parts)))) return null;
      const scannedReceipt = await scanEncodedParts(base64Parts, userPrompt || undefined, {
        scanReceipt: (b64, prompt) => api.scanReceipt(b64, prompt),
        scanReceiptParts: (images, prompt) => api.scanReceiptParts(images, prompt),
      });
      setState((s) => ({ ...s, isProcessing: false, scannedReceipt }));
      return scannedReceipt;
    } catch (error) {
      console.warn('[ReceiptScanner] multi-part scan failed:', error instanceof Error ? error.message : String(error));
      setState((s) => ({
        ...s,
        isProcessing: false,
        error: scanErrorMessage(error),
        errorStatus: (error as { status?: number }).status ?? null,
      }));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** "Retake parts": drop every part and the result, back to capturing. */
  const retakeParts = useCallback(() => {
    setState((s) => ({ ...s, ...retakeState() }));
  }, []);

  /** Dismiss a failed read without losing the parts. */
  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null, errorStatus: null }));
  }, []);

  return {
    ...state,
    pickFromCamera,
    pickFromGallery,
    pickPdfDocument,
    processExistingImage,
    processSharedFile,
    seedFromInbound,
    reset,
    addPart,
    capturePart,
    pickParts,
    removePart,
    scanParts,
    retakeParts,
    clearError,
  };
}
