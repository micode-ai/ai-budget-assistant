import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAccountStore } from '@/stores/accountStore';
import { useTranslation } from 'react-i18next';
import type { AccountRole } from '@budget/shared-types';
import * as Clipboard from 'expo-clipboard';

const ROLES: { role: AccountRole; icon: keyof typeof Ionicons.glyphMap }[] = [
  { role: 'editor', icon: 'pencil-outline' },
  { role: 'viewer', icon: 'eye-outline' },
];

export default function InviteScreen() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const { t } = useTranslation();
  const { inviteMember } = useAccountStore();

  const [mode, setMode] = useState<'email' | 'link'>('link');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AccountRole>('editor');
  const [isLoading, setIsLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const handleInvite = async () => {
    if (!accountId) return;

    if (mode === 'email' && !email.trim()) {
      Alert.alert(t('errors.error'), t('accounts.emailRequired'));
      return;
    }

    setIsLoading(true);
    try {
      const invitation = await inviteMember(accountId, {
        email: mode === 'email' ? email.trim() : undefined,
        role,
      });
      setInviteCode(invitation.inviteCode);
    } catch (e) {
      Alert.alert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (inviteCode) {
      await Clipboard.setStringAsync(inviteCode);
      Alert.alert(t('common.success'), t('accounts.codeCopied'));
    }
  };

  const handleShare = async () => {
    if (inviteCode) {
      await Share.share({
        message: t('accounts.inviteShareMessage', { code: inviteCode }),
      });
    }
  };

  if (inviteCode) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={64} color="#4ECDC4" />
          <Text style={styles.successTitle}>{t('accounts.inviteSent')}</Text>
          <Text style={styles.successSubtitle}>
            {mode === 'email'
              ? t('accounts.inviteSentEmail', { email })
              : t('accounts.shareCode')}
          </Text>

          <View style={styles.codeBox}>
            <Text style={styles.codeText}>{inviteCode}</Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionButton} onPress={handleCopyCode}>
              <Ionicons name="copy-outline" size={20} color="#4ECDC4" />
              <Text style={styles.actionButtonText}>{t('common.copy')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
              <Ionicons name="share-outline" size={20} color="#4ECDC4" />
              <Text style={styles.actionButtonText}>{t('common.share')}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => router.back()}
          >
            <Text style={styles.doneButtonText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Mode Selector */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'link' && styles.modeButtonActive]}
            onPress={() => setMode('link')}
          >
            <Ionicons
              name="link-outline"
              size={20}
              color={mode === 'link' ? '#4ECDC4' : '#999'}
            />
            <Text style={[styles.modeText, mode === 'link' && styles.modeTextActive]}>
              {t('accounts.inviteByLink')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'email' && styles.modeButtonActive]}
            onPress={() => setMode('email')}
          >
            <Ionicons
              name="mail-outline"
              size={20}
              color={mode === 'email' ? '#4ECDC4' : '#999'}
            />
            <Text style={[styles.modeText, mode === 'email' && styles.modeTextActive]}>
              {t('accounts.inviteByEmail')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Email Input */}
        {mode === 'email' && (
          <>
            <Text style={styles.label}>{t('accounts.inviteEmail')}</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder={t('accounts.emailPlaceholder')}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </>
        )}

        {/* Role Selector */}
        <Text style={styles.label}>{t('accounts.inviteRole')}</Text>
        <View style={styles.roleRow}>
          {ROLES.map((item) => (
            <TouchableOpacity
              key={item.role}
              style={[
                styles.roleCard,
                role === item.role && styles.roleCardActive,
              ]}
              onPress={() => setRole(item.role)}
            >
              <Ionicons
                name={item.icon}
                size={24}
                color={role === item.role ? '#4ECDC4' : '#999'}
              />
              <Text
                style={[
                  styles.roleLabel,
                  role === item.role && styles.roleLabelActive,
                ]}
              >
                {t(`accounts.roles.${item.role}`)}
              </Text>
              <Text style={styles.roleDescription}>
                {t(`accounts.roleDescriptions.${item.role}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
          onPress={handleInvite}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>{t('accounts.sendInvite')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    gap: 6,
  },
  modeButtonActive: {
    borderColor: '#4ECDC4',
    backgroundColor: '#f0faf9',
  },
  modeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
  },
  modeTextActive: {
    color: '#4ECDC4',
    fontWeight: '600',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  roleCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    gap: 6,
  },
  roleCardActive: {
    borderColor: '#4ECDC4',
    backgroundColor: '#f0faf9',
  },
  roleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
  },
  roleLabelActive: {
    color: '#4ECDC4',
    fontWeight: '600',
  },
  roleDescription: {
    fontSize: 11,
    color: '#aaa',
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Success state
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
    marginTop: 16,
  },
  successSubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  codeBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 16,
    marginTop: 24,
  },
  codeText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    letterSpacing: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#f0faf9',
    borderRadius: 20,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4ECDC4',
  },
  doneButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    paddingHorizontal: 48,
    paddingVertical: 14,
    marginTop: 32,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
