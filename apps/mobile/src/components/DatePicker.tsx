import { Platform } from 'react-native';
import RNDateTimePicker from '@react-native-community/datetimepicker';

export interface DatePickerProps {
  value: Date;
  /**
   * Called with the picked date, or `undefined` when the picker was dismissed
   * without a selection — the same contract as the underlying
   * `@react-native-community/datetimepicker` `onChange`, so call sites keep
   * owning their own "close the picker" logic.
   */
  onChange: (date: Date | undefined) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  /**
   * iOS presentation only. Defaults to `'spinner'` (what the transaction-date
   * fields use); the goal-deadline and trip-date screens pass `'inline'` to
   * keep their existing calendar look. Ignored on Android and on web.
   */
  iosDisplay?: 'spinner' | 'inline';
}

/**
 * Drop-in replacement for `<DateTimePicker mode="date">`.
 *
 * Exists because `@react-native-community/datetimepicker` ships NO web
 * implementation: with no `datetimepicker.web.js` in the package, Metro
 * resolves the fallback `src/datetimepicker.js`, whose entire body is
 * `console.warn('DateTimePicker is not supported on: web'); return null`. Every
 * date field in the web app was therefore dead — tapping the row flipped the
 * `show…` flag and rendered nothing at all.
 *
 * The web sibling (`DatePicker.web.tsx`) renders a real `<input type="date">`.
 * Keep the two in sync on props, and never import
 * `@react-native-community/datetimepicker` directly in a screen again — go
 * through this component so web stays working.
 */
export function DatePicker({
  value,
  onChange,
  minimumDate,
  maximumDate,
  iosDisplay = 'spinner',
}: DatePickerProps) {
  return (
    <RNDateTimePicker
      value={value}
      mode="date"
      display={Platform.OS === 'ios' ? iosDisplay : 'default'}
      minimumDate={minimumDate}
      maximumDate={maximumDate}
      onChange={(_event, date) => onChange(date)}
    />
  );
}
