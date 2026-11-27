import React from 'react';
import { View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStyles, type Theme } from '@/theme';
import { KeyboardAvoidingScreen as KeyboardAvoidingView } from '@/components/KeyboardAvoidingScreen';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import type { UseSupportThreadReturn } from '@/features/support/useSupportThread';
import { SupportTranscript } from './SupportTranscript';
import { SupportComposer } from './SupportComposer';
import { SupportHeaderMenu } from './SupportHeaderMenu';

interface Props {
  support: UseSupportThreadReturn;
  fromRoute?: string;
}

/**
 * The phone layout — the one definition of it; narrow web renders this too.
 * All state lives in `useSupportThread`, called by the platform `SupportView`
 * files and passed down as the single `support` prop.
 *
 * The composer clears the system navigation bar with `insets.bottom`
 * (edge-to-edge, ABA-483) — except while the keyboard is up, when
 * `KeyboardAvoidingScreen` already lifts it by the keyboard's height.
 */
export function SupportMobile({ support, fromRoute }: Props) {
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <KeyboardAvoidingView style={styles.container} behavior="padding">
        <View style={styles.body}>
          <SupportTranscript support={support} />
          <SupportHeaderMenu support={support} />
        </View>
        <SupportComposer
          support={support}
          fromRoute={fromRoute}
          bottomInset={keyboardHeight > 0 ? 0 : insets.bottom}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  body: {
    flex: 1,
  },
});
