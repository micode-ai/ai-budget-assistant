import React from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSettingsPane } from './SettingsPaneContext';

interface Props {
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
  children: React.ReactNode;
}

/**
 * What an extracted settings screen puts where its own `ScrollView` used to be.
 *
 * The design language allows **one page scroll per screen**: "If two scrollbars
 * look wrong, there is one scroller too many." In the desktop shell the page
 * scroll belongs to the shell, which scrolls both panes together — so a screen
 * that kept its own `ScrollView` would be a second scroll container nested in
 * the first, and on web a flex child inside an auto-height parent is exactly
 * where that goes wrong quietly.
 *
 * Full-page (native, and web below the desktop gate) it is the same
 * `ScrollView` the screen has today, with the same props. In a pane it is a
 * plain `View` and the shell scrolls.
 *
 * `contentContainerStyle` is applied in both branches, unchanged, so a screen's
 * own padding survives the swap — this component never adds padding of its own,
 * because a style array's last entry wins and silently replacing a screen's
 * `paddingBottom` is precisely the regression the extraction must not cause.
 * A screen that needs the system inset composes it itself from
 * `useSettingsPane().bottomInset`, exactly as it composes `insets.bottom` today.
 */
export function SettingsScreenScroll({
  style,
  contentContainerStyle,
  scrollEnabled,
  showsVerticalScrollIndicator,
  children,
}: Props) {
  const { desktop } = useSettingsPane();

  if (desktop) {
    return <View style={contentContainerStyle}>{children}</View>;
  }

  return (
    <ScrollView
      style={style}
      contentContainerStyle={contentContainerStyle}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
    >
      {children}
    </ScrollView>
  );
}
