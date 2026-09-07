import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils/alert';
import { SettingsScreenKeyboardScroll } from '../SettingsScreenKeyboardScroll';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { useEncryptionStore } from '@/stores/encryptionStore';
import { useAccountStore } from '@/stores/accountStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { SheetDialog } from '@/components/SheetDialog';

/**
 * Stable accessible-name id for the recovery-key sheet's title, wired to the
 * desktop dialog's `aria-labelledby`. A fixed id is safe for the same reason
 * `ExpenseDialog.tsx`'s is: only one instance of this sheet is ever mounted.
 */
const RECOVERY_KEY_SHEET_TITLE_ID = 'recovery-key-sheet-title';

/**
 * Security settings: end-to-end encryption setup, unlock, lock and reset.
 *
 * Moved out of `app/settings/security.tsx` unchanged so the desktop shell can
 * host it as a pane — `src/` may not import from `app/`. The route is now a
 * thin wrapper and the phone renders exactly the tree it rendered before: the
 * frame owns the `SafeAreaView` this file used to own, and
 * `SettingsScreenKeyboardScroll` is the same `KeyboardAwareScreen` full-page,
 * with every keyboard prop intact.
 *
 * Deliberately NOT keyed on `currentAccountId`. Its one mount effect reads
 * `GET /encryption/profile`, which is per-user, not per-account: the handler
 * takes `req.user.id`, `AccountContextGuard` is not even on that route, and
 * `UserEncryptionProfile` has no account column. `currentAccountId` is read
 * here through a live store selector at action time, so it tracks a switch
 * without a remount.
 *
 * ## The recovery-key sheet is a `SheetDialog`, and deliberately undismissable
 *
 * It shows the e2ee recovery key exactly once, with no way to see it again, so
 * it passes `dismissable={false}` — no `Esc`/Android-back/Apple-TV-menu close
 * and no desktop scrim-click close — AND `dismissOnScrimPress={false}`, since
 * the raw `Modal` this replaces never wired a tap on its dim backdrop to
 * anything either (a bare `View`, not a `TouchableOpacity`). Together the two
 * leave exactly one way out, on every surface: the "I've saved it" button,
 * same as it always was. `sheetStyle` restores the old corner radius and the
 * old flat bottom padding is now `insetFloor` (see `ProfileSettings.tsx`'s
 * timezone sheet for the identical reasoning) — the one documented pixel
 * change, and it is a fix, not a regression: a device with a gesture nav bar
 * now clears it instead of the key sitting partly behind it.
 */
export function SecuritySettings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const {
    isSetUp: e2eeSetUp,
    isUnlocked: e2eeUnlocked,
    isLoading: e2eeLoading,
    setupE2EE,
    unlock: unlockE2EE,
    lock: lockE2EE,
    enableAccountEncryption,
    resetE2EE,
    initialize: initializeE2EE,
  } = useEncryptionStore();
  const currentAccountId = useAccountStore((s) => s.currentAccountId);

  useEffect(() => {
    initializeE2EE();
  }, [initializeE2EE]);

  const [e2eePassphrase, setE2eePassphrase] = useState('');
  const [e2eePassphraseConfirm, setE2eePassphraseConfirm] = useState('');
  const [showRecoveryKey, setShowRecoveryKey] = useState<string | null>(null);
  const [showE2EESetup, setShowE2EESetup] = useState(false);
  const [showE2EEUnlock, setShowE2EEUnlock] = useState(false);

  const handleSetupE2EE = async () => {
    if (e2eePassphrase.length < 8) {
      showAlert(t('common.error'), t('encryption.passphraseMin'));
      return;
    }
    if (e2eePassphrase !== e2eePassphraseConfirm) {
      showAlert(t('common.error'), t('encryption.passphraseMismatch'));
      return;
    }
    try {
      const { recoveryKey } = await setupE2EE(e2eePassphrase);
      if (currentAccountId) {
        try {
          await enableAccountEncryption(currentAccountId, 1);
        } catch {
          // Non-critical
        }
      }
      setE2eePassphrase('');
      setE2eePassphraseConfirm('');
      setShowE2EESetup(false);
      setShowRecoveryKey(recoveryKey);
    } catch (e) {
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    }
  };

  const handleUnlockE2EE = async () => {
    if (!e2eePassphrase) return;
    try {
      await unlockE2EE(e2eePassphrase);
      if (currentAccountId) {
        try {
          await useEncryptionStore.getState().fetchAccountKey(currentAccountId);
        } catch {
          // Key may not exist yet
        }
      }
      setE2eePassphrase('');
      setShowE2EEUnlock(false);
      showAlert(t('common.success'), t('encryption.unlocked'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      showAlert(
        t('common.error'),
        t('encryption.unlockFailed') + (msg ? `\n\n${msg}` : ''),
      );
    }
  };

  const handleResetE2EE = () => {
    showAlert(
      t('encryption.resetTitle'),
      t('encryption.resetConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('encryption.resetButton'),
          style: 'destructive',
          onPress: async () => {
            try {
              await resetE2EE();
              showAlert(t('common.success'), t('encryption.resetSuccess'));
            } catch (e) {
              showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
            }
          },
        },
      ],
    );
  };

  const handleCopyRecoveryKey = async () => {
    if (showRecoveryKey) {
      await Clipboard.setStringAsync(showRecoveryKey);
      showAlert(t('common.success'), t('encryption.recoveryKeyCopied'));
    }
  };

  return (
    <>
      <SettingsScreenKeyboardScroll style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          {!e2eeSetUp ? (
            <>
              <View style={styles.fieldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>{t('encryption.e2ee')}</Text>
                  <Text style={styles.fieldDesc}>{t('encryption.e2eeDesc')}</Text>
                </View>
              </View>
              <View style={styles.divider} />
              {showE2EESetup ? (
                <View style={{ gap: theme.spacing[3] }}>
                  <Text style={styles.fieldDesc}>{t('encryption.passphraseHint')}</Text>
                  <TextInput
                    style={styles.editInput}
                    value={e2eePassphrase}
                    onChangeText={setE2eePassphrase}
                    placeholder={t('encryption.passphrasePlaceholder')}
                    placeholderTextColor={theme.colors.textTertiary}
                    secureTextEntry
                  />
                  <TextInput
                    style={styles.editInput}
                    value={e2eePassphraseConfirm}
                    onChangeText={setE2eePassphraseConfirm}
                    placeholder={t('encryption.passphraseConfirmPlaceholder')}
                    placeholderTextColor={theme.colors.textTertiary}
                    secureTextEntry
                  />
                  <TouchableOpacity
                    style={[styles.primaryButton, { opacity: e2eeLoading ? 0.7 : 1 }]}
                    onPress={handleSetupE2EE}
                    disabled={e2eeLoading}
                  >
                    {e2eeLoading && <ActivityIndicator size="small" color="#FFFFFF" />}
                    <Text style={styles.primaryButtonText}>
                      {e2eeLoading ? t('encryption.settingUp') : t('encryption.setup')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.fieldRow} onPress={() => setShowE2EESetup(true)}>
                  <View style={styles.fieldValueRow}>
                    <Ionicons name="lock-closed-outline" size={18} color={theme.colors.primary} />
                    <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>{t('encryption.setupE2EE')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              )}
            </>
          ) : e2eeUnlocked ? (
            <>
              <View style={styles.fieldRow}>
                <View style={styles.fieldValueRow}>
                  <Ionicons name="shield-checkmark" size={18} color={theme.colors.success} />
                  <Text style={styles.fieldLabel}>{t('encryption.e2ee')}</Text>
                </View>
                <Text style={[styles.fieldValue, { color: theme.colors.success }]}>{t('encryption.unlocked')}</Text>
              </View>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.fieldRow} onPress={lockE2EE}>
                <View style={styles.fieldValueRow}>
                  <Ionicons name="lock-open-outline" size={18} color={theme.colors.textSecondary} />
                  <Text style={styles.fieldLabel}>{t('encryption.lock')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.fieldRow}>
                <View style={styles.fieldValueRow}>
                  <Ionicons name="lock-closed" size={18} color={theme.colors.warning} />
                  <Text style={styles.fieldLabel}>{t('encryption.e2ee')}</Text>
                </View>
                <Text style={[styles.fieldValue, { color: theme.colors.warning }]}>{t('encryption.locked')}</Text>
              </View>
              <View style={styles.divider} />
              {showE2EEUnlock ? (
                <View style={{ gap: theme.spacing[3] }}>
                  <Text style={styles.fieldDesc}>{t('encryption.unlockDesc')}</Text>
                  <TextInput
                    style={styles.editInput}
                    value={e2eePassphrase}
                    onChangeText={setE2eePassphrase}
                    placeholder={t('encryption.passphrasePlaceholder')}
                    placeholderTextColor={theme.colors.textTertiary}
                    secureTextEntry
                    autoFocus
                  />
                  <TouchableOpacity
                    style={[styles.primaryButton, { opacity: e2eeLoading ? 0.7 : 1 }]}
                    onPress={handleUnlockE2EE}
                    disabled={e2eeLoading}
                  >
                    {e2eeLoading && <ActivityIndicator size="small" color="#FFFFFF" />}
                    <Text style={styles.primaryButtonText}>
                      {e2eeLoading ? t('encryption.unlocking') : t('encryption.unlockButton')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.fieldRow} onPress={() => setShowE2EEUnlock(true)}>
                  <View style={styles.fieldValueRow}>
                    <Ionicons name="key-outline" size={18} color={theme.colors.primary} />
                    <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>{t('encryption.unlock')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              )}
              <View style={styles.divider} />
              <TouchableOpacity style={styles.fieldRow} onPress={handleResetE2EE}>
                <View style={styles.fieldValueRow}>
                  <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                  <Text style={[styles.fieldLabel, { color: theme.colors.danger }]}>{t('encryption.resetButton')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </SettingsScreenKeyboardScroll>

      {/* Recovery Key — deliberately undismissable except by its own button;
          see the file-level comment above. */}
      <SheetDialog
        visible={showRecoveryKey !== null}
        onClose={() => setShowRecoveryKey(null)}
        titleId={RECOVERY_KEY_SHEET_TITLE_ID}
        dismissable={false}
        dismissOnScrimPress={false}
        padBottom={0}
        insetFloor={theme.spacing[6]}
        scrimColor="rgba(0,0,0,0.5)"
        sheetStyle={styles.recoveryKeySheetBox}
      >
        <View style={styles.modalHeader}>
          <Text nativeID={RECOVERY_KEY_SHEET_TITLE_ID} style={styles.modalTitle}>{t('encryption.recoveryKey')}</Text>
        </View>
        <View style={{ padding: theme.spacing[4], gap: theme.spacing[4] }}>
          <Text style={styles.fieldDesc}>{t('encryption.recoveryKeyDesc')}</Text>
          <View style={{
            backgroundColor: theme.colors.surfaceSecondary,
            borderRadius: theme.borderRadius.md,
            padding: theme.spacing[4],
          }}>
            <Text style={{
              fontFamily: 'monospace',
              fontSize: 16,
              color: theme.colors.textPrimary,
              textAlign: 'center' as const,
              letterSpacing: 1,
            }}>
              {showRecoveryKey}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.chip, styles.chipActive, { alignSelf: 'center' as const }]}
            onPress={handleCopyRecoveryKey}
          >
            <Ionicons name="copy-outline" size={16} color={theme.colors.primary} />
            <Text style={[styles.chipText, styles.chipTextActive]}>{t('common.copy')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setShowRecoveryKey(null)}
          >
            <Text style={styles.primaryButtonText}>
              {t('encryption.recoveryKeySaved')}
            </Text>
          </TouchableOpacity>
        </View>
      </SheetDialog>
    </>
  );
}

const createStyles = (theme: Theme) => ({
  scrollView: {
    flex: 1,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  fieldRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    minHeight: 32,
  },
  fieldLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },
  fieldValue: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  fieldDesc: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  fieldValueRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[2],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[3],
  },
  editInput: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[2],
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    width: '100%' as any,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing[3],
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600' as const,
    fontSize: 16,
  },
  chip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  chipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
  chipTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
  // Deviations from `SheetDialog`'s canonical sheet box, kept so the phone's
  // pixels do not move: this sheet predates the wrapper with its own bordered
  // header (below) rather than the wrapper's drag handle, at a tighter corner
  // radius, and its own inner `View` brings its own padding — so the sheet
  // itself must have none. The old flat `paddingBottom: theme.spacing[6]` is
  // now `insetFloor={theme.spacing[6]}` on the `SheetDialog` itself; see the
  // matching note on `ProfileSettings.tsx`'s timezone sheet.
  recoveryKeySheetBox: {
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    maxHeight: '70%' as const,
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  modalTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
});
