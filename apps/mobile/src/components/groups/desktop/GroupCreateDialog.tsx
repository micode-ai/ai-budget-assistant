import { useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DesktopDialogFrame } from '@/components/DesktopDialogFrame';
import { GroupButton } from '../GroupButton';
import { GroupCreateForm } from '../GroupCreateForm';
import type { GroupFormHandle, GroupFormState } from '../groupFormHandle';

/** Only one instance is mounted at a time, so a fixed id is safe. */
const TITLE_ID = 'group-create-dialog-title';

/**
 * Desktop "New group" dialog. Hosts `GroupCreateForm` (the whole body of `app/groups/new.tsx`) with
 * its in-scroll button hidden and the Create button in this dialog's footer, driven through the
 * form's ref handle, so creating a group is defined in one place. `onCreated` replaces the form's
 * `router.replace`, which would leave this dialog floating over the new route.
 *
 * No discard-changes confirmation, as `TransferDialog`/`ExchangeDialog`: a short form, and no real
 * dirty signal exists to base one on.
 */
export function GroupCreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (groupId: string) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<GroupFormHandle>(null);
  const [state, setState] = useState<GroupFormState>({ canSubmit: false, submitting: false, isEditing: false });

  return (
    <DesktopDialogFrame
      title={t('groups.newTitle')}
      titleId={TITLE_ID}
      onRequestClose={onClose}
      width={560}
      footer={
        <GroupButton
          label={t('groups.createGroup')}
          onPress={() => void ref.current?.submit()}
          loading={state.submitting}
          write
          disabled={!state.canSubmit}
          style={styles.footerButton}
        />
      }
    >
      <GroupCreateForm ref={ref} hideActions onStateChange={setState} onCreated={onCreated} />
    </DesktopDialogFrame>
  );
}

const styles = StyleSheet.create({
  footerButton: { minWidth: 160 },
});
