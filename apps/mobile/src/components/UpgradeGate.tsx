import { Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUpgradeStore } from '@/stores/upgradeStore';
import { Paywall } from '@/components/Paywall';
import { useStyles, type Theme } from '@/theme';

/**
 * Mount this once at the root (app/_layout.tsx RootNavigator).
 * Any feature can call useUpgradeStore.getState().show(featureText) to open the paywall.
 */
export function UpgradeGate() {
  const visible = useUpgradeStore((s) => s.visible);
  const feature = useUpgradeStore((s) => s.feature);
  const requiredTier = useUpgradeStore((s) => s.requiredTier);
  const hide = useUpgradeStore((s) => s.hide);
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={hide}
    >
      <View style={styles.overlay}>
        {/* The system navigation bar overlays this window, so the bottom padding
            has to clear it — a fixed value left the last row unreachable on a
            three-button-nav device (ABA-483). */}
        <View style={[styles.sheet, { paddingBottom: 40 + insets.bottom }]}>
          <Paywall feature={feature} requiredTier={requiredTier} onDismiss={hide} />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end' as const,
  },
  sheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
});
