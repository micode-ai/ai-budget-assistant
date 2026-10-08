import { useLocalSearchParams } from 'expo-router';
import { GroupLinkView } from '@/components/groups/GroupLinkView';

export default function GroupLinkScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <GroupLinkView code={code ? String(code) : undefined} />;
}
