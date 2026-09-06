import React from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStyles, type Theme } from '@/theme';
import { SettingsPaneProvider } from './SettingsPaneContext';

/**
 * A settings screen rendered full-page: native, and web below the desktop gate.
 *
 * This is the tree every settings route has today — `SafeAreaView` with
 * `edges={[]}` over a `flex: 1` background — lifted out of the seventeen route
 * files so it exists once. The extracted screen owns neither the safe area nor
 * the inset; the frame owns both and hands the inset down, which is what keeps
 * the phone byte-identical while the same screen also renders inside a pane.
 */
export function SettingsScreenFrame({ children }: { children: React.ReactNode }) {
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <SettingsPaneProvider desktop={false} bottomInset={insets.bottom}>
        {children}
      </SettingsPaneProvider>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
