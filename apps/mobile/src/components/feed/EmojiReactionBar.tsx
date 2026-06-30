import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
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

  return (
    <View style={styles.row}>
      {reactions.map((r) => (
        <TouchableOpacity
          key={r.emoji}
          style={[
            styles.chip,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
            myReaction === r.emoji && { borderColor: theme.colors.primary },
          ]}
          onPress={() => handleEmojiTap(r.emoji)}
        >
          <Text style={styles.emojiText}>{r.emoji}</Text>
          <Text style={[styles.countText, { color: theme.colors.textSecondary }]}>{r.count}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[styles.addBtn, { borderColor: theme.colors.border }]}
        onPress={() => setPickerVisible(true)}
      >
        <Text style={[styles.addText, { color: theme.colors.textSecondary }]}>＋</Text>
      </TouchableOpacity>

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
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  emojiText: { fontSize: 14 },
  countText: { fontSize: 12 },
  addBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  addText: { fontSize: 14 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  picker: { flexDirection: 'row', padding: 12, borderRadius: 16, gap: 8 },
  pickerEmoji: { padding: 8 },
  pickerEmojiText: { fontSize: 24 },
});
