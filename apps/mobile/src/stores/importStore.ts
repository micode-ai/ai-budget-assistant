import { create } from 'zustand';
import type { BankImportPreviewResponse, ColumnMapping } from '@budget/shared-types';

export interface ImportFileAsset {
  uri: string;
  name: string;
  type: string;
}

export interface PendingMapping {
  mapping: ColumnMapping;
  delimiter: string;
  encoding: 'auto' | 'utf-8' | 'windows-1250';
  amountFormat: 'polish' | 'standard';
  dateFormat: 'auto' | 'DD.MM.YYYY' | 'DD-MM-YYYY' | 'YYYY-MM-DD';
}

interface ImportState {
  previewData: BankImportPreviewResponse | null;
  fileAsset: ImportFileAsset | null;
  pickedBankId: string | null;
  pickedMappingId: string | null;
  pendingMapping: PendingMapping | null;
  /**
   * Account that granted AI-import consent during this app session. In-memory
   * only — the server holds the durable record. It exists so the consent
   * screen can tell "the user has not consented yet" from "we asked, the write
   * appeared to succeed, and the server still says no", which would otherwise
   * be an invisible loop.
   */
  aiConsentGrantedFor: string | null;
  setPreview: (preview: BankImportPreviewResponse | null) => void;
  setFileAsset: (asset: ImportFileAsset | null) => void;
  setPickedBankId: (id: string | null) => void;
  setPickedMappingId: (id: string | null) => void;
  setPendingMapping: (m: PendingMapping | null) => void;
  setAiConsentGrantedFor: (accountId: string | null) => void;
  reset: () => void;
}

export const useImportStore = create<ImportState>((set) => ({
  previewData: null,
  fileAsset: null,
  pickedBankId: null,
  pickedMappingId: null,
  pendingMapping: null,
  aiConsentGrantedFor: null,
  setPreview: (previewData) => set({ previewData }),
  setFileAsset: (fileAsset) => set({ fileAsset }),
  setPickedBankId: (pickedBankId) => set({ pickedBankId }),
  setPickedMappingId: (pickedMappingId) => set({ pickedMappingId }),
  setPendingMapping: (pendingMapping) => set({ pendingMapping }),
  setAiConsentGrantedFor: (aiConsentGrantedFor) => set({ aiConsentGrantedFor }),
  reset: () => set({
    previewData: null,
    fileAsset: null,
    pickedBankId: null,
    pickedMappingId: null,
    pendingMapping: null,
  }),
}));
