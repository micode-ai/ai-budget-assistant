import type { CreateGroupDto } from '@budget/shared-types';
import { MAX_GROUP_NAME_LENGTH, MAX_MEMBER_NAME_LENGTH } from './groupSplit';

/** The API accepts at most 50 live members, the creator included. */
export const MAX_INITIAL_MEMBER_NAMES = 49;

/** First user-perceived character of `text`, or undefined when blank. */
export function firstGrapheme(text: string): string | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => { segment(s: string): Iterable<{ segment: string }> } })
    .Segmenter;
  if (Seg) {
    for (const part of new Seg(undefined, { granularity: 'grapheme' }).segment(t)) return part.segment;
  }
  return Array.from(t)[0];
}

export interface CreateGroupInput {
  name: string;
  emoji: string;
  currencyCode: string;
  myDisplayName: string;
  memberNames: string[];
}

/**
 * Builds the create request from the raw form. Blank and duplicate member names are dropped
 * (names are the only identity cue guests have, and the API rejects a clash), as is any name
 * equal to the creator's own. Returns null when the group name is blank.
 */
export function buildCreateGroupDto(input: CreateGroupInput): CreateGroupDto | null {
  const name = input.name.trim().slice(0, MAX_GROUP_NAME_LENGTH);
  if (!name) return null;

  const me = input.myDisplayName.trim().slice(0, MAX_MEMBER_NAME_LENGTH);
  const seen = new Set<string>(me ? [me.toLowerCase()] : []);
  const memberNames: string[] = [];
  for (const raw of input.memberNames) {
    const n = raw.trim().slice(0, MAX_MEMBER_NAME_LENGTH);
    const key = n.toLowerCase();
    if (!n || seen.has(key)) continue;
    seen.add(key);
    memberNames.push(n);
    if (memberNames.length >= MAX_INITIAL_MEMBER_NAMES) break;
  }

  const emoji = firstGrapheme(input.emoji);
  return {
    name,
    currencyCode: input.currencyCode,
    ...(emoji ? { emoji } : {}),
    ...(me ? { myDisplayName: me } : {}),
    ...(memberNames.length > 0 ? { memberNames } : {}),
  };
}
