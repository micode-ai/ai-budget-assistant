import { useMemo, useState } from 'react';
import { filterAvailableRecentNames } from '@/components/split/recentParticipants';

/**
 * The "add a person" sub-flow of the receipt-split creation form
 * (`src/components/receipt-split/AssignmentEditor.tsx`) — the name input,
 * the "people you've split with before" suggestion chips, and the two ways
 * a name gets committed (typing + confirm, or tapping a recent-name chip).
 *
 * Extracted out of the screen so the assignment editor doesn't also have to
 * own this state; `onAdd` is the only thing that reaches back into the
 * editor's `participants` list.
 */
export function useAddParticipant(
  recentParticipantNames: string[],
  currentParticipantNames: string[],
  onAdd: (name: string) => void,
) {
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');

  // "People you've split with before" suggestion chips: server-recent names,
  // narrowed to exclude anyone already added to THIS split and (while
  // typing) to substring matches. Capped to 6 for layout, same convention as
  // app/expense/location.tsx's recents UX.
  const availableRecentNames = useMemo(
    () =>
      filterAvailableRecentNames(recentParticipantNames, newPersonName, currentParticipantNames).slice(
        0,
        6,
      ),
    [recentParticipantNames, newPersonName, currentParticipantNames],
  );

  function openAdd() {
    setIsAddingPerson(true);
  }

  function handleConfirmAddPerson() {
    const trimmed = newPersonName.trim();
    if (trimmed) onAdd(trimmed);
    setNewPersonName('');
    setIsAddingPerson(false);
  }

  // Tapping a "people you've split with before" suggestion adds them
  // directly — the whole point is to let the payer tap instead of retype.
  function handleSelectRecentName(name: string) {
    onAdd(name);
    setNewPersonName('');
    setIsAddingPerson(false);
  }

  return {
    isAddingPerson,
    newPersonName,
    setNewPersonName,
    availableRecentNames,
    openAdd,
    handleConfirmAddPerson,
    handleSelectRecentName,
  };
}
