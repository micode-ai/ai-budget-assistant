import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles } from '@/theme';
import { createSharedResultStyles } from './sharedResultStyles';

interface HelpMatch {
  sectionId: string;
  sectionTitle: string;
  heading?: string;
}

/** `search_help` result: the help articles the answer was grounded in, each opening the in-app article. */
export function HelpSourcesResult({ data }: { data: Record<string, unknown> }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const styles = useStyles(createSharedResultStyles);
  const matches = ((data.matches as HelpMatch[]) || []).filter((m) => m && m.sectionId);

  if (matches.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="help-circle-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.headerText}>{t('chat.actionHelpSources')}</Text>
      </View>
      {matches.map((m) => (
        <TouchableOpacity
          key={m.sectionId}
          style={styles.listItem}
          accessibilityRole="link"
          onPress={() => router.push(`/help/${m.sectionId}` as never)}
        >
          <Text style={styles.listItemText} numberOfLines={1}>
            {m.sectionTitle}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      ))}
    </View>
  );
}
