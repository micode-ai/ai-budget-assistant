import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ChatConversation } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useChatStore } from '@/stores/chatStore';
import { CHAT_RAIL_WIDTH } from '@/components/webLayout.constants';
import { conversationDateLabel, type RailState } from '@/features/chat/chatLayout';

interface ConversationRailProps {
  /** Resolved by the caller via `resolveRailState` — never `'hidden'` here,
   *  since the parent doesn't render this component at all in that state
   *  (only `'hidden'` occupies zero width, per `railIsVisible`). */
  state: Exclude<RailState, 'hidden'>;
  conversations: ChatConversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  /** Both the initial-mount fetch AND the `'retry'` state's header button
   *  call this — same function, `chat.loadConversations`. */
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

  // Fetch on mount, bounded to 5s (design's "States" section): a request
  // that never settles must not leave the rail stuck in `loading` forever
  // with no route back to the user's conversations. If `conversationsStatus`
  // hasn't moved off `'loading'` by the time the timer fires, force it to
  // `'error'` so the retry affordance appears. A concurrent caller (e.g. the
  // "reveal the rail after the first message" effect in `ChatDesktop`) may
  // already have this in flight — an extra `loadConversations()` call here is
  // a harmless duplicate fetch, not a correctness issue.
  useEffect(() => {
    loadConversations();
    const timer = setTimeout(() => {
      if (useChatStore.getState().conversationsStatus === 'loading') {
        useChatStore.setState({ conversationsStatus: 'error' });
      }
    }, 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isFreshConversation = !currentConversationId;
  const [newHovered, setNewHovered] = useState(false);

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

        {conversations.map((item) => (
          <ConversationRow
            key={item.id}
            item={item}
            selected={item.id === currentConversationId}
            onSelect={() => onSelectConversation(item.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function ConversationRow({
  item,
  selected,
  onSelect,
}: {
  item: ChatConversation;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [hovered, setHovered] = useState(false);
  const title = item.title || t('chat.conversationUntitled');

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
    >
      <View style={styles.rowTop}>
        <Ionicons
          name="chatbubble-ellipses-outline"
          size={16}
          color={selected ? theme.colors.primary : theme.colors.textSecondary}
        />
        <Text style={[styles.rowTitle, selected && styles.rowTitleSelected]} numberOfLines={1}>
          {title}
        </Text>
        {item.isShared && <Ionicons name="people" size={12} color={theme.colors.primary} />}
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
