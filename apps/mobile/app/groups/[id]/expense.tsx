import { useLocalSearchParams } from 'expo-router';
import { GroupExpenseScreenView } from '@/components/groups/GroupExpenseScreenView';

export default function GroupExpenseScreen() {
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId?: string }>();
  return <GroupExpenseScreenView groupId={String(id)} expenseId={expenseId ? String(expenseId) : undefined} />;
}
