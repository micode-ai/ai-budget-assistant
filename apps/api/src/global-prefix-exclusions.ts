/**
 * Routes served WITHOUT the `api/v1` global prefix (see `main.ts`).
 *
 * Two kinds of route live here:
 *
 * 1. Inbound webhooks, whose URL is registered with a third party (Stripe,
 *    Telegram, WhatsApp, Slack) and cannot carry our versioning scheme.
 * 2. The receipt-split guest pages (`/s/...`), which are links we hand to
 *    people outside the app. `ReceiptSplitService.buildGuestUrl` /
 *    `buildGuestGroupUrl` bake that bare `/s/...` shape into the link and into
 *    the QR code, so a guest route that picks up the prefix is a 404 nobody
 *    notices until someone outside the team opens the link.
 *
 * The guest entry is a WILDCARD on purpose. It used to name each guest route
 * one by one (`s/:token`, `s/:token/paid`), which made this a parallel list
 * somebody had to remember to update — and when the QR-code group routes
 * (`s/g/:groupToken`, `s/g/:groupToken/:seq`) were added to `GuestController`,
 * nobody did, so every scanned QR 404'd. `GuestController` is the only
 * controller mounted under `s`, so covering the whole subtree is both safe and
 * the only shape that cannot fall behind the controller.
 *
 * Nest compiles each string with `path-to-regexp` and matches it against the
 * route's DEFINITION path (`/s/g/:groupToken`, params and all) — NOT against a
 * request URL. Note `*` is a literal in path-to-regexp 3.x (what Nest 10 ships):
 * the wildcard has to be written `(.*)`.
 */
export const GLOBAL_PREFIX_EXCLUDED_ROUTES: string[] = [
  'webhooks/stripe',
  'telegram/webhook',
  'whatsapp/webhook',
  'slack/events',
  'slack/interactivity',
  'slack/install',
  'slack/oauth/callback',
  // Every GuestController route: /s/:token, /s/:token/paid,
  // /s/g/:groupToken, /s/g/:groupToken/:seq, and anything added later.
  's/(.*)',
  // Every ShoppingListGuestController route (shopping-list-guest-share-link):
  // /sl/:token, /sl/:token/items/:itemId/toggle. Same wildcard reasoning as
  // 's/(.*)' above — one controller, one entry, nothing to fall behind.
  'sl/(.*)',
];
