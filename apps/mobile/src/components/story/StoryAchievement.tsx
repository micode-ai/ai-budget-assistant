import React from 'react';
import { View, Text } from 'react-native';
import { useStyles, type Theme } from '@/theme';

interface StoryAchievementProps {
  title?: string;
  text?: string;
  icon?: string;
}

const GOLD_ACCENT = '#F5A623';
const GOLD_BACKGROUND_LIGHT = '#FFF9EE';
const GOLD_BACKGROUND_DARK = '#3D2E0A';

export function StoryAchievement({ title, text, icon }: StoryAchievementProps) {
  const styles = useStyles(createStyles);

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>{icon ?? '\uD83C\uDFC6'}</Text>
      </View>
      <View style={styles.content}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {text ? <Text style={styles.text}>{text}</Text> : null}
      </View>
      <View style={styles.shimmerAccent} />
    </View>
  );
}

const createStyles = (theme: Theme) => {
  const isDark = theme.colors.background === '#0F1117';
  const goldBackground = isDark ? GOLD_BACKGROUND_DARK : GOLD_BACKGROUND_LIGHT;

  return {
    container: {
      backgroundColor: goldBackground,
      borderRadius: theme.borderRadius.xl,
      borderWidth: 1,
      borderColor: GOLD_ACCENT,
      padding: theme.spacing[5],
      alignItems: 'center' as const,
      overflow: 'hidden' as const,
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.colors.surface,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: theme.spacing[3],
      borderWidth: 2,
      borderColor: GOLD_ACCENT,
    },
    icon: {
      fontSize: 32,
      lineHeight: 40,
    },
    content: {
      alignItems: 'center' as const,
      gap: theme.spacing[1],
    },
    title: {
      ...theme.textStyles.h3,
      color: theme.colors.textPrimary,
      textAlign: 'center' as const,
    },
    text: {
      ...theme.textStyles.bodySm,
      color: theme.colors.textSecondary,
      textAlign: 'center' as const,
      lineHeight: 20,
    },
    shimmerAccent: {
      position: 'absolute' as const,
      top: 0,
      right: 0,
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: GOLD_ACCENT,
      opacity: 0.05,
      transform: [{ translateX: 30 }, { translateY: -30 }],
    },
  };
};
