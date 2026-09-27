# Справочник API

Последнее обновление: 2026-09-27

Базовый URL: `/api/v1`

Несколько маршрутов обслуживаются **без** префикса `/api/v1`, потому что их URL зарегистрирован у третьей стороны или передаётся людям вне приложения. Авторитетный список — `GLOBAL_PREFIX_EXCLUDED_ROUTES` в `apps/api/src/global-prefix-exclusions.ts`: вебхуки Stripe, Telegram, WhatsApp и Slack (`/webhooks/stripe`, `/telegram/webhook`, `/whatsapp/webhook`, `/slack/events`, `/slack/interactivity`), установка Slack (`/slack/install`, `/slack/oauth/callback`) и два поддерева гостевых страниц, покрытых шаблонами — `/s/...` (гостевые ссылки разделения чека) и `/sl/...` (гостевые ссылки списка покупок).

Обозначения гардов ниже: **JWT** = `JwtAuthGuard`; **контекст аккаунта** = `AccountContextGuard` (нужен `X-Account-Id`); **закрыто для viewer** = `ViewerBlockGuard` (403 для роли `viewer`); **Pro** = `SubscriptionTierGuard` + `@RequireTier('pro')` (403 с `code: "TIER_REQUIRED"`); **с учётом AI** = `AiUsageGuard` + `@TrackAiUsage(feature, cost)` (списывается из месячной квоты AI-запросов).

Все эндпоинты, кроме аутентификации, требуют валидный JWT токен в заголовке Authorization:
```
Authorization: Bearer <access_token>
```

## Контекст аккаунта

Большинство эндпоинтов (расходы, бюджеты, категории, кошелёк, аналитика, инсайты, синхронизация) требуют контекст аккаунта. Передайте идентификатор аккаунта в заголовке:
```
X-Account-Id: <account-uuid>
```

Middleware `AccountContextGuard` проверяет, что аутентифицированный пользователь является участником указанного аккаунта, и устанавливает `accountId` и `accountRole` в объекте запроса.

**Роли аккаунта:**
| Роль | Разрешения |
|------|------------|
| `owner` | Полный доступ, управление участниками и приглашениями |
| `editor` | Создание, чтение, обновление расходов/бюджетов/категорий |
| `viewer` | Доступ только для чтения |

---

## Аутентификация

### Регистрация пользователя

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "Иван Иванов"
}
```

Необязательные поля: `currencyCode`, `timezone`, `language`, `referralCode` (`^[A-Z0-9]{4,10}$`) и `acquisition` (`{ src?, loc?, lang?, plan?, referrerRaw? }` — атрибуция первого касания, которую собирают веб и лендинг, см. `docs/wiki/features/acquisition-tracking.md`). Вместе с пользователем создаётся личный аккаунт по умолчанию.

**Ответ** `201 Created`
```json
{
  "accessToken": "",
  "refreshToken": "",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Иван Иванов",
    "currencyCode": "RUB",
    "defaultAccountId": "uuid",
    "isVerified": false,
    "themeMode": "system",
    "accentColor": null,
    "paymentMethod": null,
    "paymentHandle": null
  },
  "accounts": []
}
```

Новый пользователь не подтверждён: оба токена — пустые строки, а `accounts` пуст, пока 6-значный код из письма при регистрации не подтверждён через **Подтверждение e-mail** ниже — оно и возвращает настоящие токены.

### Вход в систему

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Ответ** `200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Иван Иванов",
    "currencyCode": "RUB",
    "defaultAccountId": "uuid",
    "isVerified": true,
    "themeMode": "system",
    "accentColor": null,
    "paymentMethod": null,
    "paymentHandle": null
  },
  "accounts": [ { "id": "uuid", "name": "Personal", "type": "personal", "myRole": "owner" } ]
}
```

Неподтверждённый пользователь получает `200` с пустыми токенами и `isVerified: false` (приложение переводит его на экран подтверждения). Деактивированный аккаунт, неверный пароль и аккаунт только через Google (без пароля — «Use Google sign-in for this account») — `401`. Access-токен живёт `JWT_EXPIRES_IN` (по умолчанию `7d`), refresh-токен — 30 дней.

### Обновление токена

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Ответ** `200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Скользящая сессия**: каждое обновление возвращает **новый** refresh-токен вместе с новым access-токеном, и клиенты его сохраняют, поэтому пользователь, активный хотя бы раз за время жизни refresh-токена (30 дней), никогда не вынужден входить заново. Токены — stateless JWT без списка отзыва: предыдущий refresh-токен остаётся действительным до своего срока. Заодно обновляется отметка последней активности пользователя. `401` — для недействительного токена или неактивного пользователя.

### Восстановление пароля

Запрос кода для сброса пароля. Всегда возвращает 200, независимо от того, существует ли email (предотвращение перебора email-адресов).

```http
POST /auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Ответ** `200 OK`
```json
{
  "message": "If this email is registered, a reset code has been sent"
}
```

**Ограничение частоты:** 3 запроса на email за 15 минут. Возвращает `429 Too Many Requests` при превышении.

### Сброс пароля

Проверка 6-значного кода и установка нового пароля.

```http
POST /auth/reset-password
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "NewSecurePass1"
}
```

**Ответ** `200 OK`
```json
{
  "message": "Password reset successfully"
}
```

**Ошибки:**
- `400 Bad Request` — Неверный или просроченный код
- `429 Too Many Requests` — Максимум 5 попыток проверки на email за 15 минут

**Требования к паролю:** Минимум 8 символов, хотя бы одна заглавная буква, одна строчная буква и одна цифра.

### Подтверждение e-mail

```http
POST /auth/verify-email
Content-Type: application/json

{ "email": "user@example.com", "code": "123456" }
```

Подтверждает 6-значный код, отправленный при регистрации, и возвращает полноценную сессию, чтобы пользователь продолжил без повторного входа.

**Ответ** `200 OK` — `{ "message": "Email verified successfully", "accessToken": "...", "refreshToken": "...", "user": { ... }, "accounts": [ ... ] }` (тот же блок `user`, что и при входе). `400` — для неверного или просроченного кода.

### Повторная отправка кода подтверждения

```http
POST /auth/resend-verification
Content-Type: application/json

{ "email": "user@example.com" }
```

**Ответ** `200 OK` — всегда `{ "message": "If this email is unverified, a new code has been sent" }` (без перебора e-mail).

### Вход через Google

```http
POST /auth/google
Content-Type: application/json

{
  "idToken": "<Google ID token>",
  "language": "pl",
  "currencyCode": "PLN",
  "referralCode": "ABCD12",
  "acquisition": { "src": "landing", "lang": "pl" }
}
```

Публичный. Клиент получает Google **ID token** (мобильное приложение и веб — через `expo-auth-session`), сервер его проверяет (`GoogleTokenVerifier`, audiences из `GOOGLE_OAUTH_CLIENT_IDS`, обязателен `email_verified`). Порядок: по `googleId` → автопривязка по подтверждённому e-mail (деактивированный аккаунт отклоняется, а не привязывается) → иначе новый подтверждённый пользователь без пароля и аккаунт по умолчанию. Обязателен только `idToken`. Подробности: `docs/wiki/auth.md`.

**Ответ** `200 OK` — та же форма, что и при входе.

### Смена e-mail

Оба шага защищены JWT.

```http
POST /auth/change-email/request
Authorization: Bearer <token>
Content-Type: application/json

{ "newEmail": "new@example.com", "currentPassword": "securePassword123" }
```

Отправляет 6-значный код на новый адрес. **Ответ** `200 OK` — `{ "message": "Verification code sent to new email address" }`. Для аккаунта только через Google (без пароля) отклоняется.

```http
POST /auth/change-email/confirm
Authorization: Bearer <token>
Content-Type: application/json

{ "code": "123456" }
```

**Ответ** `200 OK` — `{ "message": "Email changed successfully", "accessToken": "...", "refreshToken": "..." }` (токены выпускаются заново, потому что e-mail входит в payload JWT).

### Учётные данные восстановления (восстановление сессии на Android)

WebAuthn-учётные данные, благодаря которым сессия переживает перенос на новое Android-устройство (требование Google Play). Регистрация защищена JWT; церемония входа публичная, потому что у восстановленного устройства ещё нет токена. `503`, если relying party не настроен. Подробности: `docs/wiki/features/restore-credentials.md`.

```http
GET /auth/restore/register/options
Authorization: Bearer <token>
```
Возвращает WebAuthn `PublicKeyCredentialCreationOptionsJSON` (из `@simplewebauthn/server`).

```http
POST /auth/restore/register
Authorization: Bearer <token>
Content-Type: application/json

{ "response": { /* RegistrationResponseJSON */ } }
```
**Ответ** `200 OK` — `{ "ok": true }`. `401`, если регистрация не начата или проверка не прошла.

```http
DELETE /auth/restore
Authorization: Bearer <token>
```
Удаляет учётные данные восстановления пользователя (очистка при выходе; работает даже при ненастроенном relying party).

```http
GET /auth/restore/options
```
Публичный, ограничение 20 запросов/мин с IP. Возвращает `PublicKeyCredentialRequestOptionsJSON`.

```http
POST /auth/restore
Content-Type: application/json

{ "response": { /* AuthenticationResponseJSON */ } }
```
Публичный, ограничение 10 запросов/мин с IP. **Ответ** `200 OK` — та же форма, что и при входе. `401` — для неизвестного/просроченного challenge, неизвестных учётных данных, непрошедшей проверки подписи или деактивированного/неподтверждённого пользователя.

---

## Пользователи

### Получить текущего пользователя

```http
GET /users/me
Authorization: Bearer <token>
```

**Ответ** `200 OK`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "Иван Иванов",
  "currencyCode": "RUB",
  "timezone": "UTC",
  "aiResponseMode": "balanced",
  "aiModel": "balanced",
  "paymentMethods": [
    { "method": "revolut", "handle": "johndoe" },
    { "method": "blik", "handle": "+48123456789" }
  ],
  "isAdmin": false,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

`paymentMethods` — упорядоченный (по `sortOrder`) список способов оплаты, которые гостевая ссылка [разделения чека](#разделение-чека) предлагает другу; пустой массив, если пользователь ничего не настроил. О том, как этот список записывается, см. **Заменить способы оплаты** ниже.

### Обновить профиль

```http
PATCH /users/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Иван Петров",
  "currencyCode": "EUR",
  "timezone": "Europe/Moscow",
  "language": "ru",
  "themeMode": "dark",
  "accentColor": "#FF8A00",
  "contributeCommunityPrices": true,
  "inflationCountry": "PL"
}
```

Все поля необязательны: `name`, `currencyCode`, `timezone`, `language`, `contributeCommunityPrices`, `themeMode`, `accentColor` (`null` сбрасывает), `paymentMethod`/`paymentHandle` (устаревшая одиночная пара — лучше **Заменить способы оплаты**), `inflationCountry` (страна для [реальной зарплаты](#реальная-зарплата), `null` — определить по часовому поясу). Переключателей уведомлений здесь **нет** — они в `PATCH /users/me/notification-preferences` (см. [Оповещения об аномалиях](#оповещения-об-аномалиях)).

**Ответ** `200 OK`

### Обновить стиль ответов ИИ

```http
PATCH /users/me/ai-response-mode
Authorization: Bearer <token>
Content-Type: application/json

{
  "mode": "balanced"
}
```

**Значения mode**: `simple`, `balanced`, `expert`

**Ответ** `200 OK`
```json
{ "success": true, "mode": "balanced" }
```

### Обновить модель ИИ

```http
PATCH /users/me/ai-model
Authorization: Bearer <token>
Content-Type: application/json

{
  "model": "fast"
}
```

**Значения model**: `fast`, `balanced`, `quality`

| Значение | Модель OpenAI | Max токенов | Множитель стоимости |
|----------|--------------|------------|---------------------|
| `fast` | `gpt-4o-mini` | 1500 | ×0.75 |
| `balanced` | `gpt-4o` | 2000 | ×1.0 |
| `quality` | `gpt-4.1` | 3000 | ×1.5 |

**Ответ** `200 OK`
```json
{ "success": true, "model": "fast" }
```

### Заменить способы оплаты

```http
PUT /users/me/payment-methods
Authorization: Bearer <token>
Content-Type: application/json

{
  "paymentMethods": [
    { "method": "revolut", "handle": "johndoe" },
    { "method": "blik", "handle": "+48123456789" }
  ]
}
```

Заменяет весь список способов оплаты вызывающего пользователя одним атомарным вызовом — не более 5 записей, по одной на каждый `method` (`blik`, `revolut`, `paypal`, `cash`, `other`; повтор одного и того же метода в массиве отклоняется с `400`), каждый `handle` проверяется тем же форматом, что и настройки оплаты в кошельке группового путешествия. Пустой массив допустим и очищает список. Также в той же транзакции очищает устаревшую пару `paymentMethod`/`paymentHandle` на пользователе — так что значение, заданное до появления этого эндпоинта, уже не может всплыть снова после того, как список был сохранён (даже сохранён пустым).

Именно это в первую очередь резолвит гостевая ссылка [разделения чека](#разделение-чека) в момент, когда гость открывает её, решая, какие кнопки оплаты показать — так что изменение здесь чинит и уже отправленные ссылки.

**Ответ** `200 OK`
```json
{
  "paymentMethods": [
    { "method": "revolut", "handle": "johndoe" },
    { "method": "blik", "handle": "+48123456789" }
  ]
}
```

### Обновить push-токен

```http
PATCH /users/me/push-token
Authorization: Bearer <token>
Content-Type: application/json

{ "pushToken": "ExponentPushToken[...]" }
```

`null` очищает токен. **Ответ** `200 OK` — `{ "success": true }`.

### Записать источник привлечения

```http
PATCH /users/me/acquisition
Authorization: Bearer <token>
Content-Type: application/json

{ "src": "referral", "loc": "hero", "lang": "pl", "plan": "pro", "referrerRaw": "https://..." }
```

Атрибуция первого касания для пользователя, пришедшего до регистрации (все поля необязательны). **Ответ** `204 No Content`. См. `docs/wiki/features/acquisition-tracking.md`.

### Поиск пользователей

```http
GET /users/search?q=anna
Authorization: Bearer <token>
```

Ищет активных пользователей (кроме самого вызывающего) по подстроке имени или e-mail без учёта регистра — чтобы пригласить их в аккаунт. Запрос короче 2 символов возвращает `[]`. Ограничение 20 запросов/мин.

**Ответ** `200 OK` — до 20 строк `{ "id", "name", "email" }`. См. `docs/wiki/features/invite-by-search.md`.

### Настройки голосового дайджеста

Еженедельный голосовой дайджест — короткая озвученная сводка недели, отправляемая в привязанный бот (Telegram, WhatsApp или Slack). На уровне пользователя: `X-Account-Id` **не** нужен. Подробности: `docs/wiki/features/voice-digest.md`.

```http
GET /users/me/voice-digest
Authorization: Bearer <token>
```

**Ответ** `200 OK` — `VoiceDigestSettings` (`packages/shared-types/src/dto/voice-digest.ts`):
```json
{
  "enabled": true,
  "day": 0,
  "hour": 19,
  "channel": "telegram",
  "availableChannels": ["telegram", "slack"],
  "whatsappAvailable": false
}
```

`day` — 0 = воскресенье … 6 = суббота, `hour` — 0–23, оба в часовом поясе пользователя. `availableChannels` перечисляет только привязанные боты; `channel` равен `null`, если сохранённый канал больше не привязан. `whatsappAvailable` равен `false`, пока WhatsApp не привязан **и** не задан `WHATSAPP_DIGEST_TEMPLATE`.

```http
PATCH /users/me/voice-digest
Authorization: Bearer <token>
Content-Type: application/json

{ "enabled": true, "day": 5, "hour": 18, "channel": "slack" }
```

Все поля необязательны. `400` — если `channel` не привязан, если выбран WhatsApp до настройки шаблона или если включение невозможно из-за отсутствия канала доставки (без `channel` выбирается первый привязанный канал, способный доставить дайджест). **Ответ** `200 OK` — обновлённые настройки.

### Удалить аккаунт пользователя

```http
DELETE /users/me
Authorization: Bearer <token>
```

Деактивирует пользователя. **Ответ** `200 OK` — `{ "success": true }`.

---

## Аккаунты

### Создать аккаунт

```http
POST /accounts
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Семейный бюджет",
  "type": "shared",
  "currencyCode": "RUB",
  "icon": "family"
}
```

**Значения type**: `personal`, `business`, `shared`

**Ответ** `201 Created`
```json
{
  "id": "uuid",
  "name": "Семейный бюджет",
  "type": "shared",
  "currencyCode": "RUB",
  "ownerId": "user-uuid",
  "icon": "family",
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### Список аккаунтов

```http
GET /accounts
Authorization: Bearer <token>
```

**Ответ** `200 OK`
```json
[
  {
    "id": "uuid",
    "name": "Личный",
    "type": "personal",
    "currencyCode": "RUB",
    "ownerId": "user-uuid",
    "role": "owner",
    "memberCount": 1
  }
]
```

### Получить аккаунт

```http
GET /accounts/:id
Authorization: Bearer <token>
```

### Обновить аккаунт

```http
PATCH /accounts/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Новое название",
  "icon": "wallet",
  "monthAnchorDay": 10
}
```

**Только для владельца.** `monthAnchorDay` (1..31, либо явный `null` для сброса) сдвигает «финансовый месяц» аккаунта для периодов бюджета — например, `10` заставляет месячный период бюджета идти с 10-го по 9-е число вместо с 1-го по последний день месяца. `null`/отсутствие поля означает календарный месяц. Изменение задним числом пересчитывает и прошлые периоды в истории бюджета, не меняя сами расходы/доходы. Дни больше, чем есть в конкретном месяце (например, 31 в феврале), округляются до последнего дня этого месяца. В рамках первой волны это затрагивает только бюджеты (`GET /budgets/:id/progress`, `GET /budgets/:id/history`) — аналитика, отчёты и другие представления по месяцам всё ещё используют календарный месяц.

### Удалить аккаунт

```http
DELETE /accounts/:id
Authorization: Bearer <token>
```

**Ответ** `204 No Content`

### Создать приглашение

```http
POST /accounts/:id/invitations
Authorization: Bearer <token>
Content-Type: application/json

{
  "invitedEmail": "friend@example.com",
  "role": "editor"
}
```

**Ответ** `201 Created`
```json
{
  "id": "uuid",
  "inviteCode": "ABC123XYZ",
  "role": "editor",
  "status": "pending",
  "expiresAt": "2024-01-22T10:30:00Z"
}
```

### Список приглашений

```http
GET /accounts/:id/invitations
Authorization: Bearer <token>
```

### Отменить приглашение

```http
DELETE /accounts/:id/invitations/:invitationId
Authorization: Bearer <token>
```

### Принять приглашение

```http
POST /accounts/invitations/accept
Authorization: Bearer <token>
Content-Type: application/json

{
  "inviteCode": "ABC123XYZ"
}
```

### Отклонить приглашение

```http
POST /accounts/invitations/decline
Authorization: Bearer <token>
Content-Type: application/json

{
  "inviteCode": "ABC123XYZ"
}
```

### Список участников

```http
GET /accounts/:id/members
Authorization: Bearer <token>
```

**Ответ** `200 OK`
```json
[
  {
    "id": "member-uuid",
    "userId": "user-uuid",
    "role": "owner",
    "joinedAt": "2024-01-01T00:00:00Z",
    "user": {
      "id": "user-uuid",
      "name": "Иван Иванов",
      "email": "ivan@example.com"
    }
  }
]
```

### Обновить роль участника

```http
PATCH /accounts/:id/members/:memberId
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "viewer"
}
```

### Удалить участника

```http
DELETE /accounts/:id/members/:memberId
Authorization: Bearer <token>
```

### Покинуть аккаунт

```http
POST /accounts/:id/leave
Authorization: Bearer <token>
```

### Мои ожидающие приглашения

```http
GET /accounts/invitations/mine
Authorization: Bearer <token>
```

Ожидающие непросроченные приглашения на e-mail пользователя (при отсутствии строки пользователя возвращает `[]` — никогда не все ожидающие приглашения).

### Ответить на приглашение

```http
PATCH /accounts/invitations/:id/respond
Authorization: Bearer <token>
Content-Type: application/json

{ "action": "accept" }
```

`action` — `accept` или `decline`. Приглашение должно быть адресовано вызывающему (проверяется первым делом) и не должно быть просрочено.

### Обновить мои платёжные данные (кошелёк поездки)

```http
PATCH /accounts/:id/members/me/payment-info
Authorization: Bearer <token>
Content-Type: application/json

{ "paymentMethod": "blik", "paymentHandle": "+48 600 100 200" }
```

Собственные платёжные данные участника в этом аккаунте, используемые при расчёте поездки. `paymentMethod`: `blik`, `revolut`, `paypal`, `cash`, `other`; `paymentHandle` должен соответствовать `^[A-Za-z0-9+ ._-]{1,50}$`.

### Архивировать поездку

```http
PATCH /accounts/:id/archive-trip
Authorization: Bearer <token>
Content-Type: application/json

{ "force": false }
```

Только владелец (иначе `403`). Архивирует аккаунт типа `trip`, делая его доступным только для чтения. `400`, пока есть неподтверждённые транзакции расчёта, если не передан `force: true`. См. `docs/wiki/features/trip-wallet.md`.

### Расчёт поездки (settle-up)

JWT + контекст аккаунта. Id аккаунта всегда берётся из проверенного гардом `X-Account-Id`, никогда из сегмента пути `:id`.

```http
GET /accounts/:id/settle-up
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK` — `SettleUpResponse` (`packages/shared-types/src/dto/expense.ts`):
```json
{
  "balances": [ { "userId": "uuid", "userName": "Anna", "netAmount": -42.50 } ],
  "suggestedTransfers": [ { "fromUserId": "uuid-a", "toUserId": "uuid-b", "amount": 42.50 } ],
  "currencyCode": "EUR",
  "fxApproximate": false,
  "pendingTransactions": []
}
```

`netAmount` — в валюте аккаунта: положительное — участнику должны, отрицательное — должен он.

```http
POST /accounts/:id/settle-up/pay
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "fromUserId": "uuid-a", "toUserId": "uuid-b", "amount": 42.50 }
```

После архивации поездки блокируется `TripArchivedGuard` (в статусе `settling` разрешено). **Ответ** — `{ "transactionId", "paymentLink", "manualInstructions", "paymentHandle" }` (`paymentLink` — deep-ссылка Revolut/PayPal, если у получателя она есть).

```http
PATCH /accounts/:id/settle-up/:txnId/confirm
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Подтвердить может только получатель. Намеренно без гарда архивации, чтобы платёж «в полёте» в принудительно заархивированной поездке всё ещё можно было подтвердить.

---

## Расходы

Все эндпоинты расходов требуют заголовок `X-Account-Id`.

### Список расходов

```http
GET /expenses
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `startDate` | ISO 8601 | Фильтр от даты |
| `endDate` | ISO 8601 | Фильтр до даты |
| `categoryId` | UUID | Фильтр по категории |
| `limit` | number | Макс. результатов (по умолч.: 50) |
| `offset` | number | Смещение для пагинации |

**Ответ** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "clientId": "client-uuid",
      "categoryId": "uuid",
      "amount": 1500.00,
      "discountAmount": null,
      "currencyCode": "RUB",
      "description": "Обед в ресторане",
      "date": "2024-01-15",
      "time": "12:30",
      "locationLat": 55.7558,
      "locationLng": 37.6173,
      "locationName": "Перекрёсток, ул. Тверская 1",
      "notes": "Деловой обед",
      "receiptUrl": null,
      "isRecurring": false,
      "source": "manual",
      "syncVersion": 1,
      "createdAt": "2024-01-15T12:35:00Z",
      "category": {
        "id": "uuid",
        "name": "Еда и рестораны",
        "icon": "utensils",
        "color": "#FF6B6B"
      }
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

### Создать расход

```http
POST /expenses
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "clientId": "client-generated-uuid",
  "categoryId": "uuid",
  "amount": 1500.00,
  "discountAmount": 250.00,
  "currencyCode": "RUB",
  "description": "Обед в ресторане",
  "date": "2024-01-15",
  "time": "12:30",
  "location": { "lat": 55.7558, "lng": 37.6173, "name": "Перекрёсток, ул. Тверская 1" },
  "notes": "Деловой обед",
  "isRecurring": false,
  "source": "manual",
  "tagIds": ["tag-uuid-1", "tag-uuid-2"]
}
```

**Примечание:** `tagIds` — опциональное поле. Теги автоматически привязываются к расходу.

**Отпечаток чека:** `receiptFingerprint` (необязательно, 64 символа SHA-256 в нижнем регистре, возвращается [сканированием чека](#сканирование-чека)) сохраняется, чтобы повторную загрузку того же файла можно было отметить ещё до OCR — см. [Проверка дубликата чека](#проверка-дубликата-чека).

**Локация:** `location` — опциональный объект `{ lat, lng, name? }` (хранится в отдельных колонках `locationLat`/`locationLng`/`locationName`, которые возвращают эндпоинты чтения). В `PATCH /expenses/:id` отправьте `"location": null`, чтобы очистить локацию. Она проставляется автоматически по адресу магазина с отсканированного чека (см. [Сканирование чека](#сканирование-чека)) или, если пользователь включил опцию, по GPS устройства в момент создания.

**Ответ** `201 Created`

### Получить расход

```http
GET /expenses/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Обновить расход

```http
PATCH /expenses/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "amount": 1800.00,
  "description": "Обед в итальянском ресторане"
}
```

### Удалить расход

```http
DELETE /expenses/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

### Массовое обновление расходов

Массовое обновление или мягкое удаление нескольких расходов одним запросом. Обеспечивает работу мобильного режима множественного выбора (массовое удаление / смена категории / добавление тегов).

```http
PATCH /expenses/bulk
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "ids": ["uuid-1", "uuid-2"],
  "categoryId": "uuid",
  "tagIds": ["tag-uuid-1"],
  "isDeleted": false
}
```

**Гарды:** `JwtAuthGuard` + `AccountContextGuard` + `ViewerBlockGuard` (операция записи — наблюдателям запрещена).

**Тело** (`BulkUpdateExpensesDto`)
| Поле | Тип | Описание |
|------|-----|----------|
| `ids` | string[] | Обязательное. От 1 до 500 идентификаторов расходов. |
| `categoryId` | string \| null | Опциональное. Назначить категорию; `null` очищает её. |
| `tagIds` | string[] | Опциональное. Теги, добавляемые к каждому расходу. |
| `isDeleted` | boolean | Опциональное. При `true` мягко удаляет расходы (имеет приоритет над `categoryId`/`tagIds`). |

**Поведение:** Проверяет, что идентификаторы принадлежат счёту. При `isDeleted: true` найденные расходы мягко удаляются; иначе применяются переданные `categoryId` и/или `tagIds` (теги добавляются, а не заменяют существующие).

**Примечание:** `ids` и `tagIds` могут быть **серверными PK или локальными `clientId` мобильного клиента** (offline-first). Сервис разрешает оба варианта через `OR: [{ id }, { clientId }]`, поэтому синхронизированные и несинхронизированные строки сопоставляются одинаково.

**Ответ** `200 OK`
```json
{ "updated": 2 }
```

### Позиции расхода

#### Список позиций

```http
GET /expenses/:id/items
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
[
  {
    "id": "uuid",
    "description": "Яблоки органические",
    "quantity": 2.0,
    "unitPrice": 199.00,
    "totalPrice": 398.00,
    "sortOrder": 0
  }
]
```

#### Создать позицию

```http
POST /expenses/:id/items
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "description": "Миндальное молоко",
  "quantity": 1,
  "unitPrice": 249.00,
  "totalPrice": 249.00,
  "lineDiscount": 25.00,
  "sortOrder": 1
}
```

`lineDiscount` (необязательно, ≥ 0, принимается и при обновлении) — скидка, напечатанная на этой строке; разделение чека пропорционально учитывает её в долях.

#### Обновить позицию

```http
PATCH /expenses/:id/items/:itemId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "quantity": 2,
  "totalPrice": 498.00
}
```

#### Удалить позицию

```http
DELETE /expenses/:id/items/:itemId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Изображение чека

#### Получить изображение чека

```http
GET /expenses/:id/receipt-image
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ:**
```json
{
  "imageBase64": "/9j/4AAQ...",
  "mimeType": "image/jpeg"
}
```

`mimeType` — `image/jpeg` для фото или `application/pdf` для PDF-чеков (например, из Telegram).

#### Сохранить изображение чека

```http
PUT /expenses/:id/receipt-image
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

#### Удалить изображение чека

```http
DELETE /expenses/:id/receipt-image
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Остановить повторение

```http
PATCH /expenses/:id/stop-recurring
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Закрыто для viewer. Ставит расходу `isRecurring: false`, и ежедневный cron повторяющихся расходов перестаёт клонировать серию; история сохраняется.

### Перенести расход в другой аккаунт

```http
POST /expenses/:id/move
Authorization: Bearer <token>
X-Account-Id: <source-account-uuid>
Content-Type: application/json

{ "targetAccountId": "uuid" }
```

Закрыто для viewer и для заархивированной поездки на стороне источника; вызывающий должен быть не-viewer участником целевого аккаунта. Категория переносится по имени без учёта регистра (иначе очищается); теги, связи с проектами и разбиения по категориям снимаются; конфликт `clientId` в целевом аккаунте решается новым UUID. Расходы со сквозным шифрованием отклоняются с `400`.

**Ответ** `200 OK` — `{ "id": "uuid", "accountId": "target-uuid", "categoryId": "uuid-or-null" }`.

### Объединить два расхода

```http
POST /expenses/merge
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "keepId": "uuid",
  "mergeId": "uuid",
  "fieldChoices": { "merchant": true, "notes": false, "categoryId": true, "projectId": false, "tagIds": true, "receiptImage": true }
}
```

Закрыто для viewer. Вливает `mergeId` в `keepId` (например, автоматически захваченное банковское уведомление и отсканированный чек той же покупки). Каждый флаг `fieldChoices`, равный `true`, берёт это поле у объединяемой строки; остающаяся строка сохраняет свою сумму и валюту. Позиции чека переходят к ней, если своих у неё нет.

**Ответ** `200 OK` — `{ "keptId": "uuid", "mergedId": "uuid" }`.

---

## Доходы

Все эндпоинты доходов требуют заголовок `X-Account-Id`.

### Список доходов

```http
GET /incomes
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `startDate` | ISO 8601 | Фильтр от даты |
| `endDate` | ISO 8601 | Фильтр до даты |
| `categoryId` | UUID | Фильтр по категории |
| `limit` | number | Макс. результатов (по умолч.: 50) |
| `offset` | number | Смещение для пагинации |

**Ответ** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "clientId": "client-uuid",
      "categoryId": "uuid",
      "amount": 200000.00,
      "currencyCode": "RUB",
      "description": "Зарплата за январь",
      "date": "2024-01-15",
      "notes": "Основной доход",
      "syncVersion": 1,
      "createdAt": "2024-01-15T10:00:00Z",
      "category": {
        "id": "uuid",
        "name": "Salary",
        "color": "#4CAF50"
      }
    }
  ],
  "total": 10,
  "limit": 50,
  "offset": 0
}
```

### Создать доход

```http
POST /incomes
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "localId": "client-generated-uuid",
  "amount": 200000.00,
  "currencyCode": "RUB",
  "description": "Зарплата за январь",
  "notes": "Основной доход",
  "categoryId": "uuid",
  "date": "2024-01-15T00:00:00Z"
}
```

**Ответ** `201 Created`

### Получить доход

```http
GET /incomes/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Обновить доход

```http
PATCH /incomes/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "amount": 220000.00,
  "description": "Зарплата за январь (с бонусом)"
}
```

### Удалить доход

```http
DELETE /incomes/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

### Массовое обновление доходов

```http
PATCH /incomes/bulk
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "ids": ["uuid-1", "uuid-2"], "categoryId": "uuid" }
```

Закрыто для viewer. От 1 до 500 id (серверные PK или `clientId`), в рамках аккаунта; применяет проверенный результат `POST /ai/categorize-uncategorized-income`.

**Ответ** `200 OK` — `{ "updated": 2 }`.

---

## Бюджеты

Все эндпоинты бюджетов требуют заголовок `X-Account-Id`.

### Список бюджетов

```http
GET /budgets
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "clientId": "client-uuid",
      "name": "Бюджет на еду",
      "amount": 30000.00,
      "currencyCode": "RUB",
      "period": "monthly",
      "startDate": "2024-01-01",
      "endDate": null,
      "categoryId": "uuid",
      "alertThreshold": 80,
      "isActive": true,
      "syncVersion": 1,
      "category": {
        "id": "uuid",
        "name": "Еда и рестораны",
        "icon": "utensils",
        "color": "#FF6B6B"
      }
    }
  ]
}
```

### Создать бюджет

```http
POST /budgets
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "clientId": "client-generated-uuid",
  "name": "Бюджет на еду",
  "amount": 30000.00,
  "currencyCode": "RUB",
  "period": "monthly",
  "startDate": "2024-01-01",
  "categoryId": "uuid",
  "alertThreshold": 80
}
```

**Значения period**: `daily`, `weekly`, `monthly`, `yearly`, `custom`

**Ответ** `201 Created`

### Получить прогресс бюджета

```http
GET /budgets/:id/progress
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "budget": {
    "id": "uuid",
    "name": "Бюджет на еду",
    "amount": 30000.00,
    "period": "monthly"
  },
  "spent": 19530.00,
  "remaining": 10470.00,
  "percentage": 65.1,
  "daysRemaining": 15,
  "dailyBurnRate": 1302.00,
  "dailyAllowance": 698.00,
  "projectedTotal": 39060.00,
  "estimatedExhaustionDate": "2024-01-23",
  "onTrack": true
}
```

### Обновить бюджет

```http
PATCH /budgets/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "amount": 35000.00,
  "alertThreshold": 75
}
```

### Удалить бюджет

```http
DELETE /budgets/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

### Получить бюджет

```http
GET /budgets/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### История бюджета

```http
GET /budgets/:id/history?periods=6
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Прошлые периоды бюджета, от старых к новым. `periods` по умолчанию 6, ограничивается диапазоном 1–12; месячные периоды учитывают день начала финансового месяца аккаунта. Бюджет `custom` возвращает `[]`.

**Ответ** `200 OK`
```json
[
  { "periodStart": "2026-08-01", "periodEnd": "2026-08-31", "limit": 2000, "actual": 2140.50, "isOverBudget": true }
]
```

---

## Категории

Все эндпоинты категорий требуют заголовок `X-Account-Id`.

### Список категорий

```http
GET /categories
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Еда и рестораны",
      "icon": "utensils",
      "color": "#FF6B6B",
      "type": "expense",
      "isSystem": true,
      "parentId": null,
      "syncVersion": 1
    }
  ]
}
```

### Создать категорию

```http
POST /categories
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "Кофейни",
  "icon": "coffee",
  "color": "#8B4513",
  "type": "expense",
  "parentId": "food-category-uuid"
}
```

**Значения type**: `expense`, `income`

Необязательный `clientId` (локальный id устройства) делает создание **идемпотентным**: повторная отправка с тем же `clientId` возвращает строку, созданную в первый раз. Обновление и удаление понимают `:id` и как серверный PK, и как этот `clientId`.

### Обновить категорию

```http
PATCH /categories/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "Кофе и чай",
  "color": "#654321",
  "coicopDivision": "CP01"
}
```

`coicopDivision` (`TOTAL`, `CP01` … `CP13`) задаёт ценовую группу, с весом которой категория учитывается в [реальной зарплате](#реальная-зарплата); изменение сбрасывает кэш реальной зарплаты аккаунта.

### Удалить категорию

```http
DELETE /categories/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

---

## Теги

Все эндпоинты тегов требуют заголовок `X-Account-Id`.

### Список тегов

```http
GET /tags
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "командировка",
      "color": "#3498DB",
      "icon": "briefcase",
      "usageCount": 12,
      "syncVersion": 1,
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

### Создать тег

```http
POST /tags
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "командировка",
  "color": "#3498DB",
  "icon": "briefcase"
}
```

**Ответ** `201 Created`

### Обновить тег

```http
PATCH /tags/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "рабочая-поездка",
  "color": "#2980B9"
}
```

### Удалить тег

```http
DELETE /tags/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

### Добавить тег к расходу

```http
POST /tags/:id/expenses/:expenseId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `201 Created`

### Удалить тег с расхода

```http
DELETE /tags/:id/expenses/:expenseId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

REST-маршрута для тегов **дохода** нет: методы `TagsService.addToIncome`/`removeFromIncome` существуют, но ни один контроллер их не открывает.

---

## Проекты

Все эндпоинты проектов требуют заголовок `X-Account-Id`.

### Список проектов

```http
GET /projects?archived=false
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `archived` | boolean | Фильтр по статусу архивации |

**Ответ** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "clientId": "client-uuid",
      "name": "Ремонт кухни",
      "description": "Полный ремонт кухни",
      "color": "#E74C3C",
      "icon": "home",
      "startDate": "2026-01-01",
      "endDate": "2026-03-31",
      "budget": 300000.00,
      "currencyCode": "RUB",
      "isArchived": false,
      "syncVersion": 1,
      "createdAt": "2026-01-01T10:00:00Z"
    }
  ]
}
```

### Получить проект

```http
GET /projects/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
Возвращает проект с привязанными расходами и доходами.

### Создать проект

```http
POST /projects
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "localId": "client-generated-uuid",
  "name": "Ремонт кухни",
  "description": "Полный ремонт кухни",
  "color": "#E74C3C",
  "icon": "home",
  "startDate": "2026-01-01",
  "endDate": "2026-03-31",
  "budget": 300000.00,
  "currencyCode": "RUB"
}
```

**Ответ** `201 Created`

### Обновить проект

```http
PATCH /projects/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "Ремонт кухни — фаза 2",
  "budget": 450000.00,
  "isArchived": false
}
```

### Удалить проект

```http
DELETE /projects/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

### Добавить расход в проект

```http
POST /projects/:id/expenses
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "expenseId": "expense-uuid"
}
```

**Ответ** `201 Created`

### Удалить расход из проекта

```http
DELETE /projects/:id/expenses/:expenseId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

### Добавить доход в проект

```http
POST /projects/:id/incomes
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "incomeId": "income-uuid"
}
```

**Ответ** `201 Created`

### Удалить доход из проекта

```http
DELETE /projects/:id/incomes/:incomeId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

### Получить аналитику проекта

```http
GET /projects/:id/analytics
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "projectId": "uuid",
  "projectName": "Ремонт кухни",
  "totalExpenses": 192000.00,
  "totalIncome": 0,
  "netAmount": -192000.00,
  "expenseCount": 8,
  "incomeCount": 0,
  "budgetRemaining": 108000.00,
  "expensesByCategory": [
    {
      "categoryId": "uuid",
      "categoryName": "Материалы",
      "amount": 126000.00,
      "count": 5
    }
  ],
  "timeline": [
    {
      "date": "2026-01-15",
      "expenses": 27000.00,
      "income": 0
    }
  ]
}
```

---

## Разделение расходов по категориям

Разделение позволяет распределить один расход по нескольким категориям.

### Установить разделение для расхода

```http
POST /expenses/:id/splits
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "splits": [
    {
      "categoryId": "food-uuid",
      "amount": 1800.00,
      "percentage": 60,
      "notes": "Продукты"
    },
    {
      "categoryId": "household-uuid",
      "amount": 1200.00,
      "percentage": 40,
      "notes": "Бытовая химия"
    }
  ]
}
```

**Валидация**: от 2 до 10 разделений на расход.

**Ответ** `200 OK`
```json
{
  "splits": [
    {
      "id": "uuid",
      "expenseId": "expense-uuid",
      "categoryId": "food-uuid",
      "amount": 1800.00,
      "percentage": 60,
      "notes": "Продукты",
      "category": {
        "id": "food-uuid",
        "name": "Еда и рестораны"
      }
    },
    {
      "id": "uuid",
      "expenseId": "expense-uuid",
      "categoryId": "household-uuid",
      "amount": 1200.00,
      "percentage": 40,
      "notes": "Бытовая химия",
      "category": {
        "id": "household-uuid",
        "name": "Бытовые товары"
      }
    }
  ]
}
```

### Удалить разделение расхода

```http
DELETE /expenses/:id/splits
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

**Примечание:** Если расход разделён, аналитика агрегирует по категориям разделения вместо единственной категории расхода.

---

## Кошелёк

Все эндпоинты кошелька требуют заголовок `X-Account-Id`.

### Установить баланс

```http
POST /wallet
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "clientId": "client-generated-uuid",
  "currencyCode": "RUB",
  "initialAmount": 300000.00
}
```

### Список балансов

```http
GET /wallet
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
[
  {
    "id": "uuid",
    "currencyCode": "RUB",
    "initialAmount": 300000.00,
    "syncVersion": 1
  },
  {
    "id": "uuid",
    "currencyCode": "EUR",
    "initialAmount": 2000.00,
    "syncVersion": 1
  }
]
```

### Получить сводку по кошельку

```http
GET /wallet/summary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Возвращает по одной записи на каждую валюту, в которой на счёте **есть деньги** —
все валюты со строкой в `wallet_balances`, плюс все валюты, у которых есть
движения (доход, расход, обмен, перевод), но строки ещё нет. У выведенной валюты
`initialAmount: 0`, поэтому её `currentBalance` — ровно сумма транзакций; сама
строка создаётся в фоне, чтобы следующее чтение её уже нашло.

Валюта, строку которой удалили через `DELETE /wallet/:currencyCode`, в ответ не
попадает даже при наличии движений — удаление валюты это осознанное «скрыть», и
оно должно переживать следующую транзакцию в ней. Чтобы вернуть, задайте для неё
баланс заново.

### Сводки по всем моим аккаунтам

```http
GET /wallet/summaries
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Балансы кошелька для **всех** аккаунтов пользователя за один запрос — форме перевода нужен баланс и другого аккаунта. Гард контекста аккаунта на уровне класса остаётся, но `X-Account-Id` намеренно игнорируется: членства перечисляются по пользователю; каждая строка строится тем же `buildWalletBalanceRow`, что и в `GET /wallet/summary`, поэтому оба экрана показывают одинаковый баланс. См. `docs/wiki/features/account-transfers.md`.

**Ответ** `200 OK` — `{ "accounts": [ { "accountId": "uuid", "balances": [ /* как в сводке кошелька */ ] } ] }`.

### История баланса (по дням)

```http
GET /wallet/balance-history?days=30
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Ежедневные снимки баланса по каждой валюте за последние N дней. `days` по умолчанию `30`, максимум `90`.

> **Примечание:** оставлено для уже выпущенных версий приложения. Текущий мобильный клиент использует месячный эндпоинт ниже.

**Ответ** `200 OK`
```json
{
  "points": [
    { "date": "2026-06-01", "balances": { "USD": 5000.00, "EUR": 2000.00 } },
    { "date": "2026-06-02", "balances": { "USD": 4950.00, "EUR": 2000.00 } }
  ],
  "currencies": ["USD", "EUR"]
}
```

### История баланса (по месяцам)

```http
GET /wallet/balance-history/monthly?months=6
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Чистое изменение баланса по каждой валюте за каждый календарный месяц (доход +, расход −, обмен ±, переводы ±). `months` по умолчанию `6`, ограничено диапазоном `1`–`12`. Возвращаются все месяцы диапазона, включая месяцы без операций.

**Ответ** `200 OK`
```json
{
  "months": [
    { "month": "2026-01", "deltas": { "USD": 320.00, "EUR": -50.00 } },
    { "month": "2026-02", "deltas": { "USD": -120.50, "EUR": 0 } }
  ],
  "currencies": ["USD", "EUR"]
}
```

### Удалить баланс

```http
DELETE /wallet/:currencyCode
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Скрывает валюту из кошелька. Это soft delete, и он действует до тех пор, пока для
этой валюты снова не задать баланс: валюта с удалённой строкой **не** выводится
из своих движений заново, в отличие от валюты, у которой строки никогда не было
(см. **Получить сводку по кошельку**).

**Ответ** `204 No Content`

---

## Правила категорий для продавцов

Выученные связи `продавец → категория`. Правило создаётся/обновляется автоматически, когда расходу с указанным продавцом назначается категория; при будущих импортах из банков и Wise соответствующая категория подставляется автоматически. Все эндпоинты требуют JWT + заголовок `X-Account-Id`.

### Список правил

```http
GET /merchant-rules
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
[
  {
    "id": "uuid",
    "merchantNormalized": "amazon",
    "categoryId": "uuid",
    "categoryName": "Shopping",
    "categoryIcon": "cart",
    "createdAt": "2026-06-15T10:00:00.000Z",
    "updatedAt": "2026-06-15T10:00:00.000Z"
  }
]
```

### Удалить правило

```http
DELETE /merchant-rules/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Перестаёт автоматически назначать эту категорию. **Роль viewer заблокирована** (403).

**Ответ** `200 OK`

### Предпросмотр повторного применения правила

```http
GET /merchant-rules/:id/reapply-preview
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Сколько существующих расходов этого продавца лежит в других категориях и перейдёт в категорию правила.

**Ответ** `200 OK`
```json
{
  "ruleId": "uuid",
  "merchantNormalized": "amazon",
  "targetCategoryId": "uuid",
  "targetCategoryName": "Shopping",
  "totalCount": 7,
  "groups": [ { "categoryId": "uuid", "categoryName": "Other", "count": 5 } ]
}
```

### Повторно применить правило

```http
POST /merchant-rules/:id/reapply
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "categoryIds": ["uuid"] }
```

Закрыто для viewer. Переносит расходы продавца из перечисленных исходных категорий в категорию правила. **Ответ** `200 OK` — `{ "updated": 5 }`.

---

## Обмен валют

Все эндпоинты обмена валют требуют заголовок `X-Account-Id`.

### Создать обмен

```http
POST /currency-exchanges
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "clientId": "client-generated-uuid",
  "fromCurrency": "RUB",
  "toCurrency": "EUR",
  "fromAmount": 100000.00,
  "toAmount": 920.00,
  "exchangeRate": 0.0092,
  "date": "2024-01-15",
  "notes": "Ежемесячный обмен"
}
```

### Список обменов

```http
GET /currency-exchanges
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Получить курсы валют

```http
GET /currency-exchanges/rates?base=RUB
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "base": "RUB",
  "rates": {
    "EUR": 0.0092,
    "GBP": 0.0079,
    "USD": 0.011
  }
}
```

### Получить обмен

```http
GET /currency-exchanges/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Удалить обмен

```http
DELETE /currency-exchanges/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Обновить обмен

```http
PATCH /currency-exchanges/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "toAmount": 925.00, "exchangeRate": 0.925, "notes": "Исправлено" }
```

Закрыто для viewer. Любые из `fromCurrency`, `toCurrency`, `fromAmount`, `toAmount`, `exchangeRate`, `date`, `notes`.

---

## Оповещения о курсе

«Сообщить, когда пара достигнет моей цели». Ресурс **личный**: строки привязаны только к
`userId`, поэтому оповещение действует на всех счетах пользователя и никогда не видно
другим участникам общего счёта.

Все три эндпоинта закрыты `JwtAuthGuard + AccountContextGuard`, то есть обычный заголовок
`X-Account-Id` от мобильного клиента принимается, но сервис **полностью его игнорирует** —
тот же precedent, что и `GET /wallet/summaries`. `ViewerBlockGuard` нет: наблюдатель может
задать личную цель по курсу так же, как валюту отображения или акцентный цвет.

### Создать оповещение

```http
POST /rate-watches
Authorization: Bearer <token>
Content-Type: application/json

{
  "fromCurrency": "EUR",
  "toCurrency": "PLN",
  "targetRate": 4.35,
  "direction": "above"
}
```

`direction` — `above` или `below`; сравнивается всегда курс вида `1 fromCurrency =
<rate> toCurrency`. Обе валюты должны быть из поддерживаемого списка
(`USD`, `EUR`, `PLN`, `GBP`, `UAH`, `RUB`, `BYN`) и различаться. `targetRate` проверяется
на диапазон `[0.000001, 999999]` — колонка `Decimal(12,6)`.

**Ответ** `201 Created`
```json
{
  "id": "uuid",
  "userId": "user-uuid",
  "fromCurrency": "EUR",
  "toCurrency": "PLN",
  "targetRate": 4.35,
  "direction": "above",
  "isActive": true,
  "createdAt": "2026-09-02T12:00:00Z",
  "triggeredAt": null,
  "triggeredRate": null
}
```

`400 Bad Request` — неподдерживаемая валюта, `fromCurrency === toCurrency` либо у
пользователя уже **20** активных оповещений (`MAX_ACTIVE_WATCHES`; это защита от
злоупотребления, поэтому проверка count-then-create намеренно не атомарна).

### Список оповещений

```http
GET /rate-watches
Authorization: Bearer <token>
```

Все оповещения текущего пользователя, новые первыми — **включая уже сработавшие**
(`isActive: false`): это единственная запись о том, что оповещение отработало. Фильтрация
по конкретной паре выполняется на клиенте.

**Ответ** `200 OK`
```json
[
  {
    "id": "uuid",
    "userId": "user-uuid",
    "fromCurrency": "EUR",
    "toCurrency": "PLN",
    "targetRate": 4.35,
    "direction": "above",
    "isActive": false,
    "createdAt": "2026-09-02T12:00:00Z",
    "triggeredAt": "2026-09-02T15:00:00Z",
    "triggeredRate": 4.3512
  }
]
```

### Удалить оповещение

```http
DELETE /rate-watches/:id
Authorization: Bearer <token>
```

**Ответ** `200 OK`
```json
{ "success": true }
```

Удаление — это и способ отключить оповещение: отдельной настройки уведомлений для
`rate_watch_hit` нет (само существование оповещения и есть согласие — тот же precedent,
что `account_invitation` / `split_payment_claimed`). Строка другого пользователя даёт
`404 Not Found`, а не `403`, чтобы ответ не выдавал её существование.

### Как выполняется проверка

`ExchangeRateAlertCron` запускается раз в час (`0 * * * *`), листает активные оповещения
через `paginateById` и группирует каждую страницу по `fromCurrency` перед вызовом общего
`ExchangeRateService` — поэтому один прогон стоит не более одного запроса к провайдеру на
каждую отслеживаемую `fromCurrency` (максимум 7), независимо от числа пользователей и
оповещений. Неизвестный курс `toCurrency` пропускается и проверяется через час.

Оповещение **одноразовое**: при попадании строка переводится в `isActive: false` с
`triggeredAt`/`triggeredRate` **до** отправки пуша (чтобы два одновременных прогона не
отправили его дважды), а при неудачной отправке возвращается в активное состояние, чтобы
следующий прогон повторил — у одноразового оповещения нет другой поверхности, которая
сообщила бы о срабатывании, поэтому потерянный пуш не должен стать окончательным. Пуш
(`rate_watch_hit`, локализован на всех 9 языках) несёт только `{ fromCurrency, toCurrency }`
и открывает экран обмена в мобильном приложении с уже выбранной парой.

---

## Переводы между счетами

Эндпоинты закрыты `JwtAuthGuard + AccountContextGuard`, то есть заголовок `X-Account-Id`
**обязателен**, и счёт, от имени которого вы действуете, должен быть стороной перевода
(отправителем или получателем). Для записи дополнительно требуется быть участником
**обоих** счетов и не быть наблюдателем на списывающей стороне — правило «изменить или
удалить перевод может тот, кто мог бы его создать», проверяется на каждой записи, а не
только при смене счетов.

`GET` возвращает все переводы, которые касаются счёта, **независимо от автора**: кошелёк
считает переводы по счёту без фильтра по пользователю, поэтому баланс общего счёта и так
всегда учитывал перевод, сделанный другим участником (ABA-473). Поле `userId` в строке —
только атрибуция автора.

Перевод можно перенести на счета, при которых текущий счёт перестаёт быть стороной, —
именно так с экрана Family исправляется «эти деньги ушли на House, а не на Family»: строка
переезжает к двум счетам, которым теперь принадлежит (ABA-472).

### Создать перевод

```http
POST /account-transfers
Authorization: Bearer <token>
Content-Type: application/json

{
  "localId": "client-generated-uuid",
  "fromAccountId": "source-account-uuid",
  "fromCurrency": "USD",
  "fromAmount": 1000.00,
  "toAccountId": "destination-account-uuid",
  "toCurrency": "EUR",
  "toAmount": 920.00,
  "exchangeRate": 0.92,
  "date": "2024-01-15T00:00:00Z",
  "notes": "Ежемесячный перевод на личный",
  "countAsIncome": false
}
```

При `countAsIncome: true` дополнительно создаётся запись `Income` на счёте-получателе
(clientId `transfer-income-<localId>`), и именно она учитывается в балансе получателя —
входящий перевод попадает в `transferredIn` только при `countAsIncome: false`, поэтому
деньги никогда не считаются дважды.

Создание **идемпотентно по `localId`**: повторная отправка запроса, ответ на который был
потерян, возвращает существующую строку, а не дубликат и не `500` (на это опирается
очередь записи в мобильном приложении).

**Ответ** `201 Created`

### Список переводов

```http
GET /account-transfers
Authorization: Bearer <token>
```

**Ответ** `200 OK` — массив переводов для текущего пользователя.

### Изменить перевод

```http
PATCH /account-transfers/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "toAccountId": "other-account-uuid",
  "toCurrency": "PLN",
  "toAmount": 6000.00
}
```

Все поля необязательны: `fromAccountId`, `toAccountId`, `fromCurrency`, `toCurrency`,
`fromAmount`, `toAmount`, `exchangeRate`, `date`, `notes`, `countAsIncome`. Валюта едет
**вместе** со счётом — перенести перевод и оставить старую валюту значило бы сохранить
бессмысленную строку.

Переключение `countAsIncome` создаёт или помечает удалённой связанную запись `Income`;
смена `toAccountId` переносит этот доход на новый счёт-получатель, иначе деньги остались бы
на счёте, к которому перевод больше не относится.

`:id` сопоставляется с серверным id **или** с клиентским `clientId`: мобильный клиент
адресует строку локальным id, пока pull кошелька не подставит серверный.

**Ответ** `200 OK` — обновлённый перевод.

### Удалить перевод

```http
DELETE /account-transfers/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Помечает удалённым перевод и связанный с ним доход (если он есть).

**Ответ** `200 OK`
```json
{ "success": true }
```

---

## Инсайты

Требуется заголовок `X-Account-Id`.

### Получить инсайты

```http
GET /insights
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "anomalies": [
    {
      "categoryId": "uuid",
      "categoryName": "Развлечения",
      "currentAmount": 27000.00,
      "averageAmount": 12000.00,
      "percentageChange": 125,
      "period": "2024-01"
    }
  ],
  "predictions": [
    {
      "budgetId": "uuid",
      "budgetName": "Бюджет на еду",
      "estimatedExhaustionDate": "2024-01-25",
      "dailyBurnRate": 1302.00,
      "daysRemaining": 15,
      "projectedTotal": 39060.00,
      "currencyCode": "RUB"
    }
  ]
}
```

### Получить Inflation Shield (щит от инфляции)

Прогнозирует цену каждого отслеживаемого товара на основе истории чеков и рекомендует, что **закупить впрок прямо сейчас**, пока цена не выросла, а также показывает, сколько щит уже **сэкономил**. Детерминированный расчёт (без затрат на AI). Ограничений по тарифу нет — доступно на бесплатном тарифе. Кешируется в Redis под ключом `shield:{accountId}:{baseCurrency}` с TTL 1 час.

```http
GET /insights/inflation-shield
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "baseCurrency": "PLN",
  "items": [
    {
      "canonicalName": "Кофе 500г",
      "monthlyChangePct": 6.4,
      "currentPrice": 24.99,
      "projectedPrice": 27.10,
      "quantity": 3,
      "projectedSaving": 3.17,
      "store": null,
      "currencyOriginal": "PLN",
      "affordableToday": true
    }
  ],
  "basketMonthlyForecastPct": 4.1,
  "totalProjectedSaving": 3.17,
  "savedSoFar": 12.40,
  "hasEnoughData": true,
  "fxApproximate": false,
  "computedAt": "2026-07-16T09:00:00Z"
}
```

`items[].projectedSaving` — это оценка по модели «наполовину пройденной линейной рампы»: `(projectedPrice − currentPrice) / 2 × quantity`, а не полный разрыв на конец горизонта. `store` в Plan 1 равен `null` (только персональные данные; community-буст отложен). `savedSoFar` — реализованная экономия, засчитанная при фактической покупке рекомендованного товара, просуммированная с конвертацией валют в `baseCurrency`. При `hasEnoughData: false` возвращается пустой массив `items` — данных ниже порога (≥3 ценовые точки на товар).

**DTO** (`packages/shared-types/src/dto/insights.ts`): `InflationShieldResponse`, `ShieldItem`.

### Можно потратить сегодня (Safe-to-Spend)

```http
GET /insights/safe-to-spend
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Бесплатно (без гарда тарифа). Главное число на домашнем экране: `max(0, (walletBalance + expectedIncome − obligations − buffer) / daysRemaining)` до конца месяца или до следующего ожидаемого дохода — что наступит раньше. Кэшируется на 5 минут по аккаунту и валюте.

**Ответ** `200 OK` — `SafeToSpendResponse` (`packages/shared-types/src/dto/insights.ts`):
```json
{
  "baseCurrency": "PLN",
  "safeToSpendToday": 84.20,
  "projectedAvailable": 1010.40,
  "daysRemaining": 12,
  "horizonDate": "2026-10-10",
  "incomeInferred": true,
  "fxApproximate": false,
  "breakdown": { "walletBalance": 2400, "expectedIncome": 0, "upcomingSubscriptions": 120, "upcomingRecurring": 800, "goalContributions": 469.60, "buffer": 0 },
  "computedAt": "2026-09-27T10:00:00.000Z"
}
```

### Финансовые итоги года (Wrapped)

```http
GET /insights/wrapped?year=2026
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Бесплатно. Колода карточек «итоги года», собранная из существующих данных; `year` ограничивается диапазоном `[2000, текущий год]`. Включаются только карточки с данными; `hasEnoughData: false` с пустыми `cards` — если записей меньше 5 или аккаунт tier-2 зашифрован. Кэшируется на 1 час.

**Ответ** `200 OK` — `WrappedResponse`: `{ "year", "baseCurrency", "generatedAt", "hasEnoughData", "fxApproximate", "cards": WrappedCard[] }`, где каждая карточка — размеченное объединение по `type` (`intro`, `total_tracked`, `top_merchant`, `biggest_month`, `top_category`, `category_mix`, `receipts_scanned`, `savings`, `personal_inflation`, `streak`).

### Реальная зарплата

«Поспевает ли моя прибавка за тем, что реально можно купить на мои деньги»: подтверждённый доход-зарплата пользователя (12 месяцев против предыдущих 12) против персональной инфляции из официальных данных Eurostat HICP и собственного индекса цен по чекам, взвешенной по его тратам в разделах COICOP. Всё бесплатно, кроме PDF-справки. Подробности: `docs/wiki/features/real-salary.md`; типы: `packages/shared-types/src/dto/real-salary.ts`.

```http
GET /insights/real-salary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK` — `RealSalaryResponse`:
```json
{
  "status": "ready",
  "baseCurrency": "PLN",
  "country": "PL",
  "countryGuessed": false,
  "dataMonth": "2026-08",
  "nominalChangePct": 6.0,
  "personalInflationPct": 4.8,
  "realChangePct": 1.1,
  "requiredRaisePct": 4.8,
  "breakdown": [ { "division": "CP01", "weight": 0.31, "ratePct": 5.2, "source": "receipts" } ],
  "topDrivers": ["CP01", "CP04"],
  "fxApproximate": false,
  "computedAt": "2026-09-27T10:00:00.000Z"
}
```

`status`, отличный от `ready` (`no_salary_confirmed`, `salary_history_short`, `spend_under_3_months`, `no_inflation_source`, `encrypted`), означает, что показатели `null`/пусты и клиент показывает соответствующий шаг настройки.

```http
GET /insights/real-salary/profile
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK` — `{ "profile": { "salaryKey": "string-or-null", "manualPreviousMonthly": null }, "candidates": [ { "key", "categoryId", "categoryName", "descriptionKey", "currencyCode", "typicalAmount", "occurrences" } ] }` — сохранённый выбор и найденные серии доходов, похожие на зарплату, из которых можно выбрать.

```http
PUT /insights/real-salary/profile
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "salaryKey": "<candidate key>", "manualPreviousMonthly": 7200 }
```

Закрыто для viewer. `manualPreviousMonthly` — месячная зарплата год назад, когда истории не хватает.

```http
GET /insights/real-salary/categories
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK` — `[{ "id", "name", "icon", "coicopDivision" }]`: категории аккаунта и ценовая группа COICOP, с весом которой учитывается каждая (меняется полем `coicopDivision` в `PATCH /categories/:id`).

```http
POST /insights/real-salary/brief?lang=pl
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Pro.** Возвращает одностраничный PDF (`Content-Type: application/pdf`, `Content-Disposition: attachment; filename="real-salary-YYYY-MM-DD.pdf"`). `409` с `{ "message", "status" }`, если показатель не `ready`.

### Fat Finder

```http
POST /insights/fat-finder
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "month": 9, "year": 2026, "language": "ru", "forceRegenerate": false }
```

**Pro.** AI-аудит трат за месяц; типы находок — `subscription`, `recurring_splurge`, `large_one_off`, `category_excess`, `service_overuse`. Все поля необязательны (по умолчанию — текущий месяц). Считается и подписывается в `user.currencyCode`, а не в валюте какой-либо строки. **Ответ** — `FatFinderResponse` (`packages/shared-types/src/dto/fat-finder.ts`).

---

## AI Инсайты

Требуется заголовок `X-Account-Id`. Доступно на всех тарифах подписки. Использует AI-запросы из ежемесячного лимита.

### Получить AI-сгенерированные инсайты

```http
GET /insights/ai-charts?language=ru
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `language` | string | Код языка ответа (en, ru, de, es, fr, pl, ua) |

**Ответ** `200 OK`
```json
{
  "insights": [
    {
      "id": "uuid",
      "insightType": "anomaly_spike",
      "title": "Всплеск расходов на еду",
      "description": "Расходы на еду выросли на 45% по сравнению со средним за 3 месяца.",
      "severity": "warning",
      "chartConfig": {
        "chartType": "bar",
        "title": "Сравнение расходов на еду",
        "data": [
          { "label": "Среднее", "value": 12000, "color": "#4ECDC4" },
          { "label": "Этот месяц", "value": 17400, "color": "#E74C3C" }
        ]
      },
      "actionSuggestion": "Рекомендуем установить бюджет для этой категории.",
      "generatedAt": "2026-02-10T12:00:00Z"
    }
  ],
  "generatedAt": "2026-02-10T12:00:00Z",
  "periodStart": "2026-02-01T00:00:00Z",
  "periodEnd": "2026-02-28T00:00:00Z"
}
```

**Примечание:** Результаты кешируются на 24 часа.

---

## История расходов

Требуется заголовок `X-Account-Id`. Доступно на всех тарифах подписки. Использует AI-запросы из ежемесячного лимита.

### Сгенерировать историю расходов

```http
POST /insights/story
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "period": "month",
  "forceRegenerate": false,
  "language": "ru"
}
```

**Параметры тела**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `period` | string | `week` или `month` |
| `forceRegenerate` | boolean | Принудительная регенерация (обходит 24ч кеш) |
| `language` | string | Код языка ответа |

**Ответ** `200 OK`
```json
{
  "story": {
    "id": "uuid",
    "accountId": "uuid",
    "periodLabel": "Февраль 2026",
    "periodStart": "2026-02-01T00:00:00Z",
    "periodEnd": "2026-02-28T00:00:00Z",
    "blocks": [
      {
        "type": "hero_metric",
        "order": 1,
        "content": {
          "title": "Итого потрачено",
          "metrics": [{ "label": "Итого", "value": "75 045 ₽", "change": -12 }],
          "tone": "positive"
        }
      }
    ],
    "summary": "Отличный месяц! Вы потратили на 12% меньше, чем в прошлом.",
    "generatedAt": "2026-02-10T12:00:00Z"
  },
  "isStale": false
}
```

**Типы блоков:** `hero_metric`, `narrative_text`, `chart`, `comparison`, `callout`, `achievement`

---

## Детализация аналитики

Требуется заголовок `X-Account-Id`.

### Получить данные детализации

```http
POST /analytics/drill-down
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "level": "month",
  "parentId": null,
  "startDate": "2026-01-01",
  "endDate": "2026-12-31",
  "currencyCode": "PLN"
}
```

**Параметры тела**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `level` | string | `year`, `month`, `week`, `day`, `transactions` |
| `parentId` | string | ID категории или ключ даты для следующего уровня |
| `startDate` | ISO 8601 | Начало периода |
| `endDate` | ISO 8601 | Конец периода |
| `currencyCode` | string | Фильтр по валюте |

**Ответ** `200 OK`
```json
{
  "chart": {
    "chartType": "bar",
    "title": "Расходы по месяцам",
    "data": [
      { "label": "Янв", "value": 72000, "id": "2026-01" },
      { "label": "Фев", "value": 58800, "id": "2026-02" }
    ],
    "drillDown": {
      "enabled": true,
      "currentLevel": "year",
      "nextLevel": "month"
    }
  },
  "breadcrumb": [
    { "level": "year", "label": "2026" }
  ]
}
```

---

## AI сервисы

### Транскрипция аудио

```http
POST /ai/transcribe
Authorization: Bearer <token>
Content-Type: multipart/form-data

audio: <аудио файл>
language: "ru" (опционально)
```

**Ответ** `200 OK`
```json
{
  "text": "Потратил полторы тысячи рублей на обед сегодня",
  "language": "ru",
  "duration": 3.5
}
```

### Парсинг расхода из текста

```http
POST /ai/parse-expense
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "Потратил полторы тысячи рублей на обед сегодня в итальянском ресторане"
}
```

**Ответ** `200 OK`
```json
{
  "amount": 1500.00,
  "currencyCode": "RUB",
  "description": "Обед в итальянском ресторане",
  "date": "2024-01-15",
  "suggestedCategory": "Еда и рестораны",
  "confidence": 0.92
}
```

### Автокатегоризация расхода

```http
POST /ai/categorize
Authorization: Bearer <token>
Content-Type: application/json

{
  "description": "Uber до аэропорта",
  "amount": 2500.00
}
```

**Ответ** `200 OK`
```json
{
  "categoryId": "uuid",
  "categoryName": "Транспорт",
  "confidence": 0.95,
  "alternatives": [
    { "categoryId": "uuid", "name": "Путешествия", "confidence": 0.75 }
  ]
}
```

### Сканирование чека

Принимает изображение чека (камера/галерея) или PDF-файл в кодировке base64.

```http
POST /ai/scan-receipt
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "imageBase64": "<файл в base64>",
  "userPrompt": "Разделить поровну между двумя людьми",
  "mimeType": "application/pdf"
}
```

**Параметры тела запроса**
| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| `imageBase64` | string | Да | Изображение (JPEG/PNG) или PDF в кодировке base64 |
| `userPrompt` | string | Нет | Заметка для ИИ об этом чеке (макс. 300 символов). Воспринимается как пассивная аннотация, а не как инструкция. |
| `mimeType` | string | Нет | Укажите `application/pdf` для PDF; не указывайте для изображений |

**Логика обработки PDF:**
- Текстовые PDF (например, электронные чеки) — текст извлекается и отправляется ИИ в текстовом виде (дешевле)
- Сканированные PDF — весь PDF-файл отправляется ИИ для визуального анализа

**Ответ** `200 OK`
```json
{
  "amount": 548.00,
  "discountAmount": null,
  "currencyCode": "RUB",
  "description": "Перекрёсток (2 позиции)",
  "categoryId": "uuid",
  "categorySuggestion": "Продукты",
  "merchant": "Перекрёсток",
  "date": "2024-01-15",
  "confidence": 0.88,
  "receiptItems": [
    { "description": "Яблоки органические", "quantity": 1, "unitPrice": 299.00, "totalPrice": 299.00 },
    { "description": "Миндальное молоко", "quantity": 1, "unitPrice": 249.00, "totalPrice": 249.00 }
  ],
  "location": { "lat": 55.7558, "lng": 37.6173, "name": "ул. Тверская 1, Москва" },
  "priceFindings": []
}
```

**`location`** — геокодированные координаты магазина, полученные по адресу, напечатанному на чеке, или `null`, если адрес отсутствует либо не удалось определить. Сервер извлекает адрес магазина (точки продажи), игнорируя юридический адрес продавца, и геокодирует его через OpenStreetMap/Nominatim (структурированный запрос, результаты кэшируются). Клиент прикрепляет этот `location` при создании расхода. Геокодирование fail-silent: сбой поиска никогда не блокирует сканирование чека.

**`priceFindings`** (ABA-373, проверка цен по чеку) — позиции этого чека, которые стоят заметно дороже собственной **медианной** цены пользователя за этот же товар в этом же магазине за последние 12 недель. **Поле присутствует всегда и никогда не опускается; пустой массив означает, что сообщать не о чем.** Каждый элемент:

```json
{
  "canonicalName": "Mleko Łaciate 3,2% 1L",
  "merchant": "Biedronka",
  "currencyCode": "PLN",
  "paidUnitPrice": 5.49,
  "baselineUnitPrice": 4.29,
  "quantity": 2,
  "changePct": 28.0,
  "overpaidAmount": 2.40,
  "source": "personal",
  "confidence": "high"
}
```

`baselineUnitPrice` — медиана предыдущих покупок пользователя (`source: "personal"`; значение `"community"` зарезервировано под будущий краудсорсинговый фолбэк и пока не используется). `confidence` равен `"low"`, когда база опирается ровно на минимальные 2 предыдущие покупки, и `"high"` — от 3 и более; клиент показывает предупреждение «на основе только двух предыдущих покупок» именно для находок с `"low"`. `overpaidAmount = (paidUnitPrice − baselineUnitPrice) × quantity`. Сравнение выполняется **только для того же товара, в том же магазине, в той же валюте** — оно никогда не конвертируется и не сравнивается между магазинами или валютами, а рост цены выше настроенного предела отбрасывается как «вероятно, другой товар», а не сообщается (см. `RECEIPT_CHECK_MAX_RISE_PCT` в [ARCHITECTURE.md](./ARCHITECTURE.md#проверка-цен-по-чеку)). Это детерминированная арифметика, а не вызов ИИ, и она никогда не подразумевает, что пользователя обманули или что скидку не применили намеренно — только то, что позиция стоит дороже обычного и её стоит проверить.

### Поиск по адресу (геокодирование)

Прямое геокодирование введённого запроса в список кандидатов для пикера локации расхода. Бесплатно (не вызов OpenAI — без учёта AI-стоимости).

```http
GET /ai/geocode/search?q=Biedronka%20Gdańsk&lat=54.35&lng=18.65
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `q` | string | Текст поиска (обязателен; запрос короче 3 символов возвращает `[]`) |
| `lat` | number | Опционально. Широта пользователя — смещает результаты ближе к его позиции |
| `lng` | number | Опционально. Долгота пользователя — смещает результаты ближе к его позиции |

**Ответ** `200 OK`
```json
{
  "results": [
    { "lat": 54.3597, "lng": 18.5842, "name": "Biedronka, Piecewska, Gdańsk, Polska" },
    { "lat": 54.3190, "lng": 18.5824, "name": "Biedronka, Kazimierza Porębskiego, Gdańsk, Polska" }
  ]
}
```

До 5 кандидатов из OpenStreetMap/Nominatim. Запрос короче 3 символов или любой сбой поиска возвращает `{ "results": [] }` (fail-silent). Результаты кэшируются в Redis (1 ч).

**Смещение по близости:** когда переданы `lat` и `lng` (и они не `0,0`), поиск смещается к окну ~150 км вокруг этой точки (`bounded=0`, поэтому дальние совпадения всё равно возвращаются, если рядом ничего нет), а полученные кандидаты пересортировываются по расстоянию до точки перед обрезкой до 5. Округлённая точка входит в ключ кэша Redis, поэтому результаты кэшируются по местоположению. Без `lat`/`lng` поведение не меняется (обратно совместимо).

### Подсказки тегов

```http
GET /ai/suggest-tags
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `description` | string | Описание расхода (обязательно) |
| `merchant` | string | Название продавца (опционально) |

**Ответ** `200 OK`
```json
{
  "tags": [
    {
      "name": "деловой-обед",
      "confidence": 0.92,
      "source": "history",
      "existingTagId": "uuid"
    },
    {
      "name": "встреча-с-клиентом",
      "confidence": 0.78,
      "source": "ai",
      "existingTagId": null
    }
  ]
}
```

**Стоимость AI**: 0.5 единиц (только если из истории < 3 результатов)

**Значения source**: `history` (из похожих прошлых расходов), `ai` (сгенерировано GPT-4)

### Подсказка проекта

```http
POST /ai/suggest-project
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "description": "Краска для стен кухни",
  "date": "2026-02-10",
  "locationName": "Леруа Мерлен"
}
```

**Ответ** `200 OK`
```json
{
  "projectId": "uuid",
  "projectName": "Ремонт кухни",
  "confidence": 0.88
}
```

Возвращает `null`, если подходящий проект не найден (confidence < 0.6).

**Стоимость AI**: 0.5 единиц

### Чат с AI ассистентом

Общайтесь с AI ассистентом для получения финансовых советов и **выполнения действий** — создания расходов, бюджетов или запроса данных.

```http
POST /ai/chat
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "conversationId": "uuid" (опционально),
  "message": "Сколько я потратил на еду в этом месяце?"
}
```

**Ответ (Запрос)** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "В этом месяце вы потратили 20 550 ₽ на категорию \"Еда и рестораны\", что составляет 68% от вашего бюджета в 30 000 ₽. До конца месяца осталось 9 450 ₽ на 15 дней."
}
```

**Ответ (Требуется действие — Запись)** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "Я хочу добавить расход 20.00 PLN на продукты. Пожалуйста, подтвердите или отмените это действие.",
  "pendingAction": {
    "id": "action-uuid",
    "actionType": "create_expense",
    "data": {
      "amount": 20,
      "currencyCode": "PLN",
      "description": "продукты",
      "categoryName": "Покупки",
      "date": "2026-02-21"
    },
    "displaySummary": "добавить расход 20.00 PLN на \"продукты\" [Покупки]"
  }
}
```

**Ответ (Действие выполнено — Чтение)** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "Вот ваши расходы за прошлую неделю...",
  "actionResult": {
    "actionType": "get_expenses",
    "success": true,
    "data": {
      "expenses": [...],
      "total": 245.50
    }
  }
}
```

**AI функции (14):**
- `create_expense` — Создать расход (требует подтверждения)
- `create_income` — Создать доход (требует подтверждения)
- `create_budget` — Создать бюджет (требует подтверждения)
- `create_category` — Создать категорию расходов/доходов (требует подтверждения)
- `get_expenses` — Запросить расходы; поддерживает необязательный параметр `descriptionKeyword` для семантического поиска по товарам/позициям чека, например «сколько я потратил на пиво» (выполняется немедленно)
- `get_budget_status` — Запросить статус бюджетов (выполняется немедленно)
- `get_category_breakdown` — Запросить расходы по категориям (выполняется немедленно)
- `record_debt_repayment` — Зафиксировать погашение долга (требует подтверждения)
- `create_debt` — Создать запись о долге (я одолжил / мне одолжили) (требует подтверждения)
- `get_debt_summary` — Запросить сводку по активным долгам (выполняется немедленно)
- `update_goal_balance` — Обновить текущий баланс сберегательной цели (требует подтверждения)
- `check_affordability` — «Оракул доступности»: детерминированный вердикт «по карману / не по карману» от движка Safe-to-Spend (выполняется немедленно, без подтверждения)
- `add_to_shopping_list` — Добавить товары в список покупок (выполняется немедленно, без подтверждения)
- `get_inflation_shield` — Запросить рекомендации «что закупить впрок сейчас» и реализованную экономию от движка Inflation Shield (выполняется немедленно, без параметров)

**Определение языка:**
AI автоматически определяет язык пользователя из истории разговора и содержимого сообщения (русский, украинский, белорусский, немецкий, испанский, французский, польский, английский) и отвечает на том же языке.

---

### Подтвердить действие в чате

Подтверждение ожидающего действия записи (create_expense, create_income, create_budget, create_category, create_debt, record_debt_repayment, update_goal_balance). Действия чтения (`get_*`, `check_affordability`) и `add_to_shopping_list` выполняются сразу и не проходят через этот эндпоинт.

```http
POST /ai/chat/confirm
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "conversationId": "uuid",
  "actionId": "action-uuid"
}
```

**Ответ** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "Расход успешно создан: 20.00 PLN на продукты.",
  "actionResult": {
    "actionType": "create_expense",
    "success": true,
    "data": {
      "id": "expense-uuid",
      "amount": 20,
      "currencyCode": "PLN",
      "description": "продукты",
      "category": "Покупки",
      "date": "2026-02-21"
    }
  }
}
```

---

### Отклонить действие в чате

Отклонение ожидающего действия записи.

```http
POST /ai/chat/reject
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "conversationId": "uuid",
  "actionId": "action-uuid",
  "reason": "Передумал" (опционально)
}
```

**Ответ** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "Действие отменено. Я не буду создавать этот расход."
}
```

**Примечание:** `confirm`/`reject` привязаны к пользователю, инициировавшему ожидающее действие — только отправитель, создавший `pendingAction`, может подтвердить или отклонить его, и только в рамках своего аккаунта.

---

### Список разговоров чата

Возвращает закреплённые разговоры вызывающего пользователя (без ограничения по количеству — включены все закреплённые разговоры, независимо от давности), а за ними — до 20 последних по времени обновления незакреплённых разговоров; разговор, уже вошедший в закреплённую группу, повторно не выводится. Обе группы отсортированы по `updatedAt` по убыванию. Привязано к аккаунту: разговор виден, когда `accountId` совпадает с заголовком `X-Account-Id` **И** (`isShared` равно true **ИЛИ** разговор создан вызывающим пользователем).

```http
GET /ai/chat/conversations
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
[
  {
    "id": "conversation-uuid",
    "title": "Расходы на еду в этом месяце",
    "isShared": false,
    "isOwner": true,
    "isPinned": true,
    "createdAt": "2026-05-20T14:00:00Z",
    "updatedAt": "2026-05-20T14:30:00Z"
  }
]
```

---

### Получить сообщения разговора

Возвращает последние 50 сообщений (только роли user + assistant) для разговора. Тот же предикат доступа, что и для списка разговоров.

```http
GET /ai/chat/conversations/:id/messages
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
[
  {
    "id": "message-uuid",
    "role": "user",
    "content": "Сколько я потратил на еду в этом месяце?",
    "senderUserId": "user-uuid",
    "createdAt": "2026-05-20T14:30:00Z"
  },
  {
    "id": "message-uuid",
    "role": "assistant",
    "content": "В этом месяце вы потратили 20 550 ₽ на категорию \"Еда и рестораны\".",
    "createdAt": "2026-05-20T14:30:02Z"
  }
]
```

---

### Опрос разговора

Возвращает сообщения новее метки времени `since` и обновляет маркер присутствия вызывающего пользователя в Redis для разговора (TTL 45с). Используется мобильным клиентом для живого обновления активного общего разговора (опрос каждые ~4с).

```http
GET /ai/chat/conversations/:id/poll?since=2026-05-20T14:30:00Z
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `since` | ISO 8601 | Вернуть только сообщения, созданные после этой метки времени (опционально) |

**Ответ** `200 OK`
```json
{
  "messages": [
    {
      "id": "message-uuid",
      "role": "user",
      "content": "@John можешь проверить это?",
      "senderUserId": "user-uuid",
      "createdAt": "2026-05-20T14:31:00Z"
    }
  ]
}
```

---

### Переключить общий доступ к разговору

Помечает разговор как общий (виден всем участникам аккаунта) или приватный (только для создателя). **Только создатель** — любой участник аккаунта может открыть/закрыть общий доступ к разговору, **который он создал**; эндпоинт проверяет `conversation.userId === вызывающий`, а не роль в аккаунте, поэтому изменить флаг общего доступа к чужому разговору нельзя — даже владельцу (`owner`) аккаунта. Возвращает `403 Forbidden`, если вызывающий не является создателем.

```http
PATCH /ai/chat/conversations/:id/shared
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "isShared": true
}
```

**Ответ** `200 OK`
```json
{
  "id": "conversation-uuid",
  "isShared": true
}
```

---

### Переименовать разговор

Переименовывает разговор. **Только создатель** — проверка в том же порядке, что и для общего доступа: сначала разговор ищется по `{ id, accountId }` — идентификатор разговора из чужого аккаунта вернёт `404 Not Found`, а не `403`, так что существование разговора никогда не раскрывается за пределами аккаунта, — и только затем проверяется `conversation.userId !== вызывающий`, что даёт `403 Forbidden`. При записи `updatedAt` явно устанавливается в текущее значение самого разговора: `@updatedAt` в Prisma автоматически обновляет поле только тогда, когда оно ОТСУТСТВУЕТ в переданных данных, поэтому без этого переименование поднимало бы разговор на верх и списка разговоров, и закреплённого порядка. Без `ViewerBlockGuard`, как и `/shared`.

```http
PATCH /ai/chat/conversations/:id/title
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "title": "Продукты на этой неделе"
}
```

`title` обязателен, не может быть пустым, максимум 100 символов.

**Ответ** `200 OK`
```json
{
  "id": "conversation-uuid",
  "title": "Продукты на этой неделе"
}
```

---

### Удалить разговор

Полностью удаляет разговор — без флага мягкого удаления, без возможности отмены. Тот же предикат и тот же порядок проверки, что и при переименовании: `404`, если разговор не принадлежит аккаунту вызывающего, `403`, если вызывающий не является его создателем. Вместе с разговором удаляются его сообщения и закрепления всех участников на нём (`ChatMessage.conversation` и `ChatConversationPin.conversation` — оба с `onDelete: Cascade`). Удалить разговор, который один из чат-ботов (Telegram/WhatsApp/Slack) всё ещё хранит в своём пользовательском состоянии, безопасно: `chat()` самовосстанавливается при неразрешимом `conversationId`, незаметно начиная новый разговор. Без `ViewerBlockGuard`, как и `/shared`.

```http
DELETE /ai/chat/conversations/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

---

### Закрепить или открепить разговор

Закрепляет или открепляет разговор только для **вызывающего пользователя** — это персональная настройка каждого участника, а не свойство самого разговора. В отличие от переименования, удаления и переключения общего доступа, здесь **нет проверки на создателя**: проверяется видимость для чтения — `accountId` совпадает с заголовком **И** (`isShared` равно true **ИЛИ** разговор создан вызывающим пользователем) — тот же предикат, что использует `GET /ai/chat/conversations`, а не привязанный к создателю поиск `/shared`. Это сделано намеренно: участнику, который читает общий разговор совладельца, тоже нужен способ его закрепить, а использование здесь поиска, привязанного к создателю, позволило бы участнику подтвердить существование — закрепив его — приватного разговора другого участника. Идемпотентно в обе стороны: закрепление уже закреплённого разговора и открепление никогда не закреплённого разговора — оба являются no-op. Без `ViewerBlockGuard`.

```http
PUT /ai/chat/conversations/:id/pin
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "pinned": true
}
```

**Ответ** `200 OK`
```json
{
  "id": "conversation-uuid",
  "isPinned": true
}
```

### Разбор дохода из текста

```http
POST /ai/parse-income
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "text": "сегодня пришла зарплата 5000 zł" }
```

С учётом AI (`parse`, 1.0). Аналог разбора расхода для доходов — сопоставляет с категориями **доходов**.

### Извлечь текст из изображения

```http
POST /ai/extract-text
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "imageBase64": "<base64>" }
```

С учётом AI (`ocr`, 2.0). Простой OCR — возвращает `{ "text": "..." }` без разбора чека.

### Подсказать категорию

```http
GET /ai/suggest-category?description=Uber%20ride
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Сначала ищет в истории аккаунта, затем обращается к модели. **Ответ** `200 OK` — `{ "categoryId", "categoryName", "confidence", "source": "history" | "ai" }`.

### Проверка дубликата чека

```http
GET /ai/receipt-duplicate?fingerprint=<sha>
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Первый этап предупреждения о дубликате чека: сканировали ли и сохраняли ли уже этот самый файл? Клиент отправляет только отпечаток, посчитанный на устройстве. Намеренно **не** учитывается в квоте AI. Второй этап (другой файл с тем же продавцом/суммой/валютой/датой ±1 день) сообщает сам `POST /ai/scan-receipt`. См. `docs/wiki/features/receipt-duplicate-warning.md`.

**Ответ** `200 OK`
```json
{
  "duplicate": {
    "kind": "exact",
    "expenseId": "uuid",
    "clientId": "uuid",
    "merchant": "Lidl",
    "description": null,
    "amount": 84.37,
    "currencyCode": "PLN",
    "date": "2026-09-20"
  }
}
```

`duplicate` равен `null`, если совпадений нет.

### Категоризация расходов / доходов без категории

```http
POST /ai/categorize-uncategorized
POST /ai/categorize-uncategorized-income
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Закрыто для viewer, **только чтение**: предлагает категории для строк аккаунта без категории; клиент применяет проверенный результат через эндпоинты категорий и `PATCH /expenses/bulk` / `PATCH /incomes/bulk`. Правила категорий продавцов применяются первыми, до любого обращения к модели. Вне месячной квоты AI, со своим суточным лимитом на аккаунт (`AI_CATEGORIZE_MAX_PER_DAY`, общий для обоих проходов). См. `docs/wiki/features/categorize-uncategorized.md`.

**Ответ** `200 OK` — `CategorizeSuggestionsResponse` (для доходов — `incomes` вместо `expenses`, `packages/shared-types/src/dto/ai.ts`):
```json
{
  "expenses": [ { "id": "uuid", "clientId": "uuid", "merchant": "Orlen", "description": null, "amount": 250, "currencyCode": "PLN", "date": "2026-09-12" } ],
  "groups": [ { "categoryId": "uuid", "proposedName": null, "expenseIds": ["uuid"] } ],
  "unassigned": [],
  "skippedEncrypted": 0,
  "remainingToday": 4,
  "limitReached": false
}
```

Группа с `categoryId: null` содержит `proposedName` для ещё не существующей категории.

### Цели накоплений

Всё под JWT + контекстом аккаунта. Типы: `packages/shared-types/src/dto/goal.ts`.

```http
POST /ai/goals
Content-Type: application/json

{ "name": "Отпуск", "targetAmount": 5000, "currencyCode": "EUR", "deadline": "2027-06-01" }
```
Закрыто для viewer, с учётом AI (`goal_plan`, 2.0). Создаёт цель и AI-план накоплений. **Ответ** — `{ "goal": SavingsGoal, "plan": GoalPlan }`.

```http
GET /ai/goals
GET /ai/goals/:id
GET /ai/goals/:id/progress
```
`progress` возвращает `{ "goal", "percentComplete", "onTrack", "projectedCompletionDate", "monthlyNeeded", "behindByAmount" }`.

```http
PATCH /ai/goals/:id
Content-Type: application/json

{ "currentAmount": 1200 }
```
Закрыто для viewer. Любые из `name`, `targetAmount`, `deadline`, `currentAmount`, `status`. Рост `currentAmount` записывается ещё и как взнос; достижение `targetAmount` завершает цель.

```http
DELETE /ai/goals/:id
GET /ai/goals/:id/contributions
POST /ai/goals/:id/regenerate-plan
```
`DELETE` закрыт для viewer. `contributions` возвращает последние 20 взносов, от новых к старым. `regenerate-plan` закрыт для viewer и учитывается в квоте AI (`goal_plan`, 2.0).

---

## Аналитика

Все эндпоинты аналитики требуют заголовок `X-Account-Id`.

### Сводка по расходам

```http
GET /analytics/summary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `startDate` | ISO 8601 | Начало периода (обязательно) |
| `endDate` | ISO 8601 | Конец периода (обязательно) |

**Ответ** `200 OK`
```json
{
  "period": {
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-31T23:59:59Z"
  },
  "totalExpenses": 125045.50,
  "totalIncome": 200000.00,
  "netSavings": 74954.50,
  "expenseCount": 47,
  "averageExpense": 2660.54,
  "categoryBreakdown": [
    {
      "categoryId": "uuid",
      "categoryName": "Еда и рестораны",
      "amount": 31538.00,
      "percentage": 25.2,
      "count": 15
    }
  ],
  "topExpenses": [
    {
      "id": "uuid",
      "description": "Аренда квартиры",
      "amount": 50000.00,
      "date": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Тренды расходов

```http
GET /analytics/trends
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `startDate` | ISO 8601 | Начало периода (обязательно) |
| `endDate` | ISO 8601 | Конец периода (обязательно) |
| `groupBy` | string | `day`, `week`, `month` (по умолч.: week) |

**Ответ** `200 OK`
```json
{
  "trends": [
    {
      "period": "2024-01-01",
      "total": 26264.58,
      "count": 12
    }
  ],
  "comparison": {
    "previousPeriod": 107738.00,
    "currentPeriod": 125045.50,
    "change": 17307.50,
    "changePercentage": 16.3
  },
  "monthlyAverage": 116391.75
}
```

### Разбивка по тегам

```http
GET /analytics/by-tag?startDate=2026-09-01&endDate=2026-09-30
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `startDate` | ISO 8601 | Начало периода (обязательно) |
| `endDate` | ISO 8601 | Конец периода (обязательно) |

**Ответ** `200 OK` — простой массив, отсортированный по `amount` по убыванию:
```json
[
  {
    "tagId": "uuid",
    "tagName": "командировка",
    "color": "#3498DB",
    "amount": 75000.00,
    "count": 8,
    "percentage": 35.2
  }
]
```

Для полностью зашифрованного (tier-2) аккаунта ответ вместо этого — `{ "encryptionRestricted": true, "data": [] }`.

### Разбивка по проектам

```http
GET /analytics/by-project
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Без параметров запроса — суммы охватывают всё время жизни каждого проекта.

**Ответ** `200 OK` — простой массив (или `{ "encryptionRestricted": true, "data": [] }` для tier-2 аккаунта):
```json
[
  {
    "projectId": "uuid",
    "projectName": "Ремонт кухни",
    "color": "#E67E22",
    "totalExpenses": 192000.00,
    "totalIncome": 0,
    "expenseCount": 8,
    "budget": 300000.00,
    "isArchived": false
  }
]
```

### Разбивка по позициям чеков

```http
GET /analytics/items?startDate=2026-09-01&endDate=2026-09-30
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Топ-50 позиций чеков за период по сумме трат, сгруппированных по описанию.

**Ответ** `200 OK`
```json
[
  { "description": "Молоко 2%", "totalSpent": 42.60, "count": 12, "avgPrice": 3.55 }
]
```

### Сводка по всем аккаунтам

```http
GET /analytics/aggregated?startDate=2026-09-01&endDate=2026-09-30
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Сводка по **всем** аккаунтам, в которых состоит пользователь (кроме tier-2 зашифрованных), а не только по аккаунту из `X-Account-Id`.

**Ответ** `200 OK`
```json
{
  "period": { "start": "2026-09-01T00:00:00.000Z", "end": "2026-09-30T00:00:00.000Z" },
  "totalIncome": 5200,
  "totalExpenses": 3100,
  "netSavings": 2100,
  "expensesByCategory": [],
  "topExpenses": [],
  "trends": { "vsLastPeriod": 0, "vsAverage": 0 },
  "accountCount": 3
}
```

### Детализация экономии (скидки / залоги)

```http
GET /analytics/savings-detail?kind=discount&startDate=2026-01-01&endDate=2026-09-30
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Источник для нажимаемых строк «Экономия на скидках» / «Оплаченные залоги» во вкладке аналитики — те же колонки `Expense.discountAmount` / `Expense.depositAmount`, что читают чат-инструменты `get_discount_total` / `get_deposit_total`. `kind` обязателен (`discount` или `deposit`, иначе `400`); `startDate` по умолчанию — за всё время, `endDate` — сегодня. Суммы переводятся в `user.currencyCode`; строка без курса исключается из `total` и помечается. Подробности: `docs/wiki/features/deposit-and-discount-totals.md`.

**Ответ** `200 OK` — `SavingsSummaryResponse` (`packages/shared-types/src/dto/analytics.ts`):
```json
{
  "kind": "discount",
  "encryptionRestricted": false,
  "total": 184.20,
  "receiptCount": 37,
  "byMerchant": [ { "merchant": "Biedronka", "amount": 96.10, "receiptCount": 21 } ],
  "recent": [ { "date": "2026-09-26", "merchant": "Lidl", "amount": 4.50, "expenseId": "uuid" } ],
  "totalsByCurrency": { "PLN": 184.20 },
  "baseCurrency": "PLN",
  "fxConverted": false,
  "fxApproximate": false
}
```

---

## Импорт

Массовое создание транзакций из выписки Wise в формате CSV. Оба эндпоинта требуют заголовок `X-Account-Id`.

### Предпросмотр загрузки CSV Wise

```http
POST /import/wise/preview
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: multipart/form-data

file=<wise-statement.csv>
```

Максимальный размер файла: 5 МБ. Парсится через `papaparse`, удаляется BOM, каждая строка классифицируется как `expense` / `income` / `fx`, строки конвертации валют объединяются в пары по совпадению `Payment Reference + Date + противоположный знак`, комиссия `Total fees` сворачивается в абсолютную сумму, и выполняется дедупликация путём проверки `externalRef = 'wise:<TransferWise ID>'` по существующим строкам `Expense`/`Income`/`CurrencyExchange` в аккаунте.

**Ответ** `200 OK`
```json
{
  "totalRows": 124,
  "importable": 118,
  "skipped": 6,
  "rows": [
    {
      "idx": 0,
      "kind": "expense",
      "date": "2024-10-19",
      "amount": 22.19,
      "currencyCode": "EUR",
      "description": "Reserved.com Gdansk",
      "merchant": "Reserved.com Gdansk",
      "externalRef": "wise:5478821093",
      "suggestedCategoryName": null,
      "alreadyImported": false
    },
    {
      "idx": 7,
      "kind": "fx",
      "date": "2024-10-15",
      "amount": 120.00,
      "currencyCode": "USD",
      "description": "Currency exchange",
      "externalRef": "wise:5478811010+5478811011",
      "alreadyImported": false,
      "fxFromCurrency": "USD",
      "fxFromAmount": 120.00,
      "fxToCurrency": "EUR",
      "fxToAmount": 109.50,
      "fxRate": 0.9125
    }
  ]
}
```

### Подтверждение выбранных строк

```http
POST /import/wise/commit
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "rows": [ /* WiseImportRow[] — только строки, которые оставил пользователь */ ]
}
```

Все вставки оборачиваются в одну `prisma.$transaction`. Строки с `alreadyImported: true` отбрасываются на сервере. Каждая созданная запись получает `source: 'import'` (на `Expense`) и `externalRef`. Нарушения уникальности ключа (`P2002`) проглатываются для каждой строки.

**Ответ** `200 OK`
```json
{
  "createdExpenses": 96,
  "createdIncomes": 19,
  "createdExchanges": 3
}
```

---

## Импорт из банка

Массовое создание транзакций из банковской выписки (CSV или PDF). Все эндпоинты требуют `X-Account-Id` и защищены `JwtAuthGuard + AccountContextGuard`.

Поддерживаемые банки: `mbank`, `pko`, `ing`, `millennium`, `pekao`, `erste` (PDF), `alior` (PDF), а также универсальный резервный вариант с маппингом колонок `universal`. Кодировка CSV (UTF-8 / Windows-1250) определяется автоматически. PDF-выписки (определяются по заголовку `%PDF`) пропускают обработку заголовков/маппинга/отпечатка CSV, и их текст извлекается перед парсингом.

### Предпросмотр загрузки банковской выписки

```http
POST /import/bank/preview?bankId=mbank&mappingId=<uuid>&encoding=auto
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: multipart/form-data

file=<statement.csv | statement.pdf>
```

Максимальный размер файла: 5 МБ. Парсер выбирается в следующем порядке: `mappingId` → `bankId` → сохранённый отпечаток заголовка → автоопределение. FX-строки (одна дата, противоположный знак, разная валюта) объединяются в одну строку `fx`. Каждая строка получает детерминированный `externalRef` (`bank:<bankId>:<isoDate>:<signedAmountCents>:<sha256(normalizedDesc).slice(0,8)>`). Выполняются два слоя дедупликации: (1) точное совпадение `externalRef` (повторный импорт того же файла); (2) совпадение по содержимому `(date, signedAmountCents, currency)` со всеми Expense/Income аккаунта независимо от источника. Совпавшие строки возвращаются с `alreadyImported: true` (автоматически снимаются в интерфейсе).

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `bankId` | string | Принудительно использовать конкретный парсер банка (опционально) |
| `mappingId` | string | Применить сохранённый маппинг колонок (опционально) |
| `encoding` | string | `auto`, `utf-8` или `windows-1250` (опционально) |

**Поля тела (multipart)**
| Поле | Тип | Описание |
|------|-----|----------|
| `file` | file | Файл выписки (CSV или PDF) |
| `mapping` | string | Встроенный JSON `ColumnMapping` для универсального парсера (опционально) |
| `delimiter` | string | Переопределение разделителя CSV (опционально) |
| `amountFormat` | string | `polish` или `standard` (опционально) |
| `dateFormat` | string | `auto`, `DD.MM.YYYY`, `DD-MM-YYYY` или `YYYY-MM-DD` (опционально) |

**Ответ** `200 OK`
```json
{
  "status": "parsed",
  "detectedBankId": "mbank",
  "totalRows": 124,
  "importable": 118,
  "skipped": 6,
  "parseErrors": 0,
  "headerFingerprint": "a1b2c3d4",
  "rows": [
    {
      "idx": 0,
      "kind": "expense",
      "date": "2024-10-19",
      "amount": 22.19,
      "currencyCode": "PLN",
      "description": "Biedronka Gdansk",
      "merchant": "Biedronka",
      "externalRef": "bank:mbank:2024-10-19:-2219:9f8a2b1c",
      "suggestedCategoryName": "Продукты",
      "alreadyImported": false
    }
  ]
}
```

### Подтверждение выбранных строк

```http
POST /import/bank/commit
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "rows": [ /* ImportRow[] — только строки, которые оставил пользователь */ ],
  "bankId": "mbank",
  "headerFingerprint": "a1b2c3d4",
  "saveMapping": { "name": "Моя выписка mBank" }
}
```

Все вставки записываются в одну `prisma.$transaction` с `source: 'import'` и детерминированным `externalRef`. Строки с `alreadyImported: true` отбрасываются на сервере; нарушения уникальности ключа подсчитываются как `skippedDuplicates`. В той же транзакции создаётся `ImportBatch`, чтобы импорт можно было откатить позже (см. **Партии импорта**). Опциональное поле `saveMapping` сохраняет маппинг колонок (по ключу `headerFingerprint`) для автоматического применения при будущих импортах.

**Ответ** `200 OK`
```json
{
  "createdExpenses": 96,
  "createdIncomes": 19,
  "createdExchanges": 3,
  "skippedDuplicates": 6,
  "parseErrors": 0,
  "savedMappingId": "mapping-uuid",
  "batchId": "batch-uuid"
}
```

### Список сохранённых маппингов

```http
GET /import/bank/mappings
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Возвращает сохранённые маппинги колонок аккаунта (один на `headerFingerprint`).

### Создать сохранённый маппинг

```http
POST /import/bank/mappings
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "Моя банковская выписка",
  "headerFingerprint": "a1b2c3d4",
  "bankId": "universal",
  "mapping": { "date": "Data", "amount": "Kwota", "description": "Opis" },
  "delimiter": ";",
  "encoding": "windows-1250",
  "amountFormat": "polish",
  "dateFormat": "DD.MM.YYYY"
}
```

**Ответ** `201 Created` — сохранённый маппинг.

### Удалить сохранённый маппинг

```http
DELETE /import/bank/mappings/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

### Запросить новый банк

Пересылает запрос на поддержку банка (название, опциональные заметки, опциональная пример-выписка) в **операционный чат Telegram** — никогда не запрашивающему пользователю.

```http
POST /import/bank/request-bank
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: multipart/form-data

file=<example-statement.csv | example-statement.pdf>   (опционально)
bankName=Revolut
notes=CSV-экспорт из мобильного приложения
```

Максимальный размер файла: 5 МБ.

**Ответ** `200 OK`
```json
{ "ok": true }
```

### Дать согласие на AI-импорт

```http
POST /import/bank/ai-consent
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Закрыто для viewer, ограничение 20 запросов/мин. Записывает однократное согласие аккаунта на отправку фрагментов выписки AI-провайдеру, когда ни один банковский парсер не распознал файл. Предпросмотр согласие не выдаёт: поток такой — предпросмотр → `needs_ai_consent` → пользователь соглашается → этот вызов → снова предпросмотр. См. `docs/wiki/features/ai-statement-import.md`.

---

## Партии импорта

Отслеживает подтверждённые импорты (Wise + банк), чтобы их можно было откатить. Все эндпоинты требуют `X-Account-Id` и защищены `JwtAuthGuard + AccountContextGuard`.

### Список партий импорта

Возвращает последние 20 партий импорта аккаунта. `canRollback` равно `true`, когда партия всё ещё в статусе `committed` и находится в пределах 30-дневного окна отката.

```http
GET /import/batches
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "batches": [
    {
      "id": "batch-uuid",
      "source": "bank",
      "importedAt": "2026-05-20T14:00:00Z",
      "rowCount": 118,
      "status": "committed",
      "canRollback": true
    }
  ]
}
```

### Откатить партию импорта

Мягко удаляет (`isDeleted: true`) каждую транзакцию, созданную партией, и очищает их `externalRef`, чтобы тот же файл можно было повторно импортировать без проблем, затем помечает партию как `rolled_back`.

```http
DELETE /import/batches/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{ "rolledBack": 118 }
```

**Ошибки:**
- `404 Not Found` — Партия не найдена в этом аккаунте
- `403 Forbidden` — Уже откачена или истекло 30-дневное окно отката

---

## WhatsApp

WhatsApp-бот работает на Meta Business Cloud API. Эндпоинты webhook **исключены из префикса `/api/v1`** — их полный путь `/whatsapp/webhook` (без префикса версии). Они не защищены JWT; вместо этого входящие события проверяются HMAC-подписью.

### Верификация webhook (рукопожатие)

Meta отправляет GET-рукопожатие при регистрации webhook. Эндпоинт отвечает значением `hub.challenge` только когда `hub.mode=subscribe` и `hub.verify_token` совпадает с настроенным `WHATSAPP_VERIFY_TOKEN`.

```http
GET /whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<challenge>
```

**Ответ** `200 OK` — текстовое значение `hub.challenge` (или `403 Forbidden` при несовпадении).

### Входящее событие webhook

Принимает события сообщений WhatsApp. Тело запроса проверяется подписью HMAC-SHA256 (заголовок `X-Hub-Signature-256`), вычисленной по сырому телу запроса с использованием `WHATSAPP_APP_SECRET`. При корректной подписи эндпоинт немедленно отвечает `200` и обрабатывает обновление асинхронно (Meta повторяет запрос при любом ответе, отличном от 200).

```http
POST /whatsapp/webhook
X-Hub-Signature-256: sha256=<hmac>
Content-Type: application/json

{ /* полезная нагрузка webhook WhatsApp от Meta */ }
```

**Ответ** `200 OK` (пустой) при успехе, `401 Unauthorized` при недействительной/отсутствующей подписи.

### Сгенерировать код привязки WhatsApp

Защищён JWT (также требует `X-Account-Id`). Генерирует 6-значный шестнадцатеричный код привязки, который пользователь отправляет боту через `wa.me` deep-link, чтобы подключить свой номер WhatsApp.

```http
POST /users/me/whatsapp-link-code
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "code": "a1b2c3",
  "expiresAt": "2026-05-20T14:10:00Z",
  "waPhoneNumber": "+15551234567"
}
```

### Получить статус привязки WhatsApp

```http
GET /users/me/whatsapp-link
Authorization: Bearer <token>
```

**Ответ** `200 OK`
```json
{
  "linked": true,
  "waPhoneNumber": "+15559876543",
  "waProfileName": "John Doe",
  "linkedAt": "2026-05-19T10:00:00Z"
}
```

Возвращает `{ "linked": false }`, когда номер WhatsApp не привязан.

### Отвязать WhatsApp

```http
DELETE /users/me/whatsapp-link
Authorization: Bearer <token>
```

**Ответ** `200 OK`
```json
{ "success": true }
```

## Боты Telegram и Slack

Оба бота устроены как WhatsApp выше: неаутентифицированный вебхук, проверяемый секретом, и защищённые JWT эндпоинты привязки в `/users/me`. Подробности о ботах: `docs/wiki/telegram-bot.md`, `docs/wiki/slack-bot.md`.

### Вебхук Telegram

```http
POST /telegram/webhook
X-Telegram-Bot-Api-Secret-Token: <secret>
```

Без префикса `/api/v1`. `403`, если заголовок-секрет не совпадает; иначе апдейт обрабатывается и возвращается `200`.

### Привязка Telegram

```http
POST /users/me/telegram-link-code      (JWT + X-Account-Id)
GET /users/me/telegram-link            (JWT)
DELETE /users/me/telegram-link         (JWT)
```

`POST` возвращает `{ "code", "expiresAt", "botUsername" }` — пользователь отправляет боту `/link <code>`; привязка связывается с аккаунтом из `X-Account-Id`. `GET` возвращает `{ "linked": true, "telegramUsername", "linkedAt" }` или `{ "linked": false }`. `DELETE` возвращает `{ "success": true }`.

### События и интерактивность Slack

```http
POST /slack/events
POST /slack/interactivity
X-Slack-Signature: v0=<hmac>
X-Slack-Request-Timestamp: <unix>
```

Без префикса `/api/v1`. Проверяются по схеме HMAC `v0=` над сырым телом с `SLACK_SIGNING_SECRET` (`401` при неудаче); `url_verification` возвращает challenge. `interactivity` приходит в form-encoded виде (нажатия кнопок).

### Установка Slack (OAuth для нескольких workspace)

```http
GET /slack/install
GET /slack/oauth/callback?code=...&state=...
```

Без префикса `/api/v1`, публичные. `install` сохраняет одноразовый state в Redis (10 мин) и перенаправляет на страницу авторизации Slack (страница `503`, если OAuth не настроен); `callback` проверяет state, обменивает code и сохраняет зашифрованную установку, отдавая HTML-страницу с результатом.

### Привязка Slack

```http
POST /users/me/slack-link-code         (JWT + X-Account-Id)
GET /users/me/slack-link               (JWT)
DELETE /users/me/slack-link            (JWT)
```

`POST` возвращает `{ "code", "expiresAt" }`; `GET` — `{ "linked": true, "slackProfileName", "linkedAt" }` или `{ "linked": false }`.

---

## Синхронизация

Все эндпоинты синхронизации требуют заголовок `X-Account-Id`.

### Отправка изменений

```http
POST /sync/push
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "changes": [
    {
      "entityType": "expense",
      "operation": "create",
      "clientId": "client-uuid",
      "data": {
        "categoryId": "uuid",
        "amount": 150.00,
        "description": "Кофе",
        "date": "2024-01-15T10:00:00Z"
      },
      "clientVersion": 1
    },
    {
      "entityType": "expense",
      "operation": "update",
      "serverId": "server-uuid",
      "data": {
        "amount": 200.00
      },
      "clientVersion": 2
    },
    {
      "entityType": "expense",
      "operation": "delete",
      "serverId": "server-uuid",
      "clientVersion": 3
    }
  ]
}
```

**Ответ** `200 OK`
```json
{
  "processed": [
    {
      "clientId": "client-uuid",
      "serverId": "new-server-uuid",
      "serverVersion": 1,
      "status": "created"
    }
  ],
  "conflicts": [
    {
      "serverId": "server-uuid",
      "clientVersion": 2,
      "serverVersion": 4,
      "serverData": { },
      "resolution": "server_wins"
    }
  ],
  "serverTime": "2024-01-15T10:30:00Z"
}
```

### Получение изменений

```http
GET /sync/pull
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `since` | ISO 8601 | Время последней синхронизации |

**Ответ** `200 OK`
```json
{
  "expenses": [
    {
      "id": "uuid",
      "clientId": "client-uuid",
      "operation": "upsert",
      "data": { },
      "syncVersion": 2,
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "categories": [],
  "budgets": [],
  "deletedIds": {
    "expenses": ["uuid1", "uuid2"],
    "categories": [],
    "budgets": ["uuid3"]
  },
  "serverTime": "2024-01-15T10:30:00Z"
}
```

---

## Геймификация

Все эндпоинты геймификации требуют заголовок `X-Account-Id`.

### Получить профиль геймификации

```http
GET /gamification/profile
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "totalXp": 85,
  "level": 1,
  "levelProgress": 85,
  "currentStreak": 3,
  "longestStreak": 5,
  "achievements": [
    {
      "id": "uuid",
      "achievementId": "first_expense",
      "progress": 100,
      "isCompleted": true,
      "unlockedAt": "2026-02-10T12:00:00Z"
    }
  ],
  "recentBadges": [
    {
      "id": "uuid",
      "achievementId": "first_expense",
      "progress": 100,
      "isCompleted": true,
      "unlockedAt": "2026-02-10T12:00:00Z"
    }
  ]
}
```

### Проверить достижения

Проверяет все правила достижений, обновляет серию и возвращает новые разблокированные значки.

```http
POST /gamification/check
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "newAchievements": ["first_expense", "streak_3"],
  "updatedProgress": [
    { "achievementId": "expenses_10", "progress": 30 }
  ],
  "streak": {
    "currentStreak": 3,
    "longestStreak": 5
  },
  "totalXp": 85,
  "level": 1
}
```

**Примечание:** Проверка достижений также запускается автоматически (fire-and-forget) при создании расходов, доходов или бюджетов.

### Получить определения достижений

Возвращает все доступные определения достижений. Аутентификация не требуется.

```http
GET /gamification/definitions
```

**Ответ** `200 OK`
```json
[
  {
    "id": "first_expense",
    "i18nKey": "firstExpense",
    "category": "milestone",
    "icon": "🌟",
    "rarity": "common",
    "threshold": 1,
    "xpReward": 10
  }
]
```

**Категории достижений:** `budget`, `tracking`, `streak`, `milestone`, `savings`

**Уровни редкости:** `common` (обычный), `rare` (редкий), `epic` (эпический), `legendary` (легендарный)

**Система XP:** 100 XP за уровень. XP за достижения — от 10 (обычное) до 500 (легендарное).

---

## Инвестиции

Отслеживание инвестиционного портфеля с актуальными ценами через Twelve Data API. Требуется заголовок `X-Account-Id`. Требуется аккаунт типа **investment** (`type: 'investment'`).

### Поиск активов

```http
GET /investments/assets/search?q=AAPL
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `q` | string | Поисковый запрос (символ или название компании) |

**Ответ** `200 OK`
```json
[
  {
    "symbol": "AAPL",
    "name": "Apple Inc",
    "type": "stock",
    "exchange": "NASDAQ",
    "currency": "USD"
  },
  {
    "symbol": "AAPL.MX",
    "name": "Apple Inc",
    "type": "stock",
    "exchange": "BMV",
    "currency": "MXN"
  }
]
```

### Список позиций

```http
GET /investments/holdings
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
[
  {
    "id": "uuid",
    "localId": "client-uuid",
    "accountId": "account-uuid",
    "assetId": "asset-uuid",
    "asset": {
      "id": "asset-uuid",
      "symbol": "AAPL",
      "name": "Apple Inc",
      "type": "stock",
      "exchange": "NASDAQ",
      "currentPrice": 178.50,
      "priceCurrency": "USD",
      "lastPriceUpdate": "2026-02-14T16:00:00Z"
    },
    "quantity": 10,
    "averageCostBasis": 165.25,
    "totalInvested": 1652.50,
    "notes": "Долгосрочная позиция",
    "syncVersion": 1,
    "createdAt": "2026-01-15T10:00:00Z"
  }
]
```

### Создать позицию

```http
POST /investments/holdings
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "localId": "client-generated-uuid",
  "assetSymbol": "AAPL",
  "assetName": "Apple Inc",
  "assetType": "stock",
  "assetExchange": "NASDAQ",
  "assetCurrency": "USD",
  "notes": "Долгосрочная позиция"
}
```

**Значения assetType**: `stock` (акции), `crypto` (криптовалюта), `etf` (фонд), `bond` (облигации), `commodity` (товар)

**Ответ** `201 Created`
```json
{
  "id": "uuid",
  "localId": "client-uuid",
  "assetId": "asset-uuid",
  "asset": {
    "symbol": "AAPL",
    "name": "Apple Inc",
    "type": "stock",
    "currentPrice": 178.50
  },
  "quantity": 0,
  "averageCostBasis": 0,
  "totalInvested": 0,
  "syncVersion": 1
}
```

### Удалить позицию

```http
DELETE /investments/holdings/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

**Примечание:** При удалении позиции также удаляются все связанные транзакции.

### Список транзакций

```http
GET /investments/transactions?holdingId=uuid
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `holdingId` | UUID | Фильтр по позиции (опционально) |

**Ответ** `200 OK`
```json
[
  {
    "id": "uuid",
    "localId": "client-uuid",
    "holdingId": "holding-uuid",
    "type": "buy",
    "quantity": 10,
    "pricePerUnit": 165.25,
    "totalAmount": 1652.50,
    "fee": 0,
    "date": "2026-01-15",
    "notes": "Первая покупка",
    "syncVersion": 1,
    "createdAt": "2026-01-15T10:00:00Z"
  }
]
```

### Создать транзакцию

```http
POST /investments/transactions
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "localId": "client-generated-uuid",
  "holdingId": "holding-uuid",
  "type": "buy",
  "quantity": 10,
  "pricePerUnit": 165.25,
  "fee": 0,
  "date": "2026-01-15",
  "notes": "Первая покупка"
}
```

**Значения type**: `buy` (покупка), `sell` (продажа)

**Ответ** `201 Created`

**Примечание:** При создании транзакции автоматически обновляются поля `quantity`, `averageCostBasis` и `totalInvested` позиции.

### Обновить транзакцию

```http
PATCH /investments/transactions/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "quantity": 15,
  "pricePerUnit": 164.00,
  "notes": "Скорректированная покупка"
}
```

**Ответ** `200 OK`

### Удалить транзакцию

```http
DELETE /investments/transactions/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

### Получить сводку по портфелю

Возвращает агрегированные метрики портфеля с текущими рыночными ценами.

```http
GET /investments/summary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "totalValue": 5325.00,
  "totalInvested": 4980.00,
  "totalPnL": 345.00,
  "totalPnLPercent": 6.93,
  "dayChange": 52.50,
  "dayChangePercent": 0.99,
  "holdings": [
    {
      "holdingId": "uuid",
      "assetId": "asset-uuid",
      "symbol": "AAPL",
      "name": "Apple Inc",
      "assetType": "stock",
      "quantity": 10,
      "averageCostBasis": 165.25,
      "currentPrice": 178.50,
      "marketValue": 1785.00,
      "totalInvested": 1652.50,
      "pnl": 132.50,
      "pnlPercent": 8.02,
      "dayChange": 15.00,
      "dayChangePercent": 0.85,
      "allocationPercent": 33.52
    }
  ]
}
```

### Получить аналитику портфеля

Возвращает исторические данные о производительности с опциональным сравнением с бенчмарком.

```http
POST /investments/analytics
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "period": "month",
  "benchmark": "SPY"
}
```

**Параметры тела**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `period` | string | `week`, `month`, `quarter`, `year`, `all` |
| `benchmark` | string | Символ бенчмарка (опционально): `SPY`, `QQQ`, `DIA`, `IWM` |

**Ответ** `200 OK`
```json
{
  "dates": ["2026-01-15", "2026-01-16", "2026-01-17"],
  "values": [4980.00, 5050.00, 5325.00],
  "investedValues": [4980.00, 4980.00, 4980.00],
  "benchmarkValues": [0, 0.45, 1.23],
  "benchmarkName": "SPY"
}
```

**Расчёт доходности:**
```
Доходность % = ((Конечная стоимость - Начальная стоимость) / Начальная стоимость) × 100
```

**Значения бенчмарка:** Нормализованные проценты относительно первого дня (benchmarkValues[0] = 0, последующие значения = накопленное изменение в %).

### Получить историю цен актива

```http
GET /investments/holdings/:id/price-history?days=30
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `days` | number | Количество дней (по умолчанию: 30) |

**Ответ** `200 OK`
```json
[
  {
    "date": "2026-01-15",
    "openPrice": 175.50,
    "closePrice": 178.50,
    "highPrice": 179.20,
    "lowPrice": 174.80,
    "volume": 45230000
  }
]
```

### Обновить цены

Принудительно обновить цены для всех позиций в портфеле.

```http
POST /investments/refresh-prices
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "refreshed": 5,
  "failed": 0,
  "message": "Цены успешно обновлены"
}
```

**Примечание:** Цены автоматически обновляются каждые 15 минут для активных портфелей. Используйте этот эндпоинт для принудительного немедленного обновления.

### ИИ-инсайты портфеля

Получение сгенерированных ИИ инсайтов для анализа инвестиционного портфеля. Доступно на всех тарифах подписки. Использует AI-запросы из ежемесячного лимита.

```http
GET /investments/insights?language=ru
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| language | string | Код языка (en, ru, ua, de, es, fr, pl, be) |

**Ответ** `200 OK`
```json
{
  "insights": [
    {
      "id": "uuid",
      "insightType": "concentration_risk",
      "title": "Высокая концентрация в AAPL",
      "description": "Apple Inc составляет 45% вашего портфеля, что превышает рекомендуемый порог в 25% для концентрации в одном активе.",
      "severity": "warning",
      "chartConfig": {
        "chartType": "donut",
        "title": "Распределение портфеля",
        "data": [
          { "label": "AAPL", "value": 45, "color": "#FF6B6B" },
          { "label": "GOOGL", "value": 30 },
          { "label": "Прочие", "value": 25 }
        ]
      },
      "actionSuggestion": "Рассмотрите диверсификацию, уменьшив долю AAPL до менее 25% от стоимости портфеля.",
      "generatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "generatedAt": "2024-01-15T10:30:00Z",
  "portfolioSnapshotAt": "2024-01-15T10:30:00Z"
}
```

**Типы инсайтов:**
| Тип | Описание | Триггеры серьёзности |
|-----|----------|---------------------|
| `concentration_risk` | Один актив доминирует в портфеле | Критический: >40%, Предупреждение: >25% |
| `sector_imbalance` | Портфель сильно смещён в один тип активов | Критический: >70%, Предупреждение: >50% |
| `underperformer` | Актив значительно отстаёт от бенчмарка | Критический: <-30%, Предупреждение: <-15% |
| `overperformer` | Актив значительно опережает бенчмарк | Инфо: >+20% |
| `benchmark_deviation` | Портфель отклоняется от бенчмарка | Критический: >25%, Предупреждение: >15% |
| `diversification_gap` | Отсутствуют типы активов | Критический: <2 типов, Предупреждение: <3 типов |
| `cost_basis_alert` | Высокие нереализованные прибыли/убытки | Критический: >50% или <-30% |
| `fee_impact` | Комиссии съедают доходность | Критический: >5%, Предупреждение: >2% |

**Примечания:**
- Инсайты кэшируются на 24 часа
- Стоимость: 2.5 ИИ-кредита за запрос
- Доступно на всех тарифах подписки

---

## Отчёты

Все эндпоинты отчётов требуют JWT аутентификацию и заголовок `X-Account-Id`.

### Сгенерировать отчёт

```http
POST /reports/generate
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "format": "pdf",
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "categoryIds": ["category-uuid-1", "category-uuid-2"],
  "tagIds": ["tag-uuid-1"],
  "projectIds": ["project-uuid-1"],
  "currencyCode": "USD",
  "includeExpenses": true,
  "includeIncomes": true
}
```

**Значения format**: `csv`, `pdf`, `excel`

**Ответ** `201 Created`
```json
{
  "reportId": "uuid",
  "status": "completed",
  "downloadUrl": "/reports/uuid/download",
  "fileName": "report-2025-01-01-2025-01-31.pdf",
  "fileSize": 102400
}
```

**Примечания:**
- Все форматы (CSV, PDF, Excel) доступны на всех тарифах подписки
- Аккаунты с `encryptionTier >= 2` получат ответ `403 Forbidden`
- `categoryIds`, `tagIds`, `projectIds`, `currencyCode`, `includeExpenses` и `includeIncomes` — опциональные фильтры

### Список отчётов

```http
GET /reports
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "reports": [
    {
      "id": "uuid",
      "format": "pdf",
      "status": "completed",
      "fileName": "report-2025-01-01-2025-01-31.pdf",
      "fileSize": 102400,
      "createdAt": "2025-02-01T08:00:00Z",
      "expiresAt": "2025-02-08T08:00:00Z"
    }
  ]
}
```

**Примечания:**
- Возвращает последние 20 отчётов
- Отчёты истекают через 7 дней

### Скачать отчёт

```http
GET /reports/:id/download
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK` — Бинарный файл

`Content-Type` зависит от формата:
| Формат | Content-Type |
|--------|-------------|
| `csv` | `text/csv` |
| `pdf` | `application/pdf` |
| `excel` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |

Ответ включает заголовок `Content-Disposition: attachment; filename="<fileName>"`.

### Ежемесячный дайджест

```http
GET /reports/monthly-digest?month=2025-01
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "digest": {
    "periodLabel": "Январь 2025",
    "totalIncome": 200000.00,
    "totalExpenses": 128000.00,
    "savingsRate": 36.0,
    "topCategories": [
      {
        "categoryId": "uuid",
        "name": "Продукты",
        "amount": 34000.00,
        "percentage": 26.56
      },
      {
        "categoryId": "uuid",
        "name": "Аренда",
        "amount": 48000.00,
        "percentage": 37.50
      }
    ],
    "incomeChange": 5.2,
    "expenseChange": -3.1
  },
  "generatedAt": "2025-02-01T08:00:00Z"
}
```

**Примечания:**
- Доступно на всех тарифах подписки
- Результаты кэшируются на 7 дней

### Получить настройки отчётов

```http
GET /reports/preferences
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "weeklyEmailEnabled": false,
  "weeklyEmailDay": 1,
  "monthlyDigestEnabled": true
}
```

### Обновить настройки отчётов

```http
PATCH /reports/preferences
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "weeklyEmailEnabled": true,
  "weeklyEmailDay": 1,
  "monthlyDigestEnabled": true
}
```

**Ответ** `200 OK`
```json
{
  "weeklyEmailEnabled": true,
  "weeklyEmailDay": 1,
  "monthlyDigestEnabled": true
}
```

**Примечания:**
- `weeklyEmailDay` принимает значения `0` (воскресенье) — `6` (суббота)
- `weeklyEmailEnabled` доступно на всех тарифах подписки
- `monthlyDigestEnabled` доступно на всех тарифах подписки

### Удалить отчёт

```http
DELETE /reports/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Отправить еженедельный отчёт сейчас

```http
POST /reports/trigger-weekly
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Немедленно запускает еженедельный отчёт по e-mail для пользователя. **Ответ** `200 OK` — `{ "success": true }`.

---

## Резервное копирование

Все эндпоинты резервного копирования требуют JWT аутентификацию и заголовок `X-Account-Id`.

### Экспорт резервной копии

```http
POST /backups/export
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK` — JSON-файл резервной копии со всеми данными аккаунта.
```json
{
  "version": "1.0",
  "exportedAt": "2025-02-15T12:00:00Z",
  "accountId": "account-uuid",
  "encrypted": false,
  "entityCounts": {
    "expenses": 245,
    "incomes": 24,
    "budgets": 5,
    "categories": 18,
    "tags": 12,
    "projects": 3,
    "wallets": 2,
    "transfers": 8,
    "currencyExchanges": 4
  },
  "data": {
    "expenses": [],
    "incomes": [],
    "budgets": [],
    "categories": [],
    "tags": [],
    "projects": [],
    "wallets": [],
    "transfers": [],
    "currencyExchanges": []
  }
}
```

**Примечания:**
- Доступно на всех тарифах
- Массивы `data` содержат полные записи каждого типа сущностей

### Восстановление из резервной копии

```http
POST /backups/restore
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "data": "{\"version\":\"1.0\",\"exportedAt\":\"2025-02-15T12:00:00Z\",...}",
  "overwrite": false
}
```

**Ответ** `200 OK`
```json
{
  "restoredCounts": {
    "expenses": 245,
    "incomes": 24,
    "budgets": 5,
    "categories": 18,
    "tags": 12,
    "projects": 3,
    "wallets": 2,
    "transfers": 8,
    "currencyExchanges": 4
  },
  "errors": []
}
```

**Примечания:**
- `data` — JSON-строка ранее экспортированной резервной копии
- При `overwrite: true` существующие данные аккаунта полностью заменяются; при `false` данные из копии объединяются с существующими записями
- Массив `errors` содержит ошибки на уровне отдельных сущностей, возникшие при восстановлении

### История резервных копий

```http
GET /backups/history
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
[
  {
    "id": "uuid",
    "version": "1.0",
    "entityCounts": {
      "expenses": 245,
      "incomes": 24,
      "budgets": 5,
      "categories": 18,
      "tags": 12,
      "projects": 3,
      "wallets": 2,
      "transfers": 8,
      "currencyExchanges": 4
    },
    "encrypted": false,
    "fileSize": 524288,
    "createdAt": "2025-02-15T12:00:00Z"
  }
]
```

## Подписки и оплата

Наша собственная оплата через Stripe (тарифы Free / Pro / Business). Все маршруты ниже защищены JWT, кроме `redirect` и вебхука. Цены и правила тарифов: `docs/wiki/features/subscription-pricing.md`, `docs/wiki/subscriptions.md`.

### Список тарифов

```http
GET /subscriptions/plans
Authorization: Bearer <token>
```

Цены в `user.currencyCode`. **Ответ** — `PlansResponse`: `{ "currency", "symbol", "plans": [ { "tier": "pro", "name", "monthly": { "amount", "display", "priceEnvKey" }, "yearly": { ... }, "monthlyEquivalent", "features": [] } ] }`.

### Текущая подписка

```http
GET /subscriptions/current
Authorization: Bearer <token>
```

**Ответ** — `{ "id", "tier", "status", "currentPeriodStart", "currentPeriodEnd", "cancelAtPeriodEnd", "trialStart", "trialEnd" }`. Строка создаётся при первом чтении.

### Использование

```http
GET /subscriptions/usage
Authorization: Bearer <token>
```

**Ответ** — `{ "tier", "aiRequestsUsed", "aiRequestsLimit", "resetAt", "percentUsed", "isTrialing", "bonusAiRequests" }`.

### Создать сессию оплаты

```http
POST /subscriptions/checkout
Authorization: Bearer <token>
Content-Type: application/json

{ "priceId": "price_...", "successUrl": "https://api.ai-budget.pl/api/v1/subscriptions/redirect?target=budget://subscription/success", "cancelUrl": "https://api.ai-budget.pl/api/v1/subscriptions/redirect?target=budget://subscription/cancel" }
```

**Ответ** — `{ "sessionId", "url" }`.

### Создать сессию портала оплаты

```http
POST /subscriptions/portal
Authorization: Bearer <token>
Content-Type: application/json

{ "returnUrl": "https://..." }
```

**Ответ** — `{ "url" }`.

### Редирект после оплаты

```http
GET /subscriptions/redirect?target=budget://subscription/success
```

Публичный. Stripe требует return URL с `https://`, поэтому этот маршрут перенаправляет на deep-ссылку приложения. Принимаются только `budget://subscription/success`, `budget://subscription/cancel` и `budget://subscription`; всё остальное перенаправляется на `budget://subscription`.

### Вебхук Stripe

```http
POST /webhooks/stripe
Stripe-Signature: t=...,v1=...
```

Без префикса `/api/v1`. Проверяется по сырому телу (`400` при отсутствующей или неверной подписи). Обрабатывает `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_succeeded` и `invoice.payment_failed`; остальные события игнорируются. **Ответ** — `{ "received": true }`.

---

## Менеджер подписок

Собственные регулярные платежи пользователя (Netflix, спортзал и т. п.) — **не** наша оплата через Stripe. JWT + контекст аккаунта. См. `docs/wiki/features/subscription-manager.md`.

```http
GET /user-subscriptions
POST /user-subscriptions
PATCH /user-subscriptions/:id
DELETE /user-subscriptions/:id
```

Запись закрыта для viewer; `DELETE` возвращает `204`. Тело создания:
```json
{
  "name": "Netflix",
  "amount": 43.00,
  "currencyCode": "PLN",
  "billingCycle": "monthly",
  "nextRenewalDate": "2026-10-05",
  "categoryId": "uuid",
  "notes": "Семейный тариф",
  "detectedFrom": "anomaly"
}
```

`billingCycle`: `weekly`, `monthly`, `quarterly`, `yearly`. `PATCH` принимает те же поля плюс `isActive`; `categoryId: null` очищает категорию. Ежедневный cron записывает каждое продление как расход и сдвигает `nextRenewalDate` в одной транзакции.

---

## Рефералы

Все реферальные эндпоинты требуют JWT. Заголовок `X-Account-Id` не нужен.

### Мой реферальный код

```http
GET /referrals/my-code
Authorization: Bearer <access_token>
```

**Ответ:**
```json
{
  "code": "AB3XK7"
}
```

При первом вызове генерирует уникальный 6-символьный код, при последующих возвращает существующий.

### Статистика рефералов

```http
GET /referrals/stats
Authorization: Bearer <access_token>
```

**Ответ:**
```json
{
  "referralCode": "AB3XK7",
  "totalReferrals": 3,
  "qualifiedReferrals": 1,
  "pendingReferrals": 2,
  "bonusAiRequests": 30,
  "nextMilestone": {
    "count": 5,
    "reward": "free_pro_month"
  }
}
```

`nextMilestone` равен `null`, когда все рубежи достигнуты.

Рубежи:
- 5 квалифицированных рефералов → `free_pro_month` (промокод Stripe приходит по e-mail)
- 10 квалифицированных рефералов → `ambassador_badge`

### Список рефералов

```http
GET /referrals/list
Authorization: Bearer <access_token>
```

**Ответ:**
```json
[
  {
    "id": "uuid",
    "referredName": "Jane Doe",
    "status": "qualified",
    "createdAt": "2026-03-28T10:00:00.000Z",
    "qualifiedAt": "2026-04-04T03:00:00.000Z"
  }
]
```

**Статусы рефералов:**
| Статус | Описание |
|---|---|
| `pending` | Зарегистрирован, ждёт 7 дней + подтверждения активности |
| `qualified` | Активность подтверждена, пригласившему начислено +30 AI-запросов |
| `expired` | Прошло 30 дней без квалификации |

### Реферальный код при регистрации

Реферальный код применяется при регистрации через необязательное поле `referralCode`:

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "Jane Doe",
  "referralCode": "AB3XK7"
}
```

При валидном коде:
- создаётся запись реферала со статусом `pending`
- пробный период приглашённого продлевается на 7 дней (всего 14 дней)
- пригласивший получает push-уведомление

---

## Детали использования

#### Получить детали использования

```
GET /subscriptions/usage/details?month=3&year=2026
```

Возвращает детальную разбивку использования AI за конкретный месяц.

**Параметры запроса:**

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `month` | number | Нет | Месяц (1-12), по умолчанию текущий |
| `year` | number | Нет | Год, по умолчанию текущий |

**Ответ:**
```json
{
  "month": 3,
  "year": 2026,
  "totalCost": 24.5,
  "totalRequests": 15,
  "summary": [
    { "feature": "chat", "count": 8, "totalCost": 8.0 },
    { "feature": "story", "count": 2, "totalCost": 6.0 }
  ],
  "logs": [
    { "id": "uuid", "feature": "chat", "cost": 1.0, "date": "2026-03-15T10:30:00Z" }
  ]
}
```

---

## Оповещения об аномалиях

Проактивные оповещения, генерируемые автоматически при записи расходов и после коммита импорта. Все эндпоинты требуют JWT + заголовок `X-Account-Id`.

**Типы оповещений:**
| Тип | Описание |
|-----|----------|
| `category_spike` | Сумма по категории за текущий календарный месяц (в разрезе валюты) на ≥30% выше среднего за предыдущие ≥2 месяца |
| `price_increase` | Отслеживаемая подписка или серия `recurringId` списывает **более чем на 10%** больше прежнего (та же валюта) |
| `duplicate_charge` | Тот же плательщик (мерчант, либо описание, если мерчанта нет) + сумма + валюта в пределах **±1 календарного дня** (пары из одного импорта исключены) |
| `recurring_suggestion` | 3+ списания одинаковой суммы у неотслеживаемого мерчанта с регулярным интервалом (месяц 25–35 д / неделя 6–8 д) — возможная неотслеживаемая подписка |
| `price_overcharge` | Позиция чека стоит дороже собственной медианной цены пользователя за этот товар в этом магазине (ABA-373, проверка цен по чеку). **Только в ленте — никогда не отправляется push** (`skipPush: true`); записывается только при `RECEIPT_CHECK_ALERTS_ENABLED=true` (см. [ARCHITECTURE.md](./ARCHITECTURE.md#проверка-цен-по-чеку)) |

**Генерация:** Оповещения создаются **fire-and-forget** при создании расхода (ручной/голосовой/OCR и все боты, плюс синхронизация мобильного) и после коммита импорта (bank/Wise). Дедупликация через детерминированный `dedupKey` (`@@unique([accountId, dedupKey])`).

**Push-уведомления:** отправляются с типом `spending_anomaly`, управляются настройкой `anomalyAlerts` (`GET/PATCH /users/me/notification-preferences`), ограничены 3 пушами на аккаунт в сутки. Исключение — `price_overcharge`: он записывается в ленту, но никогда не отправляется push, поскольку уведомление, пришедшее уже после того, как пользователь ушёл из магазина, бесполезно.

### Список оповещений

Возвращает последние 50 неотклонённых оповещений аккаунта (сначала новые) и количество непрочитанных.

```http
GET /alerts?unread=true
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | Описание |
|----------|-----|----------|
| `unread` | boolean | Если `true` — возвращает только оповещения, где `readAt` равен null (необязательно) |

**Ответ** `200 OK`
```json
{
  "alerts": [
    {
      "id": "uuid",
      "accountId": "account-uuid",
      "userId": "user-uuid",
      "type": "category_spike",
      "params": {
        "categoryId": "category-uuid",
        "categoryName": "Еда и рестораны",
        "percent": 78
      },
      "expenseId": "expense-uuid",
      "categoryId": "category-uuid",
      "readAt": null,
      "dismissedAt": null,
      "createdAt": "2026-06-10T14:22:00Z"
    }
  ],
  "unreadCount": 3
}
```

**Поля `params` по типу:**
| Тип | Ключевые поля |
|-----|--------------|
| `category_spike` | `categoryId`, `categoryName`, `percent` |
| `price_increase` | `merchant`, `oldAmount`, `newAmount`, `currencyCode`, `percent` |
| `duplicate_charge` | `merchant`, `amount`, `currencyCode`, `otherExpenseId` |
| `recurring_suggestion` | `merchant`, `amount`, `currencyCode`, `cycle` (`monthly` \| `weekly`) |
| `price_overcharge` | `merchant`, `currencyCode`, `totalAmount` (строка, сумма всех `findings` этого чека), `findings` (`ReceiptCheckFinding[]`, см. [Сканирование чека](#сканирование-чека)) |

### Сводка проверки цен

Сколько проверка цен по чеку **нашла** сверх обычных цен пользователя с начала текущего календарного года. Приводит в действие строку «Найдено X сверх ваших обычных цен в этом году» на вкладке Аналитика. Объявлен до маршрутов `:id` в этом контроллере (то же правило порядка маршрутов, что и для `bulk`/`read-all` в других местах этого API).

```http
GET /alerts/price-check-summary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "totalsByCurrency": { "PLN": 42.50, "EUR": 6.20 },
  "alertCount": 5,
  "since": "2026-01-01"
}
```

- **`totalsByCurrency`** — сумма `overpaidAmount` по всем неотклонённым оповещениям `price_overcharge`, созданным в этом году, в разрезе кода валюты. **Намеренно карта по валютам, а не одно число**: эта функция нигде не конвертирует валюты, поэтому единый смешанный итог потребовал бы конвертации по курсу, которую она принципиально не делает — сложение итога в PLN с итогом в EUR исказило бы оба значения.
- **`alertCount`** — количество учтённых оповещений `price_overcharge` (по одному на чек; чек с несколькими отмеченными позициями всё равно считается одним оповещением, поскольку все его позиции хранятся в одном массиве `findings`).
- **`since`** — начало окна: всегда `YYYY-01-01` текущего календарного года по UTC, а не скользящее окно в 365 дней.

Поскольку оповещения `price_overcharge` создаются только при `RECEIPT_CHECK_ALERTS_ENABLED=true` (см. [ARCHITECTURE.md](./ARCHITECTURE.md#проверка-цен-по-чеку)), при выключенном флаге этот эндпоинт возвращает `{ "totalsByCurrency": {}, "alertCount": 0, "since": "..." }`, даже если чеки с находками сканировались — сами находки при этом всё равно отображаются на экране подтверждения скана и в сводной строке ботов независимо от флага.

### Отметить все оповещения прочитанными

Отмечает все непрочитанные оповещения аккаунта как прочитанные. **Роль viewer заблокирована** (403).

```http
PATCH /alerts/read-all
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{ "updated": 3 }
```

### Отметить одно оповещение прочитанным

Отмечает одно оповещение как прочитанное. **Роль viewer заблокирована** (403).

```http
PATCH /alerts/:id/read
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "id": "uuid",
  "readAt": "2026-06-10T15:00:00Z"
}
```

**Ошибки:**
- `404 Not Found` — Оповещение не найдено в данном аккаунте

### Скрыть оповещение

Мягко скрывает оповещение (устанавливает `dismissedAt`). Скрытые оповещения исключаются из `GET /alerts`. **Роль viewer заблокирована** (403).

```http
DELETE /alerts/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

**Ошибки:**
- `404 Not Found` — Оповещение не найдено в данном аккаунте

### Настройки уведомлений

Поле `anomalyAlerts` входит в стандартный объект настроек уведомлений:

```http
GET /users/me/notification-preferences
Authorization: Bearer <token>
```

**Ответ** `200 OK`
```json
{
  "budgetAlerts": true,
  "sharedActivity": true,
  "debtReminders": true,
  "recurringExpenses": true,
  "subscriptionRenewals": true,
  "anomalyAlerts": true,
  "trackingGap": true
}
```

```http
PATCH /users/me/notification-preferences
Authorization: Bearer <token>
Content-Type: application/json

{
  "anomalyAlerts": false
}
```

**Ответ** `200 OK` — обновлённый объект настроек.

**DTO** (`packages/shared-types/src/dto/receipt-check.ts`): `ReceiptCheckFinding`, `PriceCheckSummary`.

---

## История цен

Персональный индекс инфляции — отслеживает изменение цен на отдельные товарные позиции из чеков OCR с течением времени; рассчитывается как индекс Ласпейреса. Все эндпоинты требуют `Authorization: Bearer <token>` + заголовок `X-Account-Id`. Ограничений по тарифному плану нет — доступно на бесплатном тарифе.

### Получить индекс инфляции

Возвращает индекс цен Ласпейреса по отслеживаемым товарам аккаунта за запрошенный период. Кешируется в Redis под ключом `ph:{accountId}:{period}` с TTL 300 секунд.

```http
GET /price-history?period=3m
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Параметры запроса**
| Параметр | Тип | По умолчанию | Описание |
|----------|-----|-------------|----------|
| `period` | `3m` \| `6m` \| `12m` | `3m` | Окно сравнения |

**Ответ** `200 OK`
```json
{
  "period": "3m",
  "indexValue": 1.087,
  "inflationPercent": 8.7,
  "baseDate": "2026-04-01",
  "currentDate": "2026-07-01",
  "productCount": 24,
  "fxApproximate": false
}
```

### Список товаров

Возвращает список уникальных канонических товаров, отслеживаемых в аккаунте, с последними ценами по магазинам.

```http
GET /price-history/products
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK`
```json
{
  "products": [
    {
      "canonicalName": "Молоко 1Л",
      "rawName": "MLEKO 1L ŁACIATE",
      "latestPrice": 3.49,
      "currencyCode": "PLN",
      "latestDate": "2026-06-28",
      "storeCount": 2,
      "storeLatestPrices": [
        { "store": "Biedronka", "price": 3.39, "date": "2026-06-20" },
        { "store": "Żabka",     "price": 3.49, "date": "2026-06-28" }
      ]
    }
  ]
}
```

### Создать/обновить псевдоним товара

Сопоставляет необработанное имя товара из OCR с каноническим именем (создаёт или обновляет запись в `product_aliases`). **Роль viewer заблокирована** (403).

```http
PATCH /price-history/products/alias
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "rawName": "MLEKO 1L ŁACIATE",
  "canonicalName": "Молоко 1Л"
}
```

**Ответ** `200 OK`
```json
{
  "id": "uuid",
  "accountId": "account-uuid",
  "rawName": "MLEKO 1L ŁACIATE",
  "canonicalName": "Молоко 1Л",
  "createdAt": "2026-07-01T09:00:00Z",
  "updatedAt": "2026-07-01T09:00:00Z"
}
```

### Удалить псевдоним товара

Удаляет соответствие rawName → canonicalName из таблицы `product_aliases`. **Роль viewer заблокирована** (403).

```http
DELETE /price-history/products/alias/:rawName
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

**Ошибки:**
- `404 Not Found` — Псевдоним не найден в данном аккаунте

### Объединить варианты товара

Переименовывает все строки `ExpenseItem` и псевдонимы товаров с указанным исходным каноническим именем в целевое каноническое имя, объединяя историю цен. **Роль viewer заблокирована** (403).

```http
POST /price-history/products/merge
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "sourceCanonicalName": "Молоко 1Л",
  "targetCanonicalName": "Цельное молоко 1Л"
}
```

**Ответ** `200 OK`
```json
{ "mergedItems": 14, "mergedAliases": 3 }
```

**DTO** (`packages/shared-types/src/dto/price-history.ts`): `PriceHistoryResponse`, `PriceHistoryProduct`, `StoreLatestPrice`, `ProductListItem`, `UpsertAliasDto`, `MergeProductsDto`.

### Детали продукта

```http
GET /price-history/products/:canonicalName/detail
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Полная история покупок одного продукта, без ограничения базовым/текущим окном индекса инфляции.

### Игнорировать продукт

```http
POST /price-history/products/ignore/:rawName
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Закрыто для viewer. Прекращает отслеживание сырого имени из OCR (например, пакета или строки залога).

### Удалить ценовую точку

```http
DELETE /price-history/price-points/:itemId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Закрыто для viewer. Исключает цену одной позиции чека из отслеживания.

### Переанализировать названия продуктов с AI

```http
POST /price-history/products/backfill-ai
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Закрыто для viewer. Заново генерирует канонические имена для однословных или отсутствующих записей; пользовательский псевдоним никогда не перезаписывается. См. `docs/wiki/features/personal-inflation-index.md`.

### Цены сообщества (Pro)

```http
GET /price-history/community?product=milk&region=PL-14&period=1w
GET /price-history/community/products?q=mil
GET /price-history/community/map?product=milk&region=PL-14&period=4w
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Pro** и дополнительно за флагом `COMMUNITY_PRICE_READ_ENABLED`, который по умолчанию **выключен** — в продакшене эта поверхность скрыта. `period` — `1w` (по умолчанию) или `4w`. Краудсорсинговые k-анонимизированные цены из позиций чеков всех аккаунтов; таблица наблюдений не хранит ни аккаунт, ни пользователя, ни координаты. См. `docs/wiki/features/community-prices.md`.

---

## Список покупок

Общие offline-first списки покупок, а также подсказки о повторной покупке/скидках и Pro-функция сравнения корзины «где дешевле», построенные на корпусе истории цен по чекам (ABA-330). Все эндпоинты требуют JWT + заголовок `X-Account-Id` (`JwtAuthGuard + AccountContextGuard`).

Списки и позиции адресуются по **серверному PK или локальному `clientId`** мобильного клиента (разрешается через `OR: [{ id }, { clientId }]`), поэтому offline-first клиенты могут работать со строками, созданными до синхронизации. Запись позиций коллаборативна — она **не** защищена `ViewerBlockGuard` (наблюдатели могут отмечать/добавлять позиции); только `DELETE /shopping-list/:id` требует роль editor или owner.

### Список списков

```http
GET /shopping-list
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Возвращает все неудалённые списки аккаунта, каждый с его неудалёнными `items`. Список по умолчанию лениво создаётся, когда у аккаунта нет неархивированного списка; **архивированные списки включаются** (чтобы архивацию с другого устройства можно было отличить от удаления).

**Ответ** `200 OK`
```json
[
  {
    "id": "uuid",
    "accountId": "account-uuid",
    "clientId": "default-account-uuid",
    "name": "My List",
    "isDefault": true,
    "isArchived": false,
    "sortOrder": 0,
    "createdByUserId": "user-uuid",
    "items": [
      {
        "id": "item-uuid",
        "shoppingListId": "uuid",
        "clientId": "client-item-uuid",
        "canonicalName": "Milk 1L",
        "rawLabel": "Milk",
        "quantity": 1,
        "note": null,
        "isChecked": false,
        "addedByUserId": "user-uuid",
        "sortOrder": 0
      }
    ]
  }
]
```

### Создать список

```http
POST /shopping-list
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "clientId": "client-generated-uuid", "name": "Groceries" }
```

Идемпотентно по `clientId` — повторное создание возвращает существующий список (безопасно при offline-повторе).

**Ответ** `201 Created` — созданный (или существующий) список.

### Обновить список

```http
PATCH /shopping-list/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "name": "Weekly Groceries", "isArchived": false, "sortOrder": 1 }
```

`:id` может быть серверным PK или локальным `clientId`. Все поля тела опциональны.

### Удалить список

```http
DELETE /shopping-list/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Мягко удаляет список и его позиции. **Роль viewer заблокирована** (403, `ViewerBlockGuard`).

### Добавить позицию

```http
POST /shopping-list/:id/items
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "clientId": "client-item-uuid",
  "rawLabel": "Milk",
  "canonicalName": "Milk 1L",
  "quantity": 1,
  "note": "2% only"
}
```

`:id` = PK списка или `clientId`. Идемпотентно по `clientId` позиции (восстанавливает мягко удалённую строку). Коллаборативно — **не** блокируется для viewer.

**Ответ** `201 Created` — созданная позиция.

### Обновить позицию

```http
PATCH /shopping-list/items/:itemId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "isChecked": true, "quantity": 2, "rawLabel": "Milk", "note": null, "sortOrder": 3 }
```

`:itemId` = PK позиции или `clientId`. Все поля тела опциональны. Коллаборативно — **не** блокируется для viewer.

### Удалить позицию

```http
DELETE /shopping-list/items/:itemId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Мягко удаляет позицию. Коллаборативно — **не** блокируется для viewer.

### Очистить отмеченные позиции

```http
POST /shopping-list/:id/clear-checked
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Мягко удаляет все отмеченные позиции списка.

**Ответ** `200 OK`
```json
{ "cleared": 3 }
```

### Подсказки о повторной покупке

```http
GET /shopping-list/suggestions
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Бесплатно.** Предсказывает, какие товары пора купить снова, по истории покупок из чеков — `predictRestock` вычисляет медианный интервал между покупками каждого канонического товара (нужно ≥3 покупок) и возвращает товары, срок повторной покупки которых наступил/просрочен, исключая товары, уже находящиеся в каком-либо списке.

**Ответ** `200 OK`
```json
[
  {
    "canonicalName": "Milk 1L",
    "lastPurchase": "2026-06-20",
    "medianGapDays": 7,
    "dueInDays": -2,
    "purchaseCount": 9
  }
]
```

### Скидки

```http
GET /shopping-list/deals
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Бесплатно.** Показывает недавние падения цен — `detectDeals` отмечает магазин, чья недавняя цена за единицу товара на ≥15% ниже 90-дневного среднего по этому товару (в окне 14 дней), исключая товары, уже находящиеся в каком-либо списке.

**Ответ** `200 OK`
```json
[
  {
    "canonicalName": "Coffee 500g",
    "merchant": "Biedronka",
    "price": 18.99,
    "avgPrice": 23.50,
    "dropPct": 19,
    "currency": "PLN"
  }
]
```

### Сравнение корзины (Pro)

```http
POST /price-history/basket
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "items": [
    { "canonicalName": "Milk 1L", "quantity": 2 },
    { "canonicalName": "Coffee 500g", "quantity": 1 }
  ],
  "lat": 52.2297,
  "lng": 21.0122
}
```

**Только для Pro** (`SubscriptionTierGuard` + `@RequireTier('pro')`; Business также проходит). Оценивает стоимость корзины в каждом магазине, по которому у аккаунта есть чеки — `computeBasket` берёт последнюю цену за единицу товара в каждом магазине, выставляет бейдж «самый дешёвый» с учётом покрытия (полное покрытие, иначе лучший магазин с покрытием ≥80%) и помечает устаревшие цены. `lat`/`lng` опциональны; когда переданы (и не `0,0`), каждый магазин получает `distanceKm` и флаг `nearby` через формулу гаверсинусов, где координаты магазина берутся из самого недавнего гео-помеченного расхода по этому продавцу.

**Параметры тела**
| Поле | Тип | Описание |
|------|-----|----------|
| `items` | array | Обязательно. 1–100 записей `{ canonicalName, quantity }` |
| `lat` | number | Опционально. Широта точки (−90…90) для расстояния до магазинов |
| `lng` | number | Опционально. Долгота точки (−180…180) для расстояния до магазинов |

**Ответ** `200 OK`
```json
{
  "currency": "PLN",
  "stores": [
    {
      "merchantName": "Biedronka",
      "estimatedTotal": 41.37,
      "coveredItems": 2,
      "totalItems": 2,
      "missingItems": [],
      "hasStale": false,
      "isCheapest": true,
      "distanceKm": 1.3,
      "nearby": true,
      "lat": 52.231,
      "lng": 21.010
    }
  ],
  "perItemCheapest": [
    { "canonicalName": "Milk 1L", "cheapestStore": "Biedronka", "price": 3.39 }
  ],
  "missingEverywhere": []
}
```

**DTO** (`packages/shared-types/src/dto/shopping-list.ts`, `.../price-history.ts`): `ShoppingList`, `ShoppingListItem`, `CreateShoppingListDto`, `UpdateShoppingListDto`, `CreateShoppingListItemDto`, `UpdateShoppingListItemDto`, `RestockSuggestion`, `DealSuggestion`, `BasketCompareRequestDto`, `BasketCompareResponse`.

### Шаблоны («мои еженедельные покупки»)

Переиспользуемые наборы позиций, которые можно добавить в любой список. JWT + контекст аккаунта; закрыт для viewer только `DELETE` (как и у списков). Объявлены до динамических маршрутов `:id`. Типы: `packages/shared-types/src/dto/shopping-list.ts`.

```http
GET /shopping-list/templates
```
**Ответ** — `ShoppingListTemplate[]`: `{ "id", "accountId", "name", "sortOrder", "createdByUserId", "items": [ { "id", "templateId", "canonicalName", "rawLabel", "sortOrder" } ] }`.

```http
POST /shopping-list/templates
Content-Type: application/json

{ "name": "Еженедельные покупки", "items": [ { "rawLabel": "Молоко", "canonicalName": "milk" }, { "rawLabel": "Хлеб" } ] }
```
`name` — до 60 символов, от 1 до 200 позиций.

```http
POST /shopping-list/templates/:templateId/apply
Content-Type: application/json

{ "listId": "uuid" }
```
**Ответ** — `{ "listId", "listName", "addedLabels": [], "skippedLabels": [] }` (позиции, уже присутствующие в списке, пропускаются).

```http
PATCH /shopping-list/templates/:templateId
Content-Type: application/json

{ "name": "Закупка в субботу" }
```

```http
DELETE /shopping-list/templates/:templateId
```

### Гостевая ссылка на список

```http
POST /shopping-list/:id/guest-link
DELETE /shopping-list/:id/guest-link
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Закрыто для viewer. `POST` возвращает `{ "token", "url" }` (идемпотентно — возвращается существующая ссылка); `DELETE` отзывает её.

### Гостевая страница списка — без аутентификации

```http
GET /sl/:token
POST /sl/:token/items/:itemId/toggle
```

Без префикса `/api/v1` (шаблон `sl/(.*)`). Страница — HTML, отрисованный на сервере (`Cache-Control: no-store`), с названием списка и его текущими позициями — без сумм и имён участников; ограничение 20 запросов/мин с IP. `toggle` (30/мин) переключает отметку одной позиции — id позиции проверяется в рамках списка этого токена — и перенаправляет `303` обратно на страницу (Post/Redirect/Get). Неизвестный, отозванный, заархивированный или удалённый список отдаёт одинаковую страницу «не найдено».

---

## Разделение чека

Позволяет плательщику общего счёта разделить его между людьми, у которых нет приложения. Каждый участник получает публичную неаутентифицированную ссылку (`https://ai-budget.pl/s/<token>` — как только на VPS появится nginx-блок для гостевых ссылок, см. `docs/ops/receipt-split-rollout.md`; до этого — `https://api.ai-budget.pl/s/<token>`), показывающую только его собственную долю и платёжную deep-ссылку. Плательщик видит статус каждого участника (`sent` → `opened` → `claimed` → `settled`) и подтверждает получение денег, что закрывает долг тем же путём, что и обычный ручной возврат.

Четыре эндпоинта ниже предназначены для плательщика и требуют JWT + `X-Account-Id` (`JwtAuthGuard + AccountContextGuard`, на уровне класса) плюс `ViewerBlockGuard` + `TripArchivedGuard` на каждом маршруте, **включая чтение** — наблюдатель (viewer) не может увидеть разделение точно так же, как не может его создать. Два гостевых эндпоинта далее — **неаутентифицированные**: без заголовка `Authorization`, без `X-Account-Id` — единственная такая поверхность в приложении.

### Создать разделение

```http
POST /expenses/:id/receipt-split
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "mode": "items",
  "participants": [
    { "name": "Anna", "itemIds": ["item-uuid-1"] },
    { "name": "Marek", "itemIds": ["item-uuid-2", "item-uuid-3"] }
  ]
}
```

`:id` — серверный PK расхода или локальный `clientId` мобильного клиента. `mode: "items"` назначает позиции чека участникам (любая неназначенная позиция остаётся плательщику; позиция, выбранная несколькими участниками, делится между ними; необязательная карта `itemShareBp` у участника — `{ "<itemId>": 6000 }` = 60%, в базисных пунктах — задаёт явную долю позиции, остаток остаётся плательщику); `mode: "equal"` делит весь счёт поровну между плательщиком и всеми участниками (`itemIds` в этом режиме игнорируется). От 1 до 20 участников, имя каждого — от 1 до 60 символов, обрезается по пробелам. **Идемпотентно**: повторный вызов для расхода, у которого уже есть живое разделение, возвращает это существующее разделение вместо создания второго набора токенов/строк. Отклоняется с `400` для полностью зашифрованного (E2EE, tier-2) аккаунта — сервер не может прочитать зашифрованные позиции чека, чтобы отрисовать гостевую страницу.

Записывает одну строку `receipt_split_participants` и один расход `isDebt: true, isSplitReceivable: true` на каждого участника (дебиторская задолженность) рядом с исходным расходом-чеком (реальным оттоком денег) — всё в одной транзакции.

**Ответ** `200 OK`
```json
{
  "expenseId": "expense-uuid",
  "ownShare": 42.50,
  "currencyCode": "PLN",
  "participants": [
    {
      "id": "participant-uuid",
      "name": "Anna",
      "amount": 28.90,
      "currencyCode": "PLN",
      "status": "sent",
      "url": "https://api.ai-budget.pl/s/3f9a2b7c1e4d5a6b7c8d9e0f1a2b3c4d?lang=en",
      "flags": [],
      "itemIds": ["item-uuid-1"],
      "itemShareBp": {}
    }
  ],
  "groupUrl": "https://api.ai-budget.pl/s/g/9c1e...?lang=en"
}
```

`flags` — открытые претензии участника (см. **Гость отмечает позицию** ниже); `itemIds`/`itemShareBp` видны только плательщику и никогда не показываются на гостевой странице. `groupUrl` — единая QR-ссылка, отсканировав которую, каждый участник выбирает своё имя (`null` для разделений, созданных до появления этого поля).

### Получить разделение

```http
GET /expenses/:id/receipt-split
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Возвращает текущее состояние живого разделения — та же форма ответа, что и у создания. Каждое значение `amount`/`ownShare` — ровно то, что было вычислено в момент создания; клиент никогда не пересчитывает его заново.

**Отвечает `404`, если у расхода нет разделения** — это нормальное состояние любого нераскрытого («неразделённого») чека, а не ошибка.

### Подтвердить оплату участником

```http
PATCH /expenses/:id/receipt-split/:participantId/confirm
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Собственный шаг верификации плательщика, имеющий смысл после того, как гость отметил свою долю как `claimed`. Проходит по тому же пути, что и обычный ручной возврат долга (`DebtsService.recordRepayment`), под защитой атомарного захвата `settledAt IS NULL`, поэтому двойное нажатие или повтор запроса клиентом никогда не создаст два возврата. `400`, если разделение отменено, этот участник уже рассчитан, либо у участника нет связанной строки долга.

**Ответ** `200 OK`
```json
{
  "id": "participant-uuid",
  "name": "Anna",
  "amount": 28.90,
  "currencyCode": "PLN",
  "status": "settled",
  "url": "https://api.ai-budget.pl/s/3f9a2b7c1e4d5a6b7c8d9e0f1a2b3c4d?lang=en"
}
```

### Отменить разделение

```http
DELETE /expenses/:id/receipt-split
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Мягко удаляет связанный расход-дебиторку каждого участника и немедленно делает недействительными все гостевые ссылки этого разделения. В отличие от разделения, которое просто пережило свой 30-дневный `expiresAt` с всё ещё непогашенными долгами, отменённое разделение полностью неактивно: последующий `POST .../receipt-split` для того же расхода начинает совершенно новое разделение, а не возвращает мёртвое.

**Ответ** `200 OK`
```json
{ "success": true }
```

### Недавние участники

```http
GET /expenses/receipt-split/recent-participants?limit=8
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Уникальные имена, с которыми этот аккаунт уже делил счета, от недавних к старым (чипы-подсказки). `limit` по умолчанию 8, максимум 20. **Ответ** — `{ "names": ["Anna", "Marek"] }`.

### Закрыть претензию

```http
PATCH /expenses/:id/receipt-split/flags/:flagId/resolve
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Отмечает одну из открытых претензий гостя (см. **Гость отмечает позицию**) как разобранную.

### Переназначить позицию

```http
PATCH /expenses/:id/receipt-split/items/:itemId/reassign
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{ "participantIds": ["participant-uuid-1", "participant-uuid-2"] }
```

Переназначает претендентов ОДНОЙ позиции среди **существующих** участников разделения (никогда не добавляет и не удаляет людей и не трогает другие позиции; до 20 id, пустой список оставляет позицию плательщику) и автоматически закрывает все открытые претензии по этой позиции. `400`, как только кто-то из участников отметил или подтвердил оплату — тогда разделение нужно отменить и создать заново. Возвращает обновлённое состояние разделения.

### Гостевая страница — без аутентификации

```http
GET /s/:token
```

Без заголовка `Authorization`, без `X-Account-Id` — этот маршрут полностью исключён из префикса `/api/v1` (см. `main.ts`). Отрисовывает серверную HTML-страницу (`Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store`), показывающую только имя и сумму этого конкретного участника, назначенные позиции (если есть), имя плательщика и **по одному блоку оплаты на каждый способ**, который есть у плательщика — резолвится заново при каждом запросе (никогда не кэшируется с момента создания ссылки, поэтому настройка или изменение способов оплаты уже после отправки ссылки всё равно обновляет её): сначала список `paymentMethods` плательщика (см. **Заменить способы оплаты** выше), и только если он пуст — устаревшая одиночная пара `paymentMethod`/`paymentHandle`, и только если не задана и она — его платёжные данные уровня `AccountMember` в trip wallet для того аккаунта, к которому относится чек. Каждый разрешённый способ отрисовывается как кнопка оплаты (`revolut`, `paypal`), блок инструкций BLIK, либо не отрисовывается вовсе (`cash`, `other`); если ни один способ не разрешился — выводится обычная строка «нет платёжной информации». Неизвестный, истёкший и отменённый токен отдают **идентичную** страницу «ссылка не найдена или истекла» — тот же код статуса, то же тело, та же длина — так что ни гость, ни атакующий, перебирающий токены, не может отличить «никогда не существовало» от «раньше существовало». Первый просмотр отмечает у участника `openedAt`. Язык страницы определяется по `?lang=` (устанавливается сервером в `user.language` самого плательщика при построении ссылки), затем по `Accept-Language`, затем по умолчанию на английский — независимо от 9-языковой системы i18n приложения.

**Ограничение частоты**: 20 запросов / 60 с (по IP, трекер по умолчанию `ThrottlerGuard`).

**Ответ** `200 OK` — HTML (гостевая страница либо страница «не найдено», если токен не разрешился).

### Гость отмечает оплату — без аутентификации

```http
POST /s/:token/paid
```

Также исключён из `/api/v1`. Единственное действие записи со стороны гостя: переводит его участника в статус `claimed` (идемпотентно — повторный вызов ничего не делает и никогда не отправляет уведомление дважды) и отправляет push `split_payment_claimed` плательщику, после чего повторно отрисовывает ту же гостевую страницу с новым статусом.

**Ограничение частоты**: 10 запросов / 60 с (по IP).

**Ответ** `200 OK` — HTML (та же гостевая страница).

### Гость смотрит скан чека — без аутентификации

```http
GET /s/:token/receipt
```

Изображение или PDF чека плательщика, чтобы гость мог сверить свои позиции с бумагой. Ограничение 20/мин. `Content-Type` определяется по байтам (никогда не по сохранённому MIME-типу; нераспознанные байты не отдаются) и отправляется с `X-Content-Type-Options: nosniff`. Неизвестный, просроченный и отменённый токены — как и валидный токен, у расхода которого нет скана, — все дают `404`.

### Гость отмечает позицию — без аутентификации

```http
POST /s/:token/flag
Content-Type: application/x-www-form-urlencoded

itemId=<item-uuid>&note=I+did+not+have+this
```

Ограничение 10/мин. Сообщает, что одна позиция (или, без `itemId`, вся доля) указана неверно; `note` — до 500 символов. `itemId` ограничивается собственными позициями гостя — любое другое значение превращается в претензию ко всей доле. Не больше одной открытой претензии на участника и позицию (повтор обновляет заметку и не уведомляет повторно). Не зависит от оплаты. Заново отрисовывает гостевую страницу.

### Групповая QR-ссылка — без аутентификации

```http
GET /s/g/:groupToken
GET /s/g/:groupToken/:seq
```

Ограничение 20/мин, HTML, `no-store`. Общий QR-код разделения открывает страницу выбора имени; выбор имени ведёт на шаг «Это вы?» (`:seq` — порядковый индекс, имеющий смысл только вместе с секретным `groupToken`), а оттуда — на собственную гостевую страницу участника. Для неизвестных, просроченных и отменённых токенов — одинаковая страница «не найдено».

**DTO** (`packages/shared-types/src/dto/receipt-split.ts`): `SplitParticipantInput`, `CreateSplitDto`, `SplitParticipantStatus`, `SplitParticipantFlag`, `SplitParticipantState`, `SplitStateResponse`, `ReassignSplitItemInput`, `RecentSplitParticipantsResponse`. Страницы фичи: `docs/wiki/features/receipt-split.md`, `docs/wiki/features/receipt-split-item-shares.md`.

---

## Долги

JWT + контекст аккаунта. Отдельные долги — это обычные расходы/доходы с `isDebt: true` (дал в долг — расход, взял в долг — доход); возвраты — связанные доходы/расходы.

### Сводка по долгам

```http
GET /debts/summary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `200 OK` — `DebtSummaryResponse` (`packages/shared-types/src/dto/debt.ts`): `{ "lent": DebtSummary[], "borrowed": DebtSummary[], "totals": { "totalLent", "totalBorrowed", "totalLentRemaining", "totalBorrowedRemaining", "currencyCode" } }`.

---

## Запросы на покупку

Групповое согласование покупок в общих аккаунтах. JWT + контекст аккаунта. Голосовать могут и viewer, поэтому `vote` намеренно **не** закрыт для viewer. Подробности: `docs/wiki/features/purchase-requests.md`.

```http
GET /purchase-requests?status=PENDING
GET /purchase-requests/pending-count
GET /purchase-requests/:id
```

`status`: `PENDING`, `APPROVED`, `REJECTED`, `PURCHASED`, `EXPIRED`.

```http
POST /purchase-requests
Content-Type: application/json

{ "title": "Новая коляска", "amount": 1200, "currency": "PLN", "description": "...", "categoryId": "uuid", "merchant": "...", "imageUrl": "https://...", "expiresAt": "2026-10-10T00:00:00Z" }
```
Закрыто для viewer. Правило согласования аккаунта копируется в запрос при создании.

```http
POST /purchase-requests/:id/vote
Content-Type: application/json

{ "vote": "APPROVE", "comment": "Берём" }
```
`vote`: `APPROVE`, `REJECT`, `ABSTAIN`.

```http
PATCH /purchase-requests/:id
POST /purchase-requests/:id/convert
POST /purchase-requests/:id/mark-purchased
DELETE /purchase-requests/:id
PATCH /purchase-requests/settings/approval-rule
```

`PATCH /:id` (title, amount, currency, description, merchant, imageUrl), `convert` (создаёт запланированный расход — он никогда не считается тратой) и `mark-purchased` закрыты для viewer. `DELETE` отменяет запрос; это может только автор или владелец аккаунта (иначе `403`). `approval-rule` закрыт для viewer и принимает `{ "rule": "MAJORITY" | "UNANIMOUS" | "OWNER_ONLY" }`.

---

## Семейная лента

Лента активности и реакции в общих аккаунтах. JWT + контекст аккаунта. См. `docs/wiki/features/family-feed.md`.

```http
GET /family-feed?limit=100
```
`limit` ограничивается диапазоном 1–100. **Ответ** — `FeedGroup[]` (`packages/shared-types/src/entities/family-feed.ts`): активность по расходам/доходам, сгруппированная по участнику и дню, плюс события запросов на покупку, с реакциями.

```http
POST /family-feed/:eventId/react
Content-Type: application/json

{ "emoji": "👍" }
```
`emoji` должен входить в разрешённый набор (`ALLOWED_EMOJIS`). `DELETE /family-feed/:eventId/react` удаляет реакцию пользователя (`204`).

---

## Шифрование

Управление ключами сквозного шифрования. Все маршруты защищены JWT; маршруты уровня аккаунта используют ещё и контекст аккаунта, а `enable`, `grant-key`, `pending-grants` и `rotate-key` требуют роли `owner` (`AccountRoleGuard`). Полный протокол и тела запросов: [ENCRYPTION.md](ENCRYPTION.md).

| Метод | Путь | Назначение |
|-------|------|------------|
| `POST` | `/encryption/setup` | Создать/обновить профиль шифрования |
| `GET` | `/encryption/profile` | Получить профиль (вход с нового устройства) |
| `DELETE` | `/encryption/profile` | Сбросить профиль |
| `POST` | `/encryption/account/:accountId/enable` | Включить E2EE для аккаунта (владелец) |
| `GET` | `/encryption/account/:accountId/key` | Обёрнутый ключ аккаунта для пользователя |
| `GET` | `/encryption/account/:accountId/status` | Уровень, версия ключа, нужна ли ротация |
| `POST` | `/encryption/account/:accountId/grant-key` | Выдать ключ новому участнику (владелец) |
| `GET` | `/encryption/account/:accountId/pending-grants` | Участники, ожидающие ключа (владелец) |
| `POST` | `/encryption/account/:accountId/rotate-key` | Ротация ключа аккаунта (владелец) |
| `GET` | `/encryption/members/:accountId/public-keys` | Публичные ключи X25519 участников |
| `POST` | `/encryption/recovery/setup` | Сохранить хэш ключа восстановления и обёрнутый мастер-ключ |
| `POST` | `/encryption/recovery/recover` | Восстановить доступ ключом восстановления (лимит в Redis: 5 попыток за 15 мин на e-mail) |

---

## Телеметрия

Собственные события использования продукта — **только из веб-сборки**. См. `docs/wiki/features/web-telemetry.md`.

```http
POST /telemetry/events
Authorization: Bearer <token>
Content-Type: application/json

{
  "platform": "web",
  "sessionId": "random-session-id",
  "events": [
    { "name": "screen_view", "screen": "/(tabs)/expenses", "ts": 1790000000000 },
    { "name": "action", "screen": "/expense/new", "props": { "flow": "add_expense", "status": "completed" } }
  ]
}
```

JWT, ограничение 30 запросов/мин. `name`: `session_start`, `screen_view`, `action`; `screen` — **шаблон** маршрута, а не подставленный путь. Валидацию проходит не более 200 событий в запросе, сохраняется не более 40 за пакет. **Ответ** `204 No Content` независимо от того, сколько событий прошло проверку — клиент никогда не повторяет запрос.

---

## Версии приложения

### Проверка обновлений

```http
GET /app-versions/check?platform=android&version=1.25.0
```

Публичный (вызывается до входа). **Ответ** — `{ "latestVersion", "minSupportedVersion", "isUpdateAvailable", "isUpdateRequired", "releaseNotes": { "en": "..." } | null, "storeUrl" }`. Последней для платформы считается запись с самой поздней датой публикации.

CRUD для администратора — в `/admin/app-versions` (см. [Администрирование](#администрирование)).

---

## Health

```http
GET /health
GET /health/ai
```

Публичные. `/health` выполняет `SELECT 1` и возвращает `{ "status": "ok", "db": "ok", "uptimeSeconds", "timestamp" }` либо `503` со `status: "degraded"`; его опрашивают Docker `HEALTHCHECK`, шаг проверки деплоя и `uptime-check.yml`. Таблиц приложения он не касается, поэтому отсутствующая миграция здесь не видна. `/health/ai` проверяет ключ OpenAI — `{ "status": "ok", "openai": "ok", "timestamp" }`, `503`, если ключ не задан или вызов провайдера не удался.

---

## Администрирование

Каждый маршрут ниже требует JWT + `AdminGuard` (e-mail вызывающего должен быть в `ADMIN_EMAILS`); используется админ-панелью на Next.js. См. `docs/wiki/admin-dashboard.md` и `docs/wiki/features/admin-revenue-metrics.md`.

| Метод | Путь | Назначение |
|-------|------|------------|
| `GET` | `/admin/dashboard` | KPI-карточки, графики, начальные данные живой ленты |
| `GET` | `/admin/metrics/investor` | Метрики для инвесторов (MRR, отток, когорты; кэш в Redis) |
| `GET` | `/admin/users` | Пользователи с пагинацией (`page`, `limit`, `search`, `tier`, `billing`, `isActive`, `sortBy` = `name`/`email`/`createdAt`/`lastSyncAt`, `order`) |
| `GET` | `/admin/users/:id` | Карточка пользователя |
| `PATCH` | `/admin/users/:id` | Обновить пользователя |
| `PATCH` | `/admin/users/:id/subscription` | Сменить тариф (подарок — без Stripe id) |
| `PATCH` | `/admin/users/:id/ai-limit` | Задать индивидуальный месячный лимит AI |
| `DELETE` | `/admin/users/:id` | Деактивировать или удалить |
| `POST` | `/admin/notifications/push` | Push одному пользователю |
| `POST` | `/admin/notifications/email` | E-mail одному пользователю |
| `POST` | `/admin/notifications/broadcast` | Push/e-mail отфильтрованной аудитории |
| `GET` | `/admin/notifications/history` | История доставки |
| `POST` | `/admin/notifications/schedule` | Запланировать уведомление |
| `GET` | `/admin/notifications/scheduled` | Запланированные уведомления |
| `DELETE` | `/admin/notifications/scheduled/:id` | Отменить запланированное уведомление |
| `GET` | `/admin/analytics/overview` | Обзор аналитики |
| `GET` | `/admin/analytics/ai-usage` | Тренды использования и стоимости AI |
| `GET` | `/admin/analytics/subscriptions` | Статистика подписок |
| `GET` | `/admin/analytics/acquisition` | Разбивка привлечения по источникам |
| `GET` | `/admin/telemetry/funnel?days=30` | Воронка веб-телеметрии (`flows`, `screens`, `lastScreens`) |
| `GET` | `/admin/audit-log` | Журнал действий администраторов |
| `GET` / `PATCH` | `/admin/config` | Настройки времени выполнения |
| `GET` | `/admin/system/health` | Состояние системы |
| `GET` | `/admin/referrals/stats` | Статистика рефералов |
| `GET` | `/admin/referrals` | Список рефералов |
| `GET` / `POST` | `/admin/app-versions` | Список / публикация версий приложения (`platform`, `latestVersion`, `minSupportedVersion`, `releaseNotes`, `storeUrl`, `publishedAt`) |
| `PATCH` / `DELETE` | `/admin/app-versions/:id` | Изменить / удалить релиз |

События в реальном времени приходят через Socket.io namespace `/admin` (`new_user`, `ai_request`, `error`, `subscription_change`).

## Ответы с ошибками

### Формат ошибки

```json
{
  "statusCode": 400,
  "message": "Ошибка валидации",
  "error": "Bad Request",
  "details": [
    {
      "field": "amount",
      "message": "Сумма должна быть положительным числом"
    }
  ]
}
```

### Коды статусов

| Код | Описание |
|-----|----------|
| `400` | Bad Request — неверные входные данные |
| `401` | Unauthorized — неверный или истёкший токен |
| `403` | Forbidden — недостаточно прав или неверная роль аккаунта |
| `404` | Not Found — ресурс не найден |
| `409` | Conflict — несоответствие версий синхронизации |
| `422` | Unprocessable Entity — ошибка валидации |
| `429` | Too Many Requests — превышен лимит запросов |
| `500` | Internal Server Error — внутренняя ошибка сервера |

### Лимиты запросов

- Эндпоинты аутентификации: 10 запросов/минуту
- AI эндпоинты: 30 запросов/минуту
- Остальные эндпоинты: 100 запросов/минуту
