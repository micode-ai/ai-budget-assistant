import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { MAX_GROUP_ITEMS, MAX_ITEM_NAME_LENGTH, type ItemLineDraft, type ItemsIssue } from '@/features/groups/groupItems';

interface GroupItemsEditorProps {
  lines: ItemLineDraft[];
  discountText: string;
  /** The amount paid, entry currency. */
  amount: number;
  /** Lines net minus the receipt discount. */
  linesTotal: number;
  currencyCode: string;
  issue: ItemsIssue | null;
  onAdd: () => void;
  onChange: (key: string, patch: Partial<Pick<ItemLineDraft, 'name' | 'priceText' | 'discountText'>>) => void;
  onRemove: (key: string) => void;
  onDiscount: (text: string) => void;
  /** Sets the amount to the lines total. */
  onUseTotal: () => void;
}

/**
 * The line editor of an itemised group expense (ABA-656): name, price and line discount per line,
 * and a receipt-wide discount. Everything it shows is computed in `features/groups/groupItems.ts`;
 * this only lays it out. Members claim the lines afterwards, on the claims screen.
 */
export function GroupItemsEditor({
  lines,
  discountText,
  amount,
  linesTotal,
  currencyCode,
  issue,
  onAdd,
  onChange,
  onRemove,
  onDiscount,
  onUseTotal,
}: GroupItemsEditorProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const remainder = Math.round((amount - linesTotal) * 100) / 100;

  return (
    <View>
      <Text style={styles.label}>{t('groups.itemsTitle')}</Text>
      <Text style={styles.hint}>{t('groups.itemizeHint')}</Text>

      {lines.map((line, index) => (
        <View key={line.key} style={styles.lineCard}>
          <View style={styles.lineTop}>
            <TextInput
              style={[styles.input, styles.nameInput]}
              value={line.name}
              onChangeText={(name) => onChange(line.key, { name })}
              placeholder={t('groups.itemNamePlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              maxLength={MAX_ITEM_NAME_LENGTH}
              accessibilityLabel={`${t('groups.itemNamePlaceholder')} ${index + 1}`}
            />
            <TouchableOpacity
              onPress={() => onRemove(line.key)}
              style={styles.removeButton}
              accessibilityRole="button"
              accessibilityLabel={t('groups.removeItem')}
            >
              <Ionicons name="trash-outline" size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.lineBottom}>
            <TextInput
              style={[styles.input, styles.moneyInput]}
              value={line.priceText}
              onChangeText={(priceText) => onChange(line.key, { priceText })}
              keyboardType="decimal-pad"
              placeholder={t('groups.itemPricePlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              accessibilityLabel={t('groups.itemPricePlaceholder')}
            />
            <TextInput
              style={[styles.input, styles.moneyInput]}
              value={line.discountText}
              onChangeText={(text) => onChange(line.key, { discountText: text })}
              keyboardType="decimal-pad"
              placeholder={t('groups.itemDiscountPlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              accessibilityLabel={t('groups.itemDiscountPlaceholder')}
            />
          </View>
        </View>
      ))}

      {lines.length < MAX_GROUP_ITEMS && (
        <TouchableOpacity style={styles.addRow} onPress={onAdd} accessibilityRole="button">
          <Ionicons name="add-circle-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.addText}>{t('groups.addItem')}</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.label}>{t('groups.receiptDiscountLabel')}</Text>
      <TextInput
        style={styles.input}
        value={discountText}
        onChangeText={onDiscount}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={theme.colors.textTertiary}
        accessibilityLabel={t('groups.receiptDiscountLabel')}
      />

      <Text style={styles.total}>{t('groups.itemsTotal', { amount: formatCurrency(linesTotal, currencyCode) })}</Text>
      {amount > 0 && remainder > 0 && (
        <Text style={styles.hint}>{t('groups.itemsRemainder', { amount: formatCurrency(remainder, currencyCode) })}</Text>
      )}
      {linesTotal > 0 && Math.abs(remainder) >= 0.01 && (
        <TouchableOpacity onPress={onUseTotal} accessibilityRole="button" style={styles.useTotal}>
          <Text style={styles.addText}>{t('groups.useItemsTotal')}</Text>
        </TouchableOpacity>
      )}
      {issue && lines.length > 0 && <Text style={styles.issue}>{t(`groups.itemsIssue_${issue}`)}</Text>}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
  },
  lineCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing[2.5],
    marginBottom: theme.spacing[2],
    gap: theme.spacing[2],
  },
  lineTop: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  lineBottom: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
  },
  input: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
    fontSize: 15,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  nameInput: {
    flex: 1,
  },
  moneyInput: {
    flex: 1,
  },
  removeButton: {
    padding: theme.spacing[2],
  },
  addRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  addText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.primary,
  },
  total: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[3],
  },
  useTotal: {
    paddingVertical: theme.spacing[2],
  },
  issue: {
    ...theme.textStyles.bodySm,
    color: theme.colors.danger,
    marginTop: theme.spacing[2],
  },
});
