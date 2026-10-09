import { useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DesktopDialogFrame } from '@/components/DesktopDialogFrame';
import { GroupButton } from '../GroupButton';
import { GroupExpenseScreenView } from '../GroupExpenseScreenView';
import type { GroupFormHandle, GroupFormState } from '../groupFormHandle';

const TITLE_ID = 'group-expense-dialog-title';

/**
 * Desktop add / edit group expense dialog. Hosts `GroupExpenseScreenView` (the body of
 * `app/groups/[id]/expense.tsx`) with `withStackTitle={false}`, so the route underneath keeps its
 * own header title, and with its in-scroll Save / Delete hidden. The footer drives the form through
 * its ref handle: Save, and in edit mode Delete, which starts the form's own confirm.
 *
 * No discard-changes confirmation (the `TransferDialog` precedent): `useGroupExpenseForm` exposes
 * no dirty signal, and inferring one would be the spurious confirm `CreateDialog` documents.
 */
export function GroupExpenseDialog({
  groupId,
  expenseId,
  onClose,
}: {
  groupId: string;
  expenseId?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<GroupFormHandle>(null);
  const [state, setState] = useState<GroupFormState>({ canSubmit: false, submitting: false, isEditing: false });

  return (
    <DesktopDialogFrame
      title={expenseId ? t('groups.expenseEditTitle') : t('groups.expenseAddTitle')}
      titleId={TITLE_ID}
      onRequestClose={onClose}
      width={640}
      footer={
        <>
          {state.isEditing && (
            <GroupButton
              label={t('groups.deleteExpense')}
              onPress={() => ref.current?.remove?.()}
              variant="danger"
              write
              disabled={state.submitting}
              style={styles.footerButton}
            />
          )}
          <GroupButton
            label={t('groups.saveExpense')}
            onPress={() => void ref.current?.submit()}
            loading={state.submitting}
            write
            disabled={!state.canSubmit}
            style={styles.footerButton}
          />
        </>
      }
    >
      <GroupExpenseScreenView
        ref={ref}
        groupId={groupId}
        expenseId={expenseId}
        withStackTitle={false}
        hideActions
        onStateChange={setState}
        onDone={onClose}
      />
    </DesktopDialogFrame>
  );
}

const styles = StyleSheet.create({
  footerButton: { minWidth: 160 },
});
