import type { DocTexts } from './openapi';

/** Polish texts of the public API reference — the same keys as `texts.en.ts` (see `texts.spec.ts`). */
export const TEXTS_PL: DocTexts = {
  'ui.siteTitle': 'AI Budget API — dokumentacja',
  'info.title': 'AI Budget API',
  'server.production': 'Produkcja',

  // ── security ─────────────────────────────────────────────────────────────
  'security.oauth2':
    'OAuth 2.0, przepływ authorization code z PKCE (wyłącznie `S256`). Użytkownik loguje się do AI Budget, wybiera JEDNO konto i zatwierdza zakresy; Twoja aplikacja wymienia kod na token dostępu (ważny godzinę) i token odświeżania (90 dni, wymieniany przy każdym użyciu). Token dostępu wysyłaj w nagłówku `Authorization: Bearer <access_token>`.',
  'scope.expenses:read': 'Odczyt wydatków: lista, szczegóły z pozycjami paragonu i strumień zmian.',
  'scope.expenses:write': 'Dodawanie, edycja i usuwanie wydatków.',
  'scope.receipts:read': 'Pobieranie oryginalnego pliku paragonu dołączonego do wydatku.',
  'scope.categories:read': 'Odczyt kategorii wydatków konta.',

  // ── tags ─────────────────────────────────────────────────────────────────
  'tag.OAuth':
    'Wymiana kodu, odświeżanie i unieważnianie tokenów (RFC 6749 / RFC 7009). Błędy tych endpointów mają postać `{"error", "error_description"}`, a nie format błędów `/public/v1`.',
  'tag.Account': 'Konto, do którego przypisany jest token dostępu.',
  'tag.Categories': 'Kategorie wydatków konta — wartości dla `category_id`.',
  'tag.Expenses': 'Wydatki: odczyt, synchronizacja przyrostowa, paragony i zapis.',

  // ── shared error responses ────────────────────────────────────────────────
  'error.public.400':
    '`validation_failed` — niepoprawne żądanie (nieznany parametr, zły typ lub format, brak wymaganego pola); `details.fields` zawiera błędy dla poszczególnych pól. `invalid_cursor` — kursor nie pochodzi w niezmienionej postaci z poprzedniej odpowiedzi. Poprawne żądanie, które odwołuje się do rekordów spoza połączonego konta albo do pól należących do wspólnej grupy, dostaje `422`, nie `400`.',
  'error.public.401':
    '`invalid_token` — brak tokenu dostępu albo jest on niepoprawny, wygasł lub został unieważniony. Odśwież go raz; jeśli odświeżenie zwróci `invalid_grant`, użytkownik musi ponownie połączyć Twoją aplikację.',
  'error.public.403':
    '`insufficient_scope` (połączenie nie ma zakresu wymaganego przez to żądanie; brakujące zakresy są w `details.required`), `grant_inactive` (użytkownik, który połączył aplikację, nie ma już uprawnień do edycji tego konta), `account_encrypted` (konto szyfrowane end-to-end: tylko odczyt, bez filtrów po sprzedawcy i wyszukiwania, bez paragonów).',
  'error.public.404': '`not_found` — w połączonym koncie nie ma takiego rekordu (albo został usunięty).',
  'error.public.429':
    '`rate_limited` — za dużo żądań. Odczekaj tyle sekund, ile podaje nagłówek `Retry-After`.',
  'error.public.503': '`unavailable` — chwilowy problem po naszej stronie. Ponów żądanie za moment, z rosnącym odstępem.',
  'error.oauth.400':
    '`invalid_request` (brakujący lub sprzeczny parametr), `invalid_grant` (kod lub token odświeżania jest niepoprawny, wygasł, został już użyty albo połączenie nie jest już aktywne), `unsupported_grant_type`, `invalid_scope`.',
  'error.oauth.401':
    '`invalid_client` — nieznany lub zablokowany klient, błędny sekret albo sekret wysłany przez klienta publicznego.',
  'error.oauth.404': 'Publiczne API nie jest włączone.',
  'error.oauth.429': '`slow_down` — ponad 30 żądań tokenu na minutę dla tego klienta (klient publiczny jest liczony tylko przy żądaniach z jego ważnym kodem lub tokenem odświeżania). Ponów po 60 sekundach.',
  'error.oauth.503': '`temporarily_unavailable` — ponów za chwilę.',

  // ── OAuth ────────────────────────────────────────────────────────────────
  'op.issueToken.summary': 'Wymiana kodu autoryzacji lub odświeżenie tokenu',
  'op.issueToken.description':
    'Przyjmuje `application/x-www-form-urlencoded` (standard) albo JSON.\n\n' +
    'Uwierzytelnienie klienta: HTTP Basic (`client_id:client_secret`) albo `client_id` + `client_secret` w treści żądania. Klient publiczny (bez sekretu) wysyła tylko `client_id` i opiera się na PKCE.\n\n' +
    '- `grant_type=authorization_code`: wymagane są `code`, `redirect_uri` (identyczny jak w żądaniu autoryzacji) i `code_verifier`. Kod jest ważny 10 minut i działa tylko raz — nieudana próba też go zużywa.\n' +
    '- `grant_type=refresh_token`: wymagany jest `refresh_token`. Odpowiedź zawiera NOWY token odświeżania, a poprzedni przestaje działać. Ponowne użycie zużytego tokenu odświeżania traktujemy jak kradzież i unieważniamy całe połączenie — odświeżaj tokeny tylko w jednym miejscu.\n\n' +
    'Limit: 30 żądań na minutę na klienta.',
  'op.issueToken.body': 'Parametry żądania tokenu.',
  'op.issueToken.response.200': 'Nowa para: token dostępu i token odświeżania.',
  'op.revokeToken.summary': 'Unieważnienie tokenu (odłączenie aplikacji)',
  'op.revokeToken.description':
    'RFC 7009. Unieważnienie tokenu dostępu lub odświeżania unieważnia całe połączenie (wszystkie jego tokeny). Po uwierzytelnieniu klienta odpowiedź zawsze brzmi `200 {}`, niezależnie od tego, czy token istniał.',
  'op.revokeToken.body': 'Token do unieważnienia oraz uwierzytelnienie klienta.',
  'op.revokeToken.response.200': 'Unieważniono (albo nie było czego unieważniać).',

  // ── Account ──────────────────────────────────────────────────────────────
  'op.getAccount.summary': 'Połączone konto',
  'op.getAccount.description':
    'Konto, do którego przypisane jest to połączenie, oraz użytkownik, który je utworzył. Działa z każdym ważnym tokenem, bez względu na zakresy. `read_only: true` oznacza konto szyfrowane end-to-end: odczyt działa, ale część pól jest ukryta, a zapis zwraca `403 account_encrypted`.',
  'op.getAccount.response.200': 'Połączone konto.',

  // ── Categories ───────────────────────────────────────────────────────────
  'op.listCategories.summary': 'Lista kategorii wydatków',
  'op.listCategories.description':
    'Dokładnie te kategorie, które zapis wydatku przyjmuje jako `category_id`: własne kategorie wydatków konta. Na koncie szyfrowanym end-to-end `name` ma wartość `null` i jest wymienione w `encrypted_fields` danej kategorii.',
  'op.listCategories.response.200': 'Wszystkie kategorie wydatków konta (bez paginacji).',

  // ── Expenses ─────────────────────────────────────────────────────────────
  'op.listExpenses.summary': 'Lista wydatków',
  'op.listExpenses.description':
    'Od najnowszych (według `date`, potem `id`), z paginacją nieprzezroczystym kursorem: przekazuj `next_cursor` jako `cursor` z TYMI SAMYMI filtrami, dopóki `has_more` nie będzie `false`. Elementy listy nie zawierają `items` — pozycje paragonu zwraca zapytanie o pojedynczy wydatek. Wydatki planowane nigdy nie są zwracane.\n\n' +
    'Na koncie szyfrowanym end-to-end filtry `merchant` i `search` zwracają `403 account_encrypted`.\n\n' +
    'Do utrzymywania kopii danych używaj `GET /public/v1/expenses/changes` zamiast ponownego pobierania listy.',
  'op.listExpenses.param.date_from': 'Tylko wydatki z tego dnia lub późniejsze (`YYYY-MM-DD`, włącznie).',
  'op.listExpenses.param.date_to': 'Tylko wydatki z tego dnia lub wcześniejsze (`YYYY-MM-DD`, włącznie).',
  'op.listExpenses.param.category_id': 'Tylko wydatki, których własne `category_id` jest równe tej wartości (podział na kategorie nie jest przeszukiwany).',
  'op.listExpenses.param.merchant': 'Sprzedawca zawiera podany tekst (bez rozróżniania wielkości liter).',
  'op.listExpenses.param.project_id': 'Tylko wydatki przypisane do tego projektu.',
  'op.listExpenses.param.search': 'Opis lub notatka zawiera podany tekst (bez rozróżniania wielkości liter).',
  'op.listExpenses.param.limit': 'Rozmiar strony, 1–200 (domyślnie 50).',
  'op.listExpenses.param.cursor': '`next_cursor` z poprzedniej strony, bez zmian.',
  'op.listExpenses.response.200': 'Jedna strona wydatków.',

  'op.listExpenseChanges.summary': 'Strumień zmian (synchronizacja przyrostowa)',
  'op.listExpenseChanges.description':
    'Wszystkie zmiany wydatków konta po pozycji `cursor`, od najstarszych. Każdy wpis to `upsert` (pełny wydatek z pozycjami paragonu) albo `delete` (tylko `id`).\n\n' +
    '- Bez `cursor` strumień zaczyna się od początku: wszystkie wydatki oraz dawne usunięcia — usunięcie `id`, którego nie znasz, po prostu nic nie zmienia.\n' +
    '- Wydatek usunięty albo zamieniony w wydatek planowany przychodzi jako `delete`.\n' +
    '- Wydatek edytowany ponownie przesuwa się na koniec strumienia i przychodzi jeszcze raz, w najnowszej wersji.\n' +
    '- Zmiana pojawia się w strumieniu mniej więcej 10 sekund po jej wprowadzeniu.\n' +
    '- Po przetworzeniu każdej strony zapisz `next_cursor` (jest obecny także na pustej stronie) i kontynuuj od niego; powtarzaj, dopóki `has_more` to `true`.\n\n' +
    'Znane ograniczenia: wydatek przeniesiony na inne konto nie jest zgłaszany w tym koncie jako usunięty; zmiana nazwy tagu lub projektu nie powoduje ponownego wysłania wydatków, które go mają. Jeśli nazwy są dla Ciebie ważne, co jakiś czas wykonaj pełną resynchronizację.',
  'op.listExpenseChanges.param.limit': 'Rozmiar strony, 1–200 (domyślnie 200).',
  'op.listExpenseChanges.param.cursor': '`next_cursor` z poprzedniej strony, bez zmian. Pomiń, aby zacząć od początku.',
  'op.listExpenseChanges.response.200': 'Jedna strona zmian.',

  'op.getExpenseReceipt.summary': 'Pobranie pliku paragonu',
  'op.getExpenseReceipt.description':
    'Oryginalne zdjęcie lub PDF paragonu dołączonego do wydatku (`has_receipt: true`). `Content-Type` jest ustalany na podstawie zawartości pliku. `404 not_found`, gdy wydatek nie ma paragonu; `403 account_encrypted` na koncie szyfrowanym end-to-end.',
  'op.getExpenseReceipt.param.id': 'Identyfikator wydatku.',
  'op.getExpenseReceipt.response.200': 'Plik paragonu.',

  'op.getExpense.summary': 'Szczegóły wydatku',
  'op.getExpense.description': 'Jeden wydatek wraz z pozycjami paragonu (`items`).',
  'op.getExpense.param.id': 'Identyfikator wydatku.',
  'op.getExpense.response.200': 'Wydatek.',

  'op.createExpense.summary': 'Dodanie wydatku',
  'op.createExpense.description':
    'Wymaga nagłówka `Idempotency-Key`. Kwoty przekazuj jako ciągi dziesiętne (`"42.50"`), nigdy jako liczby JSON. Pole, którego nie ma w schemacie, jest odrzucane z `400 validation_failed`.\n\n' +
    '`category_id`, `tag_ids` i `project_id` muszą należeć do połączonego konta (w przeciwnym razie `422 validation_failed` ze szczegółami w `details.fields`). Domyślna waluta (`currency`) to waluta bazowa konta.',
  'op.createExpense.param.Idempotency-Key':
    'UUID, który generujesz dla tego wydatku i powtarzasz przy każdej ponownej próbie tego samego żądania. Powtórzenie zwraca już utworzony wydatek (`200`, treść powtórzonego żądania jest ignorowana). Ponowne próby wysyłaj po kolei, nie równolegle. Klucz użyty już przez inny rekord daje `409 idempotency_key_conflict`.',
  'op.createExpense.body': 'Nowy wydatek.',
  'op.createExpense.response.200': 'Wydatek z tym `Idempotency-Key` został utworzony wcześniej: zwracamy go bez zmian.',
  'op.createExpense.response.201': 'Utworzono.',
  'op.createExpense.response.409':
    '`idempotency_key_conflict` — klucz należy do rekordu, którego Twoja aplikacja nie utworzyła, albo do wydatku, który został później usunięty. Użyj nowego UUID.',
  'op.createExpense.response.422':
    '`validation_failed` — `category_id`, `tag_ids` lub `project_id` nie wskazuje istniejącego rekordu tego konta; szczegóły w `details.fields`.',

  'op.updateExpense.summary': 'Edycja wydatku',
  'op.updateExpense.description':
    'Częściowa aktualizacja: pominięte pole pozostaje bez zmian. `null` czyści `time`, `category_id`, `description`, `merchant`, `notes`, `location` i `project_id`; `tag_ids` zastępuje cały zestaw tagów (`[]` usuwa wszystkie). `amount`, `currency`, `date` i `tag_ids` nie mogą być `null`. Pozycji paragonu nie można edytować.\n\n' +
    'Wydatek będący udziałem we wspólnym wydatku grupy (`source: "group"`) bierze `amount`, `currency` i `date` z grupy: próba ich zmiany zwraca `422 validation_failed`.',
  'op.updateExpense.param.id': 'Identyfikator wydatku.',
  'op.updateExpense.body': 'Pola do zmiany.',
  'op.updateExpense.response.200': 'Zaktualizowany wydatek.',
  'op.updateExpense.response.422':
    '`validation_failed` — wskazana kategoria, tag lub projekt nie należy do tego konta albo wysłano pole zarządzane przez wspólną grupę (`amount`, `currency`, `date`); szczegóły w `details.fields`.',

  'op.deleteExpense.summary': 'Usunięcie wydatku',
  'op.deleteExpense.description':
    'Usuwa wydatek tak samo jak usunięcie go w aplikacji. Następnie pojawia się on w strumieniu zmian jako `delete`. Ponowne usunięcie zwraca `404 not_found`.',
  'op.deleteExpense.param.id': 'Identyfikator wydatku.',
  'op.deleteExpense.response.204': 'Usunięto.',

  // ── schemas: errors ──────────────────────────────────────────────────────
  'schema.PublicApiErrorResponse': 'Treść każdego błędu `/public/v1`.',
  'schema.PublicApiErrorResponse.error': 'Co poszło nie tak.',
  'schema.PublicApiErrorObject': 'Szczegóły błędu. Logikę opieraj na `code`; `message` jest dla ludzi i może się zmieniać.',
  'schema.PublicApiErrorObject.code': 'Stały kod do obsługi programowej. Mogą dochodzić nowe kody; istniejące nigdy się nie zmieniają.',
  'schema.PublicApiErrorObject.message': 'Opis dla człowieka (po angielsku).',
  'schema.PublicApiErrorObject.details':
    'Dodatkowe dane przy niektórych kodach, np. `fields` (komunikaty dla poszczególnych pól) przy `validation_failed`, `required` (brakujące zakresy) przy `insufficient_scope`.',
  'schema.OAuthErrorResponse': 'Treść błędu RFC 6749 dla `/oauth/token` i `/oauth/revoke`.',
  'schema.OAuthErrorResponse.error': 'Kod błędu OAuth.',
  'schema.OAuthErrorResponse.error_description': 'Opis dla człowieka (po angielsku).',

  // ── schemas: OAuth ───────────────────────────────────────────────────────
  'schema.OAuthTokenRequest': 'Parametry `POST /oauth/token`. To, które są wymagane, zależy od `grant_type`.',
  'schema.OAuthTokenRequest.grant_type': '`authorization_code` — wymiana kodu, `refresh_token` — odświeżenie.',
  'schema.OAuthTokenRequest.code': '`code` otrzymany na Twój redirect URI. Wymagany dla `authorization_code`.',
  'schema.OAuthTokenRequest.redirect_uri':
    'Dokładnie ten sam `redirect_uri` co w żądaniu autoryzacji. Wymagany dla `authorization_code`.',
  'schema.OAuthTokenRequest.code_verifier':
    'Weryfikator PKCE, którego skrót SHA-256 wysłano jako `code_challenge`. Wymagany dla `authorization_code`.',
  'schema.OAuthTokenRequest.refresh_token': 'Twój aktualny token odświeżania. Wymagany dla `refresh_token`.',
  'schema.OAuthTokenRequest.scope':
    'Opcjonalny przy odświeżaniu: podzbiór przyznanych zakresów. Odpowiedź i tak podaje wszystkie przyznane zakresy.',
  'schema.OAuthTokenRequest.client_id': 'Identyfikator klienta, chyba że wysyłasz go przez HTTP Basic.',
  'schema.OAuthTokenRequest.client_secret': 'Tylko dla klientów poufnych, chyba że wysyłasz go przez HTTP Basic. Nigdy nie wysyłaj go z przeglądarki ani z aplikacji mobilnej.',
  'schema.OAuthRevokeRequest': 'Parametry `POST /oauth/revoke`.',
  'schema.OAuthRevokeRequest.token': 'Token dostępu lub odświeżania należący do połączenia.',
  'schema.OAuthRevokeRequest.token_type_hint': 'Przyjmowany i ignorowany: oba rodzaje tokenów i tak zostaną znalezione.',
  'schema.OAuthRevokeRequest.client_id': 'Identyfikator klienta, chyba że wysyłasz go przez HTTP Basic.',
  'schema.OAuthRevokeRequest.client_secret': 'Tylko dla klientów poufnych, chyba że wysyłasz go przez HTTP Basic.',
  'schema.OAuthTokenResponse': 'Para tokenów. Za każdym razem zapisuj nowy `refresh_token` — poprzedni już nie działa.',
  'schema.OAuthTokenResponse.access_token': 'Wysyłaj jako `Authorization: Bearer <access_token>`.',
  'schema.OAuthTokenResponse.token_type': 'Zawsze `Bearer`.',
  'schema.OAuthTokenResponse.expires_in': 'Czas życia tokenu dostępu w sekundach (3600).',
  'schema.OAuthTokenResponse.refresh_token':
    'Ważny 90 dni i jednorazowy: każde odświeżenie zwraca nowy. Ponowne użycie starego unieważnia połączenie.',
  'schema.OAuthTokenResponse.scope': 'Zakresy połączenia, rozdzielone spacjami.',
  'schema.OAuthTokenResponse.account_id': 'Konto połączone przez użytkownika.',

  // ── schemas: account and categories ──────────────────────────────────────
  'schema.PublicAccount': 'Połączone konto.',
  'schema.PublicAccount.id': 'Identyfikator konta.',
  'schema.PublicAccount.name': 'Nazwa konta.',
  'schema.PublicAccount.type': 'Typ konta.',
  'schema.PublicAccount.base_currency': 'Waluta bazowa konta (ISO 4217); domyślna `currency` nowego wydatku.',
  'schema.PublicAccount.role': 'Rola użytkownika, który połączył aplikację, w tym koncie (połączyć mogą tylko właściciele i edytorzy).',
  'schema.PublicAccount.encryption':
    '`none` albo `text` dla konta szyfrowanego end-to-end (przez API tylko do odczytu, część pól ukryta). Kont w pełni zaszyfrowanych nie można połączyć.',
  'schema.PublicAccount.read_only': '`true`, gdy zapis jest odrzucany (konto szyfrowane end-to-end).',
  'schema.PublicAccount.user': 'Użytkownik, który połączył aplikację.',
  'schema.PublicAccountUser': 'Użytkownik, który połączył aplikację.',
  'schema.PublicAccountUser.id': 'Identyfikator użytkownika.',
  'schema.PublicAccountUser.name': 'Wyświetlana nazwa.',
  'schema.PublicAccountUser.base_currency': 'Waluta wyświetlania użytkownika (może się różnić od waluty konta).',
  'schema.PublicCategoryList': 'Kategorie wydatków.',
  'schema.PublicCategoryList.data': 'Kategorie.',
  'schema.PublicCategory': 'Kategoria wydatków.',
  'schema.PublicCategory.id': 'Identyfikator kategorii — wartość dla `category_id`.',
  'schema.PublicCategory.name': 'Nazwa; `null` na koncie szyfrowanym end-to-end.',
  'schema.PublicCategory.parent_id': 'Identyfikator kategorii nadrzędnej dla podkategorii, w przeciwnym razie `null`.',
  'schema.PublicCategory.icon': 'Nazwa ikony używanej w aplikacji.',
  'schema.PublicCategory.color': 'Kolor używany w aplikacji, np. `#4CAF50`.',
  'schema.PublicCategory.type': 'W tej wersji zawsze `expense`.',
  'schema.PublicCategory.encrypted_fields': 'Pola ukryte (`null`), bo konto jest szyfrowane end-to-end: `["name"]` albo `[]`.',

  // ── schemas: expense ─────────────────────────────────────────────────────
  'schema.PublicExpense': 'Wydatek.',
  'schema.PublicExpense.id': 'Identyfikator wydatku.',
  'schema.PublicExpense.amount': 'Ciąg dziesiętny we własnej walucie wydatku (`currency`, nigdy nie przeliczany), np. `"42.50"`.',
  'schema.PublicExpense.currency': 'Kod ISO 4217.',
  'schema.PublicExpense.date': 'Data wydatku, `YYYY-MM-DD`.',
  'schema.PublicExpense.time': 'Godzina w zapisanej postaci, `HH:mm`, albo `null`.',
  'schema.PublicExpense.category_id': 'Identyfikator kategorii albo `null`, gdy wydatek nie ma kategorii.',
  'schema.PublicExpense.description': 'Opis. `null`, gdy pusty lub ukryty (zob. `encrypted_fields`).',
  'schema.PublicExpense.merchant': 'Sprzedawca. `null`, gdy pusty lub ukryty (zob. `encrypted_fields`).',
  'schema.PublicExpense.notes': 'Notatka. `null`, gdy pusta lub ukryta (zob. `encrypted_fields`).',
  'schema.PublicExpense.location': 'Miejsce wydatku albo `null`.',
  'schema.PublicExpense.tags': 'Tagi wydatku.',
  'schema.PublicExpense.project': 'Projekt, do którego należy wydatek, albo `null`.',
  'schema.PublicExpense.category_splits':
    'Gdy wydatek jest podzielony na kilka kategorii: udział każdej z nich. Pusta tablica, gdy nie jest podzielony.',
  'schema.PublicExpense.items':
    'Pozycje paragonu. Obecne w szczegółach pojedynczego wydatku i w strumieniu zmian; brak ich na liście.',
  'schema.PublicExpense.discount_amount': 'Łączny rabat na paragonie jako ciąg dziesiętny albo `null`.',
  'schema.PublicExpense.deposit_amount': 'Kaucja za butelki/opakowania zapłacona w ramach kwoty, jako ciąg dziesiętny, albo `null`.',
  'schema.PublicExpense.is_debt': 'Pieniądze pożyczone komuś (dług), a nie zwykły wydatek.',
  'schema.PublicExpense.is_debt_repayment': 'Spłata pieniędzy pożyczonych przez użytkownika.',
  'schema.PublicExpense.is_split_receivable': 'Część wspólnego rachunku, którą inni mają oddać użytkownikowi — nie jego własny wydatek.',
  'schema.PublicExpense.is_recurring': 'Część serii wydatków cyklicznych.',
  'schema.PublicExpense.source':
    'Sposób zapisania wydatku, na przykład `manual`, `voice`, `ocr`, `import`, `telegram`, `whatsapp`, `slack`, `notification`, `group` (udział we wspólnym wydatku grupy) lub `api`. Traktuj listę jako otwartą: mogą pojawić się nowe wartości.',
  'schema.PublicExpense.created_by_app': 'Aplikacja, która utworzyła wydatek przez to API, albo `null`.',
  'schema.PublicExpense.created_by_user': 'Użytkownik, który zapisał wydatek.',
  'schema.PublicExpense.has_receipt': 'Do wydatku dołączono plik paragonu (pobierzesz go przez `GET /public/v1/expenses/{id}/receipt`).',
  'schema.PublicExpense.encrypted_fields':
    'Na koncie szyfrowanym end-to-end: pola zwracane jako `null`, bo są zaszyfrowane — `description`, `notes`, `merchant`, `location.name`, `items.description`, `tags.name`, `project.name`. W pozostałych przypadkach `[]`.',
  'schema.PublicExpense.created_at': 'Kiedy wydatek utworzono (ISO-8601, UTC).',
  'schema.PublicExpense.updated_at': 'Kiedy wydatek ostatnio się zmienił (ISO-8601, UTC).',
  'schema.PublicLocation': 'Lokalizacja.',
  'schema.PublicLocation.lat': 'Szerokość geograficzna.',
  'schema.PublicLocation.lng': 'Długość geograficzna.',
  'schema.PublicLocation.name': 'Nazwa miejsca; `null`, gdy nie podano lub ukryto (zob. `encrypted_fields`).',
  'schema.PublicRef': 'Tag lub projekt.',
  'schema.PublicRef.id': 'Identyfikator.',
  'schema.PublicRef.name': 'Nazwa; `null`, gdy ukryta (zob. `encrypted_fields`).',
  'schema.PublicCategorySplit': 'Udział jednej kategorii w podzielonym wydatku.',
  'schema.PublicCategorySplit.category_id': 'Identyfikator kategorii.',
  'schema.PublicCategorySplit.amount': 'Udział jako ciąg dziesiętny w walucie wydatku.',
  'schema.PublicExpenseItem': 'Pozycja paragonu.',
  'schema.PublicExpenseItem.id': 'Identyfikator pozycji.',
  'schema.PublicExpenseItem.description': 'Nazwa produktu; `null`, gdy ukryta (zob. `encrypted_fields`).',
  'schema.PublicExpenseItem.quantity': 'Ilość, ciąg dziesiętny z trzema miejscami po przecinku.',
  'schema.PublicExpenseItem.unit_price': 'Cena jednostkowa, ciąg dziesiętny.',
  'schema.PublicExpenseItem.total_price': 'Wartość pozycji, ciąg dziesiętny.',
  'schema.PublicExpenseItem.line_discount': 'Rabat na tej pozycji, ciąg dziesiętny (`"0.00"`, gdy brak).',
  'schema.PublicExpenseItem.category_id': 'Kategoria tej pozycji albo `null`.',
  'schema.PublicCreatedByApp': 'Aplikacja połączona przez to API.',
  'schema.PublicCreatedByApp.id': 'Publiczny `client_id` aplikacji — porównaj go ze swoim, aby rozpoznać własne zapisy.',
  'schema.PublicCreatedByApp.name': 'Nazwa aplikacji.',
  'schema.PublicCreatedByUser': 'Członek konta.',
  'schema.PublicCreatedByUser.id': 'Identyfikator użytkownika.',
  'schema.PublicCreatedByUser.name': 'Wyświetlana nazwa.',
  'schema.PublicExpenseList': 'Jedna strona wydatków.',
  'schema.PublicExpenseList.data': 'Wydatki z tej strony (bez `items`).',
  'schema.PublicExpenseList.next_cursor': 'Przekaż jako `cursor`, aby pobrać następną stronę; `null` na ostatniej stronie.',
  'schema.PublicExpenseList.has_more': 'Czy jest kolejna strona.',
  'schema.PublicExpenseChanges': 'Jedna strona strumienia zmian.',
  'schema.PublicExpenseChanges.changes': 'Zmiany od najstarszych. Stosuj je po kolei.',
  'schema.PublicExpenseChanges.next_cursor':
    'Zawsze obecny (na pustej stronie równy wysłanemu kursorowi). Zapisz go po przetworzeniu strony i wyślij następnym razem.',
  'schema.PublicExpenseChanges.has_more': 'Czy w tej chwili dostępne są kolejne zmiany. Gdy `false`, odpytaj ponownie później z `next_cursor`.',
  'schema.PublicExpenseUpsertChange': 'Wydatek utworzono lub zmieniono.',
  'schema.PublicExpenseUpsertChange.type': 'Zawsze `upsert`.',
  'schema.PublicExpenseUpsertChange.expense': 'Wydatek w aktualnym stanie, z pozycjami paragonu. Wstaw go do swojej kopii lub zastąp nim poprzednią wersję.',
  'schema.PublicExpenseDeleteChange': 'Wydatek usunięto albo przestał być widoczny (stał się wydatkiem planowanym).',
  'schema.PublicExpenseDeleteChange.type': 'Zawsze `delete`.',
  'schema.PublicExpenseDeleteChange.id': 'Identyfikator wydatku do usunięcia z Twojej kopii. Może to być `id`, którego nigdy nie otrzymałeś.',
  'schema.PublicExpenseDeleteChange.deleted_at': 'Kiedy wydatek usunięto lub przestał być widoczny (ISO-8601, UTC).',

  // ── schemas: write bodies ────────────────────────────────────────────────
  'schema.PublicExpenseCreateDto': 'Nowy wydatek. Pola spoza tej listy są odrzucane.',
  'schema.PublicExpenseCreateDto.amount': 'Ciąg dziesiętny większy od 0, najwyżej 2 miejsca po przecinku, np. `"42.50"`.',
  'schema.PublicExpenseCreateDto.currency': 'Kod ISO 4217 wielkimi literami. Domyślnie waluta bazowa konta.',
  'schema.PublicExpenseCreateDto.date': 'Data wydatku, `YYYY-MM-DD`.',
  'schema.PublicExpenseCreateDto.time': 'Godzina, `HH:mm` (format 24-godzinny).',
  'schema.PublicExpenseCreateDto.category_id': 'Jedna z kategorii z `GET /public/v1/categories`.',
  'schema.PublicExpenseCreateDto.description': 'Opis, do 500 znaków.',
  'schema.PublicExpenseCreateDto.merchant': 'Sprzedawca, do 120 znaków.',
  'schema.PublicExpenseCreateDto.notes': 'Notatka, do 2000 znaków.',
  'schema.PublicExpenseCreateDto.location': 'Miejsce wydatku.',
  'schema.PublicExpenseCreateDto.tag_ids': 'Identyfikatory tagów tego konta (do 50, bez powtórzeń).',
  'schema.PublicExpenseCreateDto.project_id': 'Identyfikator projektu tego konta.',
  'schema.PublicExpenseCreateDto.items': 'Pozycje paragonu (1–500). Tylko przy tworzeniu.',
  'schema.PublicExpenseUpdateDto': 'Pola do zmiany. Pominięte pola pozostają bez zmian; `null` czyści pole tam, gdzie to dozwolone.',
  'schema.PublicExpenseUpdateDto.amount': 'Ciąg dziesiętny większy od 0. Nie może być `null`.',
  'schema.PublicExpenseUpdateDto.currency': 'Kod ISO 4217 wielkimi literami. Nie może być `null`.',
  'schema.PublicExpenseUpdateDto.date': '`YYYY-MM-DD`. Nie może być `null`.',
  'schema.PublicExpenseUpdateDto.time': '`HH:mm` albo `null`, aby wyczyścić.',
  'schema.PublicExpenseUpdateDto.category_id': 'Kategoria z `GET /public/v1/categories` albo `null`, aby wyczyścić.',
  'schema.PublicExpenseUpdateDto.description': 'Opis albo `null`, aby wyczyścić.',
  'schema.PublicExpenseUpdateDto.merchant': 'Sprzedawca albo `null`, aby wyczyścić.',
  'schema.PublicExpenseUpdateDto.notes': 'Notatka albo `null`, aby wyczyścić.',
  'schema.PublicExpenseUpdateDto.location': 'Lokalizacja albo `null`, aby wyczyścić.',
  'schema.PublicExpenseUpdateDto.tag_ids': 'Zastępuje wszystkie tagi; `[]` usuwa wszystkie. Nie może być `null`.',
  'schema.PublicExpenseUpdateDto.project_id': 'Projekt tego konta albo `null`, aby odłączyć wydatek od projektu.',
  'schema.PublicLocationInput': 'Lokalizacja.',
  'schema.PublicLocationInput.lat': 'Szerokość geograficzna, od −90 do 90.',
  'schema.PublicLocationInput.lng': 'Długość geograficzna, od −180 do 180.',
  'schema.PublicLocationInput.name': 'Nazwa miejsca, do 200 znaków.',
  'schema.PublicExpenseItemInput': 'Pozycja paragonu.',
  'schema.PublicExpenseItemInput.description': 'Nazwa produktu, 1–500 znaków.',
  'schema.PublicExpenseItemInput.quantity': 'Ciąg dziesiętny większy od 0, najwyżej 3 miejsca po przecinku. Domyślnie `"1"`.',
  'schema.PublicExpenseItemInput.unit_price': 'Ciąg dziesiętny, najwyżej 2 miejsca po przecinku. Domyślnie `"0"`.',
  'schema.PublicExpenseItemInput.total_price': 'Wartość pozycji, ciąg dziesiętny, najwyżej 2 miejsca po przecinku.',
};
