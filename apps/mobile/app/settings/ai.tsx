import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';

type IconName = keyof typeof Ionicons.glyphMap;

export default function AiSettingsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { user, updateUser } = useAuthStore();

  const [aiResponseMode, setAiResponseMode] = useState(user?.aiResponseMode || 'balanced');
  const [aiModel, setAiModel] = useState(user?.aiModel || 'balanced');

  const handleAiResponseModeChange = async (newMode: string) => {
    if (newMode === aiResponseMode) return;
    setAiResponseMode(newMode as typeof aiResponseMode);
    try {
      await api.updateAiResponseMode(newMode);
      updateUser({ aiResponseMode: newMode as any });
    } catch {
      setAiResponseMode(aiResponseMode);
    }
  };

  const handleAiModelChange = async (newModel: string) => {
    if (newModel === aiModel) return;
    const oldModel = aiModel;
    setAiModel(newModel as typeof aiModel);
    try {
      await api.updateAiModel(newModel);
      updateUser({ aiModel: newModel as any });
    } catch {
      setAiModel(oldModel);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* AI Response Mode */}
        <Text style={styles.sectionTitle}>{t('settings.aiResponseMode')}</Text>
        <View style={styles.themeRow}>
          {([
            { key: 'simple', icon: 'chatbubble-ellipses-outline' as IconName, label: t('settings.aiResponseModeSimple') },
            { key: 'balanced', icon: 'options-outline' as IconName, label: t('settings.aiResponseModeBalanced') },
            { key: 'expert', icon: 'stats-chart-outline' as IconName, label: t('settings.aiResponseModeExpert') },
          ]).map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.themeChip, aiResponseMode === item.key && styles.themeChipActive]}
              onPress={() => handleAiResponseModeChange(item.key)}
            >
              <Ionicons
                name={item.icon}
                size={18}
                color={aiResponseMode === item.key ? theme.colors.primary : theme.colors.textTertiary}
              />
              <Text style={[styles.themeChipText, aiResponseMode === item.key && styles.themeChipTextActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* AI Model */}
        <Text style={styles.sectionTitle}>{t('settings.aiModel')}</Text>
        <View style={styles.themeRow}>
          {([
            { key: 'fast', icon: 'flash-outline' as IconName, label: t('settings.aiModelFast'), cost: '×0.75' },
            { key: 'balanced', icon: 'options-outline' as IconName, label: t('settings.aiModelBalanced'), cost: '×1' },
            { key: 'quality', icon: 'sparkles-outline' as IconName, label: t('settings.aiModelQuality'), cost: '×1.5' },
          ]).map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.themeChip, aiModel === item.key && styles.themeChipActive]}
              onPress={() => handleAiModelChange(item.key)}
            >
              <Ionicons
                name={item.icon}
                size={18}
                color={aiModel === item.key ? theme.colors.primary : theme.colors.textTertiary}
              />
              <Text style={[styles.themeChipText, aiModel === item.key && styles.themeChipTextActive]} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={{ fontSize: 10, color: aiModel === item.key ? theme.colors.primary : theme.colors.textTertiary, marginTop: 2 }}>
                {item.cost} {t('settings.aiModelCost')}
              </Text>
            </TouchableOpacity>
          ))}
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
  sectionTitle: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  themeRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[2],
  },
  themeChip: {
    flex: 1,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[1],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2.5],
    paddingHorizontal: theme.spacing[1.5],
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  themeChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  themeChipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
  },
  themeChipTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
});
