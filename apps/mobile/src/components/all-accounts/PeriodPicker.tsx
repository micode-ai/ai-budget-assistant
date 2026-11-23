import { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DatePicker } from '@/components/DatePicker';
import { useStyles, type Theme } from '@/theme';
import { toDateInputValue, fromDateInputValue } from '@/utils/dateInput';
import type { PeriodPreset } from '@/features/all-accounts/periods';

const PRESETS: PeriodPreset[] = ['thisMonth', 'lastMonth', 'thisYear', 'lastYear', 'custom'];

interface Props {
  preset: PeriodPreset;
  onPreset: (p: PeriodPreset) => void;
  range: { start: string; end: string };
  onCustom: (r: { start: string; end: string }) => void;
}

export function PeriodPicker({ preset, onPreset, range, onCustom }: Props) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);

  const pick = (d: Date | undefined) => {
    const which = picking;
    setPicking(null);
    if (!d || !which) return;
    const v = toDateInputValue(d);
    onCustom(
      which === 'start'
        ? { start: v, end: range.end < v ? v : range.end }
        : { start: range.start > v ? v : range.start, end: v }
    );
  };

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {PRESETS.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.chip, preset === p && styles.chipActive]}
            onPress={() => {
              if (p === 'custom') onCustom(range);
              onPreset(p);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: preset === p }}
          >
            <Text style={[styles.chipText, preset === p && styles.chipTextActive]}>
              {t(`allAccounts.period.${p}`)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {preset === 'custom' && (
        <View style={styles.customRow}>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setPicking('start')}>
            <Text style={styles.chipText}>{range.start}</Text>
          </TouchableOpacity>
          <Text style={styles.chipText}>–</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setPicking('end')}>
            <Text style={styles.chipText}>{range.end}</Text>
          </TouchableOpacity>
        </View>
      )}
      {picking && (
        <DatePicker
          value={
            fromDateInputValue(picking === 'start' ? range.start : range.end, new Date()) ??
            new Date()
          }
          onChange={pick}
        />
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  row: { gap: theme.spacing[2] },
  chip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary },
  chipTextActive: { color: theme.colors.textInverse },
  customRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  dateBtn: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
});
