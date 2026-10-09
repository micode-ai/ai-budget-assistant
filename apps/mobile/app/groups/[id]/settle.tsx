import { useLocalSearchParams } from 'expo-router';
import { GroupDetailScreen } from '@/components/groups/GroupDetailScreen';
import { GroupSettleView } from '@/components/groups/GroupSettleView';

export default function GroupSettleScreen() {
  const { id, from, to } = useLocalSearchParams<{ id: string; from?: string; to?: string }>();
  const groupId = String(id);
  const fromId = from ? String(from) : undefined;
  const toId = to ? String(to) : undefined;
  // Desktop opens the settle dialog over the group page; the phone keeps the full-screen view.
  return (
    <GroupDetailScreen
      groupId={groupId}
      initialDialog={{ kind: 'settle', from: fromId, to: toId }}
      phone={<GroupSettleView groupId={groupId} from={fromId} to={toId} />}
    />
  );
}
