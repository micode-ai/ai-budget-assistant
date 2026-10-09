import { useLocalSearchParams } from 'expo-router';
import { GroupDetailScreen } from '@/components/groups/GroupDetailScreen';
import { GroupMembersView } from '@/components/groups/GroupMembersView';

export default function GroupMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = String(id);
  // Desktop opens the members dialog over the group page; the phone keeps the full-screen view.
  return (
    <GroupDetailScreen
      groupId={groupId}
      initialDialog={{ kind: 'members' }}
      phone={<GroupMembersView groupId={groupId} />}
    />
  );
}
