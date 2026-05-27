import React, { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useExpenseStore } from '@/stores/expenseStore';
import { useTheme, useStyles, type Theme } from '@/theme';

interface MerchantInputProps {
  value: string;
  onChangeText: (text: string) => void;
}

export const MerchantInput: React.FC<MerchantInputProps> = ({ value, onChangeText }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const getDistinctMerchants = useExpenseStore((s) => s.getDistinctMerchants);

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
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={t('expenses.merchantPlaceholder')}
        placeholderTextColor={theme.colors.textTertiary}
        autoCapitalize="words"
        autoCorrect={false}
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
