# Справочник API

Базовый URL: `/api/v1`

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

**Ответ** `201 Created`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "Иван Иванов",
  "currencyCode": "RUB",
  "timezone": "UTC",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

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
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Иван Иванов"
  }
}
```

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
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900
}
```

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
  "notifyBudgetAlerts": true,
  "notifySharedActivity": false
}
```

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
  "sortOrder": 1
}
```

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

### Обновить категорию

```http
PATCH /categories/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "Кофе и чай",
  "color": "#654321"
}
```

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

### Добавить тег к доходу

```http
POST /tags/:id/incomes/:incomeId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `201 Created`

### Удалить тег с дохода

```http
DELETE /tags/:id/incomes/:incomeId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

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

---

## Переводы между счетами

Переводы между счетами работают на уровне пользователя (заголовок `X-Account-Id` не требуется). Пользователь должен быть участником обоих счетов и иметь роль Редактор или выше на счёте-источнике.

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
  "notes": "Ежемесячный перевод на личный"
}
```

**Ответ** `201 Created`

### Список переводов

```http
GET /account-transfers
Authorization: Bearer <token>
```

**Ответ** `200 OK` — массив переводов для текущего пользователя.

### Удалить перевод

```http
DELETE /account-transfers/:id
Authorization: Bearer <token>
```

**Ответ** `204 No Content`

**Примечание:** Переводы между счетами работают на уровне пользователя (заголовок `X-Account-Id` не требуется). Пользователь должен быть участником обоих счетов и иметь роль Редактор или выше на счёте-источнике.

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

### Подсказка разделения

```http
POST /ai/suggest-splits
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "id": "expense-uuid",
  "description": "Перекрёсток — продукты и бытовая химия",
  "amount": 5130.00,
  "items": [
    { "description": "Яблоки", "totalPrice": 359.00 },
    { "description": "Куриная грудка", "totalPrice": 779.00 },
    { "description": "Средство для мытья полов", "totalPrice": 509.00 },
    { "description": "Губки", "totalPrice": 239.00 }
  ]
}
```

**Ответ** `200 OK`
```json
{
  "shouldSplit": true,
  "confidence": 0.91,
  "suggestedSplits": [
    {
      "categoryName": "Еда и рестораны",
      "amount": 1138.00,
      "percentage": 22.2,
      "reasoning": "Продукты питания: яблоки, куриная грудка"
    },
    {
      "categoryName": "Бытовые товары",
      "amount": 748.00,
      "percentage": 14.6,
      "reasoning": "Бытовая химия: средство для мытья полов, губки"
    }
  ]
}
```

**Стоимость AI**: 1.0 единица

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

Возвращает последние 20 разговоров аккаунта. Привязано к аккаунту: разговор виден, когда `accountId` совпадает с заголовком `X-Account-Id` **И** (`isShared` равно true **ИЛИ** разговор создан вызывающим пользователем).

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
    "lastMessageAt": "2026-05-20T14:30:00Z",
    "createdAt": "2026-05-20T14:00:00Z"
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
GET /analytics/tags
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
  "tags": [
    {
      "tagId": "uuid",
      "tagName": "командировка",
      "color": "#3498DB",
      "amount": 75000.00,
      "count": 8,
      "percentage": 35.2
    }
  ]
}
```

### Разбивка по проектам

```http
GET /analytics/projects
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
  "projects": [
    {
      "projectId": "uuid",
      "projectName": "Ремонт кухни",
      "totalExpenses": 192000.00,
      "totalIncome": 0,
      "expenseCount": 8,
      "budget": 300000.00,
      "isArchived": false
    }
  ]
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

`:id` — серверный PK расхода или локальный `clientId` мобильного клиента. `mode: "items"` назначает позиции чека участникам (любая неназначенная позиция остаётся плательщику); `mode: "equal"` делит весь счёт поровну между плательщиком и всеми участниками (`itemIds` в этом режиме игнорируется). От 1 до 20 участников, имя каждого — от 1 до 60 символов, обрезается по пробелам. **Идемпотентно**: повторный вызов для расхода, у которого уже есть живое разделение, возвращает это существующее разделение вместо создания второго набора токенов/строк. Отклоняется с `400` для полностью зашифрованного (E2EE, tier-2) аккаунта — сервер не может прочитать зашифрованные позиции чека, чтобы отрисовать гостевую страницу.

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
      "url": "https://api.ai-budget.pl/s/3f9a2b7c1e4d5a6b7c8d9e0f1a2b3c4d?lang=en"
    }
  ]
}
```

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

**DTO** (`packages/shared-types/src/dto/receipt-split.ts`): `SplitParticipantInput`, `CreateSplitDto`, `SplitParticipantStatus`, `SplitParticipantState`, `SplitStateResponse`.

---

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
