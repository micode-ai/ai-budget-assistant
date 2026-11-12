#!/usr/bin/env node
/**
 * Manual measurement of the long-receipt scan ("a long receipt in several photos").
 * Node 20+, no dependencies. NOT part of CI: every fixture costs real AI usage
 * (2.0 per part, so the six fixtures below cost about 30 scans) and needs a real API and account.
 *
 *   AI_BUDGET_TOKEN=<jwt> AI_BUDGET_ACCOUNT_ID=<uuid> \
 *     node scripts/long-receipt-eval.mjs --api https://api.ai-budget.pl [--token-env NAME] [--only name] [--repeat 3]
 *
 * Credentials are read ONLY from the environment (the variable named by --token-env, default
 * AI_BUDGET_TOKEN, and optionally AI_BUDGET_ACCOUNT_ID for the X-Account-Id header). The token is never
 * printed, logged or accepted as an argument. Use a throwaway test user.
 *
 * Fixtures: apps/api/test/fixtures/long-receipts/*.json are SYNTHETIC receipts (made-up shops, items and
 * prices). The overlapping crops are rendered by build-fixtures.py (Pillow) into out/ on first use.
 *
 * For each fixture it posts the crops as `images` to POST /api/v1/ai/scan-receipt and compares the
 * result with the expected JSON. Reconciled = same line count as expected AND the model's total within
 * 0.01 of the expected one AND the lines sum to that total within 1%. It prints the per-fixture result
 * and the reconcile rate. Exit code is 0 either way: it is a measurement, not a gate.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'api', 'test', 'fixtures', 'long-receipts');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const api = arg('api');
const tokenEnv = arg('token-env', 'AI_BUDGET_TOKEN');
const only = arg('only');
const repeat = Math.max(1, Number(arg('repeat', '1')) || 1);
const token = process.env[tokenEnv];
const accountId = process.env.AI_BUDGET_ACCOUNT_ID;

if (!api || !token) {
  console.error(`usage: ${tokenEnv}=<jwt> [AI_BUDGET_ACCOUNT_ID=<uuid>] node scripts/long-receipt-eval.mjs --api <url> [--token-env NAME] [--only name] [--repeat N]`);
  console.error(!api ? 'missing --api' : `missing environment variable ${tokenEnv}`);
  process.exit(2);
}

const names = readdirSync(FIXTURES).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => !only || n === only);
if (names.length === 0) {
  console.error('no fixtures matched');
  process.exit(2);
}

const first = join(FIXTURES, 'out', `${names[0]}.part1.png`);
if (!existsSync(first)) {
  const r = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [join(FIXTURES, 'build-fixtures.py')], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('could not render the fixture images (needs python and Pillow)');
    process.exit(2);
  }
}

const url = `${api.replace(/\/+$/, '')}/api/v1/ai/scan-receipt`;
let reconciled = 0;
let runs = 0;
const rows = [];

for (const name of names) {
  const fx = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'));
  const images = [];
  for (let p = 1; p <= fx.partsCount; p++) {
    images.push({ imageBase64: readFileSync(join(FIXTURES, 'out', `${name}.part${p}.png`)).toString('base64'), mimeType: 'image/png' });
  }
  for (let r = 0; r < repeat; r++) {
    runs++;
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` };
    if (accountId) headers['x-account-id'] = accountId;
    let outcome;
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ images }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        outcome = { ok: false, note: `HTTP ${res.status} ${typeof body?.message === 'string' ? body.message : ''}`.trim() };
      } else {
        const items = Array.isArray(body?.items) ? body.items : [];
        const sum = items.reduce((s, i) => s + (Number(i.totalPrice) || 0), 0);
        const total = Number(body?.total);
        const lineOk = items.length === fx.expected.lineCount;
        const totalOk = Math.abs(total - fx.expected.total) <= 0.01;
        const sumOk = total > 0 && Math.abs(sum - total) / total <= 0.01;
        outcome = {
          ok: lineOk && totalOk && sumOk,
          note: `lines ${items.length}/${fx.expected.lineCount}, total ${total}/${fx.expected.total}, sum ${sum.toFixed(2)}`,
        };
      }
    } catch (e) {
      outcome = { ok: false, note: `request failed: ${e instanceof Error ? e.message : 'unknown error'}` };
    }
    if (outcome.ok) reconciled++;
    rows.push(`${outcome.ok ? 'PASS' : 'FAIL'}  ${name} (${fx.partsCount} parts${fx.repeatAcrossBoundary ? ', repeat at boundary' : ''})  ${outcome.note}`);
    console.log(rows[rows.length - 1]);
  }
}

console.log(`\nreconcile rate: ${reconciled}/${runs} (${Math.round((reconciled / runs) * 100)}%)`);
