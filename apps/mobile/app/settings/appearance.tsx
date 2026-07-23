import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/stores/themeStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { SUPPORTED_LANGUAGES, changeLanguage } from '@/i18n';
import { DEFAULT_ACCENT, PRESET_ACCENTS } from '@/theme/presetAccents';
import { ColorPicker } from '@/components/ColorPicker';

type IconName = keyof typeof Ionicons.glyphMap;

export default function AppearanceSettingsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { mode, setMode, accent, customAccent, setAccent, setCustomAccent } = useThemeStore();
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const activeAccent = accent ?? DEFAULT_ACCENT;
  const isCustom = accent !== null && !PRESET_ACCENTS.includes(accent);

  const handleLanguageChange = async (langCode: string) => {
    if (langCode === i18n.language) return;
    await changeLanguage(langCode);
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Language */}
        <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
        <View style={styles.langGrid}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={[styles.langChip, i18n.language === lang.code && styles.chipActive]}
              onPress={() => handleLanguageChange(lang.code)}
            >
              <Text style={[styles.chipText, i18n.language === lang.code && styles.chipTextActive]}>
                {lang.flag}
              </Text>
              <Text style={[styles.chipText, i18n.language === lang.code && styles.chipTextActive]}>
                {lang.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Theme */}
        <Text style={styles.sectionTitle}>{t('settings.appearance')}</Text>
        <View style={styles.themeRow}>
          {([
            { key: 'system' as const, icon: 'phone-portrait-outline' as IconName, label: t('settings.system') },
            { key: 'light' as const, icon: 'sunny-outline' as IconName, label: t('settings.light') },
            { key: 'dark' as const, icon: 'moon-outline' as IconName, label: t('settings.dark') },
          ]).map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.themeChip, mode === item.key && styles.themeChipActive]}
              onPress={() => setMode(item.key)}
            >
              <Ionicons
                name={item.icon}
                size={18}
                color={mode === item.key ? theme.colors.primary : theme.colors.textTertiary}
              />
              <Text style={[styles.themeChipText, mode === item.key && styles.themeChipTextActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Accent */}
        <Text style={styles.sectionTitle}>{t('settings.accentColor')}</Text>
        <View style={styles.swatchGrid}>
          {/* Default swatch */}
          <TouchableOpacity
            style={[styles.swatch, { backgroundColor: DEFAULT_ACCENT }, accent === null && styles.swatchActive]}
            onPress={() => setAccent(null)}
            accessibilityLabel={t('settings.accentDefault')}
          >
            {accent === null && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
          </TouchableOpacity>

          {/* Preset swatches */}
          {PRESET_ACCENTS.map((hex) => (
            <TouchableOpacity
              key={hex}
              style={[styles.swatch, { backgroundColor: hex }, accent === hex && styles.swatchActive]}
              onPress={() => setAccent(hex)}
            >
              {accent === hex && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </TouchableOpacity>
          ))}

          {/* Custom swatch */}
          <TouchableOpacity
            style={[
              styles.swatch,
              styles.customSwatch,
              { backgroundColor: customAccent ?? theme.colors.surfaceSecondary },
              isCustom && styles.swatchActive,
            ]}
            onPress={() => setPickerOpen(true)}
            accessibilityLabel={t('settings.customColor')}
          >
            <Ionicons
              name={isCustom ? 'checkmark' : 'add'}
              size={16}
              color={customAccent ? '#FFFFFF' : theme.colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <Modal visible={pickerOpen} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalSheet, { paddingBottom: insets.bottom + theme.spacing[4] }]}>
              <View style={styles.sheetHandle} />
              <ColorPicker
                initialColor={customAccent ?? activeAccent}
                onApply={(hex) => { setCustomAccent(hex); setAccent(hex); }}
                onReset={() => { setAccent(null); setPickerOpen(false); }}
                onClose={() => setPickerOpen(false)}
              />
            </View>
          </View>
        </Modal>
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
  langGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[2],
  },
  langChip: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1],
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderWidth: 2,
    borderColor: theme.colors.border,
    width: '48.5%' as unknown as number,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  chipText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textTertiary,
  },
  chipTextActive: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
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
  swatchGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: theme.spacing[3],
    marginTop: theme.spacing[1],
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: {
    borderColor: theme.colors.textPrimary,
  },
  customSwatch: {
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.border,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'flex-end' as const,
  },
  modalSheet: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  sheetHandle: {
    alignSelf: 'center' as const,
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing[2],
  },
});
