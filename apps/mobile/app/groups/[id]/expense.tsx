import { useLocalSearchParams } from 'expo-router';
import { GroupDetailScreen } from '@/components/groups/GroupDetailScreen';
import { GroupExpenseScreenView } from '@/components/groups/GroupExpenseScreenView';

export default function GroupExpenseScreen() {
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId?: string }>();
  const groupId = String(id);
  const expense = expenseId ? String(expenseId) : undefined;
  // Desktop opens the expense dialog over the group page; the phone keeps the full-screen form.
  return (
    <GroupDetailScreen
      groupId={groupId}
      initialDialog={{ kind: 'expense', expenseId: expense }}
      phone={<GroupExpenseScreenView groupId={groupId} expenseId={expense} />}
    />
  );
}
