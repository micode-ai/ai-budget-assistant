import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, useStyles, type Theme } from '@/theme';

interface TransactionActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canEdit: boolean;
}

export function TransactionActionSheet({
  visible,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
  canEdit,
}: TransactionActionSheetProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(0);
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const handleAction = (action: () => void) => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onClose();
      action();
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 16 },
            {
              transform: [
                {
                  translateY: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [300, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable>
            <View style={styles.handle} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => handleAction(onEdit)}
            >
              <Ionicons name="create-outline" size={22} color={theme.colors.primary} />
              <Text style={styles.menuItemText}>{t('common.edit')}</Text>
            </TouchableOpacity>

            {canEdit && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => handleAction(onDuplicate)}
              >
                <Ionicons name="copy-outline" size={22} color={theme.colors.primary} />
                <Text style={styles.menuItemText}>{t('common.duplicate')}</Text>
              </TouchableOpacity>
            )}

            {canEdit && (
              <>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleAction(onDelete)}
                >
                  <Ionicons name="trash-outline" size={22} color={theme.colors.danger} />
                  <Text style={[styles.menuItemText, { color: theme.colors.danger }]}>
                    {t('common.delete')}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end' as const,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingTop: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderLight,
    alignSelf: 'center' as const,
    marginBottom: theme.spacing[4],
  },
  menuItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.spacing[4],
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[2],
  },
  menuItemText: {
    ...theme.textStyles.bodyLargeMedium,
    color: theme.colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginHorizontal: theme.spacing[2],
  },
});
