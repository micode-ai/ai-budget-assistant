import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { MerchantPickerSheet } from '@/components/MerchantPickerSheet';

interface MerchantInputProps {
  value: string;
  onChangeText: (text: string) => void;
}

export const MerchantInput: React.FC<MerchantInputProps> = ({ value, onChangeText }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const getDistinctMerchants = useExpenseStore((s) => s.getDistinctMerchants);
  const [pickerOpen, setPickerOpen] = useState(false);

  const allMerchants = useMemo(() => getDistinctMerchants(), [getDistinctMerchants]);
  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    const matches = q
      ? allMerchants.filter((m) => m.toLowerCase().includes(q) && m.toLowerCase() !== q)
      : allMerchants;
    return matches.slice(0, 6);
  }, [allMerchants, value]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('expenses.merchant')}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, styles.inputFlex]}
          value={value}
          onChangeText={onChangeText}
          placeholder={t('expenses.merchantPlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {/* The chips below can only ever show six. This opens the full list,
            searchable — the difference matters once an account has dozens of
            merchants, which is the normal state after a few months of
            receipts. Hidden when there is nothing to browse yet. */}
        {allMerchants.length > 0 && (
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => setPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('merchants.title')}
          >
            <Ionicons name="list" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <MerchantPickerSheet
        visible={pickerOpen}
        merchants={allMerchants}
        onSelect={onChangeText}
        onClose={() => setPickerOpen(false)}
      />
      {suggestions.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {suggestions.map((m) => (
            <TouchableOpacity key={m} style={styles.chip} onPress={() => onChangeText(m)}>
              <Text style={styles.chipText} numberOfLines={1}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const createStyles = (theme: Theme) => ({
  container: { marginVertical: theme.spacing[2] },
  label: {
    fontSize: 13,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[1.5],
  },
  inputRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  inputFlex: { flex: 1 },
  browseButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md + 2,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md + 2,
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2.5],
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  chips: { gap: theme.spacing[2], paddingTop: theme.spacing[2] },
  chip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSecondary,
    maxWidth: 160,
  },
  chipText: { fontSize: 13, color: theme.colors.textSecondary },
});
