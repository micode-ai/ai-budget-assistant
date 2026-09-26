import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { helpContent, type HelpLanguage } from '@/help/content';
import { sectionsMeta } from '@/help/sections';
import { searchHelpSections } from '@/help/helpSearch';

export default function HelpIndexScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [query, setQuery] = useState('');

  const lang = (Object.keys(helpContent).includes(i18n.language)
    ? i18n.language
    : 'en') as HelpLanguage;

  const sections = helpContent[lang];
  const indexSection = sections.find((s) => s.id === '00-index');
  const articleSections = sections.filter((s) => s.id !== '00-index');

  const results = useMemo(
    () => searchHelpSections(articleSections, query),
    [articleSections, query]
  );
  const isSearching = query.trim() !== '';
  const hasNoMatches = isSearching && results.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {indexSection && !isSearching && (
          <Text style={styles.headerDescription}>{indexSection.description}</Text>
        )}

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={theme.colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={t('help.searchPlaceholder')}
            placeholderTextColor={theme.colors.textTertiary}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              accessibilityLabel={t('help.clearSearch')}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {hasNoMatches ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="help-circle-outline"
              size={40}
              color={theme.colors.textTertiary}
            />
            <Text style={styles.emptyTitle}>{t('help.noResults')}</Text>
            <Text style={styles.emptyBody}>{t('help.noResultsBody')}</Text>
            <TouchableOpacity
              style={styles.askButton}
              onPress={() => router.push('/(tabs)/chat')}
              activeOpacity={0.7}
            >
              <Ionicons name="chatbubbles-outline" size={18} color={theme.colors.textInverse} />
              <Text style={styles.askButtonText}>{t('help.askAssistant')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          results.map(({ section, tier, snippet }) => {
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
                    {tier === 'body' && snippet ? snippet : section.description}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.colors.textTertiary}
                />
              </TouchableOpacity>
            );
          })
        )}
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
  searchBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    height: 44,
    gap: theme.spacing[2],
    marginBottom: theme.spacing[4],
  },
  searchInput: {
    flex: 1 as const,
    ...theme.textStyles.body,
    color: theme.colors.textPrimary,
    padding: 0,
  },
  emptyState: {
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[8],
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[2],
  },
  emptyTitle: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing[2],
  },
  emptyBody: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center' as const,
    lineHeight: 18,
    marginBottom: theme.spacing[2],
  },
  askButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[5],
    gap: theme.spacing[2],
  },
  askButtonText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textInverse,
  },
});
