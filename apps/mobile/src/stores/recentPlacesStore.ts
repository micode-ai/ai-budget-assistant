import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';

export interface RecentPlace {
  lat: number;
  lng: number;
  name: string;
}

const MAX = 8;
const KEY = 'places';
const mmkv = new MMKV({ id: 'recent-places' });

// Pure: parse + validate the stored JSON (or undefined) into a clean list.
export const loadRecentPlaces = (read: (key: string) => string | undefined): RecentPlace[] => {
  const raw = read(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is RecentPlace =>
          !!p &&
          typeof p.lat === 'number' &&
          Number.isFinite(p.lat) &&
          typeof p.lng === 'number' &&
          Number.isFinite(p.lng) &&
          typeof p.name === 'string' &&
          p.name.trim().length > 0,
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
};

// Pure: prepend a place, dedupe by name (case-insensitive), cap at MAX.
export const addToRecentPlaces = (list: RecentPlace[], place: RecentPlace): RecentPlace[] => {
  const name = place.name.trim();
  if (!name || !Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return list;
  const norm = name.toLowerCase();
  return [
    { lat: place.lat, lng: place.lng, name },
    ...list.filter((p) => p.name.trim().toLowerCase() !== norm),
  ].slice(0, MAX);
};

interface RecentPlacesState {
  recents: RecentPlace[];
  addRecent: (place: RecentPlace) => void;
  clear: () => void;
}

export const useRecentPlacesStore = create<RecentPlacesState>((set) => ({
  recents: loadRecentPlaces((k) => mmkv.getString(k)),

  addRecent: (place) =>
    set((s) => {
      const next = addToRecentPlaces(s.recents, place);
      if (next === s.recents) return s;
      mmkv.set(KEY, JSON.stringify(next));
      return { recents: next };
    }),

  clear: () =>
    set(() => {
      mmkv.delete(KEY);
      return { recents: [] };
    }),
}));
