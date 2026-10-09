import { useLocalSearchParams } from 'expo-router';
import { GroupDetailScreen } from '@/components/groups/GroupDetailScreen';

export default function GroupDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupDetailScreen groupId={String(id)} />;
}
