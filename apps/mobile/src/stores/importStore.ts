import { create } from 'zustand';
import type { BankImportPreviewResponse, ColumnMapping } from '@budget/shared-types';

export interface ImportFileAsset {
  uri: string;
  name: string;
  type: string;
}

interface PendingMapping {
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
  setPreview: (preview: BankImportPreviewResponse | null) => void;
  setFileAsset: (asset: ImportFileAsset | null) => void;
  setPickedBankId: (id: string | null) => void;
  setPickedMappingId: (id: string | null) => void;
  setPendingMapping: (m: PendingMapping | null) => void;
  reset: () => void;
}

export const useImportStore = create<ImportState>((set) => ({
  previewData: null,
  fileAsset: null,
  pickedBankId: null,
  pickedMappingId: null,
  pendingMapping: null,
  setPreview: (previewData) => set({ previewData }),
  setFileAsset: (fileAsset) => set({ fileAsset }),
  setPickedBankId: (pickedBankId) => set({ pickedBankId }),
  setPickedMappingId: (pickedMappingId) => set({ pickedMappingId }),
  setPendingMapping: (pendingMapping) => set({ pendingMapping }),
  reset: () => set({
    previewData: null,
    fileAsset: null,
    pickedBankId: null,
    pickedMappingId: null,
    pendingMapping: null,
  }),
}));
