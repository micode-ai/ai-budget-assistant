/**
 * Pure queue behind share-to-capture (spec 2026-09-26-share-to-capture-design).
 * `files` holds every file of the current run; `index` points at the file on the
 * confirm card. Files before `index` are done (saved or skipped) — they are kept
 * so `position` can say "2 of 5" without a second counter. A run that advances
 * past its last file collapses back to EMPTY_QUEUE, which starts the next run
 * from "1 of N".
 */
export interface SharedFile {
  uri: string;
  mimeType: string;
  name: string;
  size: number;
}

export interface ShareQueue {
  files: SharedFile[];
  index: number;
  total: number;
}

export const SHARE_QUEUE_MAX = 10;
export const EMPTY_QUEUE: ShareQueue = Object.freeze({ files: [], index: 0, total: 0 }) as ShareQueue;

export function isAcceptedMime(mime: string): boolean {
  return mime.startsWith('image/') || mime === 'application/pdf';
}

export function enqueue(
  q: ShareQueue,
  incoming: SharedFile[],
): { queue: ShareQueue; dropped: SharedFile[] } {
  const dropped: SharedFile[] = [];
  const accepted: SharedFile[] = [];
  for (const file of incoming) {
    if (!isAcceptedMime(file.mimeType) || q.total + accepted.length >= SHARE_QUEUE_MAX) {
      dropped.push(file);
    } else {
      accepted.push(file);
    }
  }
  if (accepted.length === 0) return { queue: q, dropped };
  const files = [...q.files, ...accepted];
  return { queue: { files, index: q.index, total: files.length }, dropped };
}

export function current(q: ShareQueue): SharedFile | null {
  return q.files[q.index] ?? null;
}

export function advance(q: ShareQueue): { queue: ShareQueue; finished: SharedFile | null } {
  const finished = current(q);
  if (!finished) return { queue: q, finished: null };
  const index = q.index + 1;
  if (index >= q.files.length) return { queue: EMPTY_QUEUE, finished };
  return { queue: { ...q, index }, finished };
}

export function remaining(q: ShareQueue): SharedFile[] {
  return q.files.slice(q.index);
}

export function position(q: ShareQueue): { n: number; of: number } | null {
  return current(q) ? { n: q.index + 1, of: q.total } : null;
}
