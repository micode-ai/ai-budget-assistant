import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ChatConversation } from '@budget/shared-types';
import { SheetDialog } from '@/components/SheetDialog';
import { showAlert } from '@/utils/alert';
import { useChatStore } from '@/stores/chatStore';
import { canSaveRename } from '@/features/chat/chatLayout';
import { useTheme, useStyles, type Theme } from '@/theme';

/** Stable accessible-name id — safe because only one instance is ever
 *  mounted at a time (the `RenameProductModal.tsx` precedent). */
const TITLE_ID = 'conversation-rename-dialog-title';

interface RenameConversationDialogProps {
  /** `null` closes the dialog — same "the row being edited IS the visible
   *  flag" convention `RenameProductModal`'s `editing` prop uses. */
  conversation: ChatConversation | null;
  onClose: () => void;
}

/**
 * Decision 3's dialog, not an inline edit: a title is `message.slice(0,
 * 100)` (up to 100 characters) against a 183px rail title, and editing that
 * through a sliver is worse than a small dialog. `SheetDialog` is what
 * decides mobile-vs-desktop chrome — a bottom sheet on the phone, `480`px
 * centred on desktop — so this ONE component, not two, is what both
 * platforms render (the design's own reading of "a dialog hosts an existing
 * component": there is nothing existing to host, so this dialog IS the one
 * definition). It lives under `chat/desktop/` because that is where Task 4
 * created it; nothing about its own code is desktop-only, and a later
 * mobile call site imports it from here rather than duplicating it.
 *
 * `conversation.title` is read fresh into local state on every conversation
 * change (never on every keystroke), so opening the dialog for a second row
 * without unmounting it still starts from THAT row's own title.
 */
export function RenameConversationDialog({ conversation, onClose }: RenameConversationDialogProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const renameConversation = useChatStore((s) => s.renameConversation);

  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(conversation?.title ?? '');
  }, [conversation?.id, conversation?.title]);

  const currentTitle = conversation?.title ?? null;
  // `canSaveRename` is the ONLY place this is decided — see its own doc
  // comment for why "unchanged" and "empty" are both refused. `saving` is
  // this component's own addition on top of it: a second tap must not fire
  // a second write while the first is still in flight.
  const canSave = conversation !== null && canSaveRename(currentTitle, title) && !saving;

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSave = async () => {
    if (!conversation || !canSaveRename(currentTitle, title) || saving) return;
    setSaving(true);
    try {
      await renameConversation(conversation.id, title);
      setSaving(false);
      onClose();
    } catch {
      // `renameConversation` already restored the previous title in the
      // store and console.warn'd; this dialog's own job is to say so and
      // stay open with the typed value intact (decision 3's "States" —
      // never close and silently revert), the `errors.chatError` precedent
      // `useChatScreenData.ts`'s voice-error alert already uses.
      setSaving(false);
      showAlert(t('common.error'), t('errors.chatError'));
    }
  };

  return (
    <SheetDialog visible={conversation !== null} onClose={handleClose} titleId={TITLE_ID} keyboardAvoiding>
      <Text nativeID={TITLE_ID} style={styles.title}>
        {t('chat.renameConversation')}
      </Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={t('chat.conversationUntitled')}
        placeholderTextColor={theme.colors.textTertiary}
        maxLength={100}
        autoFocus
        editable={!saving}
      />
      <View style={styles.rowActions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={saving}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!canSave}
        >
          {saving ? (
            <ActivityIndicator size="small" color={theme.colors.textInverse} />
          ) : (
            <Text style={styles.saveText}>{t('common.save')}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SheetDialog>
  );
}

const createStyles = (theme: Theme) => ({
  title: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  rowActions: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[4],
  },
  cancelBtn: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelText: { fontSize: 16, fontWeight: '500' as const, color: theme.colors.textSecondary },
  saveBtn: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
});
