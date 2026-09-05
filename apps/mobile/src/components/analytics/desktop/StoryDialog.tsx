import { Modal, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { SpendingStoryView, type SpendingStoryPrefill } from '@/components/story/SpendingStoryView';

/** Only one instance of this dialog is ever mounted at a time (`AnalyticsDesktop`
 *  conditionally renders it from a single boolean slot), so a fixed id is
 *  safe here too — same reasoning as `ExpenseDialog.tsx`'s `TITLE_ID`, just a
 *  distinct string. */
const TITLE_ID = 'story-dialog-title';

interface Props {
  initial: SpendingStoryPrefill;
  onClose: () => void;
}

/**
 * Desktop Spending Story dialog (design decision: a narrative about the
 * period selected on this screen belongs over the screen that selected it,
 * rather than navigating away to a full route). A sibling of
 * `ExpenseDialog.tsx`/`CreateDialog.tsx`/`DrillDownDialog.tsx`, built the same
 * way and for the same reasons (read `ExpenseDialog.tsx`'s header comment
 * first).
 *
 * Hosts `SpendingStoryView` — the entire body of `app/story.tsx`, moved to
 * `src/` unchanged (Task 7) — so the story's period selector, AI generation,
 * and regenerate button are defined in exactly one place; the mobile route
 * hosts the same component. `initial` seeds the view's own month/year state
 * from `AnalyticsDesktop`'s currently-selected period, the same values the
 * bottom discovery card used to pass as route params — the view then owns its
 * own prev/next month navigation independently, exactly as it does when
 * routed on mobile.
 *
 * **Does not change when the story generates.** `SpendingStoryView`'s mount
 * effect calls `loadStory()` exactly once per mount, same as the routed
 * screen; opening this dialog mounts it (one load), closing it unmounts it —
 * no different from navigating to `/story` and back. Regeneration is still
 * only ever triggered by the view's own "regenerate" button
 * (`forceRegenerate`), never by this dialog.
 *
 * The header title is static, from the same i18n key (`story.title`) the
 * route's own `Stack.Screen` in `app/_layout.tsx` already uses —
 * `SpendingStoryView` only renders its own `periodLabel` heading once a story
 * has loaded, so this dialog supplies a title that's stable through the
 * loading/error states too, mirroring `CreateDialog`'s header.
 *
 * **A definite `height`, not `ExpenseDialog`'s shrink-to-fit `maxHeight`** —
 * same reasoning as `CreateDialog.tsx`'s / `DrillDownDialog.tsx`'s file
 * comments: `SpendingStoryView`'s root is `SafeAreaView(flex:1)`, with an
 * internal `ScrollView(flex:1)` for the loaded story content, so it needs a
 * definite-height ancestor rather than a second auto-height `ScrollView`
 * wrapped around it. Rendered directly as the panel's second flex child.
 */
export function StoryDialog({ initial, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} aria-labelledby={TITLE_ID}>
      {/* Deliberately a raw <div>, not a themed RN View/Pressable — see
          `ExpenseDialog.tsx`'s file-level comment for why it must carry no
          tabindex at all. */}
      <div
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
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
              {t('story.title')}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t('expensesDesktop.dialogClose')}
              style={styles.iconButton}
            >
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <SpendingStoryView initial={initial} />
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
    // file-level comment for why `SpendingStoryView` needs one.
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
  iconButton: {
    padding: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
});
