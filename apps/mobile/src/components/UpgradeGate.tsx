import { Modal, View } from 'react-native';
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={hide}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
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
    paddingBottom: 40,
  },
});
