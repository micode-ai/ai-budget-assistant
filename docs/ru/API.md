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
  "pushToken": null,
  "notifyBudgetAlerts": true,
  "notifySharedActivity": true,
  "defaultAccountId": "uuid",
  "lastSyncAt": "2024-01-15T10:30:00Z",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

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
  "icon": "wallet"
}
```

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
  "locationLat": 55.7558,
  "locationLng": 37.6173,
  "notes": "Деловой обед",
  "isRecurring": false,
  "source": "manual"
}
```

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

### Удалить баланс

```http
DELETE /wallet/:currencyCode
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Ответ** `204 No Content`

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

```http
POST /ai/scan-receipt
Authorization: Bearer <token>
Content-Type: multipart/form-data

image: <изображение>
```

**Ответ** `200 OK`
```json
{
  "merchant": "Перекрёсток",
  "date": "2024-01-15",
  "time": "14:30",
  "items": [
    { "description": "Яблоки органические", "amount": 299.00 },
    { "description": "Миндальное молоко", "amount": 249.00 }
  ],
  "subtotal": 548.00,
  "tax": 0,
  "total": 548.00,
  "currencyCode": "RUB",
  "paymentMethod": "Банковская карта",
  "confidence": 0.88
}
```

### Чат с AI ассистентом

```http
POST /ai/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "conversationId": "uuid" (опционально),
  "message": "Сколько я потратил на еду в этом месяце?"
}
```

**Ответ** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": {
    "id": "uuid",
    "role": "assistant",
    "content": "В этом месяце вы потратили 20 550 ₽ на категорию \"Еда и рестораны\", что составляет 68% от вашего бюджета в 30 000 ₽. До конца месяца осталось 9 450 ₽ на 15 дней.",
    "tokensUsed": 156
  },
  "suggestedActions": [
    { "type": "view_chart", "label": "Посмотреть статистику расходов" },
    { "type": "set_budget", "label": "Изменить бюджет на еду" }
  ]
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
