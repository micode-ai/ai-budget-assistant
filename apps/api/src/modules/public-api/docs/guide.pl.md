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
| `scope` | rozdzielone spacjami: `expenses:read`, `expenses:write`, `receipts:read`, `categories:read`, `incomes:read`, `incomes:write`, `budgets:read`, `budgets:write`, `analytics:read` |
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

Użytkownik loguje się, wybiera **jedno lub kilka** kont i zatwierdza zakresy. Następnie przeglądarka wraca na Twój redirect URI:

- zgoda: `https://example.com/oauth/callback?code=...&state=...`
- odmowa: `https://example.com/oauth/callback?error=access_denied&state=...`

Zanim użyjesz kodu, sprawdź, czy `state` jest tym, który wysłałeś.

**Jedno połączenie, jedno lub kilka kont.** Użytkownik zaznacza, które konta dostaje Twoja aplikacja; połączenie obejmuje dokładnie te konta. Połączyć konto może tylko jego **właściciel** albo **edytor**. Jeśli użytkownik, który połączył aplikację, straci później uprawnienia do edycji jednego z kont (zostanie obserwatorem albo opuści konto), wywołania kierowane do tego konta zwracają `403 grant_inactive`, a pozostałe konta nadal działają; konto znów zadziała, gdy ktoś z uprawnieniami do edycji połączy aplikację ponownie.

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
  "account_ids": ["7c9e1a3b-5d7f-4b2c-8e4a-6f8b0d2c4e6a"],
  "account_id": "7c9e1a3b-5d7f-4b2c-8e4a-6f8b0d2c4e6a"
}
```

`account_ids` zawiera wszystkie konta połączenia, w kolejności połączenia. `account_id` pojawia się **tylko** wtedy, gdy połączenie ma dokładnie jedno konto (dla starszych integracji); korzystaj z `account_ids`.

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

`GET /public/v1/account` mówi, którego konta dotyczy wywołanie. Przy kilku kontach wskaż je nagłówkiem `X-Account-Id` (zob. sekcja 5). Listy są stronicowane nieprzezroczystym kursorem: przekazuj `next_cursor` z powrotem jako `cursor`, z tymi samymi filtrami, dopóki `has_more` ma wartość `true`.

## 5. Kilka kont w jednym połączeniu

Odpowiedź z tokenami zawsze zawiera `account_ids`. Szczegóły pobierzesz przez `GET /public/v1/accounts`; wystarczy ważny token, bez `X-Account-Id` i bez zakresu, a odpowiedź zawsze przychodzi:

```json
{ "data": [{ "id": "...", "name": "Family", "type": "shared", "base_currency": "PLN", "access": "read_write", "active": true, "reason": null }] }
```

- `type` odróżnia konto firmowe (`business`) od prywatnego (`personal`, `shared`, `trip`, `investment`).
- `access` to `read_write`, gdy połączenie może zapisywać na koncie, w przeciwnym razie `read` (brak zakresu `expenses:write` albo konto z szyfrowaniem tekstu end-to-end).
- `active: false` oznacza, że żądania do tego konta są odrzucane; `reason` podaje powód: `role` (użytkownik nie jest już właścicielem ani edytorem), `encrypted` (konto jest teraz w pełni szyfrowane end-to-end) albo `archived` (zarchiwizowana podróż: nadal aktywna, tylko do odczytu). Gdy `role` wynika z tego, że użytkownik nie jest już w ogóle członkiem konta, pola `name`, `type` i `base_currency` mają wartość `null`.

**Wybór konta.** Identyfikator wysyłaj w nagłówku `X-Account-Id` przy wszystkich pozostałych wywołaniach. Gdy udostępnione jest dokładnie **jedno** konto, nagłówek jest opcjonalny. Gdy **więcej niż jedno**, jest wymagany, a wywołanie bez niego zwraca `400 account_required` — także `GET /public/v1/account`. Reguła liczy konta udostępnione przez użytkownika, nie te, które działają: połączenie z dwoma kontami, z których jedno jest nieaktywne, nadal wymaga nagłówka. Identyfikator spoza połączenia zwraca `403 account_not_granted`; konto, którego właściciel lub edytor utracił uprawnienia, zwraca `403 grant_inactive`; konto nowo zaszyfrowane `403 account_encrypted`. Pozostałe konta połączenia nie są dotknięte.

**Zawsze wysyłaj `X-Account-Id`, także przy jednym koncie, i traktuj `account_ids` w każdej odpowiedzi z tokenami jako wiążące.** Ponowna zgoda może **zastąpić** zestaw kont: połączenie z jednym kontem może przejść na inne, a żądanie bez nagłówka trafiłoby wtedy po cichu do nowego konta. Po każdej wymianie kodu i odświeżeniu odczytaj `account_ids` ponownie i dostosuj do niego własne powiązanie kont z danymi.

**Jedno wywołanie, jedno konto.** Nie ma wspólnego endpointu dla wielu kont: aby odczytać kilka kont, wywołaj API osobno dla każdego. Zakresy i limity żądań dotyczą całego połączenia (jeden licznik dla wszystkich jego kont), natomiast wartości `Idempotency-Key` i kursory `/expenses/changes` są osobne dla każdego konta: ten sam klucz lub kursor znaczy na każdym koncie coś innego, więc przechowuj je osobno.

**Zmiana zestawu kont.** Gdy użytkownik łączy Twoją aplikację ponownie, ekran zgody ma już zaznaczone połączone konta, a to, co zatwierdzi, **zastępuje** dotychczasowy zestaw. Konto, które odznaczy, traci dostęp od następnego żądania, a tokeny nadal działają dla pozostałych. Odświeżenie zwraca `invalid_grant` tylko wtedy, gdy **żadne** konto połączenia nie nadaje się już do użycia.

## 6. Odśwież token dostępu

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

## 7. Synchronizacja przyrostowa

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

## 8. Dodawanie, edycja i usuwanie wydatków

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

## 9. Przychody

Przychody działają jak wydatki (sekcja 8), pod adresem `/public/v1/incomes`: `GET` (lista), `GET /{id}`, `POST`, `PATCH /{id}`, `DELETE /{id}` oraz kanał zmian `GET /incomes/changes` (te same zasady co w sekcji 7). Zakresy: `incomes:read`, `incomes:write`.

- **Kody walidacji.** Żądanie niepoprawne — zły parametr zapytania albo pole treści, które nie przechodzi walidacji (nieznane pole, zły typ, zła wartość enum, `date_from` po `date_to`, nieznana waluta) — to `400 validation_failed`. `422 validation_failed` dotyczy błędów odniesień i stanu: kategorii złego typu lub z innego konta, `tag_ids` albo `project_id` spoza konta oraz próby edycji przychodu powiązanego z przelewem.
- **Filtry listy** mają nazwy takie jak lista wydatków: `date_from`, `date_to`, `category_id`, `project_id`, `search`, `limit`, `cursor`. Nie ma filtra sprzedawcy ani kwoty. `GET /public/v1/categories?type=income` zwraca kategorie, które przyjmuje zapis przychodu. Nieznane parametry zapytania są odrzucane z `400 validation_failed`, jak na każdej trasie listy, także na `/categories`.
- **Idempotentność.** `POST /incomes` wymaga `Idempotency-Key`, na tych samych zasadach co wydatki: klucz jest ograniczony do aplikacji i konta; powtórzenie zwraca `200` z istniejącym rekordem; `409 idempotency_key_conflict` oznacza, że klucz należy do rekordu innego pochodzenia, do identyfikatora innego rekordu albo do usuniętego rekordu.
- **Pola tylko do odczytu.** `is_debt`, `is_debt_repayment`, `is_split_receivable` i `is_transfer` są zwracane, ale nie można ich zapisać.
- **Spłaty długów.** Kwotę i datę spłaty długu można edytować, a spłatę usunąć — każda z tych operacji zmienia saldo pozostałe do spłaty, więc rób to świadomie.
- **Przelewy.** Przychodu będącego jedną ze stron przelewu między kontami (`is_transfer: true`) nie można edytować ani usunąć; obie operacje zwracają `422 validation_failed`.

```bash
curl -X POST https://api.ai-budget.pl/public/v1/incomes \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: 0c9d4e1a-7b2f-4a63-8e15-3f6a9b2c4d70" \
  -H "Content-Type: application/json" \
  -d '{"amount":"4200.00","currency":"PLN","date":"2026-10-31","description":"Salary"}'
```

## 10. Budżety

Budżety są pod adresem `/public/v1/budgets`: `GET` (lista), `GET /{id}`, `POST`, `PATCH /{id}`, `DELETE /{id}`. Zakresy: `budgets:read`, `budgets:write`.

- `POST /budgets` wymaga `Idempotency-Key`, na tych samych zasadach co przychody i wydatki.
- Budżet nie ma własnej kategorii: zakres kategorii istnieje tylko przez `allocations`, listę `{category_id, amount}`.
- W `PATCH` pole `allocations` **zastępuje cały zestaw**: `[]` czyści go, pominięcie pola zostawia bez zmian. Powtórzone `category_id` to `422 validation_failed`.
- `is_active` jest tylko do odczytu.
- `progress` opisuje **bieżący okres**, w walucie samego budżetu, i używa początku miesiąca finansowego konta.
- Budżety nie mają kanału zmian: odpytuj listę.

## 11. Analityka

Trzy raporty tylko do odczytu pod `/public/v1/analytics`, zakres `analytics:read`: `GET /summary` (przychody, wydatki, saldo, `transaction_count`), `GET /by-category` (`type=expense|income`) i `GET /monthly`. Wszystkie przyjmują `from` i `to` (`YYYY-MM-DD`, oba włącznie) oraz opcjonalną `currency`.

Jak to jest liczone:

- **Waluta.** Domyślnie jest to waluta wyświetlania użytkownika, który połączył aplikację. Każda odpowiedź podaje `currency`.
- **Przeliczanie.** Każdy wiersz jest przeliczany po kursach naszego serwera. Wiersz o nieznanym kursie jest wyłączany ze wszystkich wartości, a odpowiedź ma `fx_approximate: true` — nigdy nie jest dodawany nieprzeliczony.
- **Co jest liczone.** Planowane wydatki i wiersze z kwotami, które znajomi mają oddać użytkownikowi po podziale rachunku, są pomijane. Długi i przelewy są liczone, tak jak w zakładce Analityka w aplikacji. `transaction_count` liczy razem wydatki i przychody.
- **Kategorie.** Paragon rozdzielony na kategorie jest przypisywany według podziału, więc suma kategorii może różnić się od przeliczenia całego wiersza o grosz.
- **Zakresy.** `from` i `to` są włącznie. Najwyżej 366 dni dla `summary` i `by-category`, najwyżej 24 miesiące dla `monthly`; miesiące są kalendarzowe. Dłuższy zakres, `from` po `to` albo nieznana waluta to `400 validation_failed`.
- **Pamięć podręczna.** Wyniki są buforowane przez 60 sekund.
- **Dlaczego sumy mogą się nieco różnić od aplikacji.** Aplikacja przelicza po własnych, zapamiętanych kursach i dodaje kwotę bez znanego kursu nieprzeliczoną; API ją pomija i oznacza.

```bash
curl "https://api.ai-budget.pl/public/v1/analytics/summary?from=2026-10-01&to=2026-10-31&currency=PLN" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## 12. Błędy

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
| `account_required` | 400 | Połączenie obejmuje kilka kont: wyślij nagłówek `X-Account-Id` z jednym z identyfikatorów z `GET /public/v1/accounts`. |
| `account_not_granted` | 403 | Konto z `X-Account-Id` nie należy do tego połączenia. |
| `bad_request` | 400 | Każde inne niepoprawne żądanie. |
| `not_found` | 404 | W połączonym koncie nie ma takiego rekordu albo został usunięty. |
| `method_not_allowed` | 405 | Ta metoda HTTP nie jest obsługiwana pod tym adresem. |
| `conflict` | 409 | Żądanie koliduje z bieżącym stanem. |
| `idempotency_key_conflict` | 409 | `Idempotency-Key` jest już użyty przez inny rekord. Użyj nowego UUID. |
| `payload_too_large` | 413 | Treść żądania jest za duża. |
| `rate_limited` | 429 | Za dużo żądań. Odczekaj `Retry-After` sekund. |
| `internal_error` | 500 | Błąd po naszej stronie. Ponów później. |
| `unavailable` | 503 | Chwilowa awaria. Ponów z rosnącym odstępem. |

`/oauth/token` i `/oauth/revoke` odpowiadają w formacie OAuth `{"error": "...", "error_description": "..."}` z kodami: `invalid_request`, `invalid_client`, `invalid_grant`, `unsupported_grant_type`, `invalid_scope`, `slow_down`, `temporarily_unavailable`. `invalid_grant` przy odświeżaniu oznacza, że połączenia już nie ma (użytkownik je unieważnił, użyto zużytego tokenu odświeżania albo żadne konto połączenia nie nadaje się już do użycia, bo użytkownik stracił uprawnienia do edycji wszystkich) — poproś użytkownika o ponowne połączenie.

## 13. Limity żądań

- **120 żądań na minutę na połączenie** (jeden użytkownik w Twojej aplikacji, wszystkie konta połączenia razem).
- **1200 żądań na minutę na aplikację**, łącznie dla wszystkich jej połączeń.
- `/oauth/token`: 30 żądań na minutę na aplikację. Klient publiczny jest liczony tylko przy żądaniach z ważnym kodem autoryzacji lub tokenem odświeżania tego klienta.

Każda odpowiedź `/public/v1` na uwierzytelnione i autoryzowane żądanie zawiera `X-RateLimit-Limit` i `X-RateLimit-Remaining` (dla tego limitu, który jest bliżej wyczerpania); odpowiedź `401` lub `403` ich nie ma. Faktyczne limity Twojej aplikacji to te z nagłówków. Po przekroczeniu limitu dostajesz `429 rate_limited` z nagłówkiem `Retry-After` w sekundach — odczekaj tyle przed kolejnym żądaniem.

Przed API działa też serwer pośredniczący, który ogranicza zalewy żądań. Jego `429` nie ma powyższego formatu JSON, a aplikacji przeglądarkowej z obcej domeny przychodzi bez nagłówków CORS, więc przeglądarka zgłasza go jako błąd sieci. Taki nieczytelny błąd traktuj jak `429`: odczekaj i ponów.

## 14. Konta szyfrowane end-to-end

Użytkownicy mogą w aplikacji zaszyfrować swoje dane end-to-end — wtedy nawet nasze serwery nie mogą ich odczytać:

- Konta z **pełnym** szyfrowaniem nie da się połączyć w ogóle.
- Konto z szyfrowaniem **tekstu** można połączyć **tylko do odczytu**. `GET /public/v1/account` pokazuje `"encryption": "text"` i `"read_only": true`. Zapis zwraca `403 account_encrypted`.
- Na takim koncie siedem pól przychodzi jako `null` i jest wymienionych w `encrypted_fields` każdego wydatku: `description`, `notes`, `merchant`, `location.name`, `items.description`, `tags.name`, `project.name`.
- Nazwy kategorii w `/categories` również mają wartość `null`, a każda kategoria ma `"encrypted_fields": ["name"]`.
- Filtry `merchant` i `search` zwracają `403 account_encrypted`, a pliki paragonów są niedostępne.

## 15. Wypróbuj na tej stronie

Przycisk **Authorize** powyżej uruchamia prawdziwy przepływ OAuth z PKCE na prawdziwych danych użytkownika. Aby z niego skorzystać, dodaj `https://api.ai-budget.pl/public/docs/oauth2-redirect.html` do redirect URI swojej aplikacji, a następnie wpisz swój `client_id` (i sekret — w przypadku klienta poufnego).
