import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { Stack } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { usePriceHistoryStore } from '@/stores/priceHistoryStore';
import { useAccountStore } from '@/stores/accountStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ProductListItem } from '@budget/shared-types';

export default function ProductsSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const canEdit = useAccountStore((s) => s.canEdit());

  const products = usePriceHistoryStore((s) => s.products);
  const loadProducts = usePriceHistoryStore((s) => s.loadProducts);
  const upsertAlias = usePriceHistoryStore((s) => s.upsertAlias);
  const deleteAlias = usePriceHistoryStore((s) => s.deleteAlias);
  const mergeProducts = usePriceHistoryStore((s) => s.mergeProducts);

  useEffect(() => { loadProducts(); }, []);

  // Single rename modal
  const [editing, setEditing] = useState<ProductListItem | null>(null);
  const [renameName, setRenameName] = useState('');
  const [saving, setSaving] = useState(false);

  // Multi-select + merge
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mergeSources, setMergeSources] = useState<string[] | null>(null);
  const [mergeName, setMergeName] = useState('');

  const toggleSelect = useCallback((rawName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rawName)) next.delete(rawName); else next.add(rawName);
      return next;
    });
  }, []);

  const exitSelect = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  const openRename = (item: ProductListItem) => {
    setEditing(item);
    setRenameName(item.canonicalName);
  };
  const closeRename = () => {
    setEditing(null);
    setRenameName('');
  };

  const handleSaveRename = async () => {
    if (!editing) return;
    const next = renameName.trim();
    if (!next) return;
    if (next === editing.canonicalName) { closeRename(); return; }
    setSaving(true);
    try {
      await upsertAlias(editing.rawName, next);
    } catch {
      // error already console.warn'd in store
    }
    setSaving(false);
    closeRename();
  };

  const handleDeleteAlias = useCallback((rawName: string) => {
    showAlert(t('priceHistory.deleteAlias'), rawName, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: async () => {
          try { await deleteAlias(rawName); } catch { /* warn'd in store */ }
        },
      },
    ]);
  }, [deleteAlias, t]);

  // Merge
  const defaultCanonical = (sources: string[]) => {
    const countByRaw = new Map(products.map((p) => [p.rawName, p.purchaseCount]));
    return [...sources].sort(
      (a, b) => (countByRaw.get(b) ?? 0) - (countByRaw.get(a) ?? 0),
    )[0] ?? '';
  };

  const openMergeFromSelection = () => {
    const sources = [...selected];
    if (sources.length < 2) return;
    setMergeSources(sources);
    setMergeName(defaultCanonical(sources));
  };
  const closeMerge = () => {
    setMergeSources(null);
    setMergeName('');
  };

  const handleConfirmMerge = async () => {
    if (!mergeSources) return;
    const target = mergeName.trim();
    if (!target) return;
    setSaving(true);
    try {
      await mergeProducts(mergeSources, target);
    } catch { /* warn'd in store */ }
    setSaving(false);
    closeMerge();
    exitSelect();
    showAlert('', t('priceHistory.merged'));
  };

  return (
    <>
      <Stack.Screen options={{ title: t('priceHistory.manageProducts') }} />
      <SafeAreaView style={styles.container} edges={[]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.content, { paddingBottom: theme.spacing[10] + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Section header */}
          <View style={styles.sectionHeader}>
            {selecting ? (
              <>
                <Text style={styles.sectionTitle}>
                  {t('merchants.selected', { count: selected.size })}
                </Text>
                <TouchableOpacity onPress={exitSelect}>
                  <Text style={styles.headerAction}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>{t('priceHistory.manageProducts')}</Text>
                {canEdit && products.length > 1 && (
                  <TouchableOpacity onPress={() => setSelecting(true)}>
                    <Text style={styles.headerAction}>{t('merchants.select')}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          <View style={styles.card}>
            {products.length === 0 ? (
              <Text style={styles.empty}>{t('priceHistory.noProducts')}</Text>
            ) : (
              products.map((item, i) => {
                const isSelected = selected.has(item.rawName);
                const hasAlias = item.rawName !== item.canonicalName;
                return (
                  <React.Fragment key={item.rawName}>
                    <View style={styles.row}>
                      <TouchableOpacity
                        style={styles.rowContent}
                        onPress={
                          !canEdit
                            ? undefined
                            : selecting
                              ? () => toggleSelect(item.rawName)
                              : () => openRename(item)
                        }
                        onLongPress={
                          canEdit && !selecting
                            ? () => { setSelecting(true); toggleSelect(item.rawName); }
                            : undefined
                        }
                        activeOpacity={canEdit ? 0.7 : 1}
                      >
                        {selecting ? (
                          <Ionicons
                            name={isSelected ? 'checkbox' : 'square-outline'}
                            size={22}
                            color={isSelected ? theme.colors.primary : theme.colors.textTertiary}
                          />
                        ) : (
                          <View style={styles.iconWrap}>
                            <Ionicons name="bar-chart-outline" size={18} color={theme.colors.primary} />
                          </View>
                        )}
                        <View style={styles.nameContainer}>
                          <Text style={styles.name} numberOfLines={1}>{item.canonicalName}</Text>
                          {hasAlias && (
                            <Text style={styles.sub} numberOfLines={1}>{item.rawName}</Text>
                          )}
                        </View>
                        <Text style={styles.count}>{item.purchaseCount}×</Text>
                      </TouchableOpacity>
                      {canEdit && !selecting && hasAlias && (
                        <TouchableOpacity
                          onPress={() => handleDeleteAlias(item.rawName)}
                          hitSlop={8}
                        >
                          <Ionicons name="refresh-outline" size={20} color={theme.colors.textTertiary} />
                        </TouchableOpacity>
                      )}
                    </View>
                    {i < products.length - 1 && <View style={styles.divider} />}
                  </React.Fragment>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* Bottom merge bar in selection mode */}
        {selecting && (
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TouchableOpacity
              style={[styles.mergeButton, selected.size < 2 && styles.mergeButtonDisabled]}
              onPress={openMergeFromSelection}
              disabled={selected.size < 2}
            >
              <Ionicons name="git-merge-outline" size={18} color={theme.colors.textInverse} />
              <Text style={styles.mergeButtonText}>{t('priceHistory.mergeProducts')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Single rename modal */}
        <Modal
          visible={editing !== null}
          transparent
          animationType="slide"
          onRequestClose={closeRename}
        >
          <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeRename} />
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
              <View style={styles.handle} />
              <Text style={styles.modalTitle}>{t('priceHistory.renameProduct')}</Text>
              <TextInput
                style={styles.input}
                value={renameName}
                onChangeText={setRenameName}
                placeholderTextColor={theme.colors.textTertiary}
                autoFocus
                autoCapitalize="words"
              />
              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelButton} onPress={closeRename}>
                  <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  onPress={handleSaveRename}
                  disabled={saving}
                >
                  <Text style={styles.saveText}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Merge modal */}
        <Modal
          visible={mergeSources !== null}
          transparent
          animationType="slide"
          onRequestClose={closeMerge}
        >
          <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeMerge} />
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
              <View style={styles.handle} />
              <Text style={styles.modalTitle}>{t('priceHistory.mergeProducts')}</Text>
              <Text style={styles.mergeLabel}>{t('priceHistory.mergeInto')}</Text>
              <TextInput
                style={styles.input}
                value={mergeName}
                onChangeText={setMergeName}
                placeholderTextColor={theme.colors.textTertiary}
                autoFocus
                autoCapitalize="words"
              />
              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelButton} onPress={closeMerge}>
                  <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  onPress={handleConfirmMerge}
                  disabled={saving}
                >
                  <Text style={styles.saveText}>{t('priceHistory.mergeProducts')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4] },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  sectionTitle: { ...theme.textStyles.bodyMedium, color: theme.colors.textSecondary },
  headerAction: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[1],
  },
  rowContent: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  nameContainer: { flex: 1, marginLeft: theme.spacing[3] },
  name: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  sub: { ...theme.textStyles.bodySm, color: theme.colors.textTertiary, marginTop: 2 },
  count: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginRight: theme.spacing[2],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[2],
  },
  empty: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[4],
  },
  // Bottom merge bar
  bottomBar: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  mergeButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
  },
  mergeButtonDisabled: { opacity: 0.5 },
  mergeButtonText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
  // Modals
  overlay: { flex: 1, justifyContent: 'flex-end' as const },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[6],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[4] },
  mergeLabel: { ...theme.textStyles.bodySm, color: theme.colors.textSecondary, marginBottom: theme.spacing[2] },
  input: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  actions: { flexDirection: 'row' as const, gap: theme.spacing[3] },
  cancelButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelText: { fontSize: 16, fontWeight: '500' as const, color: theme.colors.textSecondary },
  saveButton: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.primary,
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },
});
