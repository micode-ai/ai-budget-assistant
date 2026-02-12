import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { helpContent, type HelpLanguage } from '@/help/content';
import { sectionsMeta } from '@/help/sections';

export default function HelpIndexScreen() {
  const { i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const lang = (Object.keys(helpContent).includes(i18n.language)
    ? i18n.language
    : 'en') as HelpLanguage;

  const sections = helpContent[lang];
  const indexSection = sections.find((s) => s.id === '00-index');
  const articleSections = sections.filter((s) => s.id !== '00-index');

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {indexSection && (
          <Text style={styles.headerDescription}>{indexSection.description}</Text>
        )}

        {articleSections.map((section) => {
          const meta = sectionsMeta.find((m) => m.id === section.id);
          const accentColor = meta?.color || theme.colors.primary;

          return (
            <TouchableOpacity
              key={section.id}
              style={styles.card}
              onPress={() => router.push(`/help/${section.id}` as any)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: accentColor + '15' },
                ]}
              >
                <Ionicons
                  name={meta?.icon || 'document-text-outline'}
                  size={22}
                  color={accentColor}
                />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {section.title}
                </Text>
                <Text style={styles.cardDescription} numberOfLines={2}>
                  {section.description}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.colors.textTertiary}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1 as const,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1 as const,
  },
  content: {
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[10],
  },
  headerDescription: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[5],
    lineHeight: 22,
  },
  card: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing[4],
    marginBottom: theme.spacing[3],
    gap: theme.spacing[3],
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  cardContent: {
    flex: 1 as const,
  },
  cardTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  cardDescription: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    lineHeight: 18,
  },
});
