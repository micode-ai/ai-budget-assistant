import { router, useLocalSearchParams } from 'expo-router';
import {
  ExpenseCreateForm,
  type ExpenseCreatePrefill,
} from '@/components/expenses/create/ExpenseCreateForm';

export default function NewExpenseScreen() {
  const params = useLocalSearchParams<ExpenseCreatePrefill>();

  return <ExpenseCreateForm initial={params} onDone={() => router.back()} />;
}
