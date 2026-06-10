import { useState, useEffect, useCallback } from 'react';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { showAlert } from '@/utils/alert';
import { api } from '@/services/api';

const API_ORIGIN = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1').replace(
  /\/api(\/v1)?\/?$/,
  '',
);

export interface SlackStatus {
  linked: boolean;
  slackProfileName?: string;
  linkedAt?: string;
}

export interface SlackLinkCode {
  code: string;
  expiresAt: string;
}

export function useSlackBot() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [linkCode, setLinkCode] = useState<SlackLinkCode | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [codeLoading, setCodeLoading] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const result = await api.getSlackLinkStatus();
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
      const result = await api.generateSlackLinkCode();
      setLinkCode(result);
    } catch (e) {
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setCodeLoading(false);
    }
  };

  const copyCode = async () => {
    if (!linkCode) return;
    await Clipboard.setStringAsync(linkCode.code);
    showAlert('', t('slackBot.copyCode'));
  };

  const refresh = async () => {
    setStatusLoading(true);
    await loadStatus();
  };

  const openSlack = () => {
    Linking.canOpenURL('slack://open').then((supported) => {
      if (supported) {
        Linking.openURL('slack://open').catch(() => {
          showAlert(t('common.error'), t('errors.unknown'));
        });
      }
    });
  };

  const addToSlack = () => {
    Linking.openURL(`${API_ORIGIN}/slack/install`).catch(() => {
      showAlert(t('common.error'), t('errors.unknown'));
    });
  };

  const unlink = () => {
    showAlert(
      t('slackBot.confirmDisconnect'),
      '',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('slackBot.disconnectButton'),
          style: 'destructive',
          onPress: async () => {
            setUnlinkLoading(true);
            try {
              await api.unlinkSlack();
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

  return {
    status,
    linkCode,
    statusLoading,
    codeLoading,
    unlinkLoading,
    generateCode,
    copyCode,
    refresh,
    openSlack,
    addToSlack,
    unlink,
  };
}
