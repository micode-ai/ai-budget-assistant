import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useAccountStore } from '@/stores/accountStore';
import { useMerchantCaps } from '@/features/merchants/useMerchantCaps';
import { capBar } from '@/features/merchants/merchantCapDisplay';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { parseAmount } from '@/utils/amount';
import { showAlert } from '@/utils/alert';

interface Props {
  /** Merchant names to offer as one-tap suggestions (most frequent first). */
  suggestions: string[];
}

/**
 * Monthly per-merchant caps on the merchants settings screen (hosted by the phone route and the
 * desktop settings pane alike). Writes only the cap itself: no budget total changes.
 */
export function MerchantCapsCard({ suggestions }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const accountId = useAccountStore((s) => s.currentAccountId);
  const canEdit = useAccountStore((s) => s.canEdit());
  const currencyCode = useAccountStore(
    (s) => s.accounts.find((a) => a.id === s.currentAccountId)?.currencyCode ?? 'USD',
  );
  const { status, caps, reload, save, remove } = useMerchantCaps(accountId);
  const [editing, setEditing] = useState(false);

  if (status === 'loading') return null;
  if (status === 'error') {
    return (
      <TouchableOpacity style={styles.card} onPress={reload} accessibilityRole="button">
        <Text style={styles.muted}>{t('merchantCaps.loadFailed')}</Text>
      </TouchableOpacity>
    );
  }
  if (caps.length === 0 && !canEdit) return null;

  const confirmRemove = (id: string, merchant: string) => {
    showAlert(t('merchantCaps.title'), t('merchantCaps.removeConfirm', { merchant }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('merchantCaps.remove'),
        style: 'destructive',
        onPress: () => remove(id).catch((e) => {
          console.warn('Merchant cap remove failed:', e);
          showAlert(t('merchantCaps.title'), t('merchantCaps.saveFailed'));
        }),
      },
    ]);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{t('merchantCaps.title')}</Text>
        {canEdit && (
          <TouchableOpacity onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel={t('merchantCaps.add')} hitSlop={8}>
            <Ionicons name="add-circle-outline" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
        )}
      </View>
      {caps.length === 0 && <Text style={styles.muted}>{t('merchantCaps.hint')}</Text>}
      {caps.map((c) => {
        const bar = capBar(c.percentUsed);
        const color = bar.over ? theme.colors.danger : bar.warn ? theme.colors.warning : theme.colors.primary;
        return (
          <View key={c.id} style={styles.capRow}>
            <View style={styles.capHeader}>
              <Text style={styles.capName} numberOfLines={1}>{c.merchantLabel}</Text>
              {canEdit && (
                <TouchableOpacity
                  onPress={() => confirmRemove(c.id, c.merchantLabel)}
                  accessibilityRole="button"
                  accessibilityLabel={t('merchantCaps.remove')}
                  hitSlop={8}
                >
                  <Ionicons name="close-circle-outline" size={18} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${bar.fill * 100}%`, backgroundColor: color }]} />
            </View>
            <Text style={[styles.caption, bar.over && { color: theme.colors.danger }]}>
              {t('merchantCaps.progress', {
                spent: formatCurrency(c.spent, c.currencyCode),
                cap: formatCurrency(c.amount, c.currencyCode),
                percent: bar.percent,
              })}
            </Text>
          </View>
        );
      })}
      {editing && (
        <CapSheet
          currencyCode={currencyCode}
          suggestions={suggestions}
          onSave={save}
          onClose={() => setEditing(false)}
        />
      )}
    </View>
  );
}

interface SheetProps {
  currencyCode: string;
  suggestions: string[];
  onSave: (dto: { merchant: string; amount: number; currencyCode: string }) => Promise<void>;
  onClose: () => void;
}

function CapSheet({ currencyCode, suggestions, onSave, onClose }: SheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const value = parseAmount(amount);
  const valid = merchant.trim().length > 0 && Number.isFinite(value) && value > 0;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onSave({ merchant: merchant.trim(), amount: value, currencyCode });
      onClose();
    } catch (e) {
      console.warn('Merchant cap save failed:', e);
      showAlert(t('merchantCaps.title'), t('merchantCaps.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('common.cancel')} />
      <View style={[styles.sheet, { paddingBottom: theme.spacing[5] + insets.bottom + keyboardHeight }]}>
        <Text style={styles.sheetTitle}>{t('merchantCaps.add')}</Text>
        <Text style={styles.fieldLabel}>{t('merchantCaps.merchant')}</Text>
        <TextInput
          style={styles.input}
          value={merchant}
          onChangeText={setMerchant}
          maxLength={120}
          placeholderTextColor={theme.colors.textTertiary}
          accessibilityLabel={t('merchantCaps.merchant')}
        />
        <View style={styles.chips}>
          {suggestions.slice(0, 6).map((m) => (
            <TouchableOpacity key={m} style={styles.chip} onPress={() => setMerchant(m)} accessibilityRole="button">
              <Text style={styles.chipText} numberOfLines={1}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.fieldLabel}>{t('merchantCaps.amount', { currency: currencyCode })}</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholderTextColor={theme.colors.textTertiary}
          accessibilityLabel={t('merchantCaps.amount', { currency: currencyCode })}
        />
        {!valid && (merchant !== '' || amount !== '') && (
          <Text style={[styles.caption, { color: theme.colors.danger }]}>{t('merchantCaps.invalid')}</Text>
        )}
        <View style={styles.buttons}>
          <TouchableOpacity style={styles.secondary} onPress={onClose} disabled={busy}>
            <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primary, (!valid || busy) && styles.disabled]}
            onPress={submit}
            disabled={!valid || busy}
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{t('common.save')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  headerRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[2],
  },
  title: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.textPrimary },
  muted: { ...theme.textStyles.body, color: theme.colors.textSecondary },
  capRow: { marginTop: theme.spacing[3] },
  capHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: theme.spacing[2] },
  capName: { ...theme.textStyles.body, color: theme.colors.textPrimary, flex: 1 },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    overflow: 'hidden' as const,
    marginTop: theme.spacing[2],
  },
  fill: { height: 4, borderRadius: 2 },
  caption: { ...theme.textStyles.caption, color: theme.colors.textSecondary, marginTop: theme.spacing[1] },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing[5],
    width: '100%' as const,
    maxWidth: 520,
    alignSelf: 'center' as const,
  },
  sheetTitle: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[2] },
  fieldLabel: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[1],
  },
  input: {
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
  },
  chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing[2], marginTop: theme.spacing[2] },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    maxWidth: 160,
  },
  chipText: { ...theme.textStyles.caption, color: theme.colors.textPrimary },
  buttons: { flexDirection: 'row' as const, gap: theme.spacing[3], marginTop: theme.spacing[4] },
  primary: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    alignItems: 'center' as const,
  },
  primaryText: { ...theme.textStyles.bodyLargeSemiBold, color: '#FFFFFF' },
  secondary: {
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    alignItems: 'center' as const,
  },
  secondaryText: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.textSecondary },
  disabled: { opacity: 0.5 },
});
