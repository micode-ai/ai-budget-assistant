import { useState, useMemo } from 'react';
import type { AccountMember } from '@budget/shared-types';

interface UseMentionBarParams {
  inputText: string;
  setInputText: (text: string) => void;
  accountMembers: AccountMember[];
  userId: string | undefined;
  currentIsShared: boolean;
}

export function useMentionBar({
  inputText,
  setInputText,
  accountMembers,
  userId,
  currentIsShared,
}: UseMentionBarParams) {
  const [pendingMentions, setPendingMentions] = useState<{ userId: string }[]>([]);

  const mentionQuery = useMemo(() => {
    const m = inputText.match(/(?:^|\s)@([\p{L}\p{N}_]*)$/u);
    return m ? m[1].toLowerCase() : null;
  }, [inputText]);

  const mentionCandidates = useMemo(
    () =>
      currentIsShared && mentionQuery !== null
        ? accountMembers
            .filter((mem) => mem.userId !== userId)
            .filter((mem) => (mem.user?.name ?? '').toLowerCase().includes(mentionQuery))
        : [],
    [currentIsShared, mentionQuery, accountMembers, userId],
  );

  const insertMention = (mem: { userId: string; user?: { name?: string } }) => {
    const name = mem.user?.name ?? 'member';
    setInputText(inputText.replace(/@[\p{L}\p{N}_]*$/u, `@${name} `));
    setPendingMentions((prev) =>
      prev.some((p) => p.userId === mem.userId) ? prev : [...prev, { userId: mem.userId }],
    );
  };

  const getActiveMentions = (text: string) =>
    pendingMentions.filter((pm) => {
      const name = accountMembers.find((m) => m.userId === pm.userId)?.user?.name;
      return name ? text.includes(`@${name}`) : false;
    });

  const resetMentions = () => setPendingMentions([]);

  return { mentionCandidates, pendingMentions, insertMention, getActiveMentions, resetMentions };
}
