import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { showAlert } from '@/utils/alert';
import { KeyboardAwareScreen } from '@/components/KeyboardAwareScreen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useIncomeStore } from '@/stores/incomeStore';
import { useAccountStore } from '@/stores/accountStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import {
  IncomeDetailsCard,
  type IncomeDetailsCardHandle,
} from './components/IncomeDetailsCard';

export default function IncomeDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const canEdit = useAccountStore((s) => s.canEdit());
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const { incomes, deleteIncome } = useIncomeStore();
  const { loadCategories, isInitialized: categoriesInitialized } = useCategoryStore();
  const income = incomes.find((i) => i.id === id);

  const [isEditing, setIsEditing] = useState(false);
  const detailsCardRef = useRef<IncomeDetailsCardHandle>(null);

  useEffect(() => {
    if (edit === 'true') setIsEditing(true);
  }, [edit]);

  useEffect(() => {
    if (!categoriesInitialized) loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!income) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.centered}>
          <Text style={styles.notFoundText}>{t('incomeDetail.notFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleDelete = () => {
    showAlert(
      t('incomeDetail.deleteTitle'),
      t('incomeDetail.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteIncome(income.id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAwareScreen contentContainerStyle={styles.content}>
        {/* Amount card + details card (owns edit form state + tags) */}
        <IncomeDetailsCard
          ref={detailsCardRef}
          income={income}
          isEditing={isEditing}
          onSaved={() => setIsEditing(false)}
        />

        {/* Action Buttons */}
        <View style={styles.actionsRow}>
          {isEditing ? (
            <>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setIsEditing(false)}>
                <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => detailsCardRef.current?.triggerSave()}
              >
                <Ionicons name="checkmark" size={20} color={theme.colors.onSemantic} />
                <Text style={styles.saveButtonText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </>
          ) : canEdit ? (
            <>
              <TouchableOpacity style={styles.editButton} onPress={() => setIsEditing(true)}>
                <Ionicons name="create-outline" size={20} color={theme.colors.primary} />
                <Text style={styles.editButtonText} numberOfLines={1}>{t('common.edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                <Text style={styles.deleteButtonText} numberOfLines={1}>{t('common.delete')}</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  notFoundText: {
    ...theme.textStyles.bodyLarge,
    color: theme.colors.textTertiary,
  },
  content: {
    padding: theme.spacing[4],
  },
  actionsRow: {
    flexDirection: 'row' as const,
    gap: theme.spacing[3],
  },
  editButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },
  editButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.primary,
    flexShrink: 1,
  },
  deleteButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.danger,
  },
  deleteButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.danger,
    flexShrink: 1,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  cancelButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3.5],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.success,
  },
  saveButtonText: {
    ...theme.textStyles.button,
    color: theme.colors.onSemantic,
  },
});
