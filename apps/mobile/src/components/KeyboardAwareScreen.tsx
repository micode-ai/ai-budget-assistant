import { ReactNode } from 'react';
import { Platform, ScrollView, ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';

interface KeyboardAwareScreenProps extends ScrollViewProps {
  children: ReactNode;
  // Kept for API compatibility with the previous wrapper; merged into `style`.
  containerStyle?: StyleProp<ViewStyle>;
  // Extra gap added below the content when the keyboard is open.
  keyboardVerticalOffset?: number;
}

// Pure-JS drop-in for a form screen's root vertical ScrollView (no native
// module → builds on Windows). On Android it pads the content by the measured
// keyboard height so the focused field can scroll above the keyboard (works
// under New Architecture + edge-to-edge, where adjustResize is unreliable). On
// iOS it uses the built-in `automaticallyAdjustKeyboardInsets`.
export function KeyboardAwareScreen({
  children,
  containerStyle,
  keyboardVerticalOffset = 0,
  contentContainerStyle,
  style,
  ...scrollProps
}: KeyboardAwareScreenProps) {
  const keyboardHeight = useKeyboardHeight();
  const androidPad =
    Platform.OS === 'android' && keyboardHeight > 0
      ? { paddingBottom: keyboardHeight + keyboardVerticalOffset + 24 }
      : null;

  return (
    <ScrollView
      style={[{ flex: 1 }, containerStyle, style]}
      contentContainerStyle={[contentContainerStyle, androidPad]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      showsVerticalScrollIndicator={false}
      {...scrollProps}
    >
      {children}
    </ScrollView>
  );
}
