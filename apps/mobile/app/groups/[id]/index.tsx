import { useLocalSearchParams } from 'expo-router';
import { GroupDetailView } from '@/components/groups/GroupDetailView';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupDetailView groupId={String(id)} />;
}
