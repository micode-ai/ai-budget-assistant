import React, { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useStyles, type Theme } from '@/theme';
import { formatCurrency } from '@budget/shared-utils';
import {
  BP_FULL,
  amountFromBp,
  bpFromAmount,
  effectiveLineShares,
  hasExplicitShares,
  isLineOverAllocated,
  payerBpFrom,
  type ItemShares,
} from '@/components/split/itemShares';

export interface LineShareClaimant {
  id: string;
  name: string;
}

interface LineShareEditorProps {
  item: { id: string; description: string; totalPrice: number };
  claimants: LineShareClaimant[];
  shares: ItemShares;
  currencyCode: string;
  canEdit: boolean;
  onChangeShare: (participantId: string, bp: number) => void;
  onReset: () => void;
}

/**
 * Sets how ONE receipt line is divided between the people on it and the payer
 * (ABA-550) -- "Edik 60%, me 40%".
 *
 * Purely presentational: every number comes from `components/split/itemShares`,
 * which is pure and unit-tested, because nothing in this repo renders a
 * component in CI. In particular the payer's row is NOT stored anywhere -- it is
 * `payerBp`, the remainder of the line, which is exactly how the server treats
 * it and why the payer never needs to be a participant row.
 *
 * The percent/amount toggle changes only what the user TYPES. Basis points are
 * what is held and sent either way: money would go stale the moment the line's
 * price is corrected, and a percentage rounded to whole numbers loses too much
 * on a three-way split.
 */
export function LineShareEditor({
  item,
  claimants,
  shares,
  currencyCode,
  canEdit,
  onChangeShare,
  onReset,
}: LineShareEditorProps) {
  const { t } = useTranslation();
  const styles = useStyles(createStyles);
  const [inputMode, setInputMode] = useState<'percent' | 'amount'>('percent');

  if (claimants.length === 0) return null;

  const manual = hasExplicitShares(shares, item.id);
  const overAllocated = isLineOverAllocated(shares, item.id);

  // Until the line is touched it still divides equally, so show that rather
  // than a column of zeros the user would have to overwrite. The payer's row is
  // derived from the SAME values the rows above display — reading the stored map
  // instead would report the payer as taking the whole line while the claimants
  // already show an equal split, a screen adding up to 200%.
  const effective = effectiveLineShares(shares, item.id, claimants.map((c) => c.id));
  const remainderBp = payerBpFrom(effective);
  const effectiveBp = (participantId: string) => effective[participantId] ?? 0;

  const handleType = (participantId: string, raw: string) => {
    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      onChangeShare(participantId, 0);
      return;
    }
    onChangeShare(
      participantId,
      inputMode === 'percent' ? Math.round(parsed * 100) : bpFromAmount(parsed, item.totalPrice),
    );
  };

  const percentLabel = (bp: number) => `${Math.round((bp / BP_FULL) * 1000) / 10}%`;

  const displayValue = (bp: number) =>
    inputMode === 'percent'
      ? String(Math.round((bp / BP_FULL) * 1000) / 10)
      : String(amountFromBp(bp, item.totalPrice));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {item.description}
        </Text>
        <Text style={styles.price}>{formatCurrency(item.totalPrice, currencyCode)}</Text>
      </View>

      <View style={styles.toggleRow}>
        {(['percent', 'amount'] as const).map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.toggle, inputMode === m && styles.toggleActive]}
            onPress={() => setInputMode(m)}
            activeOpacity={0.7}
          >
            <Text style={[styles.toggleText, inputMode === m && styles.toggleTextActive]}>
              {m === 'percent' ? '%' : t('receiptSplit.shareByAmount')}
            </Text>
          </TouchableOpacity>
        ))}
        {manual && (
          <TouchableOpacity style={styles.resetBtn} onPress={onReset} activeOpacity={0.7}>
            <Text style={styles.resetText}>{t('receiptSplit.shareReset')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {claimants.map((c) => {
        const bp = effectiveBp(c.id);
        return (
          <View key={c.id} style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>
              {c.name}
            </Text>
            <TextInput
              style={styles.input}
              value={displayValue(bp)}
              onChangeText={(v) => handleType(c.id, v)}
              keyboardType="decimal-pad"
              editable={canEdit}
              selectTextOnFocus
            />
            <Text style={styles.counterpart}>
              {inputMode === 'percent'
                ? formatCurrency(amountFromBp(bp, item.totalPrice), currencyCode)
                : percentLabel(bp)}
            </Text>
          </View>
        );
      })}

      {/* The payer's own share is the remainder, never an input: it is not
          stored and cannot be set directly -- giving it a field would invite a
          line that adds up to more than itself. */}
      <View style={[styles.row, styles.payerRow]}>
        <Text style={[styles.name, styles.payerName]} numberOfLines={1}>
          {t('receiptSplit.shareYou')}
        </Text>
        <Text style={styles.payerValue}>{percentLabel(remainderBp)}</Text>
        <Text style={styles.counterpart}>
          {formatCurrency(amountFromBp(remainderBp, item.totalPrice), currencyCode)}
        </Text>
      </View>

      {overAllocated && <Text style={styles.error}>{t('receiptSplit.shareOverAllocated')}</Text>}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 10 },
  title: { flex: 1, fontSize: 14, fontWeight: '600' as const, color: theme.colors.textPrimary },
  price: { fontSize: 14, color: theme.colors.textSecondary, marginLeft: 8 },
  toggleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 10,
    gap: 8,
  },
  toggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.background,
  },
  toggleActive: { backgroundColor: theme.colors.primary },
  toggleText: { fontSize: 13, color: theme.colors.textSecondary },
  toggleTextActive: { color: theme.colors.textInverse, fontWeight: '600' as const },
  resetBtn: { marginLeft: 'auto' as const, paddingHorizontal: 10, paddingVertical: 6 },
  resetText: { fontSize: 13, color: theme.colors.textLink },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 6,
    gap: 8,
  },
  name: { flex: 1, fontSize: 14, color: theme.colors.textPrimary },
  input: {
    width: 78,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.textPrimary,
    textAlign: 'right' as const,
    fontSize: 14,
  },
  counterpart: {
    width: 82,
    textAlign: 'right' as const,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  payerRow: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: 6,
    paddingTop: 10,
  },
  payerName: { fontWeight: '600' as const },
  payerValue: { width: 78, textAlign: 'right' as const, fontSize: 14, color: theme.colors.textPrimary },
  error: { marginTop: 8, fontSize: 13, color: theme.colors.danger },
});
