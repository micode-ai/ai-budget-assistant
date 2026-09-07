import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useIsDesktopWeb } from '@/components/webLayout.constants';

interface Props {
  visible: boolean;
  merchants: string[];
  onSelect: (merchant: string) => void;
  onClose: () => void;
}

/**
 * The full merchant list, searchable — the companion to `MerchantInput`'s six
 * inline suggestion chips, which can only ever show a slice. Reuses
 * `merchants.title` / `merchants.empty` / `common.search` / `common.cancel`
 * rather than minting near-duplicate strings in nine locales.
 *
 * Centred on desktop web and a bottom sheet everywhere else: a sheet is a
 * phone idiom, and on desktop this opens on top of a dialog that is itself
 * centred, so anchoring it to the bottom of the window would leave it
 * detached from the field it belongs to.
 */
export function MerchantPickerSheet({ visible, merchants, onSelect, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? merchants.filter((m) => m.toLowerCase().includes(q)) : merchants;
  }, [merchants, query]);

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={close}>
      <View style={[styles.backdrop, isDesktop && styles.backdropCentered]}>
        <TouchableOpacity style={styles.backdropFill} activeOpacity={1} onPress={close} />
        <View
          style={[
            styles.sheet,
            isDesktop ? styles.sheetCentered : { paddingBottom: theme.spacing[4] + insets.bottom },
          ]}
        >
          {!isDesktop && <View style={styles.handle} />}

          <View style={styles.header}>
            <Text style={styles.title}>{t('merchants.title')}</Text>
            <TouchableOpacity onPress={close} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
              <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={theme.colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={t('common.search')}
              placeholderTextColor={theme.colors.textTertiary}
              autoCorrect={false}
              autoFocus
            />
          </View>

          {filtered.length === 0 ? (
            <Text style={styles.empty}>{t('merchants.empty')}</Text>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(m) => m}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => {
                    onSelect(item);
                    close();
                  }}
                >
                  <Text style={styles.rowText} numberOfLines={1}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end' as const,
    backgroundColor: theme.colors.overlay,
  },
  backdropCentered: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[6],
  },
  backdropFill: {
    ...({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const),
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    maxHeight: '75%' as const,
  },
  sheetCentered: {
    width: '100%' as const,
    maxWidth: 420,
    borderRadius: theme.borderRadius.xl,
    paddingBottom: theme.spacing[4],
  },
  handle: {
    alignSelf: 'center' as const,
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing[3],
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[3],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  searchRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md + 2,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  list: { flexGrow: 0 },
  row: {
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  rowText: {
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  empty: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    paddingVertical: theme.spacing[6],
  },
});
