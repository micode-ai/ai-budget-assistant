import type { DocTexts } from './openapi';

/**
 * English texts of the public API reference. Keys are produced by `textSlots` in `openapi.ts`;
 * `texts.spec.ts` keeps `texts.pl.ts` and `texts.ru.ts` on exactly the same key set.
 * Field names, codes, URLs and examples stay identical in every language.
 */
export const TEXTS_EN: DocTexts = {
  'ui.siteTitle': 'AI Budget API — reference',
  'info.title': 'AI Budget API',
  'server.production': 'Production',

  // ── security ─────────────────────────────────────────────────────────────
  'security.oauth2':
    'OAuth 2.0 authorization code flow with PKCE (`S256` only). The user signs in to AI Budget, picks ONE account and approves the scopes; your app exchanges the code for an access token (1 hour) and a refresh token (90 days, rotated on every use). Send the access token as `Authorization: Bearer <access_token>`.',
  'scope.expenses:read': 'Read expenses: list, details with line items, and the changes feed.',
  'scope.expenses:write': 'Create, edit and delete expenses.',
  'scope.receipts:read': 'Download the original receipt file attached to an expense.',
  'scope.categories:read': "Read the account's expense categories.",

  // ── tags ─────────────────────────────────────────────────────────────────
  'tag.OAuth':
    'Token exchange, refresh and revocation (RFC 6749 / RFC 7009). These endpoints answer errors as `{"error", "error_description"}`, not in the `/public/v1` error shape.',
  'tag.Account': 'The account the access token is bound to.',
  'tag.Categories': "The account's expense categories, for `category_id`.",
  'tag.Expenses': 'Expenses: read, incremental sync, receipts and writes.',

  // ── shared error responses ────────────────────────────────────────────────
  'error.public.400':
    '`validation_failed` — the request is malformed (unknown parameter, wrong type or format, missing required field); `details.fields` lists the problems per field. `invalid_cursor` — the cursor was not taken unchanged from a previous response. A well-formed request that refers to records outside the connected account, or to fields a shared group owns, is `422`, not `400`.',
  'error.public.401':
    '`invalid_token` — the access token is missing, invalid, expired or revoked. Refresh it once; if refreshing fails with `invalid_grant`, the user has to connect your app again.',
  'error.public.403':
    '`insufficient_scope` (the connection lacks a scope this request needs; `details.required` lists it), `grant_inactive` (the user who connected the app can no longer edit this account), `account_encrypted` (an end-to-end encrypted account: read-only, no merchant/search filters, no receipts).',
  'error.public.404': '`not_found` — no such record in the connected account (or it was deleted).',
  'error.public.429':
    '`rate_limited` — too many requests. Wait the number of seconds in the `Retry-After` header.',
  'error.public.503': '`unavailable` — a temporary failure on our side. Retry shortly with backoff.',
  'error.oauth.400':
    '`invalid_request` (missing or contradictory parameter), `invalid_grant` (code or refresh token invalid, expired, already used, or the connection is no longer active), `unsupported_grant_type`, `invalid_scope`.',
  'error.oauth.401':
    '`invalid_client` — unknown or blocked client, a wrong secret, or a secret sent by a public client.',
  'error.oauth.404': 'The public API is not enabled.',
  'error.oauth.429': '`slow_down` — more than 30 token requests per minute for this client (a public client is counted only on requests with its valid code or refresh token). Retry after 60 seconds.',
  'error.oauth.503': '`temporarily_unavailable` — retry shortly.',

  // ── OAuth ────────────────────────────────────────────────────────────────
  'op.issueToken.summary': 'Exchange an authorization code or refresh a token',
  'op.issueToken.description':
    'Accepts `application/x-www-form-urlencoded` (standard) or JSON.\n\n' +
    'Client authentication: HTTP Basic (`client_id:client_secret`) or `client_id` + `client_secret` in the body. A public client (no secret) sends only `client_id` and relies on PKCE.\n\n' +
    '- `grant_type=authorization_code`: `code`, `redirect_uri` (exactly as in the authorize request) and `code_verifier` are required. A code is valid for 10 minutes and can be used once — a failed attempt burns it too.\n' +
    '- `grant_type=refresh_token`: `refresh_token` is required. The response carries a NEW refresh token; the old one stops working. Presenting an already used refresh token is treated as theft and revokes the whole connection — refresh from one place only.\n\n' +
    'Limit: 30 requests per minute per client.',
  'op.issueToken.body': 'Token request parameters.',
  'op.issueToken.response.200': 'A new access token and refresh token pair.',
  'op.revokeToken.summary': 'Revoke a token (disconnect)',
  'op.revokeToken.description':
    'RFC 7009. Revoking an access or a refresh token revokes the whole connection (every token of it). Always answers `200 {}` once the client is authenticated, whether or not the token existed.',
  'op.revokeToken.body': 'The token to revoke, plus client authentication.',
  'op.revokeToken.response.200': 'Revoked (or nothing to revoke).',

  // ── Account ──────────────────────────────────────────────────────────────
  'op.getAccount.summary': 'Get the connected account',
  'op.getAccount.description':
    'The account this connection is bound to and the user who connected it. Works with any valid token, whatever its scopes. `read_only: true` means the account is end-to-end encrypted: reads work with some fields withheld, writes answer `403 account_encrypted`.',
  'op.getAccount.response.200': 'The connected account.',

  // ── Categories ───────────────────────────────────────────────────────────
  'op.listCategories.summary': 'List expense categories',
  'op.listCategories.description':
    "Exactly the categories an expense write accepts as `category_id`: the account's own expense categories. On an end-to-end encrypted account `name` is `null` and listed in that category's `encrypted_fields`.",
  'op.listCategories.response.200': 'All expense categories of the account (not paginated).',

  // ── Expenses ─────────────────────────────────────────────────────────────
  'op.listExpenses.summary': 'List expenses',
  'op.listExpenses.description':
    'Newest first (by `date`, then `id`), paginated with an opaque cursor: pass `next_cursor` as `cursor` with the SAME filters until `has_more` is `false`. The list shape has no `items`; fetch one expense for its line items. Planned expenses are never returned.\n\n' +
    'On an end-to-end encrypted account the `merchant` and `search` filters answer `403 account_encrypted`.\n\n' +
    'To keep a copy in sync, use `GET /public/v1/expenses/changes` instead of re-listing.',
  'op.listExpenses.param.date_from': 'Only expenses on or after this date (`YYYY-MM-DD`, inclusive).',
  'op.listExpenses.param.date_to': 'Only expenses on or before this date (`YYYY-MM-DD`, inclusive).',
  'op.listExpenses.param.category_id': "Only expenses whose own `category_id` is this one (category splits are not searched).",
  'op.listExpenses.param.merchant': 'Case-insensitive "contains" match on the merchant.',
  'op.listExpenses.param.project_id': 'Only expenses linked to this project.',
  'op.listExpenses.param.search': 'Case-insensitive "contains" match on the description or the notes.',
  'op.listExpenses.param.limit': 'Page size, 1–200 (default 50).',
  'op.listExpenses.param.cursor': '`next_cursor` from the previous page, unchanged.',
  'op.listExpenses.response.200': 'One page of expenses.',

  'op.listExpenseChanges.summary': 'Changes feed (incremental sync)',
  'op.listExpenseChanges.description':
    'Every change to the account\'s expenses after `cursor`, oldest first. Each entry is an `upsert` (the full expense, with line items) or a `delete` (just the `id`).\n\n' +
    '- Without `cursor` the feed starts from the beginning: every expense, plus deletions from the past — deleting an id you never had is a no-op.\n' +
    '- An expense that is deleted, or turned into a planned expense, arrives as `delete`.\n' +
    '- An expense edited again moves to the end of the feed and arrives again with its latest state.\n' +
    '- A change appears in the feed about 10 seconds after it was made.\n' +
    '- Store `next_cursor` after processing each page (it is present even on an empty page) and continue from it; repeat while `has_more` is `true`.\n\n' +
    'Known limitations: an expense moved to another account is not reported as deleted in this one; renaming a tag or project does not re-emit the expenses that carry it. If names matter, do a full resync now and then.',
  'op.listExpenseChanges.param.limit': 'Page size, 1–200 (default 200).',
  'op.listExpenseChanges.param.cursor': '`next_cursor` from the previous page, unchanged. Omit it to start from the beginning.',
  'op.listExpenseChanges.response.200': 'One page of changes.',

  'op.getExpenseReceipt.summary': 'Download the receipt file',
  'op.getExpenseReceipt.description':
    'The original receipt image or PDF attached to the expense (`has_receipt: true`). The `Content-Type` is detected from the file itself. `404 not_found` when the expense has no receipt; `403 account_encrypted` on an end-to-end encrypted account.',
  'op.getExpenseReceipt.param.id': 'The expense id.',
  'op.getExpenseReceipt.response.200': 'The receipt file.',

  'op.getExpense.summary': 'Get an expense',
  'op.getExpense.description': 'One expense with its line items (`items`).',
  'op.getExpense.param.id': 'The expense id.',
  'op.getExpense.response.200': 'The expense.',

  'op.createExpense.summary': 'Create an expense',
  'op.createExpense.description':
    'Requires the `Idempotency-Key` header. Amounts are decimal strings (`"42.50"`), never JSON numbers. A field that is not listed in the schema is refused with `400 validation_failed`.\n\n' +
    '`category_id`, `tag_ids` and `project_id` must belong to the connected account (`422 validation_failed` otherwise, with `details.fields`). `currency` defaults to the account\'s base currency.',
  'op.createExpense.param.Idempotency-Key':
    'A UUID you generate for this expense and reuse on every retry of the same request. A repeat returns the expense already created (`200`, the repeated body is ignored). Send retries one after another, not in parallel. A key already used by another record answers `409 idempotency_key_conflict`.',
  'op.createExpense.body': 'The new expense.',
  'op.createExpense.response.200': 'Already created earlier with this `Idempotency-Key`: the original expense, unchanged.',
  'op.createExpense.response.201': 'Created.',
  'op.createExpense.response.409':
    '`idempotency_key_conflict` — the key belongs to a record your app did not create, or to an expense that has since been deleted. Use a new UUID.',
  'op.createExpense.response.422':
    '`validation_failed` — `category_id`, `tag_ids` or `project_id` is not a live record of this account; `details.fields` lists them.',

  'op.updateExpense.summary': 'Edit an expense',
  'op.updateExpense.description':
    'Partial update: a field you omit is left unchanged. `null` clears `time`, `category_id`, `description`, `merchant`, `notes`, `location` and `project_id`; `tag_ids` replaces the whole tag set (`[]` removes every tag). `amount`, `currency`, `date` and `tag_ids` cannot be `null`. Line items cannot be edited.\n\n' +
    'An expense that is a share of a shared group expense (`source: "group"`) takes its `amount`, `currency` and `date` from the group: changing them answers `422 validation_failed`.',
  'op.updateExpense.param.id': 'The expense id.',
  'op.updateExpense.body': 'The fields to change.',
  'op.updateExpense.response.200': 'The updated expense.',
  'op.updateExpense.response.422':
    '`validation_failed` — a referenced category, tag or project is not in this account, or a field owned by a shared group (`amount`, `currency`, `date`) was sent; `details.fields` lists them.',

  'op.deleteExpense.summary': 'Delete an expense',
  'op.deleteExpense.description':
    'Deletes the expense, as deleting it in the app does. It then appears as a `delete` in the changes feed. Deleting it again answers `404 not_found`.',
  'op.deleteExpense.param.id': 'The expense id.',
  'op.deleteExpense.response.204': 'Deleted.',

  // ── schemas: errors ──────────────────────────────────────────────────────
  'schema.PublicApiErrorResponse': 'The body of every `/public/v1` error.',
  'schema.PublicApiErrorResponse.error': 'What went wrong.',
  'schema.PublicApiErrorObject': 'Error details. Branch on `code`; `message` is for humans and may change.',
  'schema.PublicApiErrorObject.code': 'Stable machine-readable code. New codes may be added; existing ones never change.',
  'schema.PublicApiErrorObject.message': 'Human-readable explanation (English).',
  'schema.PublicApiErrorObject.details':
    'Extra data for some codes, e.g. `fields` (per-field messages) for `validation_failed`, `required` (the missing scopes) for `insufficient_scope`.',
  'schema.OAuthErrorResponse': 'RFC 6749 error body of `/oauth/token` and `/oauth/revoke`.',
  'schema.OAuthErrorResponse.error': 'The OAuth error code.',
  'schema.OAuthErrorResponse.error_description': 'Human-readable explanation (English).',

  // ── schemas: OAuth ───────────────────────────────────────────────────────
  'schema.OAuthTokenRequest': 'Parameters of `POST /oauth/token`. Which ones are required depends on `grant_type`.',
  'schema.OAuthTokenRequest.grant_type': '`authorization_code` to exchange a code, `refresh_token` to refresh.',
  'schema.OAuthTokenRequest.code': 'The `code` your redirect URI received. Required for `authorization_code`.',
  'schema.OAuthTokenRequest.redirect_uri':
    'Exactly the `redirect_uri` of the authorize request. Required for `authorization_code`.',
  'schema.OAuthTokenRequest.code_verifier':
    'The PKCE verifier whose SHA-256 you sent as `code_challenge`. Required for `authorization_code`.',
  'schema.OAuthTokenRequest.refresh_token': 'Your current refresh token. Required for `refresh_token`.',
  'schema.OAuthTokenRequest.scope':
    'Optional on refresh: a subset of the granted scopes. The response still reports all granted scopes.',
  'schema.OAuthTokenRequest.client_id': 'Your client id, unless sent with HTTP Basic.',
  'schema.OAuthTokenRequest.client_secret': 'Confidential clients only, unless sent with HTTP Basic. Never send it from a browser or a mobile app.',
  'schema.OAuthRevokeRequest': 'Parameters of `POST /oauth/revoke`.',
  'schema.OAuthRevokeRequest.token': 'An access or refresh token of the connection.',
  'schema.OAuthRevokeRequest.token_type_hint': 'Accepted and ignored: both kinds are found anyway.',
  'schema.OAuthRevokeRequest.client_id': 'Your client id, unless sent with HTTP Basic.',
  'schema.OAuthRevokeRequest.client_secret': 'Confidential clients only, unless sent with HTTP Basic.',
  'schema.OAuthTokenResponse': 'A token pair. Store the new `refresh_token` every time — the previous one no longer works.',
  'schema.OAuthTokenResponse.access_token': 'Send as `Authorization: Bearer <access_token>`.',
  'schema.OAuthTokenResponse.token_type': 'Always `Bearer`.',
  'schema.OAuthTokenResponse.expires_in': 'Access token lifetime in seconds (3600).',
  'schema.OAuthTokenResponse.refresh_token':
    'Valid for 90 days and single-use: each refresh returns a new one. Reusing an old one revokes the connection.',
  'schema.OAuthTokenResponse.scope': 'The scopes of the connection, space-separated.',
  'schema.OAuthTokenResponse.account_id': 'The account the user connected.',

  // ── schemas: account and categories ──────────────────────────────────────
  'schema.PublicAccount': 'The connected account.',
  'schema.PublicAccount.id': 'Account id.',
  'schema.PublicAccount.name': 'Account name.',
  'schema.PublicAccount.type': 'Account type.',
  'schema.PublicAccount.base_currency': "The account's base currency (ISO 4217); the default `currency` of a new expense.",
  'schema.PublicAccount.role': 'Role of the connecting user in this account (only owners and editors can connect).',
  'schema.PublicAccount.encryption':
    '`none`, or `text` for an end-to-end encrypted account (read-only through the API, some fields withheld). Fully encrypted accounts cannot be connected.',
  'schema.PublicAccount.read_only': '`true` when writes are refused (the account is end-to-end encrypted).',
  'schema.PublicAccount.user': 'The user who connected the app.',
  'schema.PublicAccountUser': 'The user who connected the app.',
  'schema.PublicAccountUser.id': 'User id.',
  'schema.PublicAccountUser.name': 'Display name.',
  'schema.PublicAccountUser.base_currency': "The user's own display currency (may differ from the account's).",
  'schema.PublicCategoryList': 'Expense categories.',
  'schema.PublicCategoryList.data': 'The categories.',
  'schema.PublicCategory': 'An expense category.',
  'schema.PublicCategory.id': 'Category id — the value for `category_id`.',
  'schema.PublicCategory.name': 'Name; `null` on an end-to-end encrypted account.',
  'schema.PublicCategory.parent_id': 'Parent category id for a subcategory, otherwise `null`.',
  'schema.PublicCategory.icon': 'Icon name used by the app.',
  'schema.PublicCategory.color': 'Colour used by the app, e.g. `#4CAF50`.',
  'schema.PublicCategory.type': 'Always `expense` in this version.',
  'schema.PublicCategory.encrypted_fields': 'Fields withheld (`null`) because the account is end-to-end encrypted: `["name"]` or `[]`.',

  // ── schemas: expense ─────────────────────────────────────────────────────
  'schema.PublicExpense': 'An expense.',
  'schema.PublicExpense.id': 'Expense id.',
  'schema.PublicExpense.amount': 'Decimal string in the expense\'s own `currency` (never converted), e.g. `"42.50"`.',
  'schema.PublicExpense.currency': 'ISO 4217 code.',
  'schema.PublicExpense.date': 'Date of the expense, `YYYY-MM-DD`.',
  'schema.PublicExpense.time': 'Time as recorded, `HH:mm`, or `null`.',
  'schema.PublicExpense.category_id': 'Category id, or `null` when uncategorized.',
  'schema.PublicExpense.description': 'Description. `null` when empty or withheld (see `encrypted_fields`).',
  'schema.PublicExpense.merchant': 'Merchant. `null` when empty or withheld (see `encrypted_fields`).',
  'schema.PublicExpense.notes': 'Notes. `null` when empty or withheld (see `encrypted_fields`).',
  'schema.PublicExpense.location': 'Where the expense was made, or `null`.',
  'schema.PublicExpense.tags': 'Tags of the expense.',
  'schema.PublicExpense.project': 'The project the expense belongs to, or `null`.',
  'schema.PublicExpense.category_splits':
    'When the expense is split across several categories: the share of each. Empty when it is not split.',
  'schema.PublicExpense.items':
    'Receipt line items. Present on a single expense and in the changes feed; absent from the list.',
  'schema.PublicExpense.discount_amount': 'Total discount on the receipt, as a decimal string, or `null`.',
  'schema.PublicExpense.deposit_amount': 'Bottle/packaging deposit already paid within the amount, as a decimal string, or `null`.',
  'schema.PublicExpense.is_debt': 'Money lent to someone (a debt), not ordinary spending.',
  'schema.PublicExpense.is_debt_repayment': 'A repayment of money the user borrowed.',
  'schema.PublicExpense.is_split_receivable': 'The part of a shared bill that others owe the user back, not the user\'s own spending.',
  'schema.PublicExpense.is_recurring': 'Part of a recurring series.',
  'schema.PublicExpense.source':
    'How the expense was recorded, for example `manual`, `voice`, `ocr`, `import`, `telegram`, `whatsapp`, `slack`, `notification`, `group` (a share of a shared group expense) or `api`. Treat it as open: new values may appear.',
  'schema.PublicExpense.created_by_app': 'The app that created the expense through this API, or `null`.',
  'schema.PublicExpense.created_by_user': 'The user who recorded the expense.',
  'schema.PublicExpense.has_receipt': 'A receipt file is attached (download it with `GET /public/v1/expenses/{id}/receipt`).',
  'schema.PublicExpense.encrypted_fields':
    'On an end-to-end encrypted account: the fields returned as `null` because they are encrypted — `description`, `notes`, `merchant`, `location.name`, `items.description`, `tags.name`, `project.name`. Otherwise `[]`.',
  'schema.PublicExpense.created_at': 'When the expense was created (ISO-8601, UTC).',
  'schema.PublicExpense.updated_at': 'When the expense last changed (ISO-8601, UTC).',
  'schema.PublicLocation': 'A location.',
  'schema.PublicLocation.lat': 'Latitude.',
  'schema.PublicLocation.lng': 'Longitude.',
  'schema.PublicLocation.name': 'Place name; `null` when unset or withheld (see `encrypted_fields`).',
  'schema.PublicRef': 'A tag or project.',
  'schema.PublicRef.id': 'Id.',
  'schema.PublicRef.name': 'Name; `null` when withheld (see `encrypted_fields`).',
  'schema.PublicCategorySplit': "One category's share of a split expense.",
  'schema.PublicCategorySplit.category_id': 'Category id.',
  'schema.PublicCategorySplit.amount': 'The share, as a decimal string in the expense currency.',
  'schema.PublicExpenseItem': 'A receipt line item.',
  'schema.PublicExpenseItem.id': 'Line item id.',
  'schema.PublicExpenseItem.description': 'Product name; `null` when withheld (see `encrypted_fields`).',
  'schema.PublicExpenseItem.quantity': 'Quantity, decimal string with three places.',
  'schema.PublicExpenseItem.unit_price': 'Unit price, decimal string.',
  'schema.PublicExpenseItem.total_price': 'Line total, decimal string.',
  'schema.PublicExpenseItem.line_discount': 'Discount on this line, decimal string (`"0.00"` when none).',
  'schema.PublicExpenseItem.category_id': 'Category of this line, or `null`.',
  'schema.PublicCreatedByApp': 'An app connected through this API.',
  'schema.PublicCreatedByApp.id': "The app's public `client_id` — compare it with yours to recognise your own writes.",
  'schema.PublicCreatedByApp.name': 'App name.',
  'schema.PublicCreatedByUser': 'A member of the account.',
  'schema.PublicCreatedByUser.id': 'User id.',
  'schema.PublicCreatedByUser.name': 'Display name.',
  'schema.PublicExpenseList': 'One page of expenses.',
  'schema.PublicExpenseList.data': 'The expenses of this page (without `items`).',
  'schema.PublicExpenseList.next_cursor': 'Pass as `cursor` to get the next page; `null` on the last page.',
  'schema.PublicExpenseList.has_more': 'Whether another page follows.',
  'schema.PublicExpenseChanges': 'One page of the changes feed.',
  'schema.PublicExpenseChanges.changes': 'Changes, oldest first. Apply them in order.',
  'schema.PublicExpenseChanges.next_cursor':
    'Always present (on an empty page it equals the cursor you sent). Store it after processing the page and send it next time.',
  'schema.PublicExpenseChanges.has_more': 'Whether more changes are available right now. When `false`, poll again later with `next_cursor`.',
  'schema.PublicExpenseUpsertChange': 'An expense was created or changed.',
  'schema.PublicExpenseUpsertChange.type': 'Always `upsert`.',
  'schema.PublicExpenseUpsertChange.expense': 'The expense in its current state, with line items. Insert or replace your copy.',
  'schema.PublicExpenseDeleteChange': 'An expense was deleted or is no longer visible (it became a planned expense).',
  'schema.PublicExpenseDeleteChange.type': 'Always `delete`.',
  'schema.PublicExpenseDeleteChange.id': 'Id of the expense to remove from your copy. It may be an id you never received.',
  'schema.PublicExpenseDeleteChange.deleted_at': 'When it was deleted or stopped being visible (ISO-8601, UTC).',

  // ── schemas: write bodies ────────────────────────────────────────────────
  'schema.PublicExpenseCreateDto': 'A new expense. Fields not listed here are refused.',
  'schema.PublicExpenseCreateDto.amount': 'Decimal string greater than 0, at most 2 decimal places, e.g. `"42.50"`.',
  'schema.PublicExpenseCreateDto.currency': "ISO 4217 code in upper case. Default: the account's base currency.",
  'schema.PublicExpenseCreateDto.date': 'Date of the expense, `YYYY-MM-DD`.',
  'schema.PublicExpenseCreateDto.time': 'Time, `HH:mm` (24-hour).',
  'schema.PublicExpenseCreateDto.category_id': 'One of the categories from `GET /public/v1/categories`.',
  'schema.PublicExpenseCreateDto.description': 'Description, up to 500 characters.',
  'schema.PublicExpenseCreateDto.merchant': 'Merchant, up to 120 characters.',
  'schema.PublicExpenseCreateDto.notes': 'Notes, up to 2,000 characters.',
  'schema.PublicExpenseCreateDto.location': 'Where the expense was made.',
  'schema.PublicExpenseCreateDto.tag_ids': 'Ids of tags of this account (up to 50, no duplicates).',
  'schema.PublicExpenseCreateDto.project_id': 'Id of a project of this account.',
  'schema.PublicExpenseCreateDto.items': 'Receipt line items (1–500). Only on create.',
  'schema.PublicExpenseUpdateDto': 'The fields to change. Omitted fields stay as they are; `null` clears a field where allowed.',
  'schema.PublicExpenseUpdateDto.amount': 'Decimal string greater than 0. Cannot be `null`.',
  'schema.PublicExpenseUpdateDto.currency': 'ISO 4217 code in upper case. Cannot be `null`.',
  'schema.PublicExpenseUpdateDto.date': '`YYYY-MM-DD`. Cannot be `null`.',
  'schema.PublicExpenseUpdateDto.time': '`HH:mm`, or `null` to clear.',
  'schema.PublicExpenseUpdateDto.category_id': 'A category from `GET /public/v1/categories`, or `null` to clear.',
  'schema.PublicExpenseUpdateDto.description': 'Description, or `null` to clear.',
  'schema.PublicExpenseUpdateDto.merchant': 'Merchant, or `null` to clear.',
  'schema.PublicExpenseUpdateDto.notes': 'Notes, or `null` to clear.',
  'schema.PublicExpenseUpdateDto.location': 'Location, or `null` to clear.',
  'schema.PublicExpenseUpdateDto.tag_ids': 'Replaces all tags; `[]` removes every tag. Cannot be `null`.',
  'schema.PublicExpenseUpdateDto.project_id': 'A project of this account, or `null` to remove the expense from its project.',
  'schema.PublicLocationInput': 'A location.',
  'schema.PublicLocationInput.lat': 'Latitude, −90 to 90.',
  'schema.PublicLocationInput.lng': 'Longitude, −180 to 180.',
  'schema.PublicLocationInput.name': 'Place name, up to 200 characters.',
  'schema.PublicExpenseItemInput': 'A receipt line item.',
  'schema.PublicExpenseItemInput.description': 'Product name, 1–500 characters.',
  'schema.PublicExpenseItemInput.quantity': 'Decimal string greater than 0, up to 3 decimal places. Default `"1"`.',
  'schema.PublicExpenseItemInput.unit_price': 'Decimal string, up to 2 decimal places. Default `"0"`.',
  'schema.PublicExpenseItemInput.total_price': 'Line total, decimal string, up to 2 decimal places.',
};
