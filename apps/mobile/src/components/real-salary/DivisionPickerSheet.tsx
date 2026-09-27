import { Modal, View, Text, TouchableOpacity, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useStyles, type Theme } from '@/theme';
import { useIsDesktopWeb } from '@/components/webLayout.constants';
import type { CoicopDivision } from '@budget/shared-types';

interface Props {
  visible: boolean;
  selected: CoicopDivision | null;
  onSelect: (division: CoicopDivision) => void;
  onClose: () => void;
}

/** CP01…CP13 first (spend categories), TOTAL last ("everything else"). */
const DIVISIONS: CoicopDivision[] = [
  'CP01', 'CP02', 'CP03', 'CP04', 'CP05', 'CP06', 'CP07',
  'CP08', 'CP09', 'CP10', 'CP11', 'CP12', 'CP13',
  'TOTAL',
];

/**
 * COICOP division picker for the real-salary config screen — same sheet
 * shape as `CountryPickerSheet`/`MerchantPickerSheet` (Modal, backdrop,
 * handle, desktop centring via `useIsDesktopWeb`).
 */
export function DivisionPickerSheet({ visible, selected, onSelect, onClose }: Props) {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktopWeb();

  return (
    <Modal visible={visible} transparent animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={[styles.backdrop, isDesktop && styles.backdropCentered]}>
        <TouchableOpacity style={styles.backdropFill} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            isDesktop ? styles.sheetCentered : { paddingBottom: theme.spacing[4] + insets.bottom },
          ]}
        >
          {!isDesktop && <View style={styles.handle} />}

          <View style={styles.header}>
            <Text style={styles.title}>{t('realSalary.config.pickDivision')}</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.cancel')}>
              <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={DIVISIONS}
            keyExtractor={(item) => item}
            style={styles.list}
            renderItem={({ item }) => {
              const isSelected = item === selected;
              return (
                <TouchableOpacity
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                >
                  <Text style={[styles.rowText, isSelected && styles.rowTextSelected]} numberOfLines={1}>
                    {t(`realSalary.division.${item}`)}
                  </Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color={theme.colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => ({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end' as const,
    backgroundColor: theme.colors.overlay,
  },
  backdropCentered: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: theme.spacing[6],
  },
  backdropFill: {
    ...({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const),
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    maxHeight: '75%' as const,
  },
  sheetCentered: {
    width: '100%' as const,
    maxWidth: 420,
    borderRadius: theme.borderRadius.xl,
    paddingBottom: theme.spacing[4],
  },
  handle: {
    alignSelf: 'center' as const,
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing[3],
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: theme.spacing[3],
  },
  title: {
    ...theme.textStyles.h3,
    color: theme.colors.textPrimary,
  },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
  },
  rowText: {
    fontSize: 15,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing[2],
  },
  rowTextSelected: {
    color: theme.colors.primary,
    fontWeight: '600' as const,
  },
});
