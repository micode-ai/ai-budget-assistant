import React, { useMemo } from 'react';
import { View, Text, ScrollView, Image, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-native-markdown-display';
import { useTheme, useStyles, type Theme } from '@/theme';
import { helpContent, type HelpLanguage } from '@/help/content';
import helpImages from '@/help/images';

function HelpImage({ src, alt }: { src: string; alt?: string }) {
  const { width: screenWidth } = useWindowDimensions();
  const imageWidth = screenWidth - 32;
  const imageHeight = imageWidth * 0.75;

  const match = src.match(/\{\{IMG:(.+?)\}\}/);
  if (!match) return null;

  const filename = match[1];
  const source = helpImages[filename];
  if (!source) return null;

  return (
    <View style={{ marginVertical: 12, alignItems: 'center' as const }}>
      <Image
        source={source}
        style={{
          width: imageWidth,
          height: imageHeight,
          borderRadius: 12,
        }}
        resizeMode="contain"
        accessibilityLabel={alt || filename}
      />
    </View>
  );
}

export default function HelpArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);

  const lang = (Object.keys(helpContent).includes(i18n.language)
    ? i18n.language
    : 'en') as HelpLanguage;

  const section = helpContent[lang]?.find((s) => s.id === id);

  const markdownStyles = useMemo(
    () => ({
      body: {
        color: theme.colors.textPrimary,
        fontSize: 15,
        lineHeight: 24,
      },
      heading1: {
        color: theme.colors.textPrimary,
        fontWeight: 'bold' as const,
        fontSize: 26,
        marginTop: 24,
        marginBottom: 12,
      },
      heading2: {
        color: theme.colors.textPrimary,
        fontWeight: '600' as const,
        fontSize: 21,
        marginTop: 20,
        marginBottom: 10,
      },
      heading3: {
        color: theme.colors.textPrimary,
        fontWeight: '600' as const,
        fontSize: 17,
        marginTop: 16,
        marginBottom: 8,
      },
      paragraph: {
        marginVertical: 6,
      },
      blockquote: {
        backgroundColor: theme.colors.surfaceSecondary,
        borderLeftColor: theme.colors.primary,
        borderLeftWidth: 4,
        paddingLeft: 12,
        paddingVertical: 8,
        marginVertical: 12,
        borderRadius: 4,
      },
      code_inline: {
        backgroundColor: theme.colors.surfaceSecondary,
        color: theme.colors.primary,
        fontSize: 13,
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
      },
      table: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        marginVertical: 12,
      },
      thead: {
        backgroundColor: theme.colors.surfaceSecondary,
      },
      th: {
        padding: 8,
        fontWeight: '600' as const,
        borderWidth: 0.5,
        borderColor: theme.colors.border,
      },
      td: {
        padding: 8,
        borderWidth: 0.5,
        borderColor: theme.colors.border,
      },
      bullet_list: {
        marginVertical: 6,
      },
      ordered_list: {
        marginVertical: 6,
      },
      list_item: {
        marginVertical: 3,
      },
      strong: {
        fontWeight: '600' as const,
      },
      em: {
        fontStyle: 'italic' as const,
      },
      hr: {
        backgroundColor: theme.colors.divider,
        height: 1,
        marginVertical: 16,
      },
    }),
    [theme]
  );

  const rules = useMemo(
    () => ({
      image: (node: any) => {
        const src = node.attributes?.src || '';
        const alt = node.attributes?.alt || '';
        return <HelpImage key={node.key} src={src} alt={alt} />;
      },
    }),
    []
  );

  if (!section) {
    return (
      <SafeAreaView style={styles.container} edges={[]}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Section not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: section.title }} />
      <SafeAreaView style={styles.container} edges={[]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Markdown style={markdownStyles} rules={rules}>
            {section.body}
          </Markdown>
        </ScrollView>
      </SafeAreaView>
    </>
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
  emptyContainer: {
    flex: 1 as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  emptyText: {
    ...theme.textStyles.body,
    color: theme.colors.textTertiary,
  },
});
