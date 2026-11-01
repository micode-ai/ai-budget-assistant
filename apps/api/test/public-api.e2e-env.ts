/**
 * Environment for `public-api.e2e-spec.ts`. Imported FIRST by the spec, before `AppModule`:
 * `ConfigModule.forRoot` reads `.env` while `app.module.ts` is being evaluated, and dotenv never
 * overrides a variable that is already set — so whatever is set here wins over the developer's
 * `.env`.
 *
 * 1. The suite refuses to run without an explicit DATABASE_URL / REDIS_URL on the command line:
 *    the fallback would be `.env`, i.e. the developer's own database. It also refuses a
 *    DATABASE_URL whose database name and host both lack "test" (it writes and deletes rows),
 *    unless PUBLIC_API_E2E_CONFIRM=1 says the target is disposable anyway.
 *    JWT_SECRET falls back to a per-run value, so a checkout without `.env` can run it.
 * 2. Every outbound integration in `.env` is blanked, so booting the whole AppModule cannot reach
 *    a real third party: the assistant Telegram bot would otherwise start long-polling (or worse,
 *    call setWebhook) with the real bot token, the ops bot would post alerts, SMTP would send.
 * 3. ADMIN_EMAILS must be known before boot (`AdminGuard` reads it in its constructor), so the
 *    run's admin e-mail is derived here and exported.
 */

for (const name of ['DATABASE_URL', 'REDIS_URL']) {
  if (!process.env[name]) {
    throw new Error(
      `public-api e2e: set ${name} explicitly (a disposable test instance) — refusing to fall back to .env`,
    );
  }
}

/** Database name or host contains "test" (case-insensitive), or the run is explicitly confirmed. */
export function isDisposableDatabaseUrl(url: string, confirm: string | undefined): boolean {
  if (confirm === '1') return true;
  try {
    const u = new URL(url);
    return /test/i.test(u.pathname.replace(/^\//, '')) || /test/i.test(u.hostname);
  } catch {
    return false;
  }
}

if (!isDisposableDatabaseUrl(process.env.DATABASE_URL!, process.env.PUBLIC_API_E2E_CONFIRM)) {
  throw new Error(
    'public-api e2e: DATABASE_URL must name a test database (db name or host containing "test"), ' +
      'or set PUBLIC_API_E2E_CONFIRM=1 if this database is disposable',
  );
}

process.env.JWT_SECRET ||= `pa-e2e-jwt-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const BLANKED = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'TELEGRAM_WEBHOOK_URL',
  'TELEGRAM_WEBHOOK_SECRET',
  'OPS_TELEGRAM_BOT_TOKEN',
  'OPS_TELEGRAM_CHAT_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_BUSINESS_ACCOUNT_ID',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'SLACK_CLIENT_ID',
  'SLACK_CLIENT_SECRET',
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'OPENAI_API_KEY',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'TWELVE_DATA_API_KEY',
  'SENTRY_DSN',
];
for (const name of BLANKED) process.env[name] = '';

/** Unique per run, so the suite is re-runnable and its teardown deletes only its own rows. */
export const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const EMAIL_DOMAIN = `pa-e2e-${RUN_ID}.test.local`;
export const ADMIN_EMAIL = `admin@${EMAIL_DOMAIN}`;

process.env.ADMIN_EMAILS = ADMIN_EMAIL;
process.env.PUBLIC_API_ENABLED = 'true';
