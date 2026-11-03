# Быстрый старт

AI Budget API позволяет вашему приложению читать и записывать расходы пользователя — с его разрешения, через OAuth 2.0. Это руководство проведёт вас от регистрации приложения до синхронизированной копии расходов. Ниже — справочник по каждому эндпоинту, полю и ошибке.

- Базовый URL API: `https://api.ai-budget.pl/public/v1`
- URL авторизации: `https://app.ai-budget.pl/authorize`
- URL токенов: `https://api.ai-budget.pl/oauth/token`
- Поля JSON — в `snake_case`. Суммы передаются десятичными **строками** (`"42.50"`), даты — в формате `YYYY-MM-DD`, метки времени — ISO-8601 в UTC.

## 1. Зарегистрируйте приложение

В приложении AI Budget откройте **Настройки → Разработчикам** и создайте приложение. Укажите название, домашнюю страницу и один или несколько **redirect URI**. Redirect URI должен начинаться с `https://`; для разработки также разрешены `http://localhost[:port]` и `http://127.0.0.1[:port]`. URI, который вы потом передаёте, должен совпадать с зарегистрированным **в точности**, символ в символ.

Выберите тип клиента:

- **Конфиденциальный** (confidential) — ваш бэкенд может хранить секрет. Вы получаете `client_id` и `client_secret`. Секрет показывается только один раз: сохраните его в надёжном месте и никогда не встраивайте в браузерный код или мобильное приложение.
- **Публичный** (public) — одностраничное или мобильное приложение. Только `client_id`; поток защищает один лишь PKCE.

Один разработчик может зарегистрировать до 10 приложений.

## 2. Отправьте пользователя на URL авторизации

Каждый запрос авторизации использует PKCE с методом `S256` (другие методы не принимаются). Сгенерируйте случайный `code_verifier`, отправьте его SHA-256 как `code_challenge` и сохраните верификатор до возвращения пользователя. Также сгенерируйте случайный `state` и проверьте его при возврате.

| Параметр | Значение |
| --- | --- |
| `response_type` | `code` |
| `client_id` | идентификатор вашего клиента |
| `redirect_uri` | один из зарегистрированных redirect URI, в точности |
| `scope` | через пробел: `expenses:read`, `expenses:write`, `receipts:read`, `categories:read`, `incomes:read`, `incomes:write`, `budgets:read`, `budgets:write`, `analytics:read` |
| `state` | случайное значение, которое вы проверяете при возврате |
| `code_challenge` | SHA-256 от `code_verifier` в base64url (43 символа) |
| `code_challenge_method` | `S256` |

JavaScript для браузера (делает переход и использует `sessionStorage`; сама часть PKCE работает и в Node.js 20+):

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

Готовый URL выглядит так:

```text
https://app.ai-budget.pl/authorize?response_type=code&client_id=aba_ci_q7Lx2Vb9TmR4kWc8Zp1sYg&redirect_uri=https%3A%2F%2Fexample.com%2Foauth%2Fcallback&scope=expenses%3Aread+expenses%3Awrite+receipts%3Aread+categories%3Aread&state=af0ifjsldkj&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256
```

Пользователь входит, выбирает **один или несколько** счетов и подтверждает разрешения. Затем браузер возвращается на ваш redirect URI:

- согласие: `https://example.com/oauth/callback?code=...&state=...`
- отказ: `https://example.com/oauth/callback?error=access_denied&state=...`

Прежде чем использовать код, убедитесь, что `state` совпадает с отправленным.

**Одно подключение — один или несколько счетов.** Пользователь отмечает, какие счета получит ваше приложение; подключение охватывает ровно их. Подключить счёт может только его **владелец** или **редактор**. Если пользователь, подключивший приложение, позже теряет право редактировать один из счетов (становится наблюдателем или покидает счёт), вызовы к этому счёту возвращают `403 grant_inactive`, а остальные счета продолжают работать; счёт снова заработает, когда кто-то с правом редактирования подключит приложение заново.

## 3. Обменяйте код на токены

Код действует **10 минут** и срабатывает **один раз** — неудачный обмен тоже его расходует. Передайте тот же `redirect_uri` и `code_verifier`:

```bash
curl -X POST https://api.ai-budget.pl/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=authorization_code \
  -d code="$CODE" \
  -d redirect_uri=https://example.com/oauth/callback \
  -d code_verifier="$CODE_VERIFIER"
```

Публичный клиент не передаёт секрет, только `client_id`:

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

Ответ:

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

`account_ids` перечисляет все счета подключения в порядке подключения. `account_id` есть **только** если в подключении ровно один счёт (для старых интеграций); читайте `account_ids`.

**Access-токен** живёт **1 час**. **Refresh-токен** действует **90 дней**, и каждое обновление выдаёт новый — снова на 90 дней. Храните оба токена надёжно, по возможности на сервере.

## 4. Вызовите API

Передавайте access-токен в заголовке `Authorization`:

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

`GET /public/v1/account` сообщает, к какому счёту относится вызов. Если счетов несколько, укажите нужный заголовком `X-Account-Id` (см. раздел 5). Списки разбиты на страницы непрозрачным курсором: передавайте `next_cursor` обратно в `cursor` с теми же фильтрами, пока `has_more` равно `true`.

## 5. Несколько счетов в одном подключении

Ответ с токенами всегда содержит `account_ids`. Подробности даёт `GET /public/v1/accounts`: нужен только действующий токен, без `X-Account-Id` и без разрешения, и ответ приходит всегда:

```json
{ "data": [{ "id": "...", "name": "Family", "type": "shared", "base_currency": "PLN", "access": "read_write", "active": true, "reason": null }] }
```

- `type` отличает счёт компании (`business`) от личного (`personal`, `shared`, `trip`, `investment`).
- `access` равен `read_write`, если подключение может писать в счёт, иначе `read` (нет разрешения `expenses:write` или счёт с шифрованием текста end-to-end).
- `active: false` означает, что запросы к этому счёту отклоняются; `reason` объясняет причину: `role` (пользователь больше не владелец и не редактор), `encrypted` (счёт теперь полностью зашифрован end-to-end) или `archived` (архивная поездка: по-прежнему активна, только чтение). Если `role` означает, что пользователь вообще больше не участник счёта, поля `name`, `type` и `base_currency` равны `null`.

**Выбор счёта.** Передавайте идентификатор в заголовке `X-Account-Id` во всех остальных вызовах. Если предоставлен ровно **один** счёт, заголовок необязателен. Если **больше одного**, он обязателен, и вызов без него возвращает `400 account_required` — включая `GET /public/v1/account`. Правило считает счета, которые предоставил пользователь, а не рабочие: подключение из двух счетов, один из которых неактивен, всё равно требует заголовок. Идентификатор вне подключения возвращает `403 account_not_granted`; счёт, у владельца или редактора которого пропало право, — `403 grant_inactive`; счёт, ставший зашифрованным, — `403 account_encrypted`. Остальные счета подключения это не затрагивает.

**Всегда передавайте `X-Account-Id`, даже при одном счёте, и считайте `account_ids` в каждом ответе с токенами определяющим.** Повторное согласие может **заменить** набор счетов: подключение с одним счётом может перейти на другой, и запрос без заголовка тогда молча попадёт в новый счёт. После каждого обмена кода и обновления токена перечитывайте `account_ids` и держите свою привязку счетов к данным в соответствии с ним.

**Один вызов — один счёт.** Общего эндпоинта по нескольким счетам нет: чтобы прочитать несколько счетов, вызывайте API отдельно для каждого. Разрешения и лимиты запросов относятся ко всему подключению (одна корзина на все его счета), а вот значения `Idempotency-Key` и курсоры `/expenses/changes` действуют отдельно в каждом счёте: один и тот же ключ или курсор в разных счетах значит разное, поэтому храните их по счетам.

**Смена набора счетов.** Когда пользователь подключает ваше приложение заново, на экране согласия уже отмечены подключённые счета, а то, что он подтвердит, **заменяет** прежний набор. Счёт, с которого он снял отметку, теряет доступ со следующего запроса, а токены продолжают работать для остальных. Обновление токена возвращает `invalid_grant` только если **ни один** счёт подключения больше не пригоден к работе.

## 6. Обновите access-токен

```bash
curl -X POST https://api.ai-budget.pl/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=refresh_token \
  -d refresh_token="$REFRESH_TOKEN"
```

**Refresh-токены ротируются.** Каждое обновление возвращает **новый** refresh-токен, а отправленный перестаёт работать. Всегда сохраняйте новый токен вместо старого — раньше, чем делать что-либо ещё.

Предъявление уже использованного refresh-токена считается кражей: всё подключение отзывается, и пользователю придётся подключить ваше приложение заново. То же самое происходит, когда **два воркера обновляют токен одновременно** одним и тем же refresh-токеном — один выигрывает, второй предъявляет уже израсходованный. Обновляйте токены **только из одного места** (один процесс, блокировка или один запрос в полёте):

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

Чтобы отключить приложение, отправьте любой из токенов на `POST https://api.ai-budget.pl/oauth/revoke` — будет отозвано всё подключение. Пользователь тоже может в любой момент отключить ваше приложение в **Настройки → Подключённые приложения**.

## 7. Инкрементальная синхронизация

Чтобы держать собственную копию расходов, читайте ленту изменений `GET https://api.ai-budget.pl/public/v1/expenses/changes`, а не выгружайте список заново:

- Без `cursor` лента начинается с самого начала: все расходы плюс все удаления, когда-либо записанные в счёте. Клиент, стартующий без курсора, получает каждое прошлое удаление как `delete` — в основном для id, которых он никогда не видел.
- Каждая запись — это либо `{"type": "upsert", "expense": {...}}` — добавьте или замените свою копию, — либо `{"type": "delete", "id": "..."}` — удалите её. Удаление может прийти для `id`, которого вы никогда не получали: удаление неизвестного `id` ничего не меняет.
- И удалённый расход, и расход, ставший запланированным, приходят как `delete`.
- Расход, отредактированный ещё раз, приходит снова — в актуальном виде, в конце ленты.
- Изменение появляется в ленте примерно через **10 секунд** после того, как его внесли.
- После обработки каждой страницы сохраняйте `next_cursor` — он есть и на пустой странице — и продолжайте с него. Когда `has_more` равно `false`, опросите ленту позже.

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

Известные ограничения:

- Расход, перенесённый на другой счёт, не приходит как удалённый в том счёте, откуда его перенесли.
- Переименование тега или проекта не переотправляет расходы с этим тегом или проектом. Если названия для вас важны, время от времени делайте полную пересинхронизацию (синхронизация заново, без курсора).

## 8. Создание, изменение и удаление расходов

Для создания расхода нужен заголовок `Idempotency-Key`: UUID, который вы генерируете для этого расхода.

```bash
curl -X POST https://api.ai-budget.pl/public/v1/expenses \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: b7e3c1a9-4f2d-4e8b-9a6c-0d5f7e1b3a24" \
  -H "Content-Type: application/json" \
  -d '{"amount":"42.50","currency":"PLN","date":"2026-10-31","merchant":"Biedronka","category_id":"8a6e0f52-1c3b-4d7e-a9f8-2b4c6d8e0f13"}'
```

- `201` — создано. Если запрос завершился по таймауту, **повторите его с тем же ключом**: повтор вернёт уже созданный расход со статусом `200`, а тело повтора будет проигнорировано. Повторы отправляйте последовательно, а не параллельно.
- `409 idempotency_key_conflict` — ключ уже занят другой записью (созданной не вашим приложением или расходом, который с тех пор удалён). Сгенерируйте новый UUID.
- Суммы — десятичные строки, не более двух знаков после точки. Число JSON будет отклонено.
- `400 validation_failed` означает, что некорректен сам запрос: неизвестное поле, неверный тип или формат, нет обязательного поля. Проблемы перечислены в `details.fields`.
- `422 validation_failed` означает, что запрос корректен по форме, но ссылается на то, что нельзя использовать: `category_id`, `tag_ids` или `project_id` не из подключённого счёта либо — при изменении — `amount`, `currency` или `date` расхода, который является долей в общем расходе группы (`source: "group"`) и которыми управляет группа.

`PATCH /public/v1/expenses/{id}` меняет только переданные поля; `null` очищает поле там, где это разрешено. `DELETE /public/v1/expenses/{id}` удаляет расход, после чего он приходит в ленте изменений как `delete`. Допустимые значения `category_id` берите из `GET /public/v1/categories`.

## 9. Доходы

Доходы работают как расходы (раздел 8), по адресу `/public/v1/incomes`: `GET` (список), `GET /{id}`, `POST`, `PATCH /{id}`, `DELETE /{id}` и лента изменений `GET /incomes/changes` (те же правила, что в разделе 7). Скоупы: `incomes:read`, `incomes:write`.

- **Коды валидации.** Некорректный запрос — неверный параметр запроса или поле тела, не прошедшее проверку (неизвестное поле, неверный тип, неверное значение enum, `date_from` позже `date_to`, неизвестная валюта) — это `400 validation_failed`. `422 validation_failed` — для ошибок ссылок и состояния: категория неверного типа или чужого счёта, `tag_ids` или `project_id` не из этого счёта, попытка изменить доход, связанный с переводом.
- **Фильтры списка** названы так же, как у списка расходов: `date_from`, `date_to`, `category_id`, `project_id`, `search`, `limit`, `cursor`. Фильтра по продавцу и по сумме нет. `GET /public/v1/categories?type=income` возвращает категории, которые принимает запись дохода. Неизвестные параметры запроса отклоняются с `400 validation_failed`, как на любом маршруте списка, включая `/categories`.
- **Идемпотентность.** `POST /incomes` требует `Idempotency-Key` по тем же правилам, что и расходы: ключ действует в пределах приложения и счёта; повтор возвращает `200` с существующей записью; `409 idempotency_key_conflict` означает, что ключ принадлежит записи другого происхождения, идентификатору другой записи или удалённой записи.
- **Поля только для чтения.** `is_debt`, `is_debt_repayment`, `is_split_receivable` и `is_transfer` возвращаются, но не записываются.
- **Погашения долга.** Сумму и дату погашения долга можно изменить, а само погашение удалить — любое из этого меняет остаток долга, поэтому делайте это осознанно.
- **Переводы.** Доход, являющийся одной из сторон перевода между счетами (`is_transfer: true`), нельзя ни изменить, ни удалить; обе операции возвращают `422 validation_failed`.

```bash
curl -X POST https://api.ai-budget.pl/public/v1/incomes \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: 0c9d4e1a-7b2f-4a63-8e15-3f6a9b2c4d70" \
  -H "Content-Type: application/json" \
  -d '{"amount":"4200.00","currency":"PLN","date":"2026-10-31","description":"Salary"}'
```

## 10. Бюджеты

Бюджеты находятся по адресу `/public/v1/budgets`: `GET` (список), `GET /{id}`, `POST`, `PATCH /{id}`, `DELETE /{id}`. Скоупы: `budgets:read`, `budgets:write`.

- `POST /budgets` требует `Idempotency-Key` по тем же правилам, что доходы и расходы.
- У бюджета нет собственной категории: ограничение по категориям задаётся только через `allocations` — список `{category_id, amount}`.
- В `PATCH` поле `allocations` **заменяет весь набор**: `[]` очищает его, отсутствие поля оставляет без изменений. Повторяющийся `category_id` — `422 validation_failed`.
- `is_active` — только для чтения.
- `progress` описывает **текущий период**, в валюте самого бюджета, и использует начало финансового месяца счёта.
- Ленты изменений для бюджетов нет: опрашивайте список.

## 11. Аналитика

Три отчёта только для чтения под `/public/v1/analytics`, скоуп `analytics:read`: `GET /summary` (доходы, расходы, итог, `transaction_count`), `GET /by-category` (`type=expense|income`) и `GET /monthly`. Все принимают `from` и `to` (`YYYY-MM-DD`, обе границы включительно) и необязательный `currency`.

Как это считается:

- **Валюта.** По умолчанию — валюта отображения пользователя, подключившего приложение. Каждый ответ содержит `currency`.
- **Конвертация.** Каждая строка конвертируется по курсам нашего сервера. Строка с неизвестным курсом исключается из всех показателей, а в ответе стоит `fx_approximate: true` — она никогда не прибавляется без конвертации.
- **Что считается.** Запланированные расходы и строки с суммами, которые друзья должны вернуть пользователю после разделения счёта, исключаются. Долги и переводы учитываются, как на вкладке «Аналитика» в приложении. `transaction_count` считает вместе расходы и доходы.
- **Категории.** Чек, разнесённый по категориям, распределяется по разбивке, поэтому сумма по категории может отличаться от конвертации всей строки на копейку.
- **Диапазоны.** `from` и `to` включительно. Не более 366 дней для `summary` и `by-category`, не более 24 месяцев для `monthly`; месяцы календарные. Более длинный диапазон, `from` позже `to` или неизвестная валюта — `400 validation_failed`.
- **Кэш.** Результаты кэшируются на 60 секунд.
- **Почему суммы могут немного отличаться от приложения.** Приложение конвертирует по своим сохранённым курсам и прибавляет сумму без известного курса без конвертации; API её исключает и помечает.

```bash
curl "https://api.ai-budget.pl/public/v1/analytics/summary?from=2026-10-01&to=2026-10-31&currency=PLN" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## 12. Ошибки

У любой ошибки `/public/v1` одинаковое тело:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The request is invalid.",
    "details": { "fields": { "amount": ["amount must be a decimal string with at most 2 decimal places"] } }
  }
}
```

Логику стройте на `code`; `message` предназначено для людей и может меняться. Новые коды могут добавляться.

| Код | HTTP | Что означает и что делать |
| --- | --- | --- |
| `invalid_token` | 401 | Access-токен отсутствует, неверен, истёк или отозван. Обновите его один раз и повторите запрос; если обновление вернуло `invalid_grant`, попросите пользователя заново подключить приложение. |
| `grant_inactive` | 403 | Пользователь, подключивший приложение, больше не может редактировать этот счёт. Подключить приложение заново должен кто-то с правом редактирования. |
| `account_encrypted` | 403 | Счёт со сквозным шифрованием: запись, фильтры `merchant`/`search` и чеки недоступны (см. ниже). |
| `insufficient_scope` | 403 | У подключения нет разрешения, нужного для запроса; оно указано в `details.required`. Попросите пользователя подключить приложение заново с этим разрешением. |
| `viewer_read_only` | 403 | Подключённый пользователь может только просматривать этот счёт. |
| `trip_archived` | 403 | Счёт — архивная поездка, менять его больше нельзя. |
| `forbidden` | 403 | Любой другой отказ. |
| `validation_failed` | 400 / 422 | 400: запрос некорректен. 422: он ссылается на записи не из этого счёта или на поля, которыми управляет общая группа. См. `details.fields`. |
| `invalid_cursor` | 400 | Передавайте `next_cursor` ровно в том виде, в каком получили. |
| `account_required` | 400 | Подключение охватывает несколько счетов: передайте заголовок `X-Account-Id` с одним из идентификаторов из `GET /public/v1/accounts`. |
| `account_not_granted` | 403 | Счёт из `X-Account-Id` не входит в это подключение. |
| `bad_request` | 400 | Любой другой некорректный запрос. |
| `not_found` | 404 | В подключённом счёте нет такой записи, или она удалена. |
| `method_not_allowed` | 405 | Этот HTTP-метод не поддерживается по данному пути. |
| `conflict` | 409 | Запрос конфликтует с текущим состоянием. |
| `idempotency_key_conflict` | 409 | `Idempotency-Key` уже занят другой записью. Используйте новый UUID. |
| `payload_too_large` | 413 | Слишком большое тело запроса. |
| `rate_limited` | 429 | Слишком много запросов. Подождите `Retry-After` секунд. |
| `internal_error` | 500 | Ошибка на нашей стороне. Повторите позже. |
| `unavailable` | 503 | Временный сбой. Повторите, увеличивая паузу. |

`/oauth/token` и `/oauth/revoke` отвечают в формате OAuth `{"error": "...", "error_description": "..."}` с кодами: `invalid_request`, `invalid_client`, `invalid_grant`, `unsupported_grant_type`, `invalid_scope`, `slow_down`, `temporarily_unavailable`. `invalid_grant` при обновлении означает, что подключения больше нет (пользователь его отозвал, был повторно предъявлен refresh-токен или ни один счёт подключения больше не пригоден, потому что пользователь потерял право редактирования на всех), — попросите пользователя подключить приложение заново.

## 13. Лимиты запросов

- **120 запросов в минуту на подключение** (один пользователь в вашем приложении, все счета подключения вместе).
- **1200 запросов в минуту на приложение** — суммарно по всем его подключениям.
- `/oauth/token`: 30 запросов в минуту на приложение. Публичный клиент учитывается только по запросам с действительным кодом авторизации или refresh-токеном этого клиента.

Каждый ответ `/public/v1` на аутентифицированный и авторизованный запрос содержит `X-RateLimit-Limit` и `X-RateLimit-Remaining` (для того лимита, который ближе к исчерпанию); в ответах `401` и `403` их нет. Фактические лимиты вашего приложения — те, что в этих заголовках. При превышении лимита приходит `429 rate_limited` с заголовком `Retry-After` в секундах — выждите столько перед следующим запросом.

Перед API стоит ещё и прокси, который гасит лавины запросов. Его `429` — не в формате JSON выше, а браузерному приложению со стороннего домена он приходит без заголовков CORS, и браузер сообщает о нём как о сетевой ошибке. Такой нечитаемый сбой считайте `429`: подождите и повторите.

## 14. Счета со сквозным шифрованием

Пользователи могут включить в приложении сквозное шифрование своих данных — тогда их не могут прочитать даже наши серверы:

- Счёт с **полным** шифрованием подключить нельзя вовсе.
- Счёт с шифрованием **текста** можно подключить **только для чтения**. `GET /public/v1/account` показывает `"encryption": "text"` и `"read_only": true`. Запись возвращает `403 account_encrypted`.
- На таком счёте семь полей приходят как `null` и перечислены в `encrypted_fields` каждого расхода: `description`, `notes`, `merchant`, `location.name`, `items.description`, `tags.name`, `project.name`.
- Названия категорий в `/categories` тоже равны `null`, а у каждой категории `"encrypted_fields": ["name"]`.
- Фильтры `merchant` и `search` возвращают `403 account_encrypted`, файлы чеков недоступны.

## 15. Попробуйте прямо на этой странице

Кнопка **Authorize** выше запускает настоящий поток OAuth с PKCE на реальных данных пользователя. Чтобы ею воспользоваться, добавьте `https://api.ai-budget.pl/public/docs/oauth2-redirect.html` в redirect URI своего приложения, а затем введите свой `client_id` (и секрет — для конфиденциального клиента).
