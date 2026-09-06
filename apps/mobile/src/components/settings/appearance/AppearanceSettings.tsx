import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/stores/themeStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { SUPPORTED_LANGUAGES, changeLanguage } from '@/i18n';
import { DEFAULT_ACCENT, PRESET_ACCENTS } from '@/theme/presetAccents';
import { ColorPicker } from '@/components/ColorPicker';
import { SheetDialog } from '@/components/SheetDialog';
import { SettingsScreenScroll } from '../SettingsScreenScroll';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * The appearance screen's body: language, theme mode, accent colour.
 *
 * Lifted out of `app/settings/appearance.tsx` unchanged so the desktop settings
 * shell can host it - `src/` may not import from `app/`, so a route file is not
 * somewhere a pane can render from. The route is now a thin wrapper around
 * `SettingsRoute`, which is the one file that decides mobile vs desktop.
 *
 * Two differences from the original body, both mechanical and both required by
 * that hosting: the outer `SafeAreaView` is gone (`SettingsScreenFrame` supplies
 * it on the full-page path, with the same `edges={[]}` and the same background),
 * and the root `ScrollView` is `SettingsScreenScroll` - the same `ScrollView`
 * full-page, a plain `View` in a pane, because the shell owns the page scroll and
 * a nested scroller would be the second scrollbar the language forbids.
 *
 * **This screen no longer reads a safe-area inset at all.** It used to hold
 * `useSafeAreaInsets()` for the colour picker's bottom-anchored `Modal`, with
 * a note here saying that was deliberately not `useSettingsPane().bottomInset`
 * - true at the time, and superseded: the picker opens in a `SheetDialog`,
 * which owns both the inset (ABA-483's rule, in one place rather than nine)
 * and the desktop chrome. `useSettingsPane().bottomInset` is still the wrong
 * number for it, and still not what is used; the right one is simply no longer
 * this screen's to compose.
 *
 * Nothing else changed. In particular `themeChip`'s `flex: 1` is untouched: it is
 * correct behaviour given a bounded parent, and supplying that bound is the
 * shell's `width: 'form'` cap, not this screen's business.
 */
export function AppearanceSettings() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { mode, setMode, accent, customAccent, setAccent, setCustomAccent } = useThemeStore();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const activeAccent = accent ?? DEFAULT_ACCENT;
  const isCustom = accent !== null && !PRESET_ACCENTS.includes(accent);

  const handleLanguageChange = async (langCode: string) => {
    if (langCode === i18n.language) return;
    await changeLanguage(langCode);
  };

  return (
    <SettingsScreenScroll style={styles.scrollView} contentContainerStyle={styles.content}>
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

      <SheetDialog
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        statusBarTranslucent
        padBottom={theme.spacing[4]}
        sheetStyle={styles.pickerSheetBox}
        handleStyle={styles.pickerHandleBox}
        // The phone's backdrop is inert today: the picker is dismissed by its
        // own Close / Reset buttons (and the back button), never by a stray
        // tap behind a control the user is dragging. The desktop scrim still
        // closes on an outside click, as every other dialog on that surface
        // does.
        dismissOnScrimPress={false}
      >
        <ColorPicker
          initialColor={customAccent ?? activeAccent}
          onApply={(hex) => { setCustomAccent(hex); setAccent(hex); }}
          onReset={() => { setAccent(null); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      </SheetDialog>
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
  // Deviations from `SheetDialog`'s canonical sheet box, kept so the phone's
  // pixels do not move: the picker sits on the elevated surface, with tighter
  // padding and a slightly wider handle than a form sheet.
  pickerSheetBox: {
    backgroundColor: theme.colors.surfaceElevated,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
    gap: theme.spacing[3],
  },
  pickerHandleBox: {
    width: 40,
    marginBottom: theme.spacing[2],
  },
});
