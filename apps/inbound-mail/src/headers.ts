/**
 * Raw top-level header scan. mailparser silently keeps only one value of a repeated header,
 * and a message with two From/Subject/Date lines is a spoofing attempt (the DKIM signature
 * may cover one copy while the parser reads the other), so duplicates are counted here
 * independently of the parser.
 */
const MAX_HEADER_BYTES = 256 * 1024;

export function topLevelHeaders(raw: Buffer): Map<string, string[]> {
  const head = raw.subarray(0, MAX_HEADER_BYTES).toString('latin1');
  const m = /\r?\n\r?\n/.exec(head);
  const block = m ? head.slice(0, m.index) : head;
  const unfolded = block.replace(/\r?\n[ \t]+/g, ' ');
  const out = new Map<string, string[]>();
  for (const line of unfolded.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    if (!/^[!-9;-~]+$/.test(name)) continue;
    const list = out.get(name) ?? [];
    list.push(line.slice(colon + 1).trim());
    out.set(name, list);
  }
  return out;
}

/** True when From, Subject or Date appears more than once. */
export function hasDuplicateIdentityHeaders(h: Map<string, string[]>): boolean {
  return ['from', 'subject', 'date'].some((n) => (h.get(n)?.length ?? 0) > 1);
}

/** Lower-cased e-mail addresses found anywhere in the given header values. */
export function addressesIn(values: string[] | undefined): string[] {
  const out: string[] = [];
  for (const v of values ?? []) {
    for (const a of v.match(/[^\s<>",;:()]+@[^\s<>",;:()]+/g) ?? []) out.push(a.toLowerCase());
  }
  return out;
}
