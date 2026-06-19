import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Share,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAccountStore } from '@/stores/accountStore';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { AccountRole } from '@budget/shared-types';
import * as Clipboard from 'expo-clipboard';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { useUpgradeStore } from '@/stores/upgradeStore';

const ROLES: { role: AccountRole; icon: keyof typeof Ionicons.glyphMap }[] = [
  { role: 'editor', icon: 'pencil-outline' },
  { role: 'viewer', icon: 'eye-outline' },
];

export default function InviteScreen() {
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { inviteMember } = useAccountStore();

  const [mode, setMode] = useState<'email' | 'link'>('link');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AccountRole>('editor');
  const [isLoading, setIsLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const showUpgrade = useUpgradeStore((s) => s.show);

  const handleInvite = async () => {
    if (!accountId) return;

    if (mode === 'email' && !email.trim()) {
      showAlert(t('errors.error'), t('accounts.emailRequired'));
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
      if ((e as { status?: number }).status === 403) {
        showUpgrade(t('subscription.limitReachedBody'), 'pro');
      } else {
        showAlert(t('errors.error'), e instanceof Error ? e.message : t('errors.unknown'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (inviteCode) {
      await Clipboard.setStringAsync(inviteCode);
      showAlert(t('common.success'), t('accounts.codeCopied'));
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
          <Ionicons name="checkmark-circle" size={64} color={theme.colors.primary} />
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
              <Ionicons name="copy-outline" size={20} color={theme.colors.primary} />
              <Text style={styles.actionButtonText}>{t('common.copy')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
              <Ionicons name="share-outline" size={20} color={theme.colors.primary} />
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
      <KeyboardAwareScreen style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Mode Selector */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'link' && styles.modeButtonActive]}
            onPress={() => setMode('link')}
          >
            <Ionicons
              name="link-outline"
              size={20}
              color={mode === 'link' ? theme.colors.primary : theme.colors.textTertiary}
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
              color={mode === 'email' ? theme.colors.primary : theme.colors.textTertiary}
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
              placeholderTextColor={theme.colors.textTertiary}
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
                color={role === item.role ? theme.colors.primary : theme.colors.textTertiary}
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
            <ActivityIndicator color={theme.colors.textInverse} />
          ) : (
            <Text style={styles.submitButtonText}>{t('accounts.sendInvite')}</Text>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[5],
  },
  modeRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
    marginBottom: theme.spacing[5],
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3.5],
    borderWidth: 2,
    borderColor: theme.colors.border,
    gap: theme.spacing[1.5],
  },
  modeButtonActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  modeText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textTertiary,
  },
  modeTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  label: {
    ...theme.textStyles.label,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[2],
    marginTop: theme.spacing[4],
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
  roleRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  roleCard: {
    flex: 1,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    borderWidth: 2,
    borderColor: theme.colors.border,
    gap: theme.spacing[1.5],
  },
  roleCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  roleLabel: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textTertiary,
  },
  roleLabelActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  roleDescription: {
    ...theme.textStyles.caption,
    color: theme.colors.textDisabled,
    textAlign: 'center' as const,
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
  // Success state
  successContainer: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[10],
  },
  successTitle: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[4],
  },
  successSubtitle: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    marginTop: theme.spacing[2],
  },
  codeBox: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[8],
    paddingVertical: theme.spacing[4],
    marginTop: theme.spacing[6],
  },
  codeText: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: theme.colors.textPrimary,
    letterSpacing: 4,
  },
  actionRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[4],
    marginTop: theme.spacing[5],
  },
  actionButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing[5],
    paddingVertical: theme.spacing[2.5],
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius['2xl'],
    gap: theme.spacing[1.5],
  },
  actionButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  doneButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[12],
    paddingVertical: theme.spacing[3.5],
    marginTop: theme.spacing[8],
  },
  doneButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textInverse,
  },
});
