import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';

export default function RequestBankScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [bankName, setBankName] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [sending, setSending] = useState(false);

  const pickFile = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'application/pdf', '*/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    setFile({
      uri: asset.uri,
      name: asset.name ?? 'statement',
      type: asset.mimeType ?? 'application/octet-stream',
    });
  };

  const send = async () => {
    if (!bankName.trim()) {
      Alert.alert(t('bankImport.requestErrorNoName'));
      return;
    }
    setSending(true);
    try {
      await api.requestBank({ bankName: bankName.trim(), notes: notes.trim() || undefined, file: file ?? undefined });
      Alert.alert(t('bankImport.requestSent'));
      router.back();
    } catch (err) {
      Alert.alert(t('bankImport.requestError'), err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>{t('bankImport.requestIntro')}</Text>

        <Text style={styles.label}>{t('bankImport.requestBankName')}</Text>
        <TextInput
          style={styles.input}
          value={bankName}
          onChangeText={setBankName}
          placeholder={t('bankImport.requestBankNamePlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
        />

        <Text style={styles.label}>{t('bankImport.requestNotes')}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder={t('bankImport.requestNotesPlaceholder')}
          placeholderTextColor={theme.colors.textTertiary}
          multiline
          numberOfLines={4}
        />

        <TouchableOpacity style={styles.attachRow} onPress={pickFile} activeOpacity={0.7}>
          <Ionicons name="attach-outline" size={20} color={theme.colors.primary} />
          <View style={styles.attachTextWrap}>
            <Text style={styles.attachLabel}>
              {file ? t('bankImport.requestAttached', { name: file.name }) : t('bankImport.requestAttach')}
            </Text>
            {!file && <Text style={styles.attachHint}>{t('bankImport.requestAttachHint')}</Text>}
          </View>
          {file ? (
            <TouchableOpacity onPress={() => setFile(null)} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primary, (!bankName.trim() || sending) && { opacity: 0.4 }]}
          onPress={send}
          disabled={!bankName.trim() || sending}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator color={theme.colors.textInverse} />
          ) : (
            <Text style={styles.primaryText}>{t('bankImport.requestSend')}</Text>
          )}
        </TouchableOpacity>
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing[4], gap: theme.spacing[2] },
  intro: { ...theme.textStyles.body, color: theme.colors.textSecondary, marginBottom: theme.spacing[2] },
  label: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[3],
    marginBottom: theme.spacing[1],
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
    ...theme.textStyles.body,
  },
  textArea: { minHeight: 96, textAlignVertical: 'top' as const },
  attachRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[4],
    padding: theme.spacing[3],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  attachTextWrap: { flex: 1 },
  attachLabel: { ...theme.textStyles.body, color: theme.colors.textPrimary },
  attachHint: { ...theme.textStyles.caption, color: theme.colors.textTertiary, marginTop: 2 },
  primary: {
    marginTop: theme.spacing[4],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
  },
  primaryText: { ...theme.textStyles.bodyMedium, color: theme.colors.textInverse },
});
