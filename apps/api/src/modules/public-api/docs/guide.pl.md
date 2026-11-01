# Pierwsze kroki

AI Budget API pozwala Twojej aplikacji odczytywać i zapisywać wydatki użytkownika — za jego zgodą, przez OAuth 2.0. Ten przewodnik prowadzi od rejestracji aplikacji do utrzymywania zsynchronizowanej kopii wydatków. Poniższa dokumentacja opisuje każdy endpoint, pole i błąd.

- Adres bazowy API: `https://api.ai-budget.pl/public/v1`
- Adres autoryzacji: `https://app.ai-budget.pl/authorize`
- Adres endpointu tokenów: `https://api.ai-budget.pl/oauth/token`
- Pola JSON są w `snake_case`. Kwoty to **ciągi znaków** z liczbą dziesiętną (`"42.50"`), daty mają format `YYYY-MM-DD`, znaczniki czasu — ISO-8601 w UTC.

## 1. Zarejestruj aplikację

W aplikacji AI Budget otwórz **Ustawienia → Dla deweloperów** i utwórz aplikację. Podaj nazwę, stronę domową i co najmniej jeden **redirect URI**. Redirect URI musi używać `https://`; na potrzeby developmentu dozwolone są też `http://localhost[:port]` i `http://127.0.0.1[:port]`. URI wysyłany później musi **dokładnie**, znak w znak, odpowiadać jednemu z zarejestrowanych.

Wybierz typ klienta:

- **Poufny** (confidential) — Twój backend potrafi przechować sekret. Otrzymujesz `client_id` i `client_secret`. Sekret jest pokazywany tylko raz: przechowuj go bezpiecznie i nigdy nie umieszczaj go w przeglądarce ani w aplikacji mobilnej.
- **Publiczny** (public) — aplikacja jednostronicowa lub mobilna. Tylko `client_id`; przepływ chroni wyłącznie PKCE.

Jeden deweloper może zarejestrować do 10 aplikacji.

## 2. Przekieruj użytkownika na adres autoryzacji

Każde żądanie autoryzacji używa PKCE z metodą `S256` (inne metody nie są akceptowane). Wygeneruj losowy `code_verifier`, wyślij jego skrót SHA-256 jako `code_challenge` i zachowaj weryfikator do powrotu użytkownika. Wygeneruj też losowy `state` i sprawdź go po powrocie.

| Parametr | Wartość |
| --- | --- |
| `response_type` | `code` |
| `client_id` | identyfikator Twojego klienta |
| `redirect_uri` | jeden z zarejestrowanych redirect URI, dokładnie |
| `scope` | rozdzielone spacjami: `expenses:read`, `expenses:write`, `receipts:read`, `categories:read` |
| `state` | losowa wartość, którą sprawdzasz po powrocie |
| `code_challenge` | SHA-256 z `code_verifier` w base64url (43 znaki) |
| `code_challenge_method` | `S256` |

JavaScript dla przeglądarki (przekierowuje i używa `sessionStorage`; sama część PKCE działa też w Node.js 20+):

```js
function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
const codeChallenge = base64url(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier)),
);
const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
sessionStorage.setItem('aba_pkce', JSON.stringify({ codeVerifier, state }));

const url = new URL('https://app.ai-budget.pl/authorize');
url.search = new URLSearchParams({
  response_type: 'code',
  client_id: 'aba_ci_q7Lx2Vb9TmR4kWc8Zp1sYg',
  redirect_uri: 'https://example.com/oauth/callback',
  scope: 'expenses:read expenses:write receipts:read categories:read',
  state,
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
}).toString();
window.location.assign(url);
```

Gotowy adres wygląda tak:

```text
https://app.ai-budget.pl/authorize?response_type=code&client_id=aba_ci_q7Lx2Vb9TmR4kWc8Zp1sYg&redirect_uri=https%3A%2F%2Fexample.com%2Foauth%2Fcallback&scope=expenses%3Aread+expenses%3Awrite+receipts%3Aread+categories%3Aread&state=af0ifjsldkj&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256
```

Użytkownik loguje się, wybiera **jedno** konto i zatwierdza zakresy. Następnie przeglądarka wraca na Twój redirect URI:

- zgoda: `https://example.com/oauth/callback?code=...&state=...`
- odmowa: `https://example.com/oauth/callback?error=access_denied&state=...`

Zanim użyjesz kodu, sprawdź, czy `state` jest tym, który wysłałeś.

**Jedno połączenie = jedno konto.** To użytkownik decyduje, które konto otrzyma Twoja aplikacja. Połączyć konto może tylko jego **właściciel** albo **edytor**. Aby pracować z kilkoma kontami, użytkownik łączy Twoją aplikację osobno z każdym z nich. Jeśli użytkownik, który połączył aplikację, straci później uprawnienia do edycji konta (zostanie obserwatorem albo opuści konto), każde wywołanie zwraca `403 grant_inactive`, dopóki ktoś z uprawnieniami do edycji nie połączy aplikacji ponownie.

## 3. Wymień kod na tokeny

Kod jest ważny **10 minut** i działa **raz** — nieudana wymiana też go zużywa. Wyślij ten sam `redirect_uri` oraz `code_verifier`:

```bash
curl -X POST https://api.ai-budget.pl/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=authorization_code \
  -d code="$CODE" \
  -d redirect_uri=https://example.com/oauth/callback \
  -d code_verifier="$CODE_VERIFIER"
```

Klient publiczny nie wysyła sekretu, tylko `client_id`:

```js
const { codeVerifier } = JSON.parse(sessionStorage.getItem('aba_pkce'));
const res = await fetch('https://api.ai-budget.pl/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: new URLSearchParams(location.search).get('code'),
    redirect_uri: 'https://example.com/oauth/callback',
    code_verifier: codeVerifier,
    client_id: 'aba_ci_q7Lx2Vb9TmR4kWc8Zp1sYg',
  }),
});
let tokens = await res.json();
```

Odpowiedź:

```json
{
  "access_token": "aba_at_Hq7Wm2Ks9Lp4Nx1Vb6Cz3Rt8Yu5Ie0Oa2Sd7Fg4Jk9L",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "aba_rt_Pz4Xc8Vb2Nm6Lk0Jh3Gf7Ds1Aq5We9Rt2Yu6Io0Pa",
  "scope": "expenses:read expenses:write receipts:read categories:read",
  "account_id": "7c9e1a3b-5d7f-4b2c-8e4a-6f8b0d2c4e6a"
}
```

**Token dostępu** żyje **1 godzinę**. **Token odświeżania** jest ważny **90 dni**, a każde odświeżenie daje nowy, znów ważny 90 dni. Przechowuj oba bezpiecznie, w miarę możliwości po stronie serwera.

## 4. Wywołaj API

Wysyłaj token dostępu w nagłówku `Authorization`:

```bash
curl "https://api.ai-budget.pl/public/v1/expenses?limit=50" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```js
const res = await fetch('https://api.ai-budget.pl/public/v1/expenses?limit=50', {
  headers: { Authorization: `Bearer ${tokens.access_token}` },
});
const page = await res.json();
```

`GET /public/v1/account` mówi, do którego konta należy token. Listy są stronicowane nieprzezroczystym kursorem: przekazuj `next_cursor` z powrotem jako `cursor`, z tymi samymi filtrami, dopóki `has_more` ma wartość `true`.

## 5. Odśwież token dostępu

```bash
curl -X POST https://api.ai-budget.pl/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=refresh_token \
  -d refresh_token="$REFRESH_TOKEN"
```

**Tokeny odświeżania są rotowane.** Każde odświeżenie zwraca **nowy** token odświeżania, a ten wysłany przestaje działać. Zawsze zapisuj nowy token w miejsce starego, zanim zrobisz cokolwiek innego.

Użycie tokenu odświeżania, który został już wykorzystany, traktujemy jak kradzież: całe połączenie zostaje unieważnione, a użytkownik musi ponownie połączyć Twoją aplikację. Dzieje się tak również wtedy, gdy **dwa procesy odświeżają jednocześnie** tym samym tokenem — jeden wygrywa, drugi używa zużytego tokenu. Odświeżaj tokeny **tylko w jednym miejscu** (jeden proces, blokada albo jedno żądanie naraz):

```js
let refreshing = null;

function refreshTokens() {
  refreshing ??= (async () => {
    const res = await fetch('https://api.ai-budget.pl/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: 'aba_ci_q7Lx2Vb9TmR4kWc8Zp1sYg',
      }),
    });
    if (!res.ok) throw new Error('reconnect');
    tokens = await res.json();
    await saveTokens(tokens);
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function api(path, init = {}) {
  const call = () =>
    fetch(`https://api.ai-budget.pl${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${tokens.access_token}` },
    });
  let res = await call();
  if (res.status === 401) {
    await refreshTokens();
    res = await call();
  }
  return res;
}
```

Aby odłączyć aplikację, wyślij dowolny z tokenów na `POST https://api.ai-budget.pl/oauth/revoke`; unieważnione zostanie całe połączenie. Użytkownik może też w każdej chwili odłączyć Twoją aplikację w **Ustawienia → Połączone aplikacje**.

## 6. Synchronizacja przyrostowa

Aby utrzymywać własną kopię wydatków, czytaj strumień zmian `GET https://api.ai-budget.pl/public/v1/expenses/changes`, zamiast ponownie pobierać listę:

- Bez `cursor` strumień zaczyna się od początku: wszystkie wydatki oraz wszystkie usunięcia, jakie kiedykolwiek zapisano na koncie. Klient startujący bez kursora dostaje więc każde dawne usunięcie jako `delete`, przeważnie dla identyfikatorów, których nigdy nie widział.
- Każdy wpis to albo `{"type": "upsert", "expense": {...}}` — wstaw lub zastąp swoją kopię — albo `{"type": "delete", "id": "..."}` — usuń ją. Usunięcie może wskazywać `id`, którego nigdy nie otrzymałeś: usunięcie nieznanego `id` nic nie zmienia.
- Wydatek usunięty oraz wydatek zamieniony w planowany przychodzą jako `delete`.
- Wydatek edytowany ponownie przychodzi jeszcze raz, w najnowszej wersji, na końcu strumienia.
- Zmiana pojawia się w strumieniu mniej więcej **10 sekund** po jej wprowadzeniu.
- Po przetworzeniu każdej strony zapisz `next_cursor` — jest obecny także na pustej stronie — i kontynuuj od niego. Gdy `has_more` ma wartość `false`, odpytaj ponownie później.

```js
async function sync(db) {
  let cursor = await db.loadCursor();
  for (;;) {
    const url = new URL('https://api.ai-budget.pl/public/v1/expenses/changes');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await api(url.pathname + url.search);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const page = await res.json();
    for (const change of page.changes) {
      if (change.type === 'upsert') await db.put(change.expense);
      else await db.remove(change.id);
    }
    cursor = page.next_cursor;
    await db.saveCursor(cursor);
    if (!page.has_more) break;
  }
}
```

Znane ograniczenia:

- Wydatek przeniesiony na inne konto nie jest zgłaszany jako usunięty na koncie, z którego go przeniesiono.
- Zmiana nazwy tagu lub projektu nie powoduje ponownego wysłania wydatków, które go mają. Jeśli nazwy są dla Ciebie ważne, co jakiś czas wykonaj pełną resynchronizację (ponowna synchronizacja bez kursora).

## 7. Dodawanie, edycja i usuwanie wydatków

Dodanie wydatku wymaga nagłówka `Idempotency-Key`: UUID wygenerowanego przez Ciebie dla tego wydatku.

```bash
curl -X POST https://api.ai-budget.pl/public/v1/expenses \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: b7e3c1a9-4f2d-4e8b-9a6c-0d5f7e1b3a24" \
  -H "Content-Type: application/json" \
  -d '{"amount":"42.50","currency":"PLN","date":"2026-10-31","merchant":"Biedronka","category_id":"8a6e0f52-1c3b-4d7e-a9f8-2b4c6d8e0f13"}'
```

- `201` — utworzono. Jeśli żądanie przekroczy limit czasu, **ponów je z tym samym kluczem**: powtórzenie zwraca już utworzony wydatek ze statusem `200`, a treść powtórzonego żądania jest ignorowana. Ponowne próby wysyłaj po kolei, nie równolegle.
- `409 idempotency_key_conflict` — klucz jest już użyty przez inny rekord (taki, którego Twoja aplikacja nie utworzyła, albo wydatek później usunięty). Wygeneruj nowy UUID.
- Kwoty to ciągi dziesiętne z najwyżej dwoma miejscami po przecinku. Liczba JSON zostanie odrzucona.
- `400 validation_failed` oznacza, że samo żądanie jest niepoprawne: nieznane pole, zły typ lub format, brak wymaganego pola. Problemy wymienia `details.fields`.
- `422 validation_failed` oznacza, że żądanie jest poprawne składniowo, ale wskazuje coś, czego nie można użyć: `category_id`, `tag_ids` lub `project_id` spoza połączonego konta albo — przy edycji — `amount`, `currency` lub `date` wydatku będącego udziałem we wspólnym wydatku grupy (`source: "group"`), którymi zarządza grupa.

`PATCH /public/v1/expenses/{id}` zmienia tylko wysłane pola; `null` czyści pole tam, gdzie to dozwolone. `DELETE /public/v1/expenses/{id}` usuwa wydatek, który potem przychodzi w strumieniu zmian jako `delete`. Poprawne wartości `category_id` znajdziesz w `GET /public/v1/categories`.

## 8. Błędy

Każdy błąd `/public/v1` ma taką samą treść:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The request is invalid.",
    "details": { "fields": { "amount": ["amount must be a decimal string with at most 2 decimal places"] } }
  }
}
```

Logikę opieraj na `code`; `message` jest dla ludzi i może się zmieniać. Mogą pojawiać się nowe kody.

| Kod | HTTP | Znaczenie i co zrobić |
| --- | --- | --- |
| `invalid_token` | 401 | Brak tokenu dostępu albo jest on niepoprawny, wygasł lub został unieważniony. Odśwież go raz i ponów żądanie; jeśli odświeżenie zwróci `invalid_grant`, poproś użytkownika o ponowne połączenie aplikacji. |
| `grant_inactive` | 403 | Użytkownik, który połączył aplikację, nie może już edytować tego konta. Aplikację musi ponownie połączyć ktoś z uprawnieniami do edycji. |
| `account_encrypted` | 403 | Konto jest szyfrowane end-to-end: zapis, filtry `merchant`/`search` i paragony są niedostępne (zob. niżej). |
| `insufficient_scope` | 403 | Połączenie nie ma zakresu wymaganego przez to żądanie; wymienia go `details.required`. Poproś użytkownika o ponowne połączenie z tym zakresem. |
| `viewer_read_only` | 403 | Połączony użytkownik może tylko przeglądać to konto. |
| `trip_archived` | 403 | Konto to zarchiwizowana podróż; nie można go już zmieniać. |
| `forbidden` | 403 | Każda inna odmowa. |
| `validation_failed` | 400 / 422 | 400: żądanie jest niepoprawne. 422: wskazuje rekordy spoza konta albo pola zarządzane przez wspólną grupę. Zob. `details.fields`. |
| `invalid_cursor` | 400 | Odsyłaj `next_cursor` dokładnie w takiej postaci, w jakiej go otrzymałeś. |
| `bad_request` | 400 | Każde inne niepoprawne żądanie. |
| `not_found` | 404 | W połączonym koncie nie ma takiego rekordu albo został usunięty. |
| `method_not_allowed` | 405 | Ta metoda HTTP nie jest obsługiwana pod tym adresem. |
| `conflict` | 409 | Żądanie koliduje z bieżącym stanem. |
| `idempotency_key_conflict` | 409 | `Idempotency-Key` jest już użyty przez inny rekord. Użyj nowego UUID. |
| `payload_too_large` | 413 | Treść żądania jest za duża. |
| `rate_limited` | 429 | Za dużo żądań. Odczekaj `Retry-After` sekund. |
| `internal_error` | 500 | Błąd po naszej stronie. Ponów później. |
| `unavailable` | 503 | Chwilowa awaria. Ponów z rosnącym odstępem. |

`/oauth/token` i `/oauth/revoke` odpowiadają w formacie OAuth `{"error": "...", "error_description": "..."}` z kodami: `invalid_request`, `invalid_client`, `invalid_grant`, `unsupported_grant_type`, `invalid_scope`, `slow_down`, `temporarily_unavailable`. `invalid_grant` przy odświeżaniu oznacza, że połączenia już nie ma (użytkownik je unieważnił, użyto zużytego tokenu odświeżania albo użytkownik stracił uprawnienia do edycji) — poproś użytkownika o ponowne połączenie.

## 9. Limity żądań

- **120 żądań na minutę na połączenie** (konto jednego użytkownika w Twojej aplikacji).
- **1200 żądań na minutę na aplikację**, łącznie dla wszystkich jej połączeń.
- `/oauth/token`: 30 żądań na minutę na aplikację. Klient publiczny jest liczony tylko przy żądaniach z ważnym kodem autoryzacji lub tokenem odświeżania tego klienta.

Każda odpowiedź `/public/v1` na uwierzytelnione i autoryzowane żądanie zawiera `X-RateLimit-Limit` i `X-RateLimit-Remaining` (dla tego limitu, który jest bliżej wyczerpania); odpowiedź `401` lub `403` ich nie ma. Faktyczne limity Twojej aplikacji to te z nagłówków. Po przekroczeniu limitu dostajesz `429 rate_limited` z nagłówkiem `Retry-After` w sekundach — odczekaj tyle przed kolejnym żądaniem.

Przed API działa też serwer pośredniczący, który ogranicza zalewy żądań. Jego `429` nie ma powyższego formatu JSON, a aplikacji przeglądarkowej z obcej domeny przychodzi bez nagłówków CORS, więc przeglądarka zgłasza go jako błąd sieci. Taki nieczytelny błąd traktuj jak `429`: odczekaj i ponów.

## 10. Konta szyfrowane end-to-end

Użytkownicy mogą w aplikacji zaszyfrować swoje dane end-to-end — wtedy nawet nasze serwery nie mogą ich odczytać:

- Konta z **pełnym** szyfrowaniem nie da się połączyć w ogóle.
- Konto z szyfrowaniem **tekstu** można połączyć **tylko do odczytu**. `GET /public/v1/account` pokazuje `"encryption": "text"` i `"read_only": true`. Zapis zwraca `403 account_encrypted`.
- Na takim koncie siedem pól przychodzi jako `null` i jest wymienionych w `encrypted_fields` każdego wydatku: `description`, `notes`, `merchant`, `location.name`, `items.description`, `tags.name`, `project.name`.
- Nazwy kategorii w `/categories` również mają wartość `null`, a każda kategoria ma `"encrypted_fields": ["name"]`.
- Filtry `merchant` i `search` zwracają `403 account_encrypted`, a pliki paragonów są niedostępne.

## 11. Wypróbuj na tej stronie

Przycisk **Authorize** powyżej uruchamia prawdziwy przepływ OAuth z PKCE na prawdziwych danych użytkownika. Aby z niego skorzystać, dodaj `https://api.ai-budget.pl/public/docs/oauth2-redirect.html` do redirect URI swojej aplikacji, a następnie wpisz swój `client_id` (i sekret — w przypadku klienta poufnego).
