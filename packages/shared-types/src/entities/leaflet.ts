export type LeafletKind = 'personal' | 'admin';
export type LeafletSource = 'share' | 'picker' | 'upload' | 'pdf' | 'admin';
export type LeafletStatus = 'reading' | 'done' | 'failed';
export type LeafletPlatform = 'android' | 'web' | 'ios';

export interface LeafletMatch {
  itemId: string;
  name: string;
  promoPrice: number;
  regularPrice: number | null;
  currencyCode: string;
  condition: string | null;
  basketName: string;
  usualPrice: number | null;
}

export interface LeafletResult {
  id: string;
  chain: string | null;
  validFrom: string | null;
  validTo: string | null;
  status: LeafletStatus;
  pagesRead: number;
  pagesUnreadable: number;
  pagesDropped: number;
  matches: LeafletMatch[];
  unmatchedCount: number;
}

export interface LeafletPageResult {
  page: number;
  readable: boolean;
  matches: LeafletMatch[];
  unmatchedCount: number;
}

export interface LeafletBudget {
  used: number;
  limit: number;
  resetAt: string;
}

/** Admin dashboard (Gazetka match): one admin-uploaded leaflet in the list. */
export interface AdminLeafletSummary {
  id: string;
  chain: string | null;
  /** `YYYY-MM-DD` */
  validFrom: string | null;
  /** `YYYY-MM-DD` */
  validTo: string | null;
  currencyCode: string | null;
  status: LeafletStatus;
  pagesRead: number;
  pagesUnreadable: number;
  pagesDropped: number;
  itemCount: number;
  /** ISO timestamp; set by publish, kept on unpublish. */
  publishedAt: string | null;
  /** ISO timestamp; a leaflet is live while `publishedAt` is set and this is null. */
  unpublishedAt: string | null;
  createdAt: string;
}

/** One extracted offer of an admin leaflet, as reviewed before publish. */
export interface AdminLeafletItem {
  id: string;
  page: number;
  name: string;
  canonicalName: string;
  promoPrice: number;
  regularPrice: number | null;
  currencyCode: string;
  condition: string | null;
  /** `YYYY-MM-DD`, only when the item's validity differs from the leaflet's. */
  validFrom: string | null;
  validTo: string | null;
}

export interface AdminLeafletDetail extends AdminLeafletSummary {
  items: AdminLeafletItem[];
}

/** `GET /admin/leaflets/stats` — personal-leaflet usage and community pushes, ADMIN_EMAILS excluded. */
export interface AdminLeafletStats {
  personalLeaflets: number;
  sharesWithMatch: number;
  pagesRead: number;
  pagesUnreadable: number;
  pagesDropped: number;
  matchesShown: number;
  addedToList: number;
  pushesSent: number;
  pushesOpened: number;
}

/** `POST /admin/leaflets/:id/publish` — the leaflet plus how many promo rows were actually written. */
export interface AdminLeafletPublishResult extends AdminLeafletDetail {
  promosWritten: number;
}
