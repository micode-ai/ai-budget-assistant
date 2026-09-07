import { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ChatConversation } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { CHAT_RAIL_WIDTH } from '@/components/webLayout.constants';
import { showAlert } from '@/utils/alert';
import { useChatStore } from '@/stores/chatStore';
import {
  conversationDateLabel,
  sortConversationsForDisplay,
  pinnedGroupBoundary,
  conversationMenuItems,
  type RailState,
  type ConversationMenuItem,
} from '@/features/chat/chatLayout';
import { ConversationRowMenu } from './ConversationRowMenu';
import { RenameConversationDialog } from './RenameConversationDialog';

interface ConversationRailProps {
  /** Resolved by the caller via `resolveRailState` — never `'hidden'` here,
   *  since the parent doesn't render this component at all in that state
   *  (only `'hidden'` occupies zero width, per `railIsVisible`). */
  state: Exclude<RailState, 'hidden'>;
  conversations: ChatConversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  /** `ChatDesktop` owns the actual fetch triggers (mount + account change);
   *  this component only calls it back on the `'retry'` state's header
   *  button — same function, `chat.loadConversations`. */
  loadConversations: () => Promise<void>;
}

/**
 * The `SettingsNav`/`FacetRail` idiom applied to a third selector (design
 * spec "The conversation rail" — Q3): a persistent left rail, `+ New
 * conversation` first, then the conversation list newest-first exactly as
 * the server returns it. Unlike those two, this one owns ITS OWN scroller —
 * the chat screen deliberately has no single page scroll (see the design's
 * "Departures" section), so this is the second (and only other) scroller on
 * the screen, alongside the transcript.
 *
 * `conversationsStatus` (design's rail-loading flag, "read only by the
 * desktop") is read directly from the store here rather than threaded
 * through the shared `useChatScreenData` hook — mobile never needs it, and
 * `ChatHistorySheet`'s own (separately wrong) `isLoading` prop is untouched.
 *
 * Purely presentational with respect to data fetching — it owns no fetch
 * effect of its own. `ChatDesktop` (the always-mounted parent) is what
 * triggers `loadConversations()`, both on first paint and on every account
 * change; this component only calls it back on the `'retry'` header's press.
 * Putting the fetch here, keyed on THIS component's own mount, was the
 * original design and the bug an account switch exposed: `resolveRailState`
 * maps `'idle'`/`'loading'` to the rail's *visible* `'loading'` state, so a
 * switch that starts from an already-visible rail (`'list'`) never unmounts
 * this component — it goes `'list'` -> `'loading'`, both visible — and a
 * mount-only effect never fires again. See `ChatDesktop`'s own comment for
 * the fix and why it has to live there.
 *
 * ABA-514 (Task 4): this component ALSO owns the row's `⋯` popover, the
 * rename dialog, and the pinned group — again read/called straight off
 * `useChatStore` (`ownedConversationIds`, `deleteConversation`,
 * `setConversationPinned`) rather than threaded through `useChatScreenData`,
 * the same reasoning `conversationsStatus` above already gives, and the
 * reason Task 4 and Task 5 (the phone's sheet) stay disjoint: neither needs
 * to touch that shared hook to get these. `conversations` is re-sorted with
 * `sortConversationsForDisplay` on every render before anything reads it —
 * `pinnedGroupBoundary` trusts an already-ordered list, and an optimistic
 * pin flip already resorts inside `chatStore`, but a defensive re-sort here
 * costs nothing and means this component never depends on every future
 * caller having done that first.
 */
export function ConversationRail({
  state,
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  loadConversations,
}: ConversationRailProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const isFreshConversation = !currentConversationId;
  const [newHovered, setNewHovered] = useState(false);

  const ownedConversationIds = useChatStore((s) => s.ownedConversationIds);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const setConversationPinned = useChatStore((s) => s.setConversationPinned);

  const [menuState, setMenuState] = useState<{ row: ChatConversation; anchor: { x: number; y: number } } | null>(
    null,
  );
  const [renamingConversation, setRenamingConversation] = useState<ChatConversation | null>(null);

  const closeMenu = () => setMenuState(null);
  const openMenu = (row: ChatConversation, anchor: { x: number; y: number }) => setMenuState({ row, anchor });

  // Every one of the four actions reports a failure the same way (design's
  // "Error" state: "each reports through showAlert and leaves the list as
  // it was") — `chatStore`'s three action methods already restore the
  // optimistic change on their own catch and rethrow, so this is only the
  // user-facing half of that contract.
  const reportActionFailure = () => showAlert(t('common.error'), t('errors.chatError'));

  const confirmDelete = (row: ChatConversation) => {
    // Decision 4's two-tier message: creator-only is who MAY delete, not
    // whether they understood a shared conversation holds other people's
    // words. Never the private message for a shared row.
    showAlert(
      t('chat.deleteConversationTitle'),
      row.isShared ? t('chat.deleteSharedConversationMessage') : t('common.deleteConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            void deleteConversation(row.id).catch(reportActionFailure);
          },
        },
      ],
    );
  };

  const handleMenuAction = (row: ChatConversation, item: ConversationMenuItem) => {
    switch (item.action) {
      case 'pin':
        void setConversationPinned(row.id, true).catch(reportActionFailure);
        break;
      case 'unpin':
        void setConversationPinned(row.id, false).catch(reportActionFailure);
        break;
      case 'rename':
        setRenamingConversation(row);
        break;
      case 'delete':
        confirmDelete(row);
        break;
    }
  };

  // See the file-level note: reproduces the server's own ordering rather
  // than trusting the prop is already sorted, so `pinnedGroupBoundary` below
  // (which trusts a leading contiguous pinned run) always sees one.
  const orderedConversations = sortConversationsForDisplay(conversations);
  const dividerIndex = pinnedGroupBoundary(orderedConversations);

  return (
    <View style={styles.sidebar}>
      {/* A real ScrollView, not a plain View: the rail is one of the two
          scrollers this screen deliberately has (see Departures) — it holds
          at most 20 rows (server LIMIT), so its own scrollbar shows only on
          overflow, per react-native-web's default `overflowY: 'auto'`. Never
          `showsVerticalScrollIndicator={false}` here. */}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Pressable
          onPress={isFreshConversation ? undefined : onNewConversation}
          onHoverIn={() => setNewHovered(true)}
          onHoverOut={() => setNewHovered(false)}
          accessibilityRole="button"
          accessibilityState={{ disabled: isFreshConversation }}
          style={[styles.newConvRow, newHovered && !isFreshConversation && styles.newConvRowHovered]}
        >
          <Ionicons
            name="add-circle-outline"
            size={18}
            color={isFreshConversation ? theme.colors.textTertiary : theme.colors.primary}
          />
          <Text style={[styles.newConvText, isFreshConversation && styles.newConvTextInert]}>
            {t('chat.newConversation')}
          </Text>
        </Pressable>

        <View style={styles.divider} />

        {state === 'retry' ? (
          <Pressable
            onPress={() => loadConversations()}
            accessibilityRole="button"
            style={styles.retryHeader}
          >
            <Text style={styles.sectionLabel}>{t('chat.history')}</Text>
            <Ionicons name="refresh-outline" size={14} color={theme.colors.primary} />
          </Pressable>
        ) : (
          <Text style={styles.sectionLabel}>{t('chat.historyTitle')}</Text>
        )}

        {state === 'loading' && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.loadingText}>{t('chat.loadingHistory')}</Text>
          </View>
        )}

        {orderedConversations.map((item, index) => (
          <View key={item.id}>
            <ConversationRow
              item={item}
              selected={item.id === currentConversationId}
              onSelect={() => onSelectConversation(item.id)}
              onOpenMenu={(anchor) => openMenu(item, anchor)}
            />
            {/* One divider, only when both groups are non-empty —
                `pinnedGroupBoundary` decides this, never an inline
                condition (Global Constraints). It reuses this same
                `styles.divider` the rail already uses above New
                Conversation — the design's own recorded, deliberate
                choice (see "What this design leaves unproven": reuse now,
                a group header only if it reads as a stray line on the
                deployed build). */}
            {dividerIndex === index && <View style={styles.divider} />}
          </View>
        ))}
      </ScrollView>

      {menuState && (
        <ConversationRowMenu
          anchor={menuState.anchor}
          items={conversationMenuItems(menuState.row, {
            isOwner: ownedConversationIds.includes(menuState.row.id),
          })}
          onClose={closeMenu}
          onSelect={(item) => handleMenuAction(menuState.row, item)}
        />
      )}

      <RenameConversationDialog conversation={renamingConversation} onClose={() => setRenamingConversation(null)} />
    </View>
  );
}

function stopEventPropagation(event: unknown): void {
  (event as { stopPropagation?: () => void } | null | undefined)?.stopPropagation?.();
}

function ConversationRow({
  item,
  selected,
  onSelect,
  onOpenMenu,
}: {
  item: ChatConversation;
  selected: boolean;
  onSelect: () => void;
  /** Anchor in viewport coordinates — the "⋯" button's own
   *  `getBoundingClientRect()`, or the row's `clientX`/`clientY` on a
   *  right-click. The caller (`ConversationRail`) resolves what the menu
   *  holds and opens it; this row never decides that itself. */
  onOpenMenu: (anchor: { x: number; y: number }) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const title = item.title || t('chat.conversationUntitled');

  // Decision 1's third reveal condition, the deliberate improvement on the
  // ledger's `hovered || focused` pair: a touch tablet at >=1024 has no
  // hover, so the SELECTED row's "⋯" stays visible as its guaranteed path —
  // "tap the row to read it, which you were doing anyway, and the menu
  // button is there". Helps the mouse too.
  const revealed = hovered || focused || selected;

  const handleRowContextMenu = (event: unknown) => {
    const e = event as { preventDefault?: () => void; clientX?: number; clientY?: number } | null | undefined;
    e?.preventDefault?.();
    stopEventPropagation(event);
    onOpenMenu({ x: e?.clientX ?? 0, y: e?.clientY ?? 0 });
  };

  const handleMenuButtonPress = (event: unknown) => {
    stopEventPropagation(event);
    let anchor = { x: 0, y: 0 };
    try {
      const e = event as
        | { currentTarget?: { getBoundingClientRect?: () => { left: number; bottom: number } } }
        | null
        | undefined;
      const rect = e?.currentTarget?.getBoundingClientRect?.();
      if (rect) anchor = { x: rect.left, y: rect.bottom + 4 };
    } catch {
      // Never let anchor resolution crash a row click — the popover clamps
      // to the viewport regardless, so (0,0) still lands on-screen.
    }
    onOpenMenu(anchor);
  };

  return (
    <Pressable
      // Same rule as `SettingsNavRow`'s (§5f): selecting the conversation you
      // are already on is a no-op, not a re-fetch of what's on screen.
      onPress={selected ? undefined : onSelect}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.row, hovered && styles.rowHovered, selected && styles.rowSelected]}
      {...({ onContextMenu: handleRowContextMenu } as object)}
    >
      <View style={styles.rowTop}>
        <Ionicons
          // Pinned rows lead with `pin` — the only row-level change this
          // task makes to the glyph; `chatbubble-ellipses-outline` carried
          // no information at all (every row here is a conversation), so
          // this swap is strictly more informative at zero added width.
          name={item.isPinned ? 'pin' : 'chatbubble-ellipses-outline'}
          size={16}
          color={selected ? theme.colors.primary : theme.colors.textSecondary}
        />
        <Text style={[styles.rowTitle, selected && styles.rowTitleSelected]} numberOfLines={1}>
          {title}
        </Text>
        {item.isShared && <Ionicons name="people" size={12} color={theme.colors.primary} />}
        {/* The "⋯" slot is UNCONDITIONAL and opacity-gated, never
            conditionally rendered — every row carries at least the
            Pin/Unpin action now, so every title is the same width and a
            conditionally mounted control would make it re-truncate under
            the cursor (Global Constraints). Stays in the tab order at
            `opacity: 0` so a keyboard user tabbing onto it reveals it via
            `onFocus`. */}
        <Pressable
          onPress={handleMenuButtonPress}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityRole="button"
          accessibilityLabel={t('chat.conversationActions')}
          style={{ opacity: revealed ? 1 : 0, padding: 4, borderRadius: 4 }}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={theme.colors.textSecondary} />
        </Pressable>
      </View>
      <Text style={styles.rowDate}>{conversationDateLabel(new Date(item.updatedAt))}</Text>
    </Pressable>
  );
}

const createStyles = (theme: Theme) => ({
  sidebar: {
    width: CHAT_RAIL_WIDTH,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: theme.colors.borderLight,
    // Paints its own ground, same reasoning as every other rail in this app
    // (`SettingsNav`, `FacetRail`) — a transparent tree shows React
    // Navigation's grey default through it.
    backgroundColor: theme.colors.surface,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
  },
  newConvRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
  },
  newConvRowHovered: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  newConvText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  newConvTextInert: {
    color: theme.colors.textTertiary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[3],
    marginHorizontal: theme.spacing[2],
  },
  sectionLabel: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    paddingHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[1],
  },
  retryHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[1],
  },
  loadingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  loadingText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
  },
  row: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSecondary,
  },
  rowSelected: {
    backgroundColor: theme.colors.primary + '15',
  },
  rowTop: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
  },
  rowTitle: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textPrimary,
    flex: 1,
    flexShrink: 1,
  },
  rowTitleSelected: {
    color: theme.colors.primary,
  },
  rowDate: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
});
