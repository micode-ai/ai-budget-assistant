import React, { useState, useEffect } from 'react';
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
import { api } from '@/services/api';

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

  const [mode, setMode] = useState<'email' | 'link' | 'search'>('link');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; email: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AccountRole>('editor');
  const [isLoading, setIsLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [searchInviteSent, setSearchInviteSent] = useState(false);
  const showUpgrade = useUpgradeStore((s) => s.show);

  useEffect(() => {
    if (mode !== 'search' || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const handle = setTimeout(() => {
      api
        .searchUsers(searchQuery.trim())
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [mode, searchQuery]);

  const handleInvite = async () => {
    if (!accountId) return;

    if (mode === 'email' && !email.trim()) {
      showAlert(t('errors.error'), t('accounts.emailRequired'));
      return;
    }
    if (mode === 'search' && !selectedUser) {
      showAlert(t('errors.error'), t('accounts.selectUserRequired'));
      return;
    }

    setIsLoading(true);
    try {
      const invitation = await inviteMember(accountId, {
        email: mode === 'email' ? email.trim() : undefined,
        invitedUserId: mode === 'search' ? selectedUser!.id : undefined,
        role,
      });
      if (mode === 'search') {
        setSearchInviteSent(true);
      } else {
        setInviteCode(invitation.inviteCode);
      }
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

  if (searchInviteSent) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.successContainer}>
          <Ionicons name="checkmark-circle" size={64} color={theme.colors.primary} />
          <Text style={styles.successTitle}>{t('accounts.inviteSent')}</Text>
          <Text style={styles.successSubtitle}>
            {t('accounts.inviteSentPush', { name: selectedUser?.name })}
          </Text>
          <TouchableOpacity style={styles.doneButton} onPress={() => router.back()}>
            <Text style={styles.doneButtonText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
              size={18}
              color={mode === 'link' ? theme.colors.primary : theme.colors.textTertiary}
            />
            <Text numberOfLines={1} style={[styles.modeText, mode === 'link' && styles.modeTextActive]}>
              {t('accounts.inviteByLink')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'email' && styles.modeButtonActive]}
            onPress={() => setMode('email')}
          >
            <Ionicons
              name="mail-outline"
              size={18}
              color={mode === 'email' ? theme.colors.primary : theme.colors.textTertiary}
            />
            <Text numberOfLines={1} style={[styles.modeText, mode === 'email' && styles.modeTextActive]}>
              {t('accounts.inviteByEmail')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeButton, mode === 'search' && styles.modeButtonActive]}
            onPress={() => setMode('search')}
          >
            <Ionicons
              name="search-outline"
              size={18}
              color={mode === 'search' ? theme.colors.primary : theme.colors.textTertiary}
            />
            <Text numberOfLines={1} style={[styles.modeText, mode === 'search' && styles.modeTextActive]}>
              {t('accounts.inviteBySearch')}
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

        {/* Search Input */}
        {mode === 'search' && (
          <>
            <Text style={styles.label}>{t('accounts.searchLabel')}</Text>
            <TextInput
              style={styles.input}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                setSelectedUser(null);
              }}
              placeholder={t('accounts.searchPlaceholder')}
              placeholderTextColor={theme.colors.textTertiary}
              autoCapitalize="none"
            />
            {isSearching && <ActivityIndicator style={{ marginTop: theme.spacing[3] }} color={theme.colors.primary} />}
            {!isSearching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
              <Text style={styles.searchEmptyText}>{t('accounts.searchNoResults')}</Text>
            )}
            {searchResults.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={[styles.searchResultRow, selectedUser?.id === u.id && styles.searchResultRowActive]}
                onPress={() => setSelectedUser(u)}
              >
                <View style={styles.searchResultAvatar}>
                  <Text style={styles.searchResultAvatarText}>{u.name[0]?.toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.searchResultName}>{u.name}</Text>
                  <Text style={styles.searchResultEmail}>{u.email}</Text>
                </View>
                {selectedUser?.id === u.id && (
                  <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} style={{ marginLeft: 'auto' }} />
                )}
              </TouchableOpacity>
            ))}
          </>
        )}

        {(mode !== 'search' || selectedUser) && (
          <>
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
          </>
        )}
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
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[1],
    gap: theme.spacing[1],
    marginBottom: theme.spacing[5],
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  modeButtonActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  modeText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    fontWeight: '500' as const,
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
  searchEmptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[3],
    textAlign: 'center' as const,
  },
  searchResultRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[3],
    marginTop: theme.spacing[2],
    gap: theme.spacing[3],
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  searchResultRowActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  searchResultAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  searchResultAvatarText: {
    color: theme.colors.textInverse,
    fontWeight: '600' as const,
  },
  searchResultName: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  searchResultEmail: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
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
