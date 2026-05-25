import { ReactNode } from 'react';
import { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

interface KeyboardAwareScreenProps extends ScrollViewProps {
  children: ReactNode;
  // Kept for API compatibility with the previous wrapper; merged into `style`.
  containerStyle?: StyleProp<ViewStyle>;
  // Extra gap between the focused input and the keyboard (added to a 24px base).
  keyboardVerticalOffset?: number;
}

// Drop-in replacement for a form screen's root vertical ScrollView. Backed by
// react-native-keyboard-controller's KeyboardAwareScrollView, which reads the
// real IME insets (works under RN New Architecture + Android edge-to-edge where
// the classic KeyboardAvoidingView/adjustResize is unreliable) and auto-scrolls
// the focused input into view. Requires <KeyboardProvider> at the app root.
export function KeyboardAwareScreen({
  children,
  containerStyle,
  keyboardVerticalOffset = 0,
  contentContainerStyle,
  style,
  ...scrollProps
}: KeyboardAwareScreenProps) {
  return (
    <KeyboardAwareScrollView
      style={[{ flex: 1 }, containerStyle, style]}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      bottomOffset={keyboardVerticalOffset + 24}
      showsVerticalScrollIndicator={false}
      {...scrollProps}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
