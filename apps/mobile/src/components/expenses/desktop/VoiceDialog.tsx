import { useCallback, useState } from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useTheme, useStyles, type Theme } from '@/theme';
import { AiUsageBadge } from '@/components/AiUsageBadge';
import { VoiceExpenseView } from '@/components/voice/VoiceExpenseView';

/** Only one instance of this dialog is ever mounted at a time (`DashboardDesktop`
 *  renders it from a single `captureDialog` slot), so a fixed id is safe — same
 *  reasoning as `ExpenseDialog.tsx`'s `TITLE_ID`, just a distinct string. */
const TITLE_ID = 'voice-dialog-title';

interface Props {
  onClose: () => void;
}

/**
 * Desktop voice-capture dialog. A sibling of `ExpenseDialog.tsx`/
 * `CreateDialog.tsx`/`ReceiptDialog.tsx`, built the same way and for the same
 * reasons (read `ExpenseDialog.tsx`'s header comment first): RN's own `Modal`,
 * a raw un-tabbable `<div>` scrim, `theme.colors.overlay`, `aria-labelledby`.
 *
 * It hosts `VoiceExpenseView` — the entire body of `app/expense/voice.tsx`,
 * already moved to `src/` — so recording, transcription and the confirm form
 * are defined in exactly one place.
 *
 * ## The chrome this dialog had to reproduce
 *
 * Unlike the receipt screen, this route's chrome IS in `app/_layout.tsx`: the
 * `expense/voice` `Stack.Screen` sets `headerShown: true`, `title:
 * t('voice.title')` and **`headerRight: () => <AiUsageBadge />`**. Both the
 * title and the badge are reproduced in the header below. The badge is the only
 * place this AI-cost-bearing flow shows remaining quota, and it is invisible in
 * the route file (`app/expense/voice.tsx` is four lines and renders neither), so
 * a dialog built by copying that file would silently drop it.
 *
 * It is given `onNavigate={onClose}`, which the route does not pass: an RN
 * `Modal` portals itself above the whole document, so tapping the badge from
 * inside a dialog would otherwise push `/subscription` underneath a dialog that
 * is still covering it.
 *
 * ## Closing, and the microphone
 *
 * Esc and a scrim click both close, through `requestClose`, which asks first
 * when a completed transcription is sitting unsaved (`onDirtyChange`) — that is
 * work the user can see and that cost a Whisper round trip.
 *
 * **Closing mid-recording is safe and deliberately unguarded.** Unmounting
 * `VoiceExpenseView` releases the microphone and restores the audio session,
 * because `useVoiceInput`'s unmount effect calls `cancelRecording` (an
 * unconditional teardown) and it fires on any unmount — including this dialog
 * closing, which is an ordinary React unmount no different from the modal route
 * being dismissed. Nothing about that cleanup is navigation-specific, so it
 * needed no change to work here.
 *
 * **A definite `height`** — `VoiceExpenseView`'s root is a `SafeAreaView` styled
 * `flex: 1` containing a `flex: 1` `KeyboardAvoidingView`/`ScrollView`, so it
 * needs a definite-height ancestor; same reasoning as `CreateDialog.tsx`'s file
 * comment. Rendered directly as the panel's second flex child.
 */
export function VoiceDialog({ onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [hasUnsavedParse, setHasUnsavedParse] = useState(false);
  const handleDirtyChange = useCallback((dirty: boolean) => setHasUnsavedParse(dirty), []);

  const requestClose = () => {
    if (hasUnsavedParse) {
      showAlert(
        t('expensesDesktop.discardChangesTitle'),
        t('expensesDesktop.discardChangesMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('expensesDesktop.discardChangesConfirm'),
            style: 'destructive',
            onPress: onClose,
          },
        ],
      );
      return;
    }
    onClose();
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={requestClose}
      aria-labelledby={TITLE_ID}
    >
      {/* Deliberately a raw <div>, not a themed RN View/Pressable — see
          `ExpenseDialog.tsx`'s file-level comment for why it must carry no
          tabindex at all. */}
      <div
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) requestClose();
        }}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.overlay,
          padding: 24,
        }}
      >
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text nativeID={TITLE_ID} style={styles.title} numberOfLines={1}>
              {t('voice.title')}
            </Text>
            <View style={styles.headerActions}>
              {/* Carried across from `app/_layout.tsx`'s `headerRight` for this
                  route — see this file's header comment. */}
              <AiUsageBadge onNavigate={onClose} />
              <Pressable
                onPress={requestClose}
                accessibilityRole="button"
                accessibilityLabel={t('expensesDesktop.dialogClose')}
                style={styles.iconButton}
              >
                <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <VoiceExpenseView onDone={onClose} onDirtyChange={handleDirtyChange} />
        </View>
      </div>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    width: '90%' as const,
    maxWidth: 680,
    // A definite height, not `ExpenseDialog`'s `maxHeight` — see the
    // file-level comment for why `VoiceExpenseView` needs one.
    height: '85%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    overflow: 'hidden' as const,
    ...theme.shadows.xl,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  iconButton: {
    padding: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
});
