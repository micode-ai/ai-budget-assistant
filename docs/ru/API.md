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
  "aiResponseMode": "balanced",
  "aiModel": "balanced",
  "isAdmin": false,
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
  "source": "manual",
  "tagIds": ["tag-uuid-1", "tag-uuid-2"]
}
```

**Примечание:** `tagIds` — опциональное поле. Теги автоматически привязываются к расходу.

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

---

## AI Инсайты

Требуется заголовок `X-Account-Id`. Требуется подписка Pro или Business.

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

Требуется заголовок `X-Account-Id`. Требуется подписка Pro или Business.

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
  ]
}
```

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

**AI функции:**
- `create_expense` — Создать расход (требует подтверждения)
- `create_income` — Создать доход (требует подтверждения)
- `create_budget` — Создать бюджет (требует подтверждения)
- `get_expenses` — Запросить расходы (выполняется немедленно)
- `get_budget_status` — Запросить статус бюджетов (выполняется немедленно)
- `get_category_breakdown` — Запросить расходы по категориям (выполняется немедленно)

**Определение языка:**
AI автоматически определяет язык пользователя из истории разговора и содержимого сообщения (русский, украинский, белорусский, немецкий, испанский, французский, польский, английский) и отвечает на том же языке.

---

### Подтвердить действие в чате

Подтверждение ожидающего действия записи (create_expense, create_income, create_budget).

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

Получение сгенерированных ИИ инсайтов для анализа инвестиционного портфеля. Требуется подписка Pro+.

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
- Требуется подписка Pro+

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
- Формат `csv` доступен на всех тарифах
- Форматы `pdf` и `excel` требуют подписку Pro+
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
- Требуется подписка Pro+
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
- `weeklyEmailEnabled` требует подписку Business
- `monthlyDigestEnabled` требует подписку Pro+

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
