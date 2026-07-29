import { useEffect, useRef } from 'react';
import { useTheme } from '@/theme';
import { toDateInputValue, fromDateInputValue } from '@/utils/dateInput';
import type { DatePickerProps } from './DatePicker';

/**
 * Web sibling of `DatePicker` — see that file for why this platform split
 * exists at all (`@react-native-community/datetimepicker` renders `null` on
 * web).
 *
 * Renders a native `<input type="date">`, which gives the browser's own
 * calendar for free. Raw DOM in a `.web.tsx` follows the established pattern
 * in this repo (`ExpenseMapView.web.tsx`, `ShareImageCard.web.tsx`) — the file
 * is only ever bundled for web, where react-native-web runs under React DOM.
 *
 * Call sites mount this conditionally behind their own `show…` flag, mirroring
 * the Android picker. On mount we therefore try to pop the browser's calendar
 * immediately (`showPicker()`), so the user's tap on the field opens the
 * calendar rather than merely revealing an input they must tap again.
 * `showPicker()` is Chromium/recent-Safari only and throws if it is called
 * without user activation, so it is best-effort — where it is unavailable the
 * input is still fully visible and usable, which is why it is rendered rather
 * than hidden.
 */
export function DatePicker({ value, onChange, minimumDate, maximumDate }: DatePickerProps) {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  // Blur is only a real dismissal once we have actually focused the input.
  // Guarding on this means a stray blur before that can never slam the picker
  // shut the instant it opens.
  const focusedRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    try {
      // Not in lib.dom for every TS version, and unsupported in Firefox.
      (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      // No user activation, or the browser refused — the visible input remains.
    }
    focusedRef.current = true;
  }, []);

  return (
    <input
      ref={inputRef}
      type="date"
      value={toDateInputValue(value)}
      min={minimumDate ? toDateInputValue(minimumDate) : undefined}
      max={maximumDate ? toDateInputValue(maximumDate) : undefined}
      onChange={(event) => {
        // A half-typed or cleared value parses to null; swallow it rather than
        // pushing an Invalid Date into the caller's state. `undefined` is the
        // "dismissed, nothing picked" signal the native picker uses too.
        const next = fromDateInputValue(event.target.value, value);
        if (next) onChange(next);
      }}
      onBlur={() => {
        // The browser gives no "cancelled" event, so clicking away is how a
        // web user backs out. Call sites already close on `undefined` (their
        // Android branch), so this needs no extra prop.
        if (focusedRef.current) onChange(undefined);
      }}
      style={{
        marginTop: 8,
        padding: '10px 12px',
        fontSize: 16,
        fontFamily: 'inherit',
        color: theme.colors.textPrimary,
        backgroundColor: theme.colors.surfaceSecondary,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 12,
        colorScheme: theme.isDark ? 'dark' : 'light',
      }}
    />
  );
}
