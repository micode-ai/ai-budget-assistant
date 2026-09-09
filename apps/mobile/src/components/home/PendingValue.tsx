import { Text } from 'react-native';
import { useTheme } from '@/theme';

/**
 * Stands in for a figure the dashboard does not know yet.
 *
 * One component so every unanswered number looks the same — five widgets each
 * inventing their own placeholder is how a screen ends up with a dash here, a
 * zero there and a spinner somewhere else, all meaning the same thing.
 *
 * An em dash rather than `0,00` or a skeleton block:
 * - a zero is a claim, and the whole point is not to make one
 *   (`resolveDashboardReadiness`'s reasoning);
 * - it is already this codebase's convention for "no figure" — the transfer
 *   form's `Available:` row resolves an unknown balance to a dash rather than
 *   fabricating a zero (`transferBalances.ts`);
 * - it needs no new i18n key, being punctuation rather than words.
 *
 * `style` takes the surrounding number's own text style, so the dash inherits
 * the size and weight of whatever it replaces instead of introducing a second
 * visual language per widget.
 */
export function PendingValue({ style }: { style?: object | object[] }) {
  const theme = useTheme();

  return (
    <Text
      style={[style, { color: theme.colors.textTertiary }]}
      // Screen readers would otherwise announce a bare dash, which says
      // nothing. `accessibilityLabel` is deliberately not translated copy: the
      // hint is the element's role, and adding words here would mean a new key
      // in nine locales for a transient state.
      accessibilityLabel="—"
    >
      —
    </Text>
  );
}
