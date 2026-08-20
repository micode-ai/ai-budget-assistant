import { View, Text, TouchableOpacity, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

interface AddDebtSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function AddDebtSheet({ visible, onClose }: AddDebtSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetOverlay} onPress={onClose}>
        <View style={[styles.sheetContainer, { paddingBottom: 32 + insets.bottom }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{t('debt.addDebt')}</Text>
          <TouchableOpacity
            style={styles.sheetOption}
            onPress={() => {
              onClose();
              router.push('/expense/new?isDebt=true');
            }}
          >
            <View style={[styles.sheetIconCircle, { backgroundColor: theme.colors.primaryLight }]}>
              <Ionicons name="arrow-up-circle-outline" size={24} color={theme.colors.success} />
            </View>
            <View style={styles.sheetOptionText}>
              <Text style={styles.sheetOptionTitle}>{t('debt.lendMoney')}</Text>
              <Text style={styles.sheetOptionSubtitle}>{t('debt.lendMoneyHint')}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetOption}
            onPress={() => {
              onClose();
              router.push('/income/new?isDebt=true');
            }}
          >
            <View style={[styles.sheetIconCircle, { backgroundColor: theme.colors.dangerLight }]}>
              <Ionicons name="arrow-down-circle-outline" size={24} color={theme.colors.danger} />
            </View>
            <View style={styles.sheetOptionText}>
              <Text style={styles.sheetOptionTitle}>{t('debt.borrowMoney')}</Text>
              <Text style={styles.sheetOptionSubtitle}>{t('debt.borrowMoneyHint')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end' as const,
  },
  sheetContainer: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius['2xl'],
    borderTopRightRadius: theme.borderRadius['2xl'],
    padding: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderLight,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  sheetTitle: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[4],
  },
  sheetOption: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[3],
  },
  sheetIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sheetOptionText: {
    flex: 1,
  },
  sheetOptionTitle: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
  },
  sheetOptionSubtitle: {
    ...theme.textStyles.bodySm,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
});
