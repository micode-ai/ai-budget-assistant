import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';

const EMOJIS = ['👍', '❤️', '😮', '😂', '🔥', '😬'] as const;

interface ReactionSummary {
  emoji: string;
  count: number;
  userIds: string[];
}

interface EmojiReactionBarProps {
  eventId: string;
  reactions: ReactionSummary[];
  myReaction: string | null;
  onReact: (eventId: string, emoji: string) => void;
  onRemove: (eventId: string) => void;
}

export function EmojiReactionBar({ eventId, reactions, myReaction, onReact, onRemove }: EmojiReactionBarProps) {
  const theme = useTheme();
  const [pickerVisible, setPickerVisible] = useState(false);

  const handleEmojiTap = (emoji: string) => {
    setPickerVisible(false);
    if (myReaction === emoji) {
      onRemove(eventId);
    } else {
      onReact(eventId, emoji);
    }
  };

  const picker = (
    <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setPickerVisible(false)}>
        <View style={[styles.picker, { backgroundColor: theme.colors.surface }]}>
          {EMOJIS.map((emoji) => (
            <TouchableOpacity key={emoji} style={styles.pickerEmoji} onPress={() => handleEmojiTap(emoji)}>
              <Text style={styles.pickerEmojiText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // No reactions yet — show a subtle icon button
  if (reactions.length === 0) {
    return (
      <View style={styles.emptyRow}>
        <TouchableOpacity
          onPress={() => setPickerVisible(true)}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.emptyBtn}
        >
          <Ionicons name="happy-outline" size={16} color={theme.colors.textTertiary} />
          <Text style={[styles.emptyPlus, { color: theme.colors.textTertiary }]}>+</Text>
        </TouchableOpacity>
        {picker}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {reactions.map((r) => (
        <TouchableOpacity
          key={r.emoji}
          style={[
            styles.chip,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider },
            myReaction === r.emoji && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '12' },
          ]}
          onPress={() => handleEmojiTap(r.emoji)}
          activeOpacity={0.7}
        >
          <Text style={styles.emojiText}>{r.emoji}</Text>
          <Text style={[styles.countText, { color: theme.colors.textSecondary }]}>{r.count}</Text>
        </TouchableOpacity>
      ))}

      {/* Add button — no border, just a "+" so it doesn't visually dominate */}
      <TouchableOpacity
        onPress={() => setPickerVisible(true)}
        activeOpacity={0.6}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text style={[styles.addText, { color: theme.colors.textTertiary }]}>＋</Text>
      </TouchableOpacity>

      {picker}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  emptyRow: { marginTop: 8 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  emptyPlus: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 10, borderWidth: 1,
  },
  emojiText: { fontSize: 13 },
  countText: { fontSize: 11 },
  addText: { fontSize: 16, lineHeight: 20 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  picker: { flexDirection: 'row', padding: 12, borderRadius: 16, gap: 8 },
  pickerEmoji: { padding: 8 },
  pickerEmojiText: { fontSize: 24 },
});
