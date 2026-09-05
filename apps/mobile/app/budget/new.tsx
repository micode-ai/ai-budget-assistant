import { router } from 'expo-router';
import { BudgetCreateForm } from '@/components/budgets/BudgetCreateForm';

export default function NewBudgetScreen() {
  return <BudgetCreateForm onDone={() => router.back()} />;
}
