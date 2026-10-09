import { useLocalSearchParams } from 'expo-router';
import { GroupJoinView } from '@/components/groups/GroupJoinView';
import { GroupsScreen } from '@/components/groups/GroupsScreen';

export default function JoinGroupScreen() {
  const { t } = useLocalSearchParams<{ t?: string }>();
  const initialLink = t ? String(t) : undefined;
  // Desktop opens the join dialog over the list; the phone keeps the full-screen view.
  return (
    <GroupsScreen
      initialDialog="join"
      initialLink={initialLink}
      phone={<GroupJoinView initialLink={initialLink} />}
    />
  );
}
