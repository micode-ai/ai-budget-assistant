import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { useSettingsPane } from './SettingsPaneContext';

interface Props {
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * {@link SettingsScreenScroll} for a settings screen whose root scroller is a
 * `KeyboardAwareScreen` rather than a bare `ScrollView`.
 *
 * It exists because swapping such a screen onto `SettingsScreenScroll` would
 * be a silent change to the phone. `KeyboardAwareScreen` is not "a ScrollView
 * with a longer name": it adds `keyboardShouldPersistTaps="handled"` (without
 * which the first tap on a button while the keyboard is open only dismisses
 * the keyboard — on a form whose only two controls sit under two secure text
 * inputs, that is the difference between the button working and not),
 * `keyboardDismissMode="on-drag"`, `automaticallyAdjustKeyboardInsets` on iOS,
 * and a measured keyboard-height pad on Android, where `adjustResize` is
 * unreliable under New Architecture with edge-to-edge. None of that is
 * expressible through the props `SettingsScreenScroll` forwards, and all of it
 * is load-bearing on the screens that reach for this wrapper.
 *
 * The desktop branch is identical to its sibling's and for the same reason:
 * one page scroll per screen, owned by the shell. It is also where the
 * keyboard behaviour stops mattering — there is no software keyboard to avoid
 * on a desktop browser, and every prop above is either iOS- or Android-only or
 * a touch-gesture concern.
 *
 * Deliberately a second component rather than a flag on the first: the five
 * screens wave 1 extracted keep rendering the file they already render, so
 * nothing about them can regress here.
 */
export function SettingsScreenKeyboardScroll({ style, contentContainerStyle, children }: Props) {
  const { desktop } = useSettingsPane();

  if (desktop) {
    return <View style={contentContainerStyle}>{children}</View>;
  }

  return (
    <KeyboardAwareScreen style={style} contentContainerStyle={contentContainerStyle}>
      {children}
    </KeyboardAwareScreen>
  );
}
