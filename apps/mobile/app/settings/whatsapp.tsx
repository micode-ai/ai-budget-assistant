import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';

interface WhatsAppStatus {
  linked: boolean;
  waPhoneNumber?: string;
  waProfileName?: string | null;
  linkedAt?: string;
}

interface LinkCodeState {
  code: string;
  expiresAt: string;
  waPhoneNumber: string;
}

export default function WhatsAppSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [linkCode, setLinkCode] = useState<LinkCodeState | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [codeLoading, setCodeLoading] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const result = await api.getWhatsAppLinkStatus();
      setStatus(result);
      if (result.linked) {
        setLinkCode(null);
      }
    } catch {
      // Ignore — feature may not be available yet
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useFocusEffect(
    useCallback(() => {
      loadStatus();
    }, [loadStatus]),
  );

  const handleGenerateCode = async () => {
    setCodeLoading(true);
    try {
      const result = await api.generateWhatsAppLinkCode();
      setLinkCode(result);
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setCodeLoading(false);
    }
  };

  const buildWaMeUrl = (waPhoneNumber: string, code: string) => {
    const phoneDigits = waPhoneNumber.replace(/^\+/, '');
    return `https://wa.me/${phoneDigits}?text=link%20${code}`;
  };

  const handleOpenWhatsApp = () => {
    if (!linkCode) return;
    const url = buildWaMeUrl(linkCode.waPhoneNumber, linkCode.code);
    Linking.openURL(url).catch(() => {
      Alert.alert(t('common.error'), t('errors.unknown'));
    });
  };

  const handleCopyCode = async () => {
    if (!linkCode) return;
    await Clipboard.setStringAsync(linkCode.code);
    Alert.alert('', t('whatsappBot.copyCode'));
  };

  const handleRefresh = async () => {
    setStatusLoading(true);
    await loadStatus();
  };

  const handleUnlink = () => {
    Alert.alert(
      t('whatsappBot.confirmDisconnect'),
      '',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('whatsappBot.disconnectButton'),
          style: 'destructive',
          onPress: async () => {
            setUnlinkLoading(true);
            try {
              await api.unlinkWhatsApp();
              setStatus({ linked: false });
              setLinkCode(null);
            } catch (e) {
              Alert.alert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
            } finally {
              setUnlinkLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('whatsappBot.title')}</Text>

          {statusLoading ? (
            <View style={[styles.card, styles.centered]}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : status?.linked ? (
            /* ── Linked state ── */
            <View style={styles.card}>
              <View style={styles.fieldRow}>
                <View style={styles.fieldInfo}>
                  <Text style={styles.fieldLabel}>
                    {t('whatsappBot.linkedAs', {
                      name: status.waProfileName ?? status.waPhoneNumber ?? '',
                    })}
                  </Text>
                  {status.waPhoneNumber && status.waProfileName && (
                    <Text style={styles.fieldDesc}>{status.waPhoneNumber}</Text>
                  )}
                </View>
                <Ionicons name="checkmark-circle" size={24} color={theme.colors.success} />
              </View>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.fieldRow}
                onPress={handleRefresh}
                disabled={statusLoading}
              >
                <Ionicons
                  name="refresh-outline"
                  size={18}
                  color={theme.colors.primary}
                  style={styles.actionIcon}
                />
                <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
                  {t('whatsappBot.refresh')}
                </Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.fieldRow}
                onPress={handleUnlink}
                disabled={unlinkLoading}
              >
                {unlinkLoading ? (
                  <ActivityIndicator size="small" color={theme.colors.danger} />
                ) : (
                  <>
                    <Ionicons
                      name="unlink-outline"
                      size={18}
                      color={theme.colors.danger}
                      style={styles.actionIcon}
                    />
                    <Text style={[styles.fieldLabel, { color: theme.colors.danger }]}>
                      {t('whatsappBot.disconnectButton')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Not linked state ── */
            <View style={styles.card}>
              {linkCode ? (
                <>
                  <Text style={[styles.fieldDesc, { marginBottom: theme.spacing[4] }]}>
                    {t('whatsappBot.codeInstructions')}
                  </Text>

                  {/* QR code */}
                  <View style={styles.qrContainer}>
                    <QRCode
                      value={buildWaMeUrl(linkCode.waPhoneNumber, linkCode.code)}
                      size={220}
                      backgroundColor={theme.colors.surface}
                      color={theme.colors.textPrimary}
                    />
                  </View>

                  {/* Code text */}
                  <View style={styles.codeBox}>
                    <Text style={styles.codeText}>{linkCode.code}</Text>
                  </View>

                  {/* Action buttons */}
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleOpenWhatsApp}
                  >
                    <Ionicons
                      name="logo-whatsapp"
                      size={20}
                      color="#ffffff"
                      style={styles.buttonIcon}
                    />
                    <Text style={styles.primaryButtonText}>{t('whatsappBot.openButton')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={handleCopyCode}
                  >
                    <Ionicons
                      name="copy-outline"
                      size={18}
                      color={theme.colors.primary}
                      style={styles.buttonIcon}
                    />
                    <Text style={styles.secondaryButtonText}>{t('whatsappBot.copyCode')}</Text>
                  </TouchableOpacity>

                  <View style={styles.divider} />

                  <TouchableOpacity style={styles.fieldRow} onPress={handleRefresh}>
                    <Ionicons
                      name="refresh-outline"
                      size={18}
                      color={theme.colors.primary}
                      style={styles.actionIcon}
                    />
                    <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
                      {t('whatsappBot.refresh')}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={[styles.fieldDesc, { marginBottom: theme.spacing[4] }]}>
                    {t('whatsappBot.subtitle')}
                  </Text>
                  <Text style={[styles.fieldDesc, { marginBottom: theme.spacing[3] }]}>
                    {t('whatsappBot.notLinked')}
                  </Text>
                  <TouchableOpacity
                    style={[styles.fieldRow, { justifyContent: 'center' }]}
                    onPress={handleGenerateCode}
                    disabled={codeLoading}
                  >
                    {codeLoading ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                      <>
                        <Ionicons
                          name="logo-whatsapp"
                          size={20}
                          color={theme.colors.primary}
                          style={styles.actionIcon}
                        />
                        <Text style={[styles.fieldLabel, { color: theme.colors.primary }]}>
                          {t('whatsappBot.connectButton')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
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
  },
  section: {
    marginBottom: theme.spacing[6],
  },
  sectionTitle: {
    ...theme.textStyles.label,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing[3],
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
  },
  centered: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: 80,
  },
  fieldRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    minHeight: 32,
  },
  fieldInfo: {
    flex: 1,
  },
  fieldLabel: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
  },
  fieldDesc: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[0.5],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginVertical: theme.spacing[3],
  },
  actionIcon: {
    marginRight: theme.spacing[2],
  },
  qrContainer: {
    alignItems: 'center' as const,
    marginBottom: theme.spacing[4],
    padding: theme.spacing[3],
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
  },
  codeBox: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[4],
    alignItems: 'center' as const,
  },
  codeText: {
    ...theme.textStyles.h2,
    color: theme.colors.textPrimary,
    letterSpacing: 6,
    textAlign: 'center' as const,
  },
  primaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#25D366',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[2],
  },
  primaryButtonText: {
    ...theme.textStyles.bodyMedium,
    color: '#ffffff',
  },
  secondaryButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    padding: theme.spacing[3],
    marginBottom: theme.spacing[3],
  },
  secondaryButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.primary,
  },
  buttonIcon: {
    marginRight: theme.spacing[2],
  },
});
