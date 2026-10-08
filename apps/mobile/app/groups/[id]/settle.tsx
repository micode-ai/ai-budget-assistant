import { useLocalSearchParams } from 'expo-router';
import { GroupSettleView } from '@/components/groups/GroupSettleView';

export default function GroupSettleScreen() {
  const { id, from, to } = useLocalSearchParams<{ id: string; from?: string; to?: string }>();
  return <GroupSettleView groupId={String(id)} from={from ? String(from) : undefined} to={to ? String(to) : undefined} />;
}
