---
title: 'Mobile Quality Checks'
status: running
iterations: 0
---

# Mobile Quality Checks

## Trigger
- Pull request that touches `apps/mobile/**`, `packages/shared-types/**`, `packages/shared-utils/**`, `package.json`, or `package-lock.json`.
- Push to `main` or `development` that touches those same paths.

Concurrent runs on the same ref are cancelled in favor of the newest run.

## Steps
1. `.github/workflows/mobile-quality.yml` checks out the repo, sets up Node 20 with npm cache.
2. `npm ci` — installs all workspace dependencies.
3. `npx turbo lint --filter=@budget/mobile` — ESLint across mobile app and transitive shared packages.
4. `npx turbo typecheck --filter=@budget/mobile` — TypeScript strict check.

## Failure modes
- **Lint error** — fix the flagged lines; common culprits are unused imports and missing i18n keys.
- **Type error** — usually a shared-types change that wasn't reflected in the mobile consumer; update `packages/shared-types` and re-run.
- **`npm ci` fails** — `package-lock.json` out of sync with `package.json`; run `npm install` locally and commit the updated lockfile.
- **Turbo cache miss causing flaky timeout** — rare; re-run the job.

## Owner
Automated gate on every mobile PR; Mihail Perevertkin fixes failures.

## Where to look first when it breaks
- GitHub Actions → "Mobile Quality Checks" run, expand the failing step
- Local repro: `npm run lint` and `npm run typecheck` from the repo root
