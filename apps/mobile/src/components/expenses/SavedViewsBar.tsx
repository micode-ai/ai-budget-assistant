import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { useAccountStore } from '@/stores/accountStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useSavedViewStore } from '@/stores/savedViewStore';
import { showAlert } from '@/utils/alert';
import { viewMatches, isEmptyView, type SavedView, type SavedViewSnapshot, type ScreenFilterState } from '@/features/expenses/savedViews';

interface Props {
  /** Live filter state of the host screen (phone or desktop). */
  state: ScreenFilterState;
  snapshot: SavedViewSnapshot;
  onApply: (view: SavedView) => void;
}

/**
 * One-tap saved views above the transaction list. Shared by the phone screen and
 * the desktop screen; both own the actual filter state and pass `onApply`.
 * Tap = apply, long-press = rename / delete. Saving uses an inline name field
 * (Alert.prompt is iOS-only).
 */
export function SavedViewsBar({ state, snapshot, onApply }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const accountId = useAccountStore((s) => s.currentAccountId);
  const isPro = useSubscriptionStore((s) => s.isPro());
  const { views, setScope, saveView, renameView, deleteView } = useSavedViewStore();
  const [editing, setEditing] = useState<{ mode: 'save' } | { mode: 'rename'; id: string } | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    setScope(userId, accountId);
  }, [userId, accountId, setScope]);

  const canSaveCurrent = !isEmptyView(snapshot);
  if (views.length === 0 && !canSaveCurrent) return null;

  const commit = () => {
    if (!editing) return;
    if (editing.mode === 'save') {
      const r = saveView(name, snapshot, isPro);
      if (r === 'limit_reached') showAlert(t('savedViews.title'), t('savedViews.limitFree'));
    } else {
      renameView(editing.id, name);
    }
    setEditing(null);
    setName('');
  };

  const openMenu = (v: SavedView) =>
    showAlert(v.name, undefined, [
      { text: t('savedViews.rename'), onPress: () => { setName(v.name); setEditing({ mode: 'rename', id: v.id }); } },
      { text: t('savedViews.delete'), style: 'destructive', onPress: () => deleteView(v.id) },
      { text: t('common.cancel'), style: 'cancel' },
    ]);

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {views.map((v) => {
          const active = viewMatches(v, state);
          return (
            <Pressable
              key={v.id}
              accessibilityRole="button"
              accessibilityLabel={v.name}
              onPress={() => onApply(v)}
              onLongPress={() => openMenu(v)}
              style={[
                styles.chip,
                { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.borderLight },
                active && { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary },
              ]}
            >
              <Ionicons name="bookmark-outline" size={13} color={active ? theme.colors.primary : theme.colors.textTertiary} />
              <Text style={[styles.chipText, { color: active ? theme.colors.primary : theme.colors.textSecondary }]} numberOfLines={1}>
                {v.name}
              </Text>
            </Pressable>
          );
        })}
        {canSaveCurrent && !editing && (
          <Pressable
            accessibilityRole="button"
            onPress={() => { setName(''); setEditing({ mode: 'save' }); }}
            style={[styles.chip, { borderColor: theme.colors.primary, borderStyle: 'dashed' }]}
          >
            <Ionicons name="add" size={14} color={theme.colors.primary} />
            <Text style={[styles.chipText, { color: theme.colors.primary }]}>{t('savedViews.save')}</Text>
          </Pressable>
        )}
      </ScrollView>
      {editing && (
        <View style={styles.editRow}>
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            onSubmitEditing={commit}
            maxLength={40}
            placeholder={t('savedViews.namePlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.borderLight, backgroundColor: theme.colors.surfaceSecondary }]}
          />
          <Pressable onPress={commit} accessibilityRole="button" style={styles.iconBtn}>
            <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
          </Pressable>
          <Pressable onPress={() => setEditing(null)} accessibilityRole="button" style={styles.iconBtn}>
            <Ionicons name="close" size={20} color={theme.colors.textTertiary} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 4 },
  row: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, maxWidth: 200 },
  chipText: { fontSize: 13, fontWeight: '500' },
  editRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, gap: 4 },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 14 },
  iconBtn: { padding: 6 },
});
