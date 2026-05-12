---
name: i18n-add-strings
description: Use when adding, renaming, or removing i18n keys in the mobile app. Ensures all 8 locale files (en/de/es/fr/pl/ru/ua/be) stay in sync. Triggers on any change to apps/mobile/src/i18n/locales/.
---

# Adding i18n Strings Across All 8 Locales

The mobile app has 8 locale files at `apps/mobile/src/i18n/locales/`:

| Locale | File | Language |
|---|---|---|
| `en` | `en.ts` | English — **source of truth, edit first** |
| `de` | `de.ts` | German |
| `es` | `es.ts` | Spanish |
| `fr` | `fr.ts` | French |
| `pl` | `pl.ts` | Polish |
| `ru` | `ru.ts` | Russian |
| `ua` | `ua.ts` | Ukrainian |
| `be` | `be.ts` | Belarusian |

All 8 files must have the same key structure. A key missing in one locale breaks that language at runtime.

## Workflow

### 1. Add to `en.ts` first

This is the source of truth. Place the new key under the appropriate section (e.g., `common`, `dates`, `expenses`, `budget`). Match the existing nesting style.

### 2. Translate to the remaining 7 locales

For each of `de`, `es`, `fr`, `pl`, `ru`, `ua`, `be`:
- Add the key at the same nesting path as in `en.ts`.
- Keep translations concise — mobile UI has limited horizontal space.
- Match the tone of surrounding strings (formal vs casual is locale-specific).

**Pairing notes:**
- `ua` and `be` are close to `ru` but distinct languages — do not copy Russian text into them.
- `de`/`es`/`fr` follow Western European conventions; `pl` follows Slavic.

### 3. Verify completeness

After editing, list the new key(s) and grep each locale to confirm presence:

```bash
# Example: just-added key `expenses.bulkDelete`
grep -l "bulkDelete" apps/mobile/src/i18n/locales/*.ts
```

You should see all 8 files. If fewer, you missed a locale.

### 4. Typecheck

```bash
npm run typecheck
```

If TypeScript complains about a missing key in a specific locale, that locale's file is incomplete.

### 5. Use the key in code

```ts
const { t } = useTranslation();
t('expenses.bulkDelete')
```

## Renaming or deleting a key

- Renaming: change the key in **all 8 files** in one pass, then update all `t('old.key')` call sites.
- Deleting: remove from all 8 files. Grep for residual usages before committing:
  ```bash
  grep -rn "t('removed.key')" apps/mobile
  ```

## Common mistakes

- Adding the key only to `en.ts` and forgetting the other 7. Causes runtime fallback to English (or worse, the key string itself shown to the user).
- Copying Russian into `ua` or `be`. They are separate languages with their own vocabulary.
- Mismatched nesting — `en.ts` has `expenses.bulkDelete` but `de.ts` has it under `common`. The lookup fails silently.
- Mixing string interpolation tokens. If `en` uses `{{count}}`, every locale must use `{{count}}` (not `{count}` or `%d`).
