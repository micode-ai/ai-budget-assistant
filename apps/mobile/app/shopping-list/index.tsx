import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { Stack, router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useShoppingListStore } from '@/stores/shoppingListStore';
import { useAccountStore } from '@/stores/accountStore';
import { api } from '@/services/api';
import type { ShoppingListItem, ProductListItem, RestockSuggestion } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

const FREQUENT_COUNT = 8;

export default function ShoppingListScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  const canEdit = useAccountStore((s) => s.canEdit());
  const currentAccountId = useAccountStore((s) => s.currentAccountId);

  const items = useShoppingListStore((s) => s.items);
  const lists = useShoppingListStore((s) => s.lists);
  const activeListId = useShoppingListStore((s) => s.activeListId);
  const suggestions = useShoppingListStore((s) => s.suggestions);
  const isLoading = useShoppingListStore((s) => s.isLoading);
  const hydrate = useShoppingListStore((s) => s.hydrate);
  const addItem = useShoppingListStore((s) => s.addItem);
  const toggleChecked = useShoppingListStore((s) => s.toggleChecked);
  const updateQuantity = useShoppingListStore((s) => s.updateQuantity);
  const removeItem = useShoppingListStore((s) => s.removeItem);
  const clearChecked = useShoppingListStore((s) => s.clearChecked);
  const deleteList = useShoppingListStore((s) => s.deleteList);

  useEffect(() => {
    hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccountId]);

  // Unchecked items first, checked items sink to the bottom.
  const sortedItems = useMemo(() => {
    const unchecked = items.filter((i) => !i.isChecked);
    const checked = items.filter((i) => i.isChecked);
    return [...unchecked, ...checked];
  }, [items]);

  const activeListName = useMemo(
    () => lists.find((l) => l.id === activeListId)?.name ?? t('shoppingList.title'),
    [lists, activeListId, t],
  );

  const checkedCount = useMemo(() => items.filter((i) => i.isChecked).length, [items]);
  const comparableCount = useMemo(
    () => items.filter((i) => !i.isChecked && i.canonicalName).length,
    [items],
  );

  // ─── Add-item bottom sheet ────────────────────────────────────────────────
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const openAddModal = () => {
    setQuery('');
    setAddModalVisible(true);
    setLoadingProducts(true);
    api
      .getProducts()
      .then((list) => {
        setProducts([...list].sort((a, b) => b.purchaseCount - a.purchaseCount));
      })
      .catch((e) => console.warn('Failed to load tracked products:', e))
      .finally(() => setLoadingProducts(false));
  };

  const closeAddModal = () => {
    setAddModalVisible(false);
    setQuery('');
  };

  const handleAddProduct = (product: ProductListItem) => {
    addItem(product.canonicalName, product.canonicalName, 1);
    setQuery('');
  };

  const handleAddFreeText = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    addItem(trimmed, null, 1);
    setQuery('');
  };

  // ─── Restock suggestions strip (all members, not canEdit-gated) ───────────
  const handleAddSuggestion = (suggestion: RestockSuggestion) => {
    addItem(suggestion.canonicalName, suggestion.canonicalName, 1);
  };

  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();
  const filteredProducts = useMemo(
    () =>
      trimmedQuery
        ? products.filter((p) => p.canonicalName.toLowerCase().includes(lowerQuery))
        : [],
    [products, trimmedQuery, lowerQuery],
  );
  const frequentlyBought = useMemo(() => products.slice(0, FREQUENT_COUNT), [products]);
  const hasExactMatch = useMemo(
    () => (trimmedQuery ? products.some((p) => p.canonicalName.toLowerCase() === lowerQuery) : false),
    [products, trimmedQuery, lowerQuery],
  );

  // ─── Delete list (canEdit-gated; item ops below are NOT gated) ────────────
  const handleDeleteList = () => {
    if (!activeListId) return;
    showAlert(t('shoppingList.deleteList'), t('shoppingList.deleteListConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deleteList(activeListId),
      },
    ]);
  };

  const headerRight = () => (
    <View style={styles.headerActions}>
      {checkedCount > 0 && (
        <TouchableOpacity onPress={() => clearChecked()} hitSlop={8}>
          <Text style={styles.headerAction}>{t('shoppingList.clearChecked')}</Text>
        </TouchableOpacity>
      )}
      {canEdit && activeListId && (
        <TouchableOpacity onPress={handleDeleteList} hitSlop={8} style={styles.headerDeleteBtn}>
          <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderRow = (item: ShoppingListItem, isLast: boolean) => (
    <React.Fragment key={item.id}>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => toggleChecked(item.id)}
          hitSlop={8}
          style={styles.checkboxTouch}
        >
          <View style={[styles.checkbox, item.isChecked && styles.checkboxChecked]}>
            {item.isChecked && (
              <Ionicons name="checkmark" size={14} color={theme.colors.textInverse} />
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.labelTouch}
          onPress={() => toggleChecked(item.id)}
          activeOpacity={0.7}
        >
          <Text
            style={[styles.label, item.isChecked && styles.labelChecked]}
            numberOfLines={2}
          >
            {item.rawLabel}
          </Text>
        </TouchableOpacity>

        <View
          style={styles.stepper}
          accessibilityLabel={t('shoppingList.quantity')}
        >
          <TouchableOpacity
            onPress={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
            hitSlop={8}
            disabled={item.quantity <= 1}
          >
            <Ionicons
              name="remove-circle-outline"
              size={22}
              color={item.quantity <= 1 ? theme.colors.textDisabled : theme.colors.primary}
            />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{item.quantity}</Text>
          <TouchableOpacity onPress={() => updateQuantity(item.id, item.quantity + 1)} hitSlop={8}>
            <Ionicons name="add-circle-outline" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={8} style={styles.trashTouch}>
          <Ionicons name="trash-outline" size={19} color={theme.colors.danger} />
        </TouchableOpacity>
      </View>
      {!isLast && <View style={styles.divider} />}
    </React.Fragment>
  );

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <Stack.Screen options={{ title: t('shoppingList.title'), headerRight }} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {suggestions.length > 0 && (
          <View style={styles.restockSection}>
            <Text style={styles.restockTitle}>{t('shoppingList.restockTitle')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.restockRow}
            >
              {suggestions.map((s) => (
                <TouchableOpacity
                  key={s.canonicalName}
                  style={styles.restockChip}
                  onPress={() => handleAddSuggestion(s)}
                >
                  <Ionicons name="refresh-outline" size={14} color={theme.colors.primary} />
                  <Text style={styles.restockChipText} numberOfLines={1}>
                    {s.canonicalName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle} numberOfLines={1}>
            {activeListName}
          </Text>
          <TouchableOpacity onPress={openAddModal} hitSlop={8} style={styles.addRow}>
            <Ionicons name="add-circle-outline" size={22} color={theme.colors.primary} />
            <Text style={styles.addRowText}>{t('shoppingList.addItem')}</Text>
          </TouchableOpacity>
        </View>

        {isLoading && items.length === 0 ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={40} color={theme.colors.textTertiary} />
            <Text style={styles.emptyText}>{t('shoppingList.emptyList')}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {sortedItems.map((item, i) => renderRow(item, i === sortedItems.length - 1))}
          </View>
        )}
      </ScrollView>

      {items.length > 0 && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            style={[styles.compareBtn, comparableCount === 0 && styles.compareBtnDisabled]}
            onPress={() => router.push('/shopping-list/compare')}
            disabled={comparableCount === 0}
          >
            <Ionicons name="storefront-outline" size={18} color={theme.colors.textInverse} />
            <Text style={styles.compareBtnText}>{t('shoppingList.compareCta')}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={addModalVisible} transparent animationType="slide" onRequestClose={closeAddModal}>
        <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeAddModal} />
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 24) + 16, maxHeight: '82%' },
            ]}
          >
            <View style={styles.handle} />
            <Text style={styles.modalTitle}>{t('shoppingList.addItem')}</Text>

            <View style={styles.searchRow}>
              <Ionicons
                name="search-outline"
                size={16}
                color={theme.colors.textTertiary}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={t('shoppingList.searchProducts')}
                placeholderTextColor={theme.colors.textTertiary}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleAddFreeText}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {trimmedQuery.length > 0 ? (
                <>
                  {!hasExactMatch && (
                    <TouchableOpacity style={styles.freeTextRow} onPress={handleAddFreeText}>
                      <Ionicons name="add-circle" size={20} color={theme.colors.primary} />
                      <Text style={styles.freeTextText} numberOfLines={1}>
                        {t('shoppingList.addFreeText', { text: trimmedQuery })}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {filteredProducts.map((p) => (
                    <TouchableOpacity
                      key={p.rawName}
                      style={styles.productRow}
                      onPress={() => handleAddProduct(p)}
                    >
                      <View style={styles.iconCircle}>
                        <Ionicons name="pricetag-outline" size={16} color={theme.colors.primary} />
                      </View>
                      <Text style={styles.productName} numberOfLines={1}>
                        {p.canonicalName}
                      </Text>
                      <Ionicons name="add" size={18} color={theme.colors.primary} />
                    </TouchableOpacity>
                  ))}
                </>
              ) : (
                frequentlyBought.length > 0 && (
                  <>
                    <Text style={styles.modalSectionTitle}>{t('shoppingList.frequentlyBought')}</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipsRow}
                    >
                      {frequentlyBought.map((p) => (
                        <TouchableOpacity
                          key={p.rawName}
                          style={styles.chip}
                          onPress={() => handleAddProduct(p)}
                        >
                          <Text style={styles.chipText} numberOfLines={1}>
                            {p.canonicalName}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )
              )}

              {loadingProducts && (
                <ActivityIndicator
                  color={theme.colors.primary}
                  style={{ paddingVertical: theme.spacing[4] }}
                />
              )}
            </ScrollView>

            <TouchableOpacity style={styles.doneButton} onPress={closeAddModal}>
              <Text style={styles.doneButtonText}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[10] },

  headerActions: { flexDirection: 'row' as const, alignItems: 'center' as const },
  headerAction: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  headerDeleteBtn: { marginLeft: theme.spacing[3] },

  restockSection: { marginBottom: theme.spacing[3] },
  restockTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  restockRow: { gap: theme.spacing[2], paddingBottom: theme.spacing[0.5] },
  restockChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    maxWidth: 180,
  },
  restockChipText: { ...theme.textStyles.bodySm, color: theme.colors.primary, fontWeight: '500' as const },

  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  sectionTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    flexShrink: 1,
    marginRight: theme.spacing[2],
  },
  addRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  addRowText: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },

  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[3],
  },
  checkboxTouch: { flexShrink: 0 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  checkboxChecked: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  labelTouch: { flex: 1 },
  label: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  labelChecked: { color: theme.colors.textTertiary, textDecorationLine: 'line-through' as const },
  stepper: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    flexShrink: 0,
  },
  qtyText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    minWidth: 18,
    textAlign: 'center' as const,
  },
  trashTouch: { flexShrink: 0 },
  divider: { height: 1, backgroundColor: theme.colors.divider },

  emptyState: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[10],
    gap: theme.spacing[2],
  },
  emptyText: { ...theme.textStyles.body, color: theme.colors.textTertiary, textAlign: 'center' as const },

  bottomBar: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  compareBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
  },
  compareBtnDisabled: { opacity: 0.45 },
  compareBtnText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textInverse },

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
  modalTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[3] },

  searchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  searchIcon: { marginRight: 2 },
  searchInput: { flex: 1, ...theme.textStyles.body, color: theme.colors.textPrimary, paddingVertical: 2 },

  modalScroll: { flexGrow: 0 },
  modalSectionTitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  chipsRow: { gap: theme.spacing[2], paddingBottom: theme.spacing[2] },
  chip: {
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    maxWidth: 160,
  },
  chipText: { ...theme.textStyles.bodySm, color: theme.colors.primary, fontWeight: '500' as const },

  freeTextRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  freeTextText: { ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1 },

  productRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary + '15',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    flexShrink: 0,
  },
  productName: { ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1 },

  doneButton: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSecondary,
    marginTop: theme.spacing[3],
  },
  doneButtonText: { fontSize: 16, fontWeight: '600' as const, color: theme.colors.textPrimary },
});
