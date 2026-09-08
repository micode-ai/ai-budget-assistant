import { useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Currency } from '@budget/shared-types';
import { useTheme, useStyles, type Theme } from '@/theme';

interface CurrencyDropdownProps {
  selectedCurrency: Currency | undefined;
  onCurrencyChange: (currency: Currency | undefined) => void;
  availableCurrencies: string[];
}

/**
 * Labelled dropdown ("Currency: All ▾") replacing mobile's horizontal pill
 * row — same options (All + each currency actually held), same
 * `onCurrencyChange` contract. Built on RN's own `Modal` (Universal dialogs
 * rule — free Escape handling + focus trap) with a raw, tab-index-less
 * `<div>` scrim, same shape as `RowContextMenu.tsx`'s anchored popover.
 * Deliberately visually distinct from the global display-currency control
 * (which now lives inside the account menu, and sets the account's display
 * currency for the whole app; this is a screen-local filter) — a labelled
 * button, not a bare pill.
 */
export function CurrencyDropdown({ selectedCurrency, onCurrencyChange, availableCurrencies }: CurrencyDropdownProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });

  const label = selectedCurrency ?? t('analytics.allCurrencies');

  const openMenu = (event: unknown) => {
    let next = { x: 0, y: 0 };
    try {
      const e = event as { currentTarget?: { getBoundingClientRect?: () => { left: number; bottom: number } } } | null | undefined;
      const rect = e?.currentTarget?.getBoundingClientRect?.();
      if (rect) next = { x: rect.left, y: rect.bottom + 4 };
    } catch {
      // RowContextMenu's own precedent: never let anchor resolution crash a
      // click — the menu clamps to the viewport regardless.
    }
    setAnchor(next);
    setOpen(true);
  };

  const choose = (value: Currency | undefined) => {
    onCurrencyChange(value);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={(e) => openMenu(e)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.currencyTrigger}
      >
        <Text style={styles.currencyTriggerText}>
          {t('wallet.currency')}: {label}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={theme.colors.textSecondary} />
      </Pressable>

      {open && (
        <Modal visible transparent animationType="none" onRequestClose={() => setOpen(false)}>
          <div
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
            style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <View style={[styles.currencyMenu, { position: 'absolute', top: anchor.y, left: anchor.x }]}>
              <Pressable style={styles.currencyMenuItem} onPress={() => choose(undefined)} accessibilityRole="menuitem">
                <Text
                  style={[styles.currencyMenuItemText, !selectedCurrency && { color: theme.colors.primary }]}
                >
                  {t('analytics.allCurrencies')}
                </Text>
              </Pressable>
              {availableCurrencies.map((c) => (
                <Pressable
                  key={c}
                  style={styles.currencyMenuItem}
                  onPress={() => choose(c as Currency)}
                  accessibilityRole="menuitem"
                >
                  <Text
                    style={[styles.currencyMenuItemText, selectedCurrency === c && { color: theme.colors.primary }]}
                  >
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>
          </div>
        </Modal>
      )}
    </>
  );
}

const createStyles = (theme: Theme) => ({
  currencyTrigger: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  currencyTriggerText: {
    ...theme.textStyles.bodySmMedium,
    color: theme.colors.textSecondary,
  },
  currencyMenu: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing[1],
    minWidth: 140,
    ...theme.shadows.lg,
  },
  currencyMenuItem: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  currencyMenuItemText: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textPrimary,
  },
});
