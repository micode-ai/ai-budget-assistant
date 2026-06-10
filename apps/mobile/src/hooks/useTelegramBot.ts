import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as Clipboard from 'expo-clipboard';
import { showAlert } from '@/utils/alert';
import { api } from '@/services/api';

export function useTelegramBot() {
  const { t } = useTranslation();
  const [linked, setLinked] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const status = await api.getTelegramLinkStatus();
      setLinked(status.linked);
      setUsername(status.telegramUsername || null);
    } catch {
      // Ignore — telegram feature may not be available
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const generateCode = async () => {
    setLoading(true);
    try {
      const result = await api.generateTelegramLinkCode();
      setLinkCode(result.code);
      setBotUsername(result.botUsername);
    } catch (e) {
      showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    if (linkCode) {
      await Clipboard.setStringAsync(linkCode);
      showAlert(t('settings.telegram.codeCopied'));
    }
  };

  const unlink = () => {
    showAlert(
      t('settings.telegram.disconnect'),
      t('settings.telegram.disconnectConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.telegram.disconnect'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.unlinkTelegram();
              setLinked(false);
              setUsername(null);
              setLinkCode(null);
            } catch (e) {
              showAlert(t('common.error'), e instanceof Error ? e.message : t('errors.unknown'));
            }
          },
        },
      ],
    );
  };

  return { linked, username, linkCode, botUsername, loading, generateCode, copyCode, unlink };
}
