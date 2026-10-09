import { GroupCreateForm } from '@/components/groups/GroupCreateForm';
import { GroupsScreen } from '@/components/groups/GroupsScreen';

export default function NewGroupScreen() {
  // Desktop opens the create dialog over the list; the phone keeps the full-screen form.
  return <GroupsScreen initialDialog="new" phone={<GroupCreateForm />} />;
}
