import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { Stack, router, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useShoppingListStore } from '@/stores/shoppingListStore';
import { useAccountStore } from '@/stores/accountStore';
import { useExpenseStore } from '@/stores/expenseStore';
import { useHydrationStore } from '@/stores/hydrateTransactions';
import { useInsightsStore } from '@/stores/insightsStore';
import { useShoppingModeStore } from '@/stores/shoppingModeStore';
import { buildSessionSnapshot } from '@/features/shopping-mode/snapshot';
import { startShoppingMode, stopShoppingMode } from '@/services/shoppingMode';
import { AddItemModal } from '@/components/shopping-list/AddItemModal';
import { ListSwitcherModal } from '@/components/shopping-list/ListSwitcherModal';
import { ListNameModal, type NameModalState } from '@/components/shopping-list/ListNameModal';
import type {
  ShoppingList,
  ShoppingListItem,
  ProductListItem,
  RestockSuggestion,
  DealSuggestion,
} from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

export default function ShoppingListScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  const canEdit = useAccountStore((s) => s.canEdit());
  const currentAccountId = useAccountStore((s) => s.currentAccountId);

  const items = useShoppingListStore((s) => s.items);
  const lists = useShoppingListStore((s) => s.lists);
  const activeListId = useShoppingListStore((s) => s.activeListId);
  const suggestions = useShoppingListStore((s) => s.suggestions);
  const deals = useShoppingListStore((s) => s.deals);
  const isLoading = useShoppingListStore((s) => s.isLoading);
  const hydrate = useShoppingListStore((s) => s.hydrate);
  const addItem = useShoppingListStore((s) => s.addItem);
  const dismissSuggestion = useShoppingListStore((s) => s.dismissSuggestion);
  const dismissDeal = useShoppingListStore((s) => s.dismissDeal);
  const toggleChecked = useShoppingListStore((s) => s.toggleChecked);
  const updateQuantity = useShoppingListStore((s) => s.updateQuantity);
  const removeItem = useShoppingListStore((s) => s.removeItem);
  const clearChecked = useShoppingListStore((s) => s.clearChecked);
  const setActiveList = useShoppingListStore((s) => s.setActiveList);
  const createList = useShoppingListStore((s) => s.createList);
  const renameList = useShoppingListStore((s) => s.renameList);
  const archiveList = useShoppingListStore((s) => s.archiveList);
  const deleteList = useShoppingListStore((s) => s.deleteList);

  // ─── Shopping mode (Android only) ─────────────────────────────────────────
  // The only subscription this feature adds to the screen: the button's own
  // label and icon depend on it. Everything else the snapshot needs is read
  // once, at press time, straight from the stores — subscribing to expenses,
  // the user, or the safe-to-spend figure would re-render this list on changes
  // that never touch it.
  const shoppingModeActive = useShoppingModeStore((s) => s.active);
  const refreshShoppingMode = useShoppingModeStore((s) => s.refreshFromDisk);
  // Both branches below await before the button's appearance can change, and
  // `startShoppingMode` stops any running service before starting a new one —
  // so a double tap is the easiest way to have a stop resolve into a freshly
  // started service and kill it. One press at a time.
  const shoppingModeBusy = useRef(false);

  // A trip that ends by itself — on exit, or at the two-hour cap — is cleared
  // by the location task, which writes MMKV and cannot touch a store. That is
  // the NORMAL ending, and it happens while the app is backgrounded but alive,
  // because `killServiceOnDestroy: false` is precisely what keeps the process
  // up. Without re-reading disk here, the user comes home to a button still
  // reading "Stop shopping mode" and spends their first press correcting the
  // label instead of starting the next trip.
  //
  // Both listeners are needed, and neither subsumes the other: focus covers
  // arriving at this screen, `AppState` covers foregrounding while already
  // standing on it. An `AppState` change fires no navigation focus event —
  // the lesson `useNearbyStore` carries a comment about. `refreshFromDisk` is
  // one MMKV read, so running both on a cold foreground-into-this-screen costs
  // nothing worth avoiding.
  useFocusEffect(
    useCallback(() => {
      refreshShoppingMode();
    }, [refreshShoppingMode]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s !== 'active') return;
      refreshShoppingMode();
    });
    return () => sub.remove();
  }, [refreshShoppingMode]);

  const toggleShoppingMode = async () => {
    if (shoppingModeBusy.current) return;
    shoppingModeBusy.current = true;
    try {
      if (shoppingModeActive) {
        await stopShoppingMode();
        refreshShoppingMode();
        return;
      }

      const expenses = useExpenseStore.getState().expenses;
      const snapshot = buildSessionSnapshot({
        accountId: currentAccountId ?? '',
        // The live UI language, not a field on the user: the mobile `User`
        // entity carries no `language` — the client owns it and merely tells
        // the server about it. This is the same i18n instance the headless
        // notification path resolves `{ lng: snapshot.language }` against, so
        // the two cannot disagree.
        language: i18n.language,
        expenses,
        items,
        // The cached figure the home hero already shows, not a fresh fetch: it
        // is a daily number, the home tab refreshes it on every app start, and
        // a null here degrades the arrival notification to its no-figure
        // wording rather than blocking anything.
        safeToSpend: useInsightsStore.getState().safeToSpend,
      });

      // A session that can never fire is worse than no button: say so instead.
      if (snapshot.centres.length === 0) {
        // ...but say the RIGHT thing. `/shopping-list` is reachable straight
        // from a `shopping_reminder` / `shopping_deal` push deep link, which
        // can land the user here while `hydrateTransactions()` is still in
        // flight and the expense store is empty. Telling someone holding
        // hundreds of receipts to "scan a few receipts first" is a lie about
        // their own data; "not loaded yet" is the truth, and it self-corrects
        // on the retry a second later. An empty store with nothing loading is
        // a genuinely empty account, where the original wording is right.
        const stillLoading =
          expenses.length === 0 &&
          (useHydrationStore.getState().isHydrating || useExpenseStore.getState().isLoading);
        showAlert(
          t(stillLoading ? 'shoppingMode.notReadyTitle' : 'shoppingMode.noShopsTitle'),
          t(stillLoading ? 'shoppingMode.notReadyBody' : 'shoppingMode.noShopsBody'),
        );
        return;
      }

      const result = await startShoppingMode(snapshot);
      // Same explain-and-abort shape as the no-shops and no-permission cases:
      // nothing is running, and the user is told which of the two permissions
      // the mode cannot work without. Notifications are not a nicety here —
      // they are the whole output, including the persistent service
      // notification the user is meant to see for the entire session.
      if (result === 'no_permission' || result === 'no_notifications') {
        const notifications = result === 'no_notifications';
        showAlert(
          t(notifications ? 'shoppingMode.notifyPermissionTitle' : 'shoppingMode.permissionTitle'),
          t(notifications ? 'shoppingMode.notifyPermissionBody' : 'shoppingMode.permissionBody'),
        );
        return;
      }
      refreshShoppingMode();
    } finally {
      shoppingModeBusy.current = false;
    }
  };

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

  const handleAddProduct = (product: ProductListItem) => {
    addItem(product.canonicalName, product.canonicalName, 1);
  };

  const handleAddFreeText = (text: string) => {
    addItem(text, null, 1);
  };

  // ─── Restock suggestions strip (all members, not canEdit-gated) ───────────
  const handleAddSuggestion = (suggestion: RestockSuggestion) => {
    addItem(suggestion.canonicalName, suggestion.canonicalName, 1);
    dismissSuggestion(suggestion.canonicalName);
  };

  // ─── Deal suggestions strip (all members, not canEdit-gated) ──────────────
  const handleAddDeal = (deal: DealSuggestion) => {
    addItem(deal.canonicalName, deal.canonicalName, 1);
    dismissDeal(deal.canonicalName, deal.merchant);
  };

  // ─── List switcher bottom sheet ────────────────────────────────────────────
  // Create + Rename: all members. Archive + Delete: canEdit only.
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [nameModal, setNameModal] = useState<NameModalState | null>(null);

  const openSwitcher = () => setSwitcherVisible(true);
  const closeSwitcher = () => setSwitcherVisible(false);

  const handleSelectList = (id: string) => {
    setActiveList(id);
    closeSwitcher();
  };

  const openCreateList = () => setNameModal({ mode: 'create', value: '' });
  const openRenameList = (list: ShoppingList) =>
    setNameModal({ mode: 'rename', id: list.id, value: list.name });
  const closeNameModal = () => setNameModal(null);

  const handleSaveNameModal = () => {
    if (!nameModal) return;
    const trimmed = nameModal.value.trim();
    if (!trimmed) {
      closeNameModal();
      return;
    }
    if (nameModal.mode === 'create') {
      createList(trimmed);
    } else if (nameModal.id) {
      renameList(nameModal.id, trimmed);
    }
    closeNameModal();
  };

  const handleArchiveList = (list: ShoppingList) => {
    showAlert(t('shoppingList.archiveList'), t('shoppingList.archiveListConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('shoppingList.archiveList'),
        style: 'destructive',
        onPress: () => archiveList(list.id),
      },
    ]);
  };

  const handleDeleteListRow = (list: ShoppingList) => {
    showAlert(t('shoppingList.deleteList'), t('shoppingList.deleteListConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteList(list.id) },
    ]);
  };

  const headerRight = () => (
    <View style={styles.headerActions}>
      {checkedCount > 0 && (
        <TouchableOpacity onPress={() => clearChecked()} hitSlop={8}>
          <Text style={styles.headerAction}>{t('shoppingList.clearChecked')}</Text>
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
        {/*
          Android only, and not cosmetically: there is no iOS native project in
          this repo, and on web `startLocationUpdatesAsync` throws. The service
          degrades that harmlessly, but the alert it produces would tell the
          user "location needed" when the truth is "not on this platform".

          Deliberately NOT canEdit-gated — a viewer can walk into a shop, and
          starting a location session on their own device writes nothing to the
          account.
        */}
        {Platform.OS === 'android' && (
          <TouchableOpacity
            style={[styles.shoppingModeButton, shoppingModeActive && styles.shoppingModeButtonActive]}
            onPress={() => void toggleShoppingMode()}
            activeOpacity={0.7}
          >
            <Ionicons
              name={shoppingModeActive ? 'stop-circle-outline' : 'navigate-outline'}
              size={18}
              color={shoppingModeActive ? theme.colors.textInverse : theme.colors.primary}
            />
            <Text
              style={[styles.shoppingModeText, shoppingModeActive && styles.shoppingModeTextActive]}
            >
              {shoppingModeActive ? t('shoppingMode.stop') : t('shoppingMode.start')}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.switcherPill}
          onPress={openSwitcher}
          hitSlop={8}
          accessibilityLabel={t('shoppingList.switchList')}
        >
          <Text style={styles.switcherPillText} numberOfLines={1}>
            {activeListName}
          </Text>
          <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
        </TouchableOpacity>

        {lists.length > 0 && suggestions.length > 0 && (
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

        {lists.length > 0 && deals.length > 0 && (
          <View style={styles.dealsSection}>
            <Text style={styles.dealsTitle}>{t('shoppingList.dealsTitle')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dealsRow}
            >
              {deals.map((d) => (
                <TouchableOpacity
                  key={`${d.canonicalName}-${d.merchant}`}
                  style={styles.dealChip}
                  onPress={() => handleAddDeal(d)}
                >
                  <View style={styles.dealChipTop}>
                    <Ionicons name="pricetag-outline" size={14} color={theme.colors.success} />
                    <Text style={styles.dealChipName} numberOfLines={1}>
                      {d.canonicalName}
                    </Text>
                  </View>
                  <View style={styles.dealChipBottom}>
                    <Text style={styles.dealChipPct}>
                      {t('shoppingList.dealDrop', { pct: d.dropPct })}
                    </Text>
                    <Text style={styles.dealChipMerchant} numberOfLines={1}>
                      {d.merchant}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {lists.length > 0 && (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle} numberOfLines={1}>
              {activeListName}
            </Text>
          </View>
        )}

        {isLoading && items.length === 0 ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : lists.length === 0 ? (
          // All lists archived/deleted — the server no longer resurrects one,
          // so show a clean "create a list" state instead of silently
          // reviving the archived list (ABA archive-reappears fix).
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={40} color={theme.colors.textTertiary} />
            <Text style={styles.emptyText}>{t('shoppingList.noLists')}</Text>
            <TouchableOpacity style={styles.createListBtn} onPress={openCreateList}>
              <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.createListBtnText}>{t('shoppingList.createFirstList')}</Text>
            </TouchableOpacity>
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

      {lists.length > 0 && (
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.bottomBarRow}>
          <TouchableOpacity style={styles.addBtn} onPress={() => setAddModalVisible(true)}>
            <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.addBtnText}>{t('shoppingList.addItem')}</Text>
          </TouchableOpacity>
          {items.length > 0 && (
            <>
              <TouchableOpacity
                style={[styles.compareBtn, comparableCount === 0 && styles.compareBtnDisabled]}
                onPress={() => router.push('/shopping-list/compare')}
                disabled={comparableCount === 0}
              >
                <Ionicons name="storefront-outline" size={18} color={theme.colors.textInverse} />
                <Text style={styles.compareBtnText}>{t('shoppingList.compareCta')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.mapIconBtn}
                onPress={() => router.push('/shopping-list/map')}
                accessibilityLabel={t('shoppingList.mapTitle')}
              >
                <Ionicons name="map-outline" size={22} color={theme.colors.primary} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
      )}

      <AddItemModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onAddProduct={handleAddProduct}
        onAddFreeText={handleAddFreeText}
        bottomInset={insets.bottom}
      />

      <ListSwitcherModal
        visible={switcherVisible}
        onClose={closeSwitcher}
        lists={lists}
        activeListId={activeListId}
        canEdit={canEdit}
        onSelectList={handleSelectList}
        onRenameList={openRenameList}
        onArchiveList={handleArchiveList}
        onDeleteList={handleDeleteListRow}
        onCreateList={openCreateList}
        bottomInset={insets.bottom}
      />

      <ListNameModal
        nameModal={nameModal}
        onChangeValue={(value) => setNameModal((m) => (m ? { ...m, value } : m))}
        onSave={handleSaveNameModal}
        onClose={closeNameModal}
        bottomInset={insets.bottom}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  content: { padding: theme.spacing[4], paddingBottom: theme.spacing[10] },

  headerActions: { flexDirection: 'row' as const, alignItems: 'center' as const },
  headerAction: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },

  // No horizontal margin on purpose: the ScrollView's own content padding
  // already sets the gutter every other element on this screen sits inside.
  shoppingModeButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  shoppingModeButtonActive: { backgroundColor: theme.colors.primary },
  shoppingModeText: {
    ...theme.textStyles.bodyMedium,
    fontWeight: '600' as const,
    color: theme.colors.primary,
  },
  shoppingModeTextActive: { color: theme.colors.textInverse },

  switcherPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: theme.spacing[1.5],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2],
    marginBottom: theme.spacing[3],
    maxWidth: '100%' as const,
  },
  switcherPillText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: '600' as const,
    flexShrink: 1,
  },

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

  dealsSection: { marginBottom: theme.spacing[3] },
  dealsTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  dealsRow: { gap: theme.spacing[2], paddingBottom: theme.spacing[0.5] },
  dealChip: {
    backgroundColor: theme.colors.successLight,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    maxWidth: 200,
    gap: theme.spacing[1],
  },
  dealChipTop: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
  },
  dealChipName: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    fontWeight: '500' as const,
    flexShrink: 1,
  },
  dealChipBottom: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
  },
  dealChipPct: { ...theme.textStyles.bodySm, color: theme.colors.success, fontWeight: '700' as const },
  dealChipMerchant: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    flexShrink: 1,
  },

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
  createListBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  createListBtnText: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },

  bottomBar: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
  },
  bottomBarRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  addBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[3.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  addBtnText: { ...theme.textStyles.bodyMedium, color: theme.colors.primary },
  compareBtn: {
    flex: 1,
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
  mapIconBtn: {
    width: 48,
    height: 48,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
});
