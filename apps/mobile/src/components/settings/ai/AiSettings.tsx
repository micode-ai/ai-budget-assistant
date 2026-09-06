import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { api } from '@/services/api';
import { SettingsScreenScroll } from '../SettingsScreenScroll';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * The AI screen's body: response mode and model, three chips each.
 *
 * Lifted out of `app/settings/ai.tsx` unchanged so the desktop settings shell
 * can host it - `src/` may not import from `app/`, so a route file is not
 * somewhere a pane can render from. The route is now a thin wrapper around
 * `SettingsRoute`, which is the one file that decides mobile vs desktop.
 *
 * Two differences from the original body, both mechanical and both required by
 * that hosting: the outer `SafeAreaView` is gone (`SettingsScreenFrame` supplies
 * it on the full-page path, with the same `edges={[]}` and the same
 * background), and the root `ScrollView` is `SettingsScreenScroll` - the same
 * `ScrollView` full-page, a plain `View` in a pane, because the shell owns the
 * page scroll and a nested scroller would be the second scrollbar the language
 * forbids.
 *
 * **Nothing hides in the layout.** An AI screen is where the voice extraction
 * found a route's only remaining-quota indicator declared as a `headerRight` in
 * `app/_layout.tsx` rather than in the route file, so this one was checked
 * before being moved: `settings/ai` declares `headerShown: true` and a `title`
 * and nothing else, and both `AiUsageBadge` header buttons in that file belong
 * to `expense/voice` and `income/voice`. `settings/ai-usage-details` is a
 * separate route reached from `app/subscription.tsx`, never from here, so no
 * affordance goes missing when this body is hosted somewhere other than a route.
 *
 * `themeChip`'s `flex: 1` is untouched, for the same reason it was on the
 * appearance screen: three chips across a viewport is the parent's fault, and
 * the bound is the registry's `width: 'form'` cap.
 */
export function AiSettings() {
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
    <SettingsScreenScroll style={styles.scrollView} contentContainerStyle={styles.content}>
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
    </SettingsScreenScroll>
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
