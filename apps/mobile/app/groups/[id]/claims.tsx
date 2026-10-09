import { useLocalSearchParams } from 'expo-router';
import { GroupDetailScreen } from '@/components/groups/GroupDetailScreen';
import { GroupClaimsView } from '@/components/groups/GroupClaimsView';

export default function GroupClaimsScreen() {
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId?: string }>();
  const groupId = String(id);
  const expense = expenseId ? String(expenseId) : undefined;
  // ABA-656. Desktop opens the claims dialog over the group page; the phone keeps the full screen.
  return (
    <GroupDetailScreen
      groupId={groupId}
      initialDialog={{ kind: 'claims', expenseId: expense }}
      // Without an expense id there is nothing to divide: the group itself.
      phone={expense ? <GroupClaimsView groupId={groupId} expenseId={expense} /> : undefined}
    />
  );
}
