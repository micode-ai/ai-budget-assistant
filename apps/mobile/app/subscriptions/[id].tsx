import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useUserSubscriptionStore } from '@/stores/userSubscriptionStore';
import { useAccountStore } from '@/stores/accountStore';
import type { BillingCycle } from '@budget/shared-types';

const BILLING_CYCLES: BillingCycle[] = ['monthly', 'yearly', 'quarterly', 'weekly'];

export default function SubscriptionDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const canEdit = useAccountStore((s) => s.canEdit());

  const { subscriptions, updateSubscription, deleteSubscription } = useUserSubscriptionStore();
  const sub = subscriptions.find((s) => s.id === id);

  const [name, setName] = useState(sub?.name || '');
  const [amount, setAmount] = useState(String(sub?.amount || ''));
  const [billingCycle, setBillingCycle] = useState<BillingCycle>((sub?.billingCycle as BillingCycle) || 'monthly');
  const [nextRenewalDate, setNextRenewalDate] = useState(sub?.nextRenewalDate || '');
  const [notes, setNotes] = useState(sub?.notes || '');
  const [isActive, setIsActive] = useState(sub?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sub) {
      setName(sub.name);
      setAmount(String(sub.amount));
      setBillingCycle(sub.billingCycle as BillingCycle);
      setNextRenewalDate(sub.nextRenewalDate);
      setNotes(sub.notes || '');
      setIsActive(sub.isActive);
    }
  }, [sub]);

  if (!sub) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.notFoundText}>{t('subscriptionManager.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

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
      await updateSubscription(id, {
        name: name.trim(),
        amount: amountNum,
        billingCycle,
        nextRenewalDate,
        notes: notes.trim() || null,
        isActive,
      });
      router.back();
    } catch (e) {
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    showAlert(
      t('subscriptionManager.deleteTitle'),
      t('subscriptionManager.deleteMessage', { name: sub.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () =>
            deleteSubscription(id)
              .then(() => router.back())
              .catch(() => showAlert(t('common.error'), t('errors.unknown'))),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        <View style={styles.section}>
          <Text style={styles.label}>{t('subscriptionManager.fieldName')}</Text>
          <TextInput
            style={[styles.input, !canEdit && styles.inputDisabled]}
            value={name}
            onChangeText={setName}
            editable={canEdit}
            placeholderTextColor={theme.colors.textTertiary}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t('subscriptionManager.fieldAmount')} ({sub.currencyCode})</Text>
          <TextInput
            style={[styles.input, !canEdit && styles.inputDisabled]}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            editable={canEdit}
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
                onPress={() => canEdit && setBillingCycle(cycle)}
                activeOpacity={canEdit ? 0.7 : 1}
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
            style={[styles.input, !canEdit && styles.inputDisabled]}
            value={nextRenewalDate}
            onChangeText={setNextRenewalDate}
            editable={canEdit}
            placeholderTextColor={theme.colors.textTertiary}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.activeRow}>
            <Text style={styles.label}>{t('subscriptionManager.fieldActive')}</Text>
            <Switch
              value={isActive}
              onValueChange={canEdit ? setIsActive : undefined}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              disabled={!canEdit}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t('subscriptionManager.fieldNotes')}</Text>
          <TextInput
            style={[styles.input, styles.notesInput, !canEdit && styles.inputDisabled]}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            editable={canEdit}
            placeholderTextColor={theme.colors.textTertiary}
          />
        </View>

        {sub.detectedFrom && (
          <View style={styles.detectedBanner}>
            <Ionicons name="information-circle-outline" size={16} color={theme.colors.textTertiary} />
            <Text style={styles.detectedText}>
              {t('subscriptionManager.detectedFrom', { source: sub.detectedFrom })}
            </Text>
          </View>
        )}

        {canEdit && (
          <View style={styles.actions}>
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

            <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
              <Text style={styles.deleteButtonText}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  notFoundText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
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
  inputDisabled: {
    opacity: 0.7,
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
  activeRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
  },
  detectedBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  detectedText: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    flex: 1,
  },
  actions: {
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
  saveButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing[4],
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
  deleteButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.danger,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing[3],
  },
  deleteButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.danger,
  },
});
