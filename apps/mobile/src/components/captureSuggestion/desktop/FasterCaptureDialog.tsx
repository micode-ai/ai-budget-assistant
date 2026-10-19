import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { DesktopDialogFrame } from '@/components/DesktopDialogFrame';
import { useFasterCaptureSuggestion } from '@/hooks/useFasterCaptureSuggestion';
import { FasterCaptureOptions } from '../FasterCaptureOptions';

/**
 * The desktop presentation (web, >= 1024px): the shared dialog frame sized to
 * its content. Reached only from `FasterCaptureSuggestion.web.tsx`.
 */
export function FasterCaptureDialog() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { visible, options, choose, dismiss } = useFasterCaptureSuggestion();

  if (!visible) return null;

  return (
    <DesktopDialogFrame
      title={t('captureSuggestion.title')}
      titleId="faster-capture-title"
      onRequestClose={dismiss}
      width={520}
      height="auto"
      footer={
        <View style={styles.footer}>
          <TouchableOpacity onPress={dismiss} style={styles.notNow} accessibilityRole="button">
            <Text style={[styles.notNowText, { color: theme.colors.textSecondary }]}>
              {t('captureSuggestion.notNow')}
            </Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.content}>
        <Text style={styles.body}>{t('captureSuggestion.body')}</Text>
        <FasterCaptureOptions options={options} onChoose={choose} />
      </View>
    </DesktopDialogFrame>
  );
}

const createStyles = (theme: Theme) => ({
  content: {
    padding: theme.spacing[5],
  },
  body: {
    ...theme.textStyles.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing[4],
    lineHeight: 21,
  },
  footer: {
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
  },
  notNow: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
  },
  notNowText: {
    ...theme.textStyles.bodyMedium,
  },
});
