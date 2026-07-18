import { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { useProductSearch } from '@/hooks/useProductSearch';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { ProductListItem } from '@budget/shared-types';

interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
  onAddProduct: (product: ProductListItem) => void;
  onAddFreeText: (text: string) => void;
  bottomInset: number;
}

export function AddItemModal({
  visible,
  onClose,
  onAddProduct,
  onAddFreeText,
  bottomInset,
}: AddItemModalProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const {
    query,
    setQuery,
    trimmedQuery,
    loadingProducts,
    filteredProducts,
    frequentlyBought,
    hasExactMatch,
    load,
  } = useProductSearch();

  useEffect(() => {
    if (visible) {
      setQuery('');
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  const handleFreeText = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onAddFreeText(trimmed);
    setQuery('');
  };

  const handleProduct = (product: ProductListItem) => {
    onAddProduct(product);
    setQuery('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(bottomInset, 24) + 16, maxHeight: '82%' },
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
              onSubmitEditing={handleFreeText}
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
                  <TouchableOpacity style={styles.freeTextRow} onPress={handleFreeText}>
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
                    onPress={() => handleProduct(p)}
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
                        onPress={() => handleProduct(p)}
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

          <TouchableOpacity style={styles.doneButton} onPress={handleClose}>
            <Text style={styles.doneButtonText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
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
