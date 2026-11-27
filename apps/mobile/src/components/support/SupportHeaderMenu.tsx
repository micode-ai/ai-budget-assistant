import React, { useState } from 'react';
import { View, Text, Switch, Pressable, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';
import type { UseSupportThreadReturn } from '@/features/support/useSupportThread';

/**
 * The header's "⋮" button and the menu it opens, holding the one option the
 * screen has: "Translate replies automatically". The button takes the
 * header's own `tintColor` (`textInverse` on the phone's primary header,
 * `textPrimary` on the desktop's surface header) — never a semantic colour.
 *
 * Rendered as an in-tree overlay rather than a `Modal`: it is anchored to the
 * top edge, so it has no bottom inset to clear, and it closes on any tap
 * outside it.
 */
export function SupportHeaderMenu({ support }: { support: UseSupportThreadReturn }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [open, setOpen] = useState(false);
  const autoTranslate = support.thread?.autoTranslate ?? true;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: ({ tintColor }) => (
            <TouchableOpacity
              onPress={() => setOpen((v) => !v)}
              hitSlop={10}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel={t('support.menu')}
            >
              <Ionicons name="ellipsis-vertical" size={20} color={tintColor ?? theme.colors.textInverse} />
            </TouchableOpacity>
          ),
        }}
      />
      {open && (
        <>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel={t('support.closeMenu')} />
          <View style={styles.menu}>
            <View style={styles.menuRow}>
              <View style={styles.menuText}>
                <Text style={styles.menuLabel}>{t('support.autoTranslate')}</Text>
                <Text style={styles.menuHint}>{t('support.autoTranslateHint')}</Text>
              </View>
              <Switch
                value={autoTranslate}
                onValueChange={(v) => void support.setAutoTranslate(v)}
                disabled={!support.thread || support.isOffline}
                trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
                accessibilityLabel={t('support.autoTranslate')}
              />
            </View>
          </View>
        </>
      )}
    </>
  );
}

const createStyles = (theme: Theme) => ({
  headerButton: {
    paddingHorizontal: theme.spacing[2],
  },
  backdrop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  menu: {
    position: 'absolute' as const,
    top: theme.spacing[2],
    right: theme.spacing[3],
    zIndex: 11,
    elevation: 6,
    width: 300,
    maxWidth: '92%' as const,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing[3],
    ...theme.shadows.md,
  },
  menuRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[3],
  },
  menuText: {
    flex: 1,
  },
  menuLabel: {
    ...theme.textStyles.bodyMedium,
    color: theme.colors.textPrimary,
  },
  menuHint: {
    ...theme.textStyles.caption,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
});
