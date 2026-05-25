import { ReactNode } from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

interface KeyboardAvoidingScreenProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  // Accepted for drop-in compatibility with KeyboardAvoidingView; `behavior` is
  // ignored (this lifts content by the measured keyboard height instead).
  behavior?: 'height' | 'position' | 'padding';
  keyboardVerticalOffset?: number;
}

// Pure-JS drop-in for KeyboardAvoidingView (no native module → builds on
// Windows). Applies bottom padding equal to the keyboard height so the wrapped
// content (and any docked input / pinned footer inside it) is pushed above the
// keyboard. Works under RN New Architecture + Android edge-to-edge, where the
// built-in KeyboardAvoidingView / adjustResize are unreliable.
export function KeyboardAvoidingScreen({
  children,
  style,
  keyboardVerticalOffset = 0,
}: KeyboardAvoidingScreenProps) {
  const keyboardHeight = useKeyboardHeight();
  return (
    <View
      style={[
        style,
        keyboardHeight > 0 ? { paddingBottom: keyboardHeight + keyboardVerticalOffset } : null,
      ]}
    >
      {children}
    </View>
  );
}
