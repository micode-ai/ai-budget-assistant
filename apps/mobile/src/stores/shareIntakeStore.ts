import { create } from 'zustand';
import {
  EMPTY_QUEUE, enqueue, advance, remaining, type ShareQueue, type SharedFile,
} from '@/features/share-intake/shareIntakeQueue';
import { deleteSharedFile } from '@/services/shareIntake';

interface ShareIntakeState {
  queue: ShareQueue;
  /** Files dropped by add() (cap/MIME/native limits) — shown once, then cleared by the view. */
  lastDropped: number;
  /** Shared plain texts waiting for the root hook (SMS / e-mail / chat). */
  texts: string[];
  /** Set when a queue arrives; the root `useShareIntake` hook consumes it. */
  pendingNavigation: boolean;
  /** True while `expense/receipt?source=share` is mounted — the root hook stays idle then. */
  screenOpen: boolean;
  /**
   * Files the user sent to the leaflet screen from the share chooser, waiting for that screen to
   * take them on mount. Expo Router params cannot carry file objects, so they ride here.
   */
  leafletFiles: SharedFile[];
  add: (files: SharedFile[], nativeDropped: number) => void;
  addTexts: (texts: string[]) => void;
  /** Returns and clears the waiting texts. */
  takeTexts: () => string[];
  /** Advances; returns the finished file. */
  next: () => SharedFile | null;
  /** Returns everything not yet processed and empties the queue. */
  discardAll: () => SharedFile[];
  /**
   * Moves every unprocessed queued file to `leafletFiles` (appending to any not yet taken) and
   * empties the queue. Returns how many were handed over.
   */
  handOffToLeaflets: () => number;
  /** Returns and clears `leafletFiles` — the leaflet screen now owns those cache copies. */
  takeFiles: () => SharedFile[];
  consumeNavigation: () => void;
  clearDropped: () => void;
  setScreenOpen: (open: boolean) => void;
  /** Clears everything; deletes the cache copies of a leaflet hand-off nobody took. */
  reset: () => void;
}

/**
 * In-memory only, deliberately (spec: a queue lost to process death is re-shared,
 * persisting it is not worth the complexity). Reset on sign-out.
 */
export const useShareIntakeStore = create<ShareIntakeState>((set, get) => ({
  queue: EMPTY_QUEUE,
  lastDropped: 0,
  texts: [],
  pendingNavigation: false,
  screenOpen: false,
  leafletFiles: [],
  addTexts: (texts) => { if (texts.length) set((s) => ({ texts: [...s.texts, ...texts] })); },
  takeTexts: () => {
    const t = get().texts;
    set({ texts: [] });
    return t;
  },
  add: (files, nativeDropped) => {
    const before = get().queue;
    const { queue, dropped } = enqueue(before, files);
    const accepted = queue !== before;
    set((s) => ({
      queue,
      lastDropped: s.lastDropped + nativeDropped + dropped.length,
      pendingNavigation: s.pendingNavigation || accepted,
    }));
  },
  next: () => {
    const { queue, finished } = advance(get().queue);
    set({ queue });
    return finished;
  },
  discardAll: () => {
    const left = remaining(get().queue);
    set({ queue: EMPTY_QUEUE });
    return left;
  },
  handOffToLeaflets: () => {
    const left = remaining(get().queue);
    set((s) => ({ queue: EMPTY_QUEUE, leafletFiles: [...s.leafletFiles, ...left] }));
    return left.length;
  },
  takeFiles: () => {
    const files = get().leafletFiles;
    set({ leafletFiles: [] });
    return files;
  },
  consumeNavigation: () => set({ pendingNavigation: false }),
  clearDropped: () => set({ lastDropped: 0 }),
  setScreenOpen: (screenOpen) => set({ screenOpen }),
  reset: () => {
    // A hand-off the leaflet screen never took (signed out first) would otherwise sit in the
    // cache until the 24 h purge — leaflet images are never kept past processing.
    get().leafletFiles.forEach((f) => void deleteSharedFile(f.uri));
    set({ queue: EMPTY_QUEUE, lastDropped: 0, texts: [], pendingNavigation: false, screenOpen: false, leafletFiles: [] });
  },
}));
