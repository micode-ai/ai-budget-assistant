import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useFasterCaptureSuggestion } from '@/hooks/useFasterCaptureSuggestion';
import { FasterCaptureOptions } from './FasterCaptureOptions';

/**
 * The phone presentation (native, and web below 1024px): a bottom sheet like
 * the What's New spotlight — a nudge, never a blocking centre-screen modal.
 */
export function FasterCaptureSheet() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { visible, options, choose, dismiss } = useFasterCaptureSuggestion();

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={dismiss} accessibilityLabel={t('captureSuggestion.notNow')} />
        {/* The system navigation bar overlays this window, so the bottom padding
            has to clear it — a fixed value left the last row unreachable on a
            three-button-nav device (ABA-483). */}
        <View style={[styles.sheet, { paddingBottom: theme.spacing[6] + insets.bottom }]}>
          <View style={styles.handle} />
          <ScrollView bounces={false}>
            <Text style={styles.title}>{t('captureSuggestion.title')}</Text>
            <Text style={styles.body}>{t('captureSuggestion.body')}</Text>
            <FasterCaptureOptions options={options} onChoose={choose} />
            <TouchableOpacity
              onPress={dismiss}
              style={styles.notNow}
              accessibilityRole="button"
              accessibilityLabel={t('captureSuggestion.notNow')}
            >
              <Text style={styles.notNowText}>{t('captureSuggestion.notNow')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  backdrop: {
    flex: 1 as const,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end' as const,
  },
  scrim: {
    flex: 1 as const,
  },
  sheet: {
    maxHeight: '85%' as const,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing[5],
    paddingTop: theme.spacing[3],
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  body: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[4],
    lineHeight: 21,
  },
  notNow: {
    alignSelf: 'center' as const,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    marginTop: theme.spacing[2],
  },
  notNowText: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textSecondary,
  },
});
