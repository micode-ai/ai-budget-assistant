import { useLocalSearchParams } from 'expo-router';
import { GroupJoinView } from '@/components/groups/GroupJoinView';

export default function JoinGroupScreen() {
  const { t } = useLocalSearchParams<{ t?: string }>();
  return <GroupJoinView initialLink={t ? String(t) : undefined} />;
}
