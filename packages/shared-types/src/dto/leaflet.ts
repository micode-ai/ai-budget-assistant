import type { LeafletPlatform, LeafletSource } from '../entities/leaflet';

export interface CreateLeafletRequest {
  source: LeafletSource;
  platform: LeafletPlatform | null;
}

export interface LeafletPageRequest {
  imageBase64: string;
  mimeType?: string;
}

export interface LeafletPdfRequest {
  pdfBase64: string;
}

/** `PATCH /admin/leaflets/:id` — dates are `YYYY-MM-DD`; allowed only while the leaflet is not live. */
export interface UpdateAdminLeafletRequest {
  chain?: string;
  validFrom?: string | null;
  validTo?: string | null;
}

/** `PATCH /admin/leaflets/:id/items/:itemId` — allowed only while the leaflet is not live. */
export interface UpdateAdminLeafletItemRequest {
  name?: string;
  canonicalName?: string;
  promoPrice?: number;
  regularPrice?: number | null;
  condition?: string | null;
}
