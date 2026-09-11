import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useDesktopShortcut, useRegisteredShortcuts } from '@/hooks/useDesktopShortcuts';
import { groupShortcutDescriptors } from '@/features/shortcuts/shortcutGrouping';
import { formatComboForDisplay } from '@/features/shortcuts/shortcutCombo';

function detectIsMac(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform ?? '');
}

/**
 * The `?` cheat sheet. Mounted once by `WebShell.web.tsx`'s `DesktopShell`
 * (never on native — the whole file only ever renders inside that desktop
 * shell), so it's reachable from every desktop screen.
 *
 * **Reads the LIVE registry, on purpose.** A hardcoded list would drift the
 * moment a screen's own bindings changed, and would show a Dashboard user
 * shortcuts that only exist on the transactions screen. This can only ever
 * list what is genuinely active right now — on a screen with no shortcuts of
 * its own it still shows the two that are always true (this key itself, and
 * `Esc`), which is the honest answer rather than an empty, confusing sheet.
 */
export function ShortcutsHelpOverlay() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [open, setOpen] = useState(false);
  const isMac = useMemo(detectIsMac, []);

  useDesktopShortcut('?', () => setOpen((current) => !current), {
    description: t('shortcuts.showHelp'),
  });

  const registrations = useRegisteredShortcuts();
  const groups = useMemo(
    () => groupShortcutDescriptors(registrations.map((r) => ({ combo: r.combo, description: r.description }))),
    [registrations]
  );

  if (!open) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      {/* A raw `<div>`, never a `Pressable` — a `Pressable` always emits a
          `tabIndex`, which would make the invisible scrim the focus trap's
          first stop (design-language contract §3). */}
      <div
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.overlay,
          padding: 24,
        }}
      >
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('shortcuts.helpTitle')}</Text>
            <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
              <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView style={styles.list}>
            {groups.map((group) => (
              <ShortcutRow key={group.description} label={group.description} combos={group.combos} isMac={isMac} theme={theme} />
            ))}
            {/* Not a registered binding — see the plan's "Esc needs no new
                code" decision: every desktop dialog already closes on Escape
                via RN's own `Modal`. Listed here so the sheet stays honest
                about what actually works, without risking a second handler
                fighting the existing focus-trap behaviour. */}
            <ShortcutRow label={t('shortcuts.closeDialog')} combos={['escape']} isMac={isMac} theme={theme} />
          </ScrollView>
        </View>
      </div>
    </Modal>
  );
}

function ShortcutRow({
  label,
  combos,
  isMac,
  theme,
}: {
  label: string;
  combos: string[];
  isMac: boolean;
  theme: Theme;
}) {
  const styles = createStyles(theme);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.combosRow}>
        {combos.map((combo) => (
          <View key={combo} style={styles.kbd}>
            <Text style={[styles.kbdText, { fontVariant: ['tabular-nums'] }]}>
              {formatComboForDisplay(combo, isMac)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  panel: {
    width: '90%' as const,
    maxWidth: 420,
    maxHeight: '80%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[4],
    overflow: 'hidden' as const,
    ...theme.shadows.xl,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: theme.spacing[3],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  list: {
    maxHeight: 360,
  },
  row: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[2.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  rowLabel: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
    flex: 1,
    paddingRight: theme.spacing[3],
  },
  combosRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[1.5],
  },
  kbd: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  kbdText: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
});
