import { useState } from 'react';

export interface PendingCategorySplit {
  categoryId: string;
  categoryName: string;
  amount: number;
  percentage: number;
  notes?: string;
}

export interface CategorySplitEditorState {
  showSplitEditor: boolean;
  setShowSplitEditor: (value: boolean) => void;
  pendingSplits: PendingCategorySplit[];
  setPendingSplits: (value: PendingCategorySplit[]) => void;
}

/**
 * Owns the manual category-split editor state for expense/new.tsx
 * (tech-debt expense-new-screen-god-file) — whether the SplitEditor sheet is
 * open, and the splits the user has built so far. `handleSubmit` in the
 * screen still turns `pendingSplits` into the create-expense payload and the
 * local `ExpenseCategorySplit` rows.
 */
export function useCategorySplitEditor(): CategorySplitEditorState {
  const [showSplitEditor, setShowSplitEditor] = useState(false);
  const [pendingSplits, setPendingSplits] = useState<PendingCategorySplit[]>([]);

  return { showSplitEditor, setShowSplitEditor, pendingSplits, setPendingSplits };
}
