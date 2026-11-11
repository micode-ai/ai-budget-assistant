import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { LeafletBudget, LeafletMatch, LeafletResult, LeafletSource } from '@budget/shared-types';
import { api } from '@/services/api';
import { deleteSharedFile } from '@/services/shareIntake';
import { useShoppingListStore } from '@/stores/shoppingListStore';
import { showAlert } from '@/utils/alert';
import i18n from '@/i18n';
import { reopenableLeaflets } from './leafletActive';
import { LEAFLET_MAX_PAGES, type LeafletInputFile } from './leafletPages';
import { useLeafletReader, type LeafletReader } from './useLeafletReader';

export interface LeafletSessionOptions {
  /**
   * Files handed over by the share sheet — cache copies in `shared-intake/` that this session now
   * owns and deletes (see `releaseShared`). None → the screen offers a picker.
   */
  files?: LeafletInputFile[];
  source: LeafletSource;
  /**
   * Open the gallery at once (native only) when there are no files. Set ONLY when the user came
   * from a "read a leaflet" action (`/leaflets?from=pick`). Any other way in (the community push,
   * `from=push`, a deep link) lands on the idle state with the list of active leaflets (R13/R14).
   */
  autoPick?: boolean;
}

export interface LeafletSession {
  reader: LeafletReader;
  /** `GET /leaflets/budget`; null until loaded or when it failed. */
  budget: LeafletBudget | null;
  addedIds: ReadonlySet<string>;
  addToList: (match: LeafletMatch) => Promise<void>;
  /** The multi-image picker (gallery on a phone, a file input on web). */
  pickImages: () => Promise<void>;
  /** Images or one PDF through the document picker — the desktop "Choose files". */
  pickFiles: () => Promise<void>;
  /** Reads files from a desktop drop. */
  readFiles: (files: LeafletInputFile[], source: LeafletSource) => void;
  retry: () => void;
  /** The account's active leaflets that have something to reopen (`GET /leaflets`); null until loaded. */
  active: LeafletResult[] | null;
  /** Loads one active leaflet (`GET /leaflets/:id`) and shows its matches with the usual rows. */
  openLeaflet: (id: string) => Promise<void>;
  /** Back to the idle state and its list (only when nothing is being read). */
  closeLeaflet: () => void;
}

/**
 * Everything the leaflet screen holds, in one hook called ONCE by the platform screen file
 * (`LeafletScreen.tsx` / `LeafletScreen.web.tsx`) and passed down to the phone or desktop body.
 * A resize across 1024 swaps the body, never this state, so a read in flight survives it.
 */
export function useLeafletSession({ files, source, autoPick = false }: LeafletSessionOptions): LeafletSession {
  const reader = useLeafletReader();
  const [budget, setBudget] = useState<LeafletBudget | null>(null);
  const [active, setActive] = useState<LeafletResult[] | null>(null);
  const [addedIds, setAddedIds] = useState<ReadonlySet<string>>(() => new Set());
  const lastRun = useRef<{ files: LeafletInputFile[]; source: LeafletSource } | null>(null);
  const autoStarted = useRef(false);

  const loadBudget = useCallback(async () => {
    try {
      setBudget(await api.getLeafletBudget());
    } catch (e) {
      console.warn('[leaflets] budget load failed:', e);
    }
  }, []);

  const loadActive = useCallback(async () => {
    try {
      setActive(reopenableLeaflets(await api.getActiveLeaflets()));
    } catch (e) {
      console.warn('[leaflets] active list load failed:', e);
    }
  }, []);

  const { start, reset, show } = reader;
  // Object URLs (`blob:`) of the current run, from a desktop drop. Owned here, not by the desktop
  // body, so a resize across 1024 mid-read cannot revoke them under the reader or break Retry.
  // Released when the next run starts and when the screen goes away; never written anywhere.
  const revokeRunUrls = useCallback(() => {
    if (Platform.OS !== 'web' || typeof URL === 'undefined') return;
    for (const f of lastRun.current?.files ?? []) {
      if (f.uri.startsWith('blob:')) URL.revokeObjectURL(f.uri);
    }
  }, []);
  useEffect(() => revokeRunUrls, [revokeRunUrls]);

  // Shared-file cache copies this session still owns. A leaflet image is never kept past
  // processing: each copy is deleted once a run has read it, and whatever is left (a run that
  // failed and kept its files for Retry, one superseded, one never started) when the screen goes
  // away. `deleteSharedFile` only ever deletes inside `shared-intake/` and is a no-op off Android.
  const sharedUris = useRef<Set<string>>(new Set((files ?? []).map((f) => f.uri)));
  const releaseShared = useCallback((only?: LeafletInputFile[]) => {
    const owned = sharedUris.current;
    const uris = only ? only.map((f) => f.uri).filter((u) => owned.has(u)) : [...owned];
    for (const uri of uris) {
      owned.delete(uri);
      void deleteSharedFile(uri);
    }
  }, []);
  useEffect(() => () => releaseShared(), [releaseShared]);

  const run = useCallback(
    (picked: LeafletInputFile[], runSource: LeafletSource) => {
      if (lastRun.current && lastRun.current.files !== picked) revokeRunUrls();
      lastRun.current = { files: picked, source: runSource };
      setAddedIds(new Set());
      void start(picked, runSource).then((done) => {
        if (done) releaseShared(picked);
      });
    },
    [start, revokeRunUrls, releaseShared],
  );

  const pickImages = useCallback(async () => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: LEAFLET_MAX_PAGES,
      });
      if (picked.canceled || picked.assets.length === 0) return;
      run(
        picked.assets.map((a) => ({
          uri: a.uri,
          mimeType: a.mimeType ?? 'image/jpeg',
          size: a.fileSize ?? 0,
        })),
        'picker',
      );
    } catch (e) {
      console.warn('[leaflets] image picker failed:', e);
    }
  }, [run]);

  const pickFiles = useCallback(async () => {
    try {
      const DocumentPicker = await import('expo-document-picker');
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const chosen = picked.assets.map((a) => ({
        uri: a.uri,
        mimeType: a.mimeType ?? (a.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        size: a.size ?? 0,
      }));
      run(chosen, chosen.every((f) => f.mimeType === 'application/pdf') ? 'pdf' : 'upload');
    } catch (e) {
      console.warn('[leaflets] file picker failed:', e);
    }
  }, [run]);

  const retry = useCallback(() => {
    const last = lastRun.current;
    if (!last) return;
    reset();
    run(last.files, last.source);
  }, [reset, run]);

  const openLeaflet = useCallback(
    async (id: string) => {
      if (reader.reading) return;
      try {
        const leaflet = await api.getLeaflet(id);
        lastRun.current = null;
        setAddedIds(new Set());
        show(leaflet);
      } catch (e) {
        console.warn('[leaflets] open failed:', e);
        showAlert(i18n.t('common.error'), i18n.t('leaflets.openFailed'));
      }
    },
    [reader.reading, show],
  );

  const closeLeaflet = useCallback(() => {
    if (reader.reading) return;
    reset();
  }, [reader.reading, reset]);

  const addToList = useCallback(async (match: LeafletMatch) => {
    try {
      const store = useShoppingListStore.getState();
      // `addItem` needs a list to add to; outside the shopping-list screen none may be loaded yet.
      if (store.lists.length === 0) await store.hydrate();
      if (useShoppingListStore.getState().lists.length === 0) {
        showAlert(i18n.t('common.error'), i18n.t('leaflets.addFailed'));
        return;
      }
      await useShoppingListStore.getState().addItem(match.basketName, match.basketName);
      setAddedIds((prev) => new Set(prev).add(match.itemId));
      api.markLeafletItemAdded(match.itemId).catch((e) => console.warn('[leaflets] mark added failed:', e));
    } catch (e) {
      console.warn('[leaflets] add to list failed:', e);
      showAlert(i18n.t('common.error'), i18n.t('leaflets.addFailed'));
    }
  }, []);

  useEffect(() => {
    void loadBudget();
    void loadActive();
  }, [loadBudget, loadActive]);

  // Refetch the budget and the active list after each run.
  const wasReading = useRef(false);
  useEffect(() => {
    if (wasReading.current && !reader.reading) {
      void loadBudget();
      void loadActive();
    }
    wasReading.current = reader.reading;
  }, [reader.reading, loadBudget, loadActive]);

  // Shared files read at once. With none, a phone opens the gallery straight away only when the
  // user asked to read a leaflet (`autoPick`); otherwise (the push, a deep link) the idle state
  // and its active list show. Web never auto-opens: a browser blocks a chooser no click opened.
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    if (files && files.length > 0) run(files, source);
    else if (autoPick && Platform.OS !== 'web') void pickImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    reader,
    budget,
    addedIds,
    addToList,
    pickImages,
    pickFiles,
    readFiles: run,
    retry,
    active,
    openLeaflet,
    closeLeaflet,
  };
}
