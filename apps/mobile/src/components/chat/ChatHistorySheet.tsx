import { useState } from 'react';
import { Modal, View, Text, FlatList, TouchableOpacity, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ChatConversation } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useChatStore } from '@/stores/chatStore';
import { showAlert } from '@/utils/alert';
import {
  sortConversationsForDisplay,
  pinnedGroupBoundary,
  conversationMenuItems,
  type ConversationMenuItem,
} from '@/features/chat/chatLayout';

interface ChatHistorySheetProps {
  visible: boolean;
  onClose: () => void;
  conversations: ChatConversation[];
  currentConversationId: string | null;
  isLoading: boolean;
  onSelectConversation: (conversation: ChatConversation) => void;
  /**
   * Bubbles a "rename this one" request up to `ChatMobile`. `RenameConversationDialog`
   * is itself a `SheetDialog` (a real `Modal` on mobile), and this sheet is
   * already a presented `Modal` — nesting one inside the other is the exact
   * "flaky on iOS" case decision 2 names, so the dialog is mounted by the
   * parent as a sibling, never rendered from inside this component's own tree.
   */
  onRequestRename: (conversation: ChatConversation) => void;
}

/**
 * ABA-514 (Task 5): the phone's own `⋯` menu — rename, delete and pin — the
 * mirror of the desktop rail's `ConversationRowMenu` (Task 4), but a
 * SEPARATE implementation, not a shared one: the rail's popover is a real
 * `Modal` with a raw `<div>` scrim (needs `Escape` + a focus trap); this
 * sheet is ALREADY inside a presented `Modal`, so its menu is just an
 * absolutely-positioned overlay with its own swallowing scrim, the same
 * idiom `styles.modalSheet`'s own `<Pressable onPress={() => {}}>` already
 * uses one level up.
 *
 * This task changes the mobile rendering TWICE, both named per the plan's
 * Global Constraints: (1) the row's leading icon now becomes `pin` on a
 * pinned row (replacing the uninformative `chatbubble-ellipses-outline`, in
 * place, not beside it), and the list is re-sorted pinned-first with the
 * same one divider rule the rail uses; (2) the row gains a PERMANENTLY
 * visible trailing `⋯` (there is no hover on a phone) plus long-press on the
 * row itself opens the same overlay — both paths, not either.
 *
 * Ownership (which gates Rename/Delete — Pin/Unpin is read-visibility, not
 * creator-only, per the pin fork) comes from `chatStore`'s
 * `ownedConversationIds`, never the SQLite cache: `loadConversations` writes
 * the current user's id onto every cached row, so the cache cannot answer
 * it. An unknown-ownership first paint (empty until the network answers)
 * yields the non-owner menu — Pin/Unpin only — never a wrong one.
 */
export function ChatHistorySheet({
  visible,
  onClose,
  conversations,
  currentConversationId,
  isLoading,
  onSelectConversation,
  onRequestRename,
}: ChatHistorySheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  const ownedConversationIds = useChatStore((s) => s.ownedConversationIds);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const setConversationPinned = useChatStore((s) => s.setConversationPinned);

  // No anchor coordinates, unlike the rail's popover — this overlay is a
  // fixed, bottom-anchored panel, not something pinned next to the row that
  // opened it (there is no cheap native equivalent of the web
  // `getBoundingClientRect()` the rail's anchor relies on).
  const [menuRow, setMenuRow] = useState<ChatConversation | null>(null);
  const closeMenu = () => setMenuRow(null);

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

  const handleMenuItemPress = (row: ChatConversation, item: ConversationMenuItem) => {
    closeMenu();
    switch (item.action) {
      case 'pin':
        void setConversationPinned(row.id, true).catch(reportActionFailure);
        break;
      case 'unpin':
        void setConversationPinned(row.id, false).catch(reportActionFailure);
        break;
      case 'rename':
        onRequestRename(row);
        break;
      case 'delete':
        confirmDelete(row);
        break;
    }
  };

  // Reproduces the server's own ordering defensively, exactly as the rail
  // does before it — `pinnedGroupBoundary` trusts an already-ordered list,
  // and an optimistic pin flip already resorts inside `chatStore`, but a
  // stray unsorted input (a future caller, an older cached shape) must never
  // feed it a wrong answer.
  const orderedConversations = sortConversationsForDisplay(conversations);
  const dividerIndex = pinnedGroupBoundary(orderedConversations);

  const renderConversationItem = ({ item, index }: { item: ChatConversation; index: number }) => {
    const isActive = item.id === currentConversationId;
    const title = item.title || t('chat.conversationUntitled');
    const date = new Date(item.updatedAt);
    const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    return (
      <View>
        <TouchableOpacity
          style={[styles.conversationItem, isActive && styles.conversationItemActive]}
          onPress={() => onSelectConversation(item)}
          onLongPress={() => setMenuRow(item)}
          activeOpacity={0.7}
        >
          <View style={styles.conversationItemContent}>
            <Ionicons
              // The one row-level glyph change this task makes: pinned
              // rows lead with `pin`, in place of the uninformative
              // `chatbubble-ellipses-outline` — same swap, same reason, as
              // the rail (chatLayout.ts's own doc comment).
              name={item.isPinned ? 'pin' : 'chatbubble-ellipses-outline'}
              size={18}
              color={isActive ? theme.colors.primary : theme.colors.textSecondary}
              style={styles.conversationIcon}
            />
            <Text
              style={[styles.conversationTitle, isActive && styles.conversationTitleActive]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {item.isShared && (
              <Ionicons name="people" size={14} color={theme.colors.primary} style={{ marginLeft: 4 }} />
            )}
          </View>
          <View style={styles.conversationTrailing}>
            <Text style={styles.conversationDate}>{dateLabel}</Text>
            {/* Permanently visible — there is no hover on a phone to reveal
                it conditionally on, per decision 2. `hitSlop` gives the 20px
                glyph a 44pt target at zero layout cost. */}
            <TouchableOpacity
              onPress={() => setMenuRow(item)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.conversationActions')}
              style={styles.menuButton}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
        {/* One divider, only when both the pinned and unpinned groups are
            non-empty — `pinnedGroupBoundary` decides this, never an inline
            condition, matching the rail's own rule byte for byte. */}
        {dividerIndex === index && <View style={styles.groupDivider} />}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      // Unchanged: the sheet's own `onRequestClose` still handles the
      // Android back button regardless of the menu's open state (decision
      // 2) — it is not given a second, menu-aware behaviour here.
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        {/* The system navigation bar overlays this window, so the bottom padding
            has to clear it — a fixed value left the last row unreachable on a
            three-button-nav device (ABA-483). */}
        <Pressable
          style={[styles.modalSheet, { paddingBottom: theme.spacing[8] + insets.bottom }]}
          onPress={() => {}}
        >
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('chat.historyTitle')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={orderedConversations}
            renderItem={renderConversationItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.conversationList}
            ListEmptyComponent={
              isLoading ? (
                <View style={styles.historyLoadingContainer}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <Text style={styles.historyLoadingText}>{t('chat.loadingHistory')}</Text>
                </View>
              ) : (
                <View style={styles.historyEmptyContainer}>
                  <Ionicons name="chatbubbles-outline" size={40} color={theme.colors.textTertiary} />
                  <Text style={styles.historyEmptyText}>{t('chat.historyEmpty')}</Text>
                </View>
              )
            }
          />
        </Pressable>

        {/* The row menu: an in-sheet overlay, NOT a second `Modal` (decision
            2) — nesting one inside this already-presented `Modal` is flaky
            on iOS. Rendered as the last child of `styles.modalOverlay`
            (full-screen, flex: 1), never inside `styles.modalSheet`, whose
            `maxHeight: '70%'` would confine it. */}
        {menuRow && (
          <Pressable
            style={[styles.actionOverlay, { paddingBottom: theme.spacing[8] + insets.bottom }]}
            onPress={closeMenu}
          >
            {/* Swallows its own taps so pressing the menu's padding closes
                only the MENU, never the whole sheet — the same idiom
                `styles.modalSheet`'s own `onPress={() => {}}` above already
                uses one level up; without it RN bubbles an unclaimed touch
                to the nearest ancestor responder, which is this overlay's
                own `onPress={closeMenu}`... and, one level further out,
                `styles.modalOverlay`'s `onPress={onClose}`. */}
            <Pressable style={styles.actionMenu} onPress={() => {}}>
              {conversationMenuItems(menuRow, { isOwner: ownedConversationIds.includes(menuRow.id) }).map(
                (item) => (
                  <View key={item.action}>
                    {item.dividerBefore && <View style={styles.actionMenuDivider} />}
                    <TouchableOpacity
                      style={styles.actionMenuItem}
                      onPress={() => handleMenuItemPress(menuRow, item)}
                      accessibilityRole="menuitem"
                    >
                      <Ionicons
                        name={item.icon as keyof typeof Ionicons.glyphMap}
                        size={18}
                        color={item.destructive ? theme.colors.danger : theme.colors.primary}
                      />
                      <Text
                        style={[styles.actionMenuItemText, item.destructive && { color: theme.colors.danger }]}
                      >
                        {t(item.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ),
              )}
            </Pressable>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: theme.colors.background,
      borderTopLeftRadius: theme.borderRadius['2xl'],
      borderTopRightRadius: theme.borderRadius['2xl'],
      maxHeight: '70%' as const,
    },
    modalHandle: {
      width: 36,
      height: 4,
      backgroundColor: theme.colors.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginTop: theme.spacing[3],
      marginBottom: theme.spacing[2],
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: theme.spacing[5],
      paddingVertical: theme.spacing[3],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.borderLight,
    },
    modalTitle: {
      ...theme.textStyles.h3,
      color: theme.colors.textPrimary,
    },
    conversationList: {
      paddingVertical: theme.spacing[2],
    },
    conversationItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing[5],
      paddingVertical: theme.spacing[3.5],
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.borderLight,
    },
    conversationItemActive: {
      backgroundColor: theme.colors.primaryLight,
    },
    conversationItemContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: theme.spacing[3],
    },
    conversationIcon: {
      marginRight: theme.spacing[2],
    },
    conversationTitle: {
      ...theme.textStyles.bodyLarge,
      color: theme.colors.textPrimary,
      flex: 1,
    },
    conversationTitleActive: {
      color: theme.colors.primary,
      fontWeight: '600',
    },
    conversationTrailing: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[1],
    },
    conversationDate: {
      ...theme.textStyles.bodySm,
      color: theme.colors.textTertiary,
    },
    menuButton: {
      padding: theme.spacing[1],
    },
    groupDivider: {
      height: 1,
      backgroundColor: theme.colors.divider,
      marginVertical: theme.spacing[1],
      marginHorizontal: theme.spacing[5],
    },
    historyLoadingContainer: {
      alignItems: 'center',
      paddingVertical: theme.spacing[8],
      gap: theme.spacing[3],
    },
    historyLoadingText: {
      ...theme.textStyles.bodySm,
      color: theme.colors.textTertiary,
    },
    historyEmptyContainer: {
      alignItems: 'center',
      paddingVertical: theme.spacing[12],
      gap: theme.spacing[3],
    },
    historyEmptyText: {
      ...theme.textStyles.bodyLarge,
      color: theme.colors.textTertiary,
    },
    actionOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    actionMenu: {
      width: '86%',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.lg,
      paddingVertical: theme.spacing[2],
      ...theme.shadows.lg,
    },
    actionMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing[2],
      paddingVertical: theme.spacing[3],
      paddingHorizontal: theme.spacing[4],
    },
    actionMenuItemText: {
      ...theme.textStyles.bodyLarge,
      color: theme.colors.textPrimary,
    },
    actionMenuDivider: {
      height: 1,
      backgroundColor: theme.colors.divider,
      marginVertical: theme.spacing[1],
      marginHorizontal: theme.spacing[2],
    },
  });
