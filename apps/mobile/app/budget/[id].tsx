import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useBudgetStore } from '@/stores/budgetStore';
import { useTheme, useStyles, type Theme } from '@/theme';
import { BudgetEditForm } from '@/components/budget/BudgetEditForm';
import { BudgetDetailView } from '@/components/budgets/BudgetDetailView';

export default function BudgetDetailScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useStyles(createStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { budgets, loadBudgets, isLoading } = useBudgetStore();
  // Deep-links (e.g. a `budget_alert` push) carry the SERVER budget id, but on a
  // device the local row id is the clientId and the server PK lives in `serverId`.
  // Match all four so tapping a budget notification resolves the budget instead of
  // dead-ending on "Budget not found" (same fix class as the anomaly-alert
  // expense deep-link, ABA-247/339).
  const budget = budgets.find(
    (b) => b.id === id || b.serverId === id || b.clientId === id || b.localId === id,
  );

  const [isEditing, setIsEditing] = useState(false);
  const [referenceDate, setReferenceDate] = useState<Date>(new Date());
  const [triedReload, setTriedReload] = useState(false);

  useEffect(() => {
    setReferenceDate(new Date());
  }, [budget?.period]);

  useEffect(() => {
    // Cold-start from a push can mount this screen before the budget store is
    // hydrated. Force one reload before concluding the budget is gone.
    if (!budget && !triedReload) {
      setTriedReload(true);
      void loadBudgets();
    }
  }, [budget, triedReload, loadBudgets]);

  if (!budget) {
    if (isLoading || !triedReload) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color={theme.colors.textDisabled} />
          <Text style={styles.notFoundText}>{t('budgetDetail.notFound')}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isEditing) {
    return (
      <BudgetEditForm
        budget={budget}
        onSaved={() => setIsEditing(false)}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <BudgetDetailView
      budget={budget}
      referenceDate={referenceDate}
      onReferenceDateChange={setReferenceDate}
      onEdit={() => setIsEditing(true)}
      onDeleted={() => router.back()}
    />
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
    padding: theme.spacing[6],
  },
  notFoundText: {
    fontSize: 18,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing[4],
  },
  backButton: {
    marginTop: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[3],
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
  },
  backButtonText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
