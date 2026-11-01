import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { copyValue } from '@/features/developers/developerApps';

interface Props {
  label: string;
  value: string;
  /** Monospace and wrapped anywhere — for tokens, which have no word breaks. */
  mono?: boolean;
}

/**
 * A labelled, selectable value with a copy button that confirms for two seconds. When the clipboard
 * refuses, it says so and the value stays selectable for a manual copy - never a silent failure.
 */
export function CopyField({ label, value, mono = true }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copied = status === 'copied';

  useEffect(() => {
    if (status !== 'copied') return;
    const timer = setTimeout(() => setStatus('idle'), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  const copy = async () => {
    setStatus(await copyValue(Clipboard.setStringAsync, value));
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueBox}>
        <Text style={[styles.value, mono && styles.mono]} selectable>
          {value}
        </Text>
        <TouchableOpacity
          style={styles.copyButton}
          onPress={copy}
          accessibilityRole="button"
          accessibilityLabel={`${t('common.copy')} ${label}`}
        >
          <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={theme.colors.primary} />
          <Text style={styles.copyText}>{copied ? t('developerApps.copied') : t('common.copy')}</Text>
        </TouchableOpacity>
      </View>
      {status === 'failed' ? (
        <Text style={styles.failed} accessibilityLiveRegion="polite">
          {t('developerApps.copyFailed')}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  field: { gap: theme.spacing[1.5] },
  label: { ...theme.textStyles.label, color: theme.colors.textTertiary },
  valueBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2.5],
  },
  value: { ...theme.textStyles.bodySm, color: theme.colors.textPrimary, flex: 1 },
  // Tokens have no word breaks; on web let them wrap anywhere instead of overflowing the pane.
  mono: { fontFamily: 'monospace', ...(Platform.OS === 'web' ? { wordBreak: 'break-all' } : {}) } as object,
  copyButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    minHeight: 36,
  },
  copyText: { ...theme.textStyles.bodySmMedium, color: theme.colors.primary },
  failed: { ...theme.textStyles.bodySm, color: theme.colors.danger },
});
