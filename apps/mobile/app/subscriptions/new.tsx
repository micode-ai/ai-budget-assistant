import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useUserSubscriptionStore } from '@/stores/userSubscriptionStore';
import { useAuthStore } from '@/stores/authStore';
import type { BillingCycle } from '@budget/shared-types';

const BILLING_CYCLES: BillingCycle[] = ['monthly', 'yearly', 'quarterly', 'weekly'];

function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDefaultNextRenewal(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return formatDateForInput(d);
}

export default function NewSubscriptionScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const params = useLocalSearchParams<{ name?: string; amount?: string; detectedFrom?: string }>();

  const [name, setName] = useState(params.name || '');
  const [amount, setAmount] = useState(params.amount || '');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [nextRenewalDate, setNextRenewalDate] = useState(getDefaultNextRenewal());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const userCurrency = useAuthStore((s) => s.user?.currencyCode || 'USD');
  const { createSubscription } = useUserSubscriptionStore();

  const handleSave = async () => {
    if (!name.trim()) {
      showAlert(t('common.error'), t('subscriptionManager.errorName'));
      return;
    }
    const amountNum = parseFloat(amount.replace(',', '.'));
    if (isNaN(amountNum) || amountNum <= 0) {
      showAlert(t('common.error'), t('subscriptionManager.errorAmount'));
      return;
    }

    setSaving(true);
    try {
      await createSubscription({
        name: name.trim(),
        amount: amountNum,
        currencyCode: userCurrency,
        billingCycle,
        nextRenewalDate,
        notes: notes.trim() || undefined,
        detectedFrom: params.detectedFrom || undefined,
      });
      router.back();
    } catch (e) {
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <View style={styles.section}>
          <Text style={styles.label}>{t('subscriptionManager.fieldName')}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('subscriptionManager.fieldNamePlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t('subscriptionManager.fieldAmount')} ({userCurrency})</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="9.99"
            placeholderTextColor={theme.colors.textTertiary}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t('subscriptionManager.fieldCycle')}</Text>
          <View style={styles.cycleRow}>
            {BILLING_CYCLES.map((cycle) => (
              <TouchableOpacity
                key={cycle}
                style={[styles.cycleChip, billingCycle === cycle && styles.cycleChipActive]}
                onPress={() => setBillingCycle(cycle)}
              >
                <Text style={[styles.cycleChipText, billingCycle === cycle && styles.cycleChipTextActive]}>
                  {t(`subscriptionManager.cycle.${cycle}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t('subscriptionManager.fieldNextRenewal')}</Text>
          <TextInput
            style={styles.input}
            value={nextRenewalDate}
            onChangeText={setNextRenewalDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.colors.textTertiary}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t('subscriptionManager.fieldNotes')}</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('subscriptionManager.fieldNotesPlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            multiline
            numberOfLines={3}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={theme.colors.textInverse} />
          ) : (
            <>
              <Ionicons name="checkmark" size={20} color={theme.colors.textInverse} />
              <Text style={styles.saveButtonText}>{t('common.save')}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
    gap: theme.spacing[4],
  },
  section: {
    gap: theme.spacing[2],
  },
  label: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top' as const,
    paddingTop: theme.spacing[3],
  },
  cycleRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  cycleChip: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cycleChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  cycleChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  cycleChipTextActive: {
    color: theme.colors.textInverse,
  },
  saveButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing[4],
    marginTop: theme.spacing[2],
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
});
