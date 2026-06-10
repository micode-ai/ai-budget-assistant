import { useState, useEffect, useCallback } from 'react';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { api } from '@/services/api';

export interface WhatsAppStatus {
  linked: boolean;
  waPhoneNumber?: string;
  waProfileName?: string | null;
  linkedAt?: string;
}

export interface WhatsAppLinkCode {
  code: string;
  expiresAt: string;
  waPhoneNumber: string;
}

export function useWhatsAppBot() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [linkCode, setLinkCode] = useState<WhatsAppLinkCode | null>(null);
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

  const generateCode = async () => {
    setCodeLoading(true);
    try {
      const result = await api.generateWhatsAppLinkCode();
      setLinkCode(result);
    } catch (e) {
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setCodeLoading(false);
    }
  };

  const buildWaMeUrl = (waPhoneNumber: string, code: string) => {
    const phoneDigits = waPhoneNumber.replace(/^\+/, '');
    return `https://wa.me/${phoneDigits}?text=link%20${code}`;
  };

  const openWhatsApp = () => {
    if (!linkCode) return;
    const url = buildWaMeUrl(linkCode.waPhoneNumber, linkCode.code);
    Linking.openURL(url).catch(() => {
      showAlert(t('common.error'), t('errors.unknown'));
    });
  };

  const copyCode = async () => {
    if (!linkCode) return;
    await Clipboard.setStringAsync(linkCode.code);
    showAlert('', t('whatsappBot.copyCode'));
  };

  const refresh = async () => {
    setStatusLoading(true);
    await loadStatus();
  };

  const unlink = () => {
    showAlert(
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
              showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
            } finally {
              setUnlinkLoading(false);
            }
          },
        },
      ],
    );
  };

  const getQrUrl = () =>
    linkCode ? buildWaMeUrl(linkCode.waPhoneNumber, linkCode.code) : '';

  return {
    status,
    linkCode,
    statusLoading,
    codeLoading,
    unlinkLoading,
    generateCode,
    openWhatsApp,
    copyCode,
    refresh,
    unlink,
    getQrUrl,
  };
}
