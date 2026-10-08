import { useLocalSearchParams } from 'expo-router';
import { GroupMembersView } from '@/components/groups/GroupMembersView';

export default function GroupMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupMembersView groupId={String(id)} />;
}
