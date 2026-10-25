import { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@budget/shared-utils';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useWalletStore } from '@/stores/walletStore';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { parseAmount } from '@/utils/amount';
import { showAlert } from '@/utils/alert';

interface Props {
  currencyCode: string;
  currentBalance: number;
  onClose: () => void;
}

/**
 * "Correct balance": the user types the money they really have and the server records the
 * difference as a wallet adjustment — never an expense or income, so no spend, budget or
 * analytics figure moves. One component for phone and desktop web: the wallet screen is a
 * single route on both, so a plain `Modal` serves both and there is no second implementation.
 *
 * Online-only on purpose: the server computes the difference from its own balance, which is
 * what keeps a stale local figure from writing a wrong correction.
 */
export function CorrectBalanceSheet({ currencyCode, currentBalance, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const addAdjustment = useWalletStore((s) => s.addAdjustment);

  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [untracked, setUntracked] = useState<number | null>(null);

  const actual = parseAmount(value);
  const valid = Number.isFinite(actual);
  const difference = valid ? Math.round((actual - currentBalance) * 100) / 100 : 0;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const result = await addAdjustment(currencyCode, actual);
      if (result.untrackedThisMonth > 0) {
        setUntracked(result.untrackedThisMonth);
      } else {
        onClose();
      }
    } catch (e) {
      // Expected offline or for a viewer / archived trip: tell the user, do not crash.
      console.warn('Balance correction failed:', e);
      showAlert(t('wallet.correctBalance.title'), t('wallet.correctBalance.failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('common.cancel')} />
      <View style={[styles.sheet, { paddingBottom: theme.spacing[5] + insets.bottom + keyboardHeight }]}>
        {untracked !== null ? (
          <>
            <Text style={styles.title}>
              {t('wallet.correctBalance.untracked', {
                amount: formatCurrency(untracked, currencyCode),
              })}
            </Text>
            <TouchableOpacity
              style={styles.link}
              onPress={() => {
                onClose();
                router.push('/settings/notifications');
              }}
            >
              <Text style={styles.linkText}>{t('wallet.correctBalance.reminderLink')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primary} onPress={onClose}>
              <Text style={styles.primaryText}>{t('common.done')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>{t('wallet.correctBalance.title')}</Text>
            <Text style={styles.hint}>
              {t('wallet.correctBalance.current', {
                amount: formatCurrency(currentBalance, currencyCode),
              })}
            </Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              placeholder={t('wallet.correctBalance.placeholder')}
              placeholderTextColor={theme.colors.textTertiary}
              autoFocus
              accessibilityLabel={t('wallet.correctBalance.placeholder')}
            />
            {valid && (
              <Text
                style={[
                  styles.difference,
                  { color: difference < 0 ? theme.colors.danger : theme.colors.success },
                ]}
              >
                {difference === 0
                  ? t('wallet.correctBalance.noDifference')
                  : t('wallet.correctBalance.difference', {
                      amount: `${difference > 0 ? '+' : ''}${formatCurrency(difference, currencyCode)}`,
                    })}
              </Text>
            )}
            <Text style={styles.note}>{t('wallet.correctBalance.note')}</Text>
            <View style={styles.row}>
              <TouchableOpacity style={styles.secondary} onPress={onClose}>
                <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primary, styles.flex, (!valid || saving) && styles.disabled]}
                onPress={save}
                disabled={!valid || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryText}>{t('wallet.correctBalance.save')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
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
  title: { ...theme.textStyles.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing[2] },
  hint: { ...theme.textStyles.body, color: theme.colors.textSecondary, marginBottom: theme.spacing[3] },
  input: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
  },
  difference: { ...theme.textStyles.bodyLargeSemiBold, marginTop: theme.spacing[3] },
  note: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: theme.spacing[3] },
  row: { flexDirection: 'row' as const, gap: theme.spacing[3], marginTop: theme.spacing[4] },
  flex: { flex: 1 },
  primary: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    alignItems: 'center' as const,
    marginTop: theme.spacing[2],
  },
  primaryText: { ...theme.textStyles.bodyLargeSemiBold, color: '#FFFFFF' },
  secondary: {
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    alignItems: 'center' as const,
    marginTop: theme.spacing[2],
  },
  secondaryText: { ...theme.textStyles.bodyLargeSemiBold, color: theme.colors.textSecondary },
  disabled: { opacity: 0.5 },
  link: { paddingVertical: theme.spacing[2] },
  linkText: { ...theme.textStyles.body, color: theme.colors.primary },
});
