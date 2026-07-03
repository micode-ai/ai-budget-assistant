import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { showAlert } from '@/utils/alert';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import type { SettleMethod } from '@budget/shared-types';

const METHODS: SettleMethod[] = ['revolut', 'paypal', 'blik', 'cash', 'other'];

const METHOD_LABEL_KEYS: Record<SettleMethod, string> = {
  revolut: 'trip.paymentMethodRevolut',
  paypal: 'trip.paymentMethodPaypal',
  blik: 'trip.paymentMethodBlik',
  cash: 'trip.paymentMethodCash',
  other: 'trip.paymentMethodOther',
};

const METHOD_PLACEHOLDER_KEYS: Record<SettleMethod, string> = {
  revolut: 'trip.paymentHandlePlaceholderRevolut',
  paypal: 'trip.paymentHandlePlaceholderPaypal',
  blik: 'trip.paymentHandlePlaceholderBlik',
  cash: 'trip.paymentHandlePlaceholderGeneric',
  other: 'trip.paymentHandlePlaceholderGeneric',
};

export default function PaymentSettingsScreen() {
  const { id: accountId } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { updatePaymentInfo, loadMembers } = useAccountStore();
  const currentUser = useAuthStore((s) => s.user);

  const [method, setMethod] = useState<SettleMethod>('revolut');
  const [handle, setHandle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!accountId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const list = await loadMembers(accountId);
      if (cancelled) return;
      const mine = list.find((m) => m.userId === currentUser?.id);
      if (mine?.paymentMethod) setMethod(mine.paymentMethod);
      if (mine?.paymentHandle) setHandle(mine.paymentHandle);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, currentUser?.id, loadMembers]);

  const handleSave = async () => {
    if (!accountId) return;
    const trimmedHandle = handle.trim();
    if (!trimmedHandle) {
      showAlert(t('errors.error'), t('trip.paymentHandleRequired'));
      return;
    }

    setIsSaving(true);
    try {
      await updatePaymentInfo(accountId, method, trimmedHandle);
      showAlert(t('trip.paymentSettingsTitle'), t('trip.paymentInfoSaved'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (e) {
      showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.label}>{t('trip.paymentMethod')}</Text>
        <View style={styles.methodRow}>
          {METHODS.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.methodChip, method === m && styles.methodChipActive]}
              onPress={() => setMethod(m)}
            >
              <Text style={[styles.methodText, method === m && styles.methodTextActive]}>
                {t(METHOD_LABEL_KEYS[m])}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>{t('trip.paymentHandle')}</Text>
        <TextInput
          style={styles.input}
          value={handle}
          onChangeText={setHandle}
          placeholder={t(METHOD_PLACEHOLDER_KEYS[method])}
          placeholderTextColor={theme.colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={method === 'blik' ? 'phone-pad' : 'default'}
        />
        {method === 'blik' && <Text style={styles.hint}>{t('trip.paymentHandleBlikHint')}</Text>}

        <TouchableOpacity
          style={[styles.submitButton, isSaving && styles.submitButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color={theme.colors.textInverse} />
          ) : (
            <Text style={styles.submitButtonText}>{t('common.save')}</Text>
          )}
        </TouchableOpacity>
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[5],
  },
  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  methodRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  methodChip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2.5],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius['2xl'],
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  methodChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  methodText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
  methodTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3.5],
    fontSize: 16,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  hint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[1.5],
  },
  submitButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    alignItems: 'center' as const,
    marginTop: theme.spacing[8],
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
});
