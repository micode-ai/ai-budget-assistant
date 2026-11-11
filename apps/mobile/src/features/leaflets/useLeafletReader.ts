import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type {
  LeafletMatch,
  LeafletPageResult,
  LeafletPlatform,
  LeafletResult,
  LeafletSource,
} from '@budget/shared-types';
import { api } from '@/services/api';
import { trackAction } from '@/services/telemetry';
import { useUpgradeStore } from '@/stores/upgradeStore';
import { downscaleForOcr } from '@/features/receipt/receiptImage';
import { releaseReceipt } from '@/features/receipt/receiptImageCache';
import { uriToBase64 } from '@/utils/fileBase64';
import i18n from '@/i18n';
import { pdfUploadFailure, planLeafletPages, type LeafletInputFile } from './leafletPages';

export type LeafletReaderError = 'empty_basket' | 'encrypted' | 'failed' | null;

export interface LeafletReader {
  /**
   * Resolves `true` when the run is over with the files no longer needed — every page sent, or
   * nothing in them could be read at all (too large, no images). `false` when the files may still
   * be needed: the run failed before reading (Retry re-reads them), was superseded by a reset or
   * a newer run, or was ignored because another run was still reading.
   */
  start: (files: LeafletInputFile[], source: LeafletSource) => Promise<boolean>;
  /** The leaflet as read so far; rows append as pages arrive. */
  result: LeafletResult | null;
  /** Pages sent / pages planned. For a PDF `total` is 0 (the server renders it) and `done` is pages read. */
  progress: { done: number; total: number };
  error: LeafletReaderError;
  reading: boolean;
  /** Files the client never sent: past 10 pages, a PDF beside images, a stopped run's remainder. */
  dropped: number;
  tooLargePdf: boolean;
  /** The monthly page budget ran out mid-read; earlier rows are kept. */
  limitReached: boolean;
  reset: () => void;
  /** Shows a leaflet read earlier (reopened from the active list) as if it had just been read. */
  show: (leaflet: LeafletResult) => void;
}

const PDF_POLL_MS = 2000;
/** A PDF of 10 pages reads in well under a minute; stop polling a stuck read after this. */
const PDF_POLL_MAX_MS = 5 * 60 * 1000;

interface ApiErrorLike {
  status?: number;
  code?: string;
}

const asApiError = (e: unknown): ApiErrorLike => (typeof e === 'object' && e !== null ? (e as ApiErrorLike) : {});

function startErrorOf(e: unknown): Exclude<LeafletReaderError, null> {
  const { code } = asApiError(e);
  if (code === 'EMPTY_BASKET') return 'empty_basket';
  if (code === 'ENCRYPTED_ACCOUNT') return 'encrypted';
  return 'failed';
}

function currentPlatform(): LeafletPlatform | null {
  if (Platform.OS === 'web') return 'web';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return null;
}

function mergeMatches(existing: LeafletMatch[], incoming: LeafletMatch[]): LeafletMatch[] {
  const seen = new Set(existing.map((m) => m.itemId));
  return [...existing, ...incoming.filter((m) => !seen.has(m.itemId))];
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Gazetka match reader. Sends a leaflet's pages one at a time (each downscaled through
 * `downscaleForOcr` before it is base64-encoded, like a receipt) and merges each page's matches in
 * as it arrives, or uploads one PDF and polls until the server finishes reading it.
 *
 * Never keeps an image: the base64 lives for one request. A new `start` or an unmount abandons the
 * running loop (its results are dropped, the server keeps whatever it already read).
 */
export function useLeafletReader(): LeafletReader {
  const [result, setResult] = useState<LeafletResult | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<LeafletReaderError>(null);
  const [reading, setReading] = useState(false);
  const [dropped, setDropped] = useState(0);
  const [tooLargePdf, setTooLargePdf] = useState(false);
  const [limitReached, setLimitReached] = useState(false);

  // Bumped by every start/reset/unmount; a loop whose run id is stale stops writing state.
  const runRef = useRef(0);
  const readingRef = useRef(false);
  useEffect(
    () => () => {
      runRef.current += 1;
    },
    [],
  );

  const reset = useCallback(() => {
    runRef.current += 1;
    readingRef.current = false;
    setResult(null);
    setProgress({ done: 0, total: 0 });
    setError(null);
    setReading(false);
    setDropped(0);
    setTooLargePdf(false);
    setLimitReached(false);
  }, []);

  const start = useCallback(async (files: LeafletInputFile[], source: LeafletSource): Promise<boolean> => {
    if (readingRef.current) return false;
    const plan = planLeafletPages(files);
    const run = ++runRef.current;
    const live = () => runRef.current === run;

    setResult(null);
    setError(null);
    setLimitReached(false);
    setDropped(plan.dropped);
    setTooLargePdf(plan.tooLargePdf);
    setProgress({ done: 0, total: plan.pages.length });
    if (plan.pages.length === 0 && !plan.pdf) return true;

    readingRef.current = true;
    setReading(true);
    trackAction('gazetka', 'started');
    let failed = false;

    try {
      let id: string;
      try {
        ({ id } = await api.createLeaflet({ source, platform: currentPlatform() }));
      } catch (e) {
        console.warn('[leaflets] create failed:', e);
        if (live()) setError(startErrorOf(e));
        failed = true;
        return false;
      }
      if (!live()) return false;
      setResult({
        id,
        chain: null,
        validFrom: null,
        validTo: null,
        status: 'reading',
        pagesRead: 0,
        pagesUnreadable: 0,
        pagesDropped: 0,
        matches: [],
        unmatchedCount: 0,
      });

      if (plan.pdf) {
        failed = !(await readPdf(id, plan.pdf.uri, live));
      } else {
        failed = !(await readPages(id, plan.pages, live));
      }
      return live() && !failed;
    } finally {
      if (live()) {
        readingRef.current = false;
        setReading(false);
      }
      trackAction('gazetka', failed ? 'failed' : 'completed');
    }

    // Returns false only when nothing could be read at all.
    async function readPages(id: string, pages: LeafletInputFile[], isLive: () => boolean): Promise<boolean> {
      let sent = 0;
      let headerFetched = false;
      for (let i = 0; i < pages.length; i++) {
        if (!isLive()) return true;
        setProgress({ done: i, total: pages.length });
        try {
          const original = pages[i];
          const small = await downscaleForOcr(original.uri);
          let page: LeafletPageResult;
          try {
            const imageBase64 = await uriToBase64(small);
            // A failed downscale falls back to the original file, which keeps its own type.
            const mimeType = small === original.uri ? original.mimeType : 'image/jpeg';
            page = await api.readLeafletPage(id, { imageBase64, mimeType });
          } finally {
            // The downscaled JPEG is a cache file of our own: never keep a leaflet image past its read.
            if (small !== original.uri) void releaseReceipt(small);
          }
          sent++;
          if (!isLive()) return true;
          setResult((prev) =>
            prev
              ? {
                  ...prev,
                  pagesRead: prev.pagesRead + (page.readable ? 1 : 0),
                  pagesUnreadable: prev.pagesUnreadable + (page.readable ? 0 : 1),
                  matches: mergeMatches(prev.matches, page.matches),
                  unmatchedCount: prev.unmatchedCount + page.unmatchedCount,
                }
              : prev,
          );
          // The chain and dates live on the leaflet, not the page: fetch them once a page was read.
          if (!headerFetched && page.readable) {
            headerFetched = true;
            await refreshHeader(id, isLive);
          }
        } catch (e) {
          const { code } = asApiError(e);
          const unsent = pages.length - i - 1;
          if (code === 'LEAFLET_LIMIT') {
            if (isLive()) {
              setLimitReached(true);
              setDropped((d) => d + unsent);
              useUpgradeStore.getState().show(i18n.t('leaflets.limitBody'), 'pro');
            }
            break;
          }
          if (code === 'PAGE_CAP') {
            if (isLive()) setDropped((d) => d + unsent);
            break;
          }
          console.warn('[leaflets] page read failed:', e);
          if (sent === 0) {
            if (isLive()) setError(startErrorOf(e));
            return false;
          }
          if (isLive()) setDropped((d) => d + unsent + 1);
          break;
        }
      }
      if (isLive()) setProgress({ done: pages.length, total: pages.length });
      // The server's own view is authoritative (it counted the refused page, normalized the chain).
      await refreshAll(id, isLive);
      return true;
    }

    async function readPdf(id: string, uri: string, isLive: () => boolean): Promise<boolean> {
      try {
        const pdfBase64 = await uriToBase64(uri);
        await api.uploadLeafletPdf(id, { pdfBase64 });
      } catch (e) {
        console.warn('[leaflets] PDF upload failed:', e);
        if (!isLive()) return true;
        const why = pdfUploadFailure(e, Platform.OS === 'web');
        // Nothing was read: back to the idle state, where the banner (or the paywall) explains why.
        if (why) setResult(null);
        if (why === 'too_large') {
          setTooLargePdf(true);
          return true;
        }
        if (why === 'limit') {
          setLimitReached(true);
          useUpgradeStore.getState().show(i18n.t('leaflets.limitBody'), 'pro');
          return true;
        }
        setError(startErrorOf(e));
        return false;
      }
      const startedAt = Date.now();
      while (isLive() && Date.now() - startedAt < PDF_POLL_MAX_MS) {
        await sleep(PDF_POLL_MS);
        if (!isLive()) return true;
        let leaflet: LeafletResult;
        try {
          leaflet = await api.getLeaflet(id);
        } catch (e) {
          console.warn('[leaflets] PDF poll failed:', e);
          continue;
        }
        if (!isLive()) return true;
        setResult(leaflet);
        setProgress({ done: leaflet.pagesRead + leaflet.pagesUnreadable, total: 0 });
        if (leaflet.status !== 'reading') {
          if (leaflet.status === 'failed' && leaflet.matches.length === 0) {
            setError('failed');
            return false;
          }
          return true;
        }
      }
      return true;
    }

    async function refreshHeader(id: string, isLive: () => boolean) {
      try {
        const leaflet = await api.getLeaflet(id);
        if (!isLive()) return;
        setResult((prev) =>
          prev ? { ...prev, chain: leaflet.chain, validFrom: leaflet.validFrom, validTo: leaflet.validTo } : leaflet,
        );
      } catch (e) {
        console.warn('[leaflets] header fetch failed:', e);
      }
    }

    async function refreshAll(id: string, isLive: () => boolean) {
      try {
        const leaflet = await api.getLeaflet(id);
        if (isLive()) setResult(leaflet);
      } catch (e) {
        console.warn('[leaflets] final fetch failed:', e);
      }
    }
  }, []);

  const show = useCallback(
    (leaflet: LeafletResult) => {
      reset();
      setResult(leaflet);
    },
    [reset],
  );

  return { start, result, progress, error, reading, dropped, tooLargePdf, limitReached, reset, show };
}
