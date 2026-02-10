# API Reference

Base URL: `/api/v1`

All endpoints except authentication require a valid JWT token in the Authorization header:
```
Authorization: Bearer <access_token>
```

## Account Context

Most endpoints (expenses, budgets, categories, wallet, analytics, insights, sync) require an account context. Pass the account ID in a header:
```
X-Account-Id: <account-uuid>
```

The `AccountContextGuard` middleware validates that the authenticated user is a member of the specified account and sets `accountId` and `accountRole` on the request.

**Account roles:**
| Role | Permissions |
|------|-------------|
| `owner` | Full access, manage members and invitations |
| `editor` | Create, read, update expenses/budgets/categories |
| `viewer` | Read-only access |

---

## Authentication

### Register User

```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```

**Response** `201 Created`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "currencyCode": "USD",
  "timezone": "UTC",
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response** `200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### Refresh Token

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response** `200 OK`
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900
}
```

---

## Users

### Get Current User

```http
GET /users/me
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "currencyCode": "USD",
  "timezone": "UTC",
  "pushToken": null,
  "notifyBudgetAlerts": true,
  "notifySharedActivity": true,
  "defaultAccountId": "uuid",
  "lastSyncAt": "2024-01-15T10:30:00Z",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### Update Profile

```http
PATCH /users/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Smith",
  "currencyCode": "EUR",
  "timezone": "Europe/London",
  "notifyBudgetAlerts": true,
  "notifySharedActivity": false
}
```

**Response** `200 OK`

---

## Accounts

### Create Account

```http
POST /accounts
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Family Budget",
  "type": "shared",
  "currencyCode": "USD",
  "icon": "family"
}
```

**Type values**: `personal`, `business`, `shared`

**Response** `201 Created`
```json
{
  "id": "uuid",
  "name": "Family Budget",
  "type": "shared",
  "currencyCode": "USD",
  "ownerId": "user-uuid",
  "icon": "family",
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

### List Accounts

```http
GET /accounts
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "name": "Personal",
    "type": "personal",
    "currencyCode": "USD",
    "ownerId": "user-uuid",
    "role": "owner",
    "memberCount": 1
  }
]
```

### Get Account

```http
GET /accounts/:id
Authorization: Bearer <token>
```

### Update Account

```http
PATCH /accounts/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "icon": "wallet"
}
```

### Delete Account

```http
DELETE /accounts/:id
Authorization: Bearer <token>
```

**Response** `204 No Content`

### Create Invitation

```http
POST /accounts/:id/invitations
Authorization: Bearer <token>
Content-Type: application/json

{
  "invitedEmail": "friend@example.com",
  "role": "editor"
}
```

**Response** `201 Created`
```json
{
  "id": "uuid",
  "inviteCode": "ABC123XYZ",
  "role": "editor",
  "status": "pending",
  "expiresAt": "2024-01-22T10:30:00Z"
}
```

### List Invitations

```http
GET /accounts/:id/invitations
Authorization: Bearer <token>
```

### Cancel Invitation

```http
DELETE /accounts/:id/invitations/:invitationId
Authorization: Bearer <token>
```

### Accept Invitation

```http
POST /accounts/invitations/accept
Authorization: Bearer <token>
Content-Type: application/json

{
  "inviteCode": "ABC123XYZ"
}
```

### Decline Invitation

```http
POST /accounts/invitations/decline
Authorization: Bearer <token>
Content-Type: application/json

{
  "inviteCode": "ABC123XYZ"
}
```

### List Members

```http
GET /accounts/:id/members
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
[
  {
    "id": "member-uuid",
    "userId": "user-uuid",
    "role": "owner",
    "joinedAt": "2024-01-01T00:00:00Z",
    "user": {
      "id": "user-uuid",
      "name": "John Doe",
      "email": "john@example.com"
    }
  }
]
```

### Update Member Role

```http
PATCH /accounts/:id/members/:memberId
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "viewer"
}
```

### Remove Member

```http
DELETE /accounts/:id/members/:memberId
Authorization: Bearer <token>
```

### Leave Account

```http
POST /accounts/:id/leave
Authorization: Bearer <token>
```

---

## Expenses

All expense endpoints require `X-Account-Id` header.

### List Expenses

```http
GET /expenses
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | ISO 8601 | Filter from date |
| `endDate` | ISO 8601 | Filter to date |
| `categoryId` | UUID | Filter by category |
| `limit` | number | Max results (default: 50) |
| `offset` | number | Pagination offset |

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "clientId": "client-uuid",
      "categoryId": "uuid",
      "amount": 29.99,
      "discountAmount": null,
      "currencyCode": "USD",
      "description": "Lunch at restaurant",
      "date": "2024-01-15",
      "time": "12:30",
      "locationLat": 40.7128,
      "locationLng": -74.0060,
      "notes": "Business lunch",
      "receiptUrl": null,
      "isRecurring": false,
      "source": "manual",
      "syncVersion": 1,
      "createdAt": "2024-01-15T12:35:00Z",
      "category": {
        "id": "uuid",
        "name": "Food & Dining",
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

### Create Expense

```http
POST /expenses
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "clientId": "client-generated-uuid",
  "categoryId": "uuid",
  "amount": 29.99,
  "discountAmount": 5.00,
  "currencyCode": "USD",
  "description": "Lunch at restaurant",
  "date": "2024-01-15",
  "time": "12:30",
  "locationLat": 40.7128,
  "locationLng": -74.0060,
  "notes": "Business lunch",
  "isRecurring": false,
  "source": "manual"
}
```

**Response** `201 Created`

### Get Single Expense

```http
GET /expenses/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Update Expense

```http
PATCH /expenses/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "amount": 35.50,
  "description": "Lunch at Italian restaurant"
}
```

### Delete Expense

```http
DELETE /expenses/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Expense Items

#### List Items

```http
GET /expenses/:id/items
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "description": "Organic Apples",
    "quantity": 2.0,
    "unitPrice": 3.99,
    "totalPrice": 7.98,
    "sortOrder": 0
  }
]
```

#### Create Item

```http
POST /expenses/:id/items
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "description": "Almond Milk",
  "quantity": 1,
  "unitPrice": 4.49,
  "totalPrice": 4.49,
  "sortOrder": 1
}
```

#### Update Item

```http
PATCH /expenses/:id/items/:itemId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "quantity": 2,
  "totalPrice": 8.98
}
```

#### Delete Item

```http
DELETE /expenses/:id/items/:itemId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Receipt Image

#### Get Receipt Image

```http
GET /expenses/:id/receipt-image
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

#### Save Receipt Image

```http
PUT /expenses/:id/receipt-image
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

#### Delete Receipt Image

```http
DELETE /expenses/:id/receipt-image
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

---

## Incomes

All income endpoints require `X-Account-Id` header.

### List Incomes

```http
GET /incomes
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | ISO 8601 | Filter from date |
| `endDate` | ISO 8601 | Filter to date |
| `categoryId` | UUID | Filter by category |
| `limit` | number | Max results (default: 50) |
| `offset` | number | Pagination offset |

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "clientId": "client-uuid",
      "categoryId": "uuid",
      "amount": 5000.00,
      "currencyCode": "USD",
      "description": "Freelance payment",
      "date": "2024-01-15",
      "notes": "January invoice",
      "syncVersion": 1,
      "createdAt": "2024-01-15T10:00:00Z",
      "category": {
        "id": "uuid",
        "name": "Freelance",
        "color": "#4CAF50"
      }
    }
  ],
  "total": 10,
  "limit": 50,
  "offset": 0
}
```

### Create Income

```http
POST /incomes
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "localId": "client-generated-uuid",
  "amount": 5000.00,
  "currencyCode": "USD",
  "description": "Freelance payment",
  "notes": "January invoice",
  "categoryId": "uuid",
  "date": "2024-01-15T00:00:00Z"
}
```

**Response** `201 Created`

### Get Single Income

```http
GET /incomes/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Update Income

```http
PATCH /incomes/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "amount": 5500.00,
  "description": "Freelance payment (updated)"
}
```

### Delete Income

```http
DELETE /incomes/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

---

## Budgets

All budget endpoints require `X-Account-Id` header.

### List Budgets

```http
GET /budgets
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "clientId": "client-uuid",
      "name": "Monthly Food Budget",
      "amount": 500.00,
      "currencyCode": "USD",
      "period": "monthly",
      "startDate": "2024-01-01",
      "endDate": null,
      "categoryId": "uuid",
      "alertThreshold": 80,
      "isActive": true,
      "syncVersion": 1,
      "category": {
        "id": "uuid",
        "name": "Food & Dining",
        "icon": "utensils",
        "color": "#FF6B6B"
      }
    }
  ]
}
```

### Create Budget

```http
POST /budgets
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "clientId": "client-generated-uuid",
  "name": "Monthly Food Budget",
  "amount": 500.00,
  "currencyCode": "USD",
  "period": "monthly",
  "startDate": "2024-01-01",
  "categoryId": "uuid",
  "alertThreshold": 80
}
```

**Period Values**: `daily`, `weekly`, `monthly`, `yearly`, `custom`

**Response** `201 Created`

### Get Budget Progress

```http
GET /budgets/:id/progress
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "budget": {
    "id": "uuid",
    "name": "Monthly Food Budget",
    "amount": 500.00,
    "period": "monthly"
  },
  "spent": 325.50,
  "remaining": 174.50,
  "percentage": 65.1,
  "daysRemaining": 15,
  "dailyBurnRate": 21.70,
  "dailyAllowance": 11.63,
  "projectedTotal": 651.50,
  "estimatedExhaustionDate": "2024-01-23",
  "onTrack": true
}
```

### Update Budget

```http
PATCH /budgets/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "amount": 600.00,
  "alertThreshold": 75
}
```

### Delete Budget

```http
DELETE /budgets/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

---

## Categories

All category endpoints require `X-Account-Id` header.

### List Categories

```http
GET /categories
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Food & Dining",
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

### Create Category

```http
POST /categories
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "Coffee Shops",
  "icon": "coffee",
  "color": "#8B4513",
  "type": "expense",
  "parentId": "food-category-uuid"
}
```

**Type Values**: `expense`, `income`

### Update Category

```http
PATCH /categories/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "Coffee & Tea",
  "color": "#654321"
}
```

### Delete Category

```http
DELETE /categories/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

---

## Wallet

All wallet endpoints require `X-Account-Id` header.

### Set Balance

```http
POST /wallet
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "clientId": "client-generated-uuid",
  "currencyCode": "USD",
  "initialAmount": 5000.00
}
```

### List Balances

```http
GET /wallet
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "currencyCode": "USD",
    "initialAmount": 5000.00,
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

### Get Wallet Summary

```http
GET /wallet/summary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Remove Balance

```http
DELETE /wallet/:currencyCode
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

---

## Currency Exchange

All currency exchange endpoints require `X-Account-Id` header.

### Create Exchange

```http
POST /currency-exchanges
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "clientId": "client-generated-uuid",
  "fromCurrency": "USD",
  "toCurrency": "EUR",
  "fromAmount": 1000.00,
  "toAmount": 920.00,
  "exchangeRate": 0.92,
  "date": "2024-01-15",
  "notes": "Monthly exchange"
}
```

### List Exchanges

```http
GET /currency-exchanges
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Get Exchange Rates

```http
GET /currency-exchanges/rates?base=USD
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "base": "USD",
  "rates": {
    "EUR": 0.92,
    "GBP": 0.79,
    "JPY": 148.50
  }
}
```

### Get Single Exchange

```http
GET /currency-exchanges/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

### Delete Exchange

```http
DELETE /currency-exchanges/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

---

## Insights

Requires `X-Account-Id` header.

### Get Insights

```http
GET /insights
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "anomalies": [
    {
      "categoryId": "uuid",
      "categoryName": "Entertainment",
      "currentAmount": 450.00,
      "averageAmount": 200.00,
      "percentageChange": 125,
      "period": "2024-01"
    }
  ],
  "predictions": [
    {
      "budgetId": "uuid",
      "budgetName": "Monthly Food Budget",
      "estimatedExhaustionDate": "2024-01-25",
      "dailyBurnRate": 21.70,
      "daysRemaining": 15,
      "projectedTotal": 651.50,
      "currencyCode": "USD"
    }
  ]
}
```

---

## AI Insights

Requires `X-Account-Id` header. Requires Pro or Business subscription.

### Get AI-Generated Insights

```http
GET /insights/ai-charts?language=en
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `language` | string | Response language code (en, ru, de, es, fr, pl, ua) |

**Response** `200 OK`
```json
{
  "insights": [
    {
      "id": "uuid",
      "insightType": "anomaly_spike",
      "title": "Food spending spike",
      "description": "Your food spending increased 45% compared to the 3-month average.",
      "severity": "warning",
      "chartConfig": {
        "chartType": "bar",
        "title": "Food Spending Comparison",
        "data": [
          { "label": "Average", "value": 200, "color": "#4ECDC4" },
          { "label": "This month", "value": 290, "color": "#E74C3C" }
        ]
      },
      "actionSuggestion": "Consider setting a budget for this category.",
      "generatedAt": "2026-02-10T12:00:00Z"
    }
  ],
  "generatedAt": "2026-02-10T12:00:00Z",
  "periodStart": "2026-02-01T00:00:00Z",
  "periodEnd": "2026-02-28T00:00:00Z"
}
```

**Note:** Results are cached for 24 hours.

---

## Spending Story

Requires `X-Account-Id` header. Requires Pro or Business subscription.

### Generate Spending Story

```http
POST /insights/story
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "period": "month",
  "forceRegenerate": false,
  "language": "en"
}
```

**Body Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | `week` or `month` |
| `forceRegenerate` | boolean | Force regeneration (bypasses 24h cache) |
| `language` | string | Response language code |

**Response** `200 OK`
```json
{
  "story": {
    "id": "uuid",
    "accountId": "uuid",
    "periodLabel": "February 2026",
    "periodStart": "2026-02-01T00:00:00Z",
    "periodEnd": "2026-02-28T00:00:00Z",
    "blocks": [
      {
        "type": "hero_metric",
        "order": 1,
        "content": {
          "title": "Total Spent",
          "metrics": [{ "label": "Total", "value": "$1,250.00", "change": -12 }],
          "tone": "positive"
        }
      }
    ],
    "summary": "Great month! You spent 12% less than last month.",
    "generatedAt": "2026-02-10T12:00:00Z"
  },
  "isStale": false
}
```

**Block types:** `hero_metric`, `narrative_text`, `chart`, `comparison`, `callout`, `achievement`

---

## Analytics Drill-Down

Requires `X-Account-Id` header.

### Get Drill-Down Data

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
  "currencyCode": "USD"
}
```

**Body Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `level` | string | `year`, `month`, `week`, `day`, `transactions` |
| `parentId` | string | Category or date key for next level |
| `startDate` | ISO 8601 | Period start |
| `endDate` | ISO 8601 | Period end |
| `currencyCode` | string | Currency filter |

**Response** `200 OK`
```json
{
  "chart": {
    "chartType": "bar",
    "title": "Monthly Spending",
    "data": [
      { "label": "Jan", "value": 1200, "id": "2026-01" },
      { "label": "Feb", "value": 980, "id": "2026-02" }
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

## AI Services

### Transcribe Audio

```http
POST /ai/transcribe
Authorization: Bearer <token>
Content-Type: multipart/form-data

audio: <audio file>
language: "en" (optional)
```

**Response** `200 OK`
```json
{
  "text": "I spent twenty dollars on lunch today",
  "language": "en",
  "duration": 3.5
}
```

### Parse Expense from Text

```http
POST /ai/parse-expense
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "I spent twenty dollars on lunch today at the Italian place"
}
```

**Response** `200 OK`
```json
{
  "amount": 20.00,
  "currencyCode": "USD",
  "description": "Lunch at Italian place",
  "date": "2024-01-15",
  "suggestedCategory": "Food & Dining",
  "confidence": 0.92
}
```

### Auto-Categorize Expense

```http
POST /ai/categorize
Authorization: Bearer <token>
Content-Type: application/json

{
  "description": "Uber ride to airport",
  "amount": 45.00
}
```

**Response** `200 OK`
```json
{
  "categoryId": "uuid",
  "categoryName": "Transportation",
  "confidence": 0.95,
  "alternatives": [
    { "categoryId": "uuid", "name": "Travel", "confidence": 0.75 }
  ]
}
```

### Scan Receipt

```http
POST /ai/scan-receipt
Authorization: Bearer <token>
Content-Type: multipart/form-data

image: <image file>
```

**Response** `200 OK`
```json
{
  "merchant": "Whole Foods Market",
  "date": "2024-01-15",
  "time": "14:30",
  "items": [
    { "description": "Organic Apples", "amount": 5.99 },
    { "description": "Almond Milk", "amount": 4.49 }
  ],
  "subtotal": 10.48,
  "tax": 0.84,
  "total": 11.32,
  "currencyCode": "USD",
  "paymentMethod": "Credit Card",
  "confidence": 0.88
}
```

### Chat with AI Assistant

```http
POST /ai/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "conversationId": "uuid" (optional),
  "message": "How much did I spend on food this month?"
}
```

**Response** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": {
    "id": "uuid",
    "role": "assistant",
    "content": "This month you've spent $342.50 on Food & Dining, which is 68% of your $500 budget. You have $157.50 remaining with 15 days left in the month.",
    "tokensUsed": 156
  },
  "suggestedActions": [
    { "type": "view_chart", "label": "View spending breakdown" },
    { "type": "set_budget", "label": "Adjust food budget" }
  ]
}
```

---

## Analytics

All analytics endpoints require `X-Account-Id` header.

### Get Spending Summary

```http
GET /analytics/summary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | ISO 8601 | Period start (required) |
| `endDate` | ISO 8601 | Period end (required) |

**Response** `200 OK`
```json
{
  "period": {
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-01-31T23:59:59Z"
  },
  "totalExpenses": 2150.75,
  "totalIncome": 5000.00,
  "netSavings": 2849.25,
  "expenseCount": 47,
  "averageExpense": 45.76,
  "categoryBreakdown": [
    {
      "categoryId": "uuid",
      "categoryName": "Food & Dining",
      "amount": 542.30,
      "percentage": 25.2,
      "count": 15
    }
  ],
  "topExpenses": [
    {
      "id": "uuid",
      "description": "Monthly Rent",
      "amount": 1200.00,
      "date": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Get Spending Trends

```http
GET /analytics/trends
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `startDate` | ISO 8601 | Period start (required) |
| `endDate` | ISO 8601 | Period end (required) |
| `groupBy` | string | `day`, `week`, `month` (default: week) |

**Response** `200 OK`
```json
{
  "trends": [
    {
      "period": "2024-01-01",
      "total": 450.25,
      "count": 12
    }
  ],
  "comparison": {
    "previousPeriod": 1850.00,
    "currentPeriod": 2150.75,
    "change": 300.75,
    "changePercentage": 16.3
  },
  "monthlyAverage": 2000.38
}
```

---

## Synchronization

All sync endpoints require `X-Account-Id` header.

### Push Changes

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
        "amount": 29.99,
        "description": "Coffee",
        "date": "2024-01-15T10:00:00Z"
      },
      "clientVersion": 1
    },
    {
      "entityType": "expense",
      "operation": "update",
      "serverId": "server-uuid",
      "data": {
        "amount": 35.00
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

**Response** `200 OK`
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

### Pull Changes

```http
GET /sync/pull
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `since` | ISO 8601 | Last sync timestamp |

**Response** `200 OK`
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

## Error Responses

### Error Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [
    {
      "field": "amount",
      "message": "Amount must be a positive number"
    }
  ]
}
```

### Common Status Codes

| Code | Description |
|------|-------------|
| `400` | Bad Request - Invalid input |
| `401` | Unauthorized - Invalid or expired token |
| `403` | Forbidden - Insufficient permissions or wrong account role |
| `404` | Not Found - Resource doesn't exist |
| `409` | Conflict - Sync version mismatch |
| `422` | Unprocessable Entity - Validation error |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error |

### Rate Limits

- Authentication endpoints: 10 requests/minute
- AI endpoints: 30 requests/minute
- Other endpoints: 100 requests/minute
