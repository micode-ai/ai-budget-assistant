import { useLocalSearchParams } from 'expo-router';
import { GroupDetailScreen } from '@/components/groups/GroupDetailScreen';
import { GroupBudgetLinksView } from '@/components/groups/GroupBudgetLinksView';

export default function GroupBudgetLinksScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);
  // ABA-661. Desktop opens the "may be counted twice" dialog over the group page; the phone keeps the full screen.
  return (
    <GroupDetailScreen
      groupId={groupId}
      initialDialog={{ kind: 'budgetLinks' }}
      phone={<GroupBudgetLinksView groupId={groupId} />}
    />
  );
}
