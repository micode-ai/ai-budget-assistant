import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { usePurchaseRequestStore } from '@/stores/purchaseRequestStore';
import { useTheme } from '@/theme';
import { useAuthStore } from '@/stores/authStore';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';

export default function NewPurchaseRequestScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const baseCurrency = useAuthStore(s => s.user?.currencyCode ?? 'USD');
  const { createRequest, updateRequest, requests } = usePurchaseRequestStore();

  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const existing = editId ? requests.find(r => r.id === editId) : undefined;
  const isEdit = !!editId;

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<string>(baseCurrency);
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setAmount(String(existing.amount));
      setCurrency(existing.currency);
      setMerchant(existing.merchant ?? '');
      setDescription(existing.description ?? '');
    }
  }, [existing?.id]);

  const canSave = title.trim().length > 0 && parseFloat(amount) > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      if (isEdit && editId) {
        await updateRequest(editId, {
          title: title.trim(),
          amount: parseFloat(amount),
          currency,
          merchant: merchant.trim() || undefined,
          description: description.trim() || undefined,
        });
      } else {
        await createRequest({
          title: title.trim(),
          amount: parseFloat(amount),
          currency,
          merchant: merchant.trim() || undefined,
          description: description.trim() || undefined,
        });
      }
      router.back();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('errors.unknown');
      Alert.alert(t('errors.error'), message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAwareScreen contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]}>
      {isEdit ? <Stack.Screen options={{ title: t('purchaseRequests.editTitle') }} /> : null}
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
          {t('purchaseRequests.titleLabel')} *
        </Text>
        <TextInput
          style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
          value={title}
          onChangeText={setTitle}
          placeholderTextColor={theme.colors.textSecondary}
        />

        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
          {t('purchaseRequests.amountLabel')} *
        </Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.amountInput, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={theme.colors.textSecondary}
          />
          <TextInput
            style={[styles.input, styles.currencyInput, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
            value={currency}
            onChangeText={setCurrency}
            autoCapitalize="characters"
            maxLength={3}
            placeholderTextColor={theme.colors.textSecondary}
          />
        </View>

        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
          {t('expenses.merchant')}
        </Text>
        <TextInput
          style={[styles.input, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
          value={merchant}
          onChangeText={setMerchant}
          placeholderTextColor={theme.colors.textSecondary}
        />

        <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
          {t('purchaseRequests.voteComment')}
        </Text>
        <TextInput
          style={[styles.input, styles.multiline, { color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          placeholderTextColor={theme.colors.textSecondary}
        />
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: canSave && !isSaving ? theme.colors.primary : theme.colors.border }]}
        onPress={handleSave}
        disabled={!canSave || isSaving}
      >
        <Text style={styles.saveBtnText}>
          {isSaving ? '...' : t('common.save')}
        </Text>
      </TouchableOpacity>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  card: { borderRadius: 12, padding: 16, gap: 12 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: -4 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  amountInput: { flex: 2 },
  currencyInput: { flex: 1, textAlign: 'center' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8 },
  saveBtn: { borderRadius: 12, padding: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
