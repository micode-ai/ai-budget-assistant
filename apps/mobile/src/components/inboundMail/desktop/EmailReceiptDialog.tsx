import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { DesktopDialogFrame } from '@/components/DesktopDialogFrame';
import type { ExpenseCreatePrefill } from '@/components/expenses/create/ExpenseCreateForm';
import { EmailReceiptConfirm } from '../EmailReceiptConfirm';

/** Only one instance is mounted at a time (the inbox holds a single `openId`). */
const TITLE_ID = 'email-receipt-dialog-title';

/**
 * Desktop confirm dialog for one pending e-mail receipt (ABA-646). Hosts `EmailReceiptConfirm`, the
 * whole body of `app/inbox/email-receipt.tsx`, so the confirm card is defined once. Unlike
 * `ReceiptDialog` there is no `AiUsageBadge`: the extraction was already charged server-side when
 * the mail arrived, and this view spends nothing.
 *
 * Esc and a scrim click both go through `requestClose`, which asks first only when a completed
 * extraction is sitting unsaved (`onDirtyChange(true)`, the `ReceiptDialog` precedent). The dirty
 * signal is real, so the confirmation is never spurious.
 *
 * "Edit" hands the prefill to the inbox page, which closes this dialog and opens `CreateDialog`:
 * never a dialog on top of a dialog.
 */
export function EmailReceiptDialog({
  id,
  onClose,
  onEdit,
}: {
  id: string;
  onClose: () => void;
  onEdit: (prefill: ExpenseCreatePrefill) => void;
}) {
  const { t } = useTranslation();
  const [hasUnsaved, setHasUnsaved] = useState(false);
  // Stable, so the hosted view's reporting effect does not re-run on every render.
  const handleDirtyChange = useCallback((dirty: boolean) => setHasUnsaved(dirty), []);

  const requestClose = () => {
    if (hasUnsaved) {
      showAlert(t('expensesDesktop.discardChangesTitle'), t('expensesDesktop.discardChangesMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('expensesDesktop.discardChangesConfirm'), style: 'destructive', onPress: onClose },
      ]);
      return;
    }
    onClose();
  };

  return (
    <DesktopDialogFrame
      title={t('emailReceipts.confirmTitle')}
      titleId={TITLE_ID}
      onRequestClose={requestClose}
      width={680}
    >
      <EmailReceiptConfirm
        id={id}
        onDone={onClose}
        onDirtyChange={handleDirtyChange}
        onEdit={onEdit}
        onOpenExpense={(expenseId) => {
          onClose();
          router.push(`/expense/${expenseId}` as never);
        }}
      />
    </DesktopDialogFrame>
  );
}
