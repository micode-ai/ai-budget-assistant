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
  "aiResponseMode": "balanced",
  "aiModel": "balanced",
  "isAdmin": false,
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

### Update AI Response Mode

```http
PATCH /users/me/ai-response-mode
Authorization: Bearer <token>
Content-Type: application/json

{
  "mode": "balanced"
}
```

**Mode values**: `simple`, `balanced`, `expert`

**Response** `200 OK`
```json
{ "success": true, "mode": "balanced" }
```

### Update AI Model

```http
PATCH /users/me/ai-model
Authorization: Bearer <token>
Content-Type: application/json

{
  "model": "fast"
}
```

**Model values**: `fast`, `balanced`, `quality`

| Value | OpenAI Model | Max Tokens | Cost Multiplier |
|-------|-------------|-----------|-----------------|
| `fast` | `gpt-4o-mini` | 1500 | ×0.75 |
| `balanced` | `gpt-4o` | 2000 | ×1.0 |
| `quality` | `gpt-4.1` | 3000 | ×1.5 |

**Response** `200 OK`
```json
{ "success": true, "model": "fast" }
```

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
  "source": "manual",
  "tagIds": ["tag-uuid-1", "tag-uuid-2"]
}
```

**Note:** `tagIds` is optional. Tags will be associated with the expense automatically.

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

## Tags

All tag endpoints require `X-Account-Id` header.

### List Tags

```http
GET /tags
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "business-trip",
      "color": "#3498DB",
      "icon": "briefcase",
      "usageCount": 12,
      "syncVersion": 1,
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ]
}
```

### Create Tag

```http
POST /tags
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "business-trip",
  "color": "#3498DB",
  "icon": "briefcase"
}
```

**Response** `201 Created`

### Update Tag

```http
PATCH /tags/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "work-trip",
  "color": "#2980B9"
}
```

### Delete Tag

```http
DELETE /tags/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Add Tag to Expense

```http
POST /tags/:id/expenses/:expenseId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `201 Created`

### Remove Tag from Expense

```http
DELETE /tags/:id/expenses/:expenseId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Add Tag to Income

```http
POST /tags/:id/incomes/:incomeId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `201 Created`

### Remove Tag from Income

```http
DELETE /tags/:id/incomes/:incomeId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

---

## Projects

All project endpoints require `X-Account-Id` header.

### List Projects

```http
GET /projects?archived=false
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `archived` | boolean | Filter by archived status |

**Response** `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "clientId": "client-uuid",
      "name": "Kitchen Renovation",
      "description": "Complete kitchen remodel",
      "color": "#E74C3C",
      "icon": "home",
      "startDate": "2026-01-01",
      "endDate": "2026-03-31",
      "budget": 5000.00,
      "currencyCode": "USD",
      "isArchived": false,
      "syncVersion": 1,
      "createdAt": "2026-01-01T10:00:00Z"
    }
  ]
}
```

### Get Project

```http
GET /projects/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
Returns project with associated expenses and incomes.

### Create Project

```http
POST /projects
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "localId": "client-generated-uuid",
  "name": "Kitchen Renovation",
  "description": "Complete kitchen remodel",
  "color": "#E74C3C",
  "icon": "home",
  "startDate": "2026-01-01",
  "endDate": "2026-03-31",
  "budget": 5000.00,
  "currencyCode": "USD"
}
```

**Response** `201 Created`

### Update Project

```http
PATCH /projects/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "Kitchen Renovation Phase 2",
  "budget": 7500.00,
  "isArchived": false
}
```

### Delete Project

```http
DELETE /projects/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Add Expense to Project

```http
POST /projects/:id/expenses
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "expenseId": "expense-uuid"
}
```

**Response** `201 Created`

### Remove Expense from Project

```http
DELETE /projects/:id/expenses/:expenseId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Add Income to Project

```http
POST /projects/:id/incomes
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "incomeId": "income-uuid"
}
```

**Response** `201 Created`

### Remove Income from Project

```http
DELETE /projects/:id/incomes/:incomeId
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Get Project Analytics

```http
GET /projects/:id/analytics
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "projectId": "uuid",
  "projectName": "Kitchen Renovation",
  "totalExpenses": 3200.00,
  "totalIncome": 0,
  "netAmount": -3200.00,
  "expenseCount": 8,
  "incomeCount": 0,
  "budgetRemaining": 1800.00,
  "expensesByCategory": [
    {
      "categoryId": "uuid",
      "categoryName": "Materials",
      "amount": 2100.00,
      "count": 5
    }
  ],
  "timeline": [
    {
      "date": "2026-01-15",
      "expenses": 450.00,
      "income": 0
    }
  ]
}
```

---

## Expense Category Splits

Splits allow distributing a single expense across multiple categories.

### Set Splits for Expense

```http
POST /expenses/:id/splits
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "splits": [
    {
      "categoryId": "food-uuid",
      "amount": 30.00,
      "percentage": 60,
      "notes": "Groceries"
    },
    {
      "categoryId": "household-uuid",
      "amount": 20.00,
      "percentage": 40,
      "notes": "Cleaning supplies"
    }
  ]
}
```

**Validation**: 2-10 splits per expense.

**Response** `200 OK`
```json
{
  "splits": [
    {
      "id": "uuid",
      "expenseId": "expense-uuid",
      "categoryId": "food-uuid",
      "amount": 30.00,
      "percentage": 60,
      "notes": "Groceries",
      "category": {
        "id": "food-uuid",
        "name": "Food & Dining"
      }
    },
    {
      "id": "uuid",
      "expenseId": "expense-uuid",
      "categoryId": "household-uuid",
      "amount": 20.00,
      "percentage": 40,
      "notes": "Cleaning supplies",
      "category": {
        "id": "household-uuid",
        "name": "Household"
      }
    }
  ]
}
```

### Remove Splits from Expense

```http
DELETE /expenses/:id/splits
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

**Note:** When an expense has splits, analytics aggregate by split categories instead of the single expense category.

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

## Account Transfers

Account transfers are **user-scoped** — they do NOT require the `X-Account-Id` header since they span across accounts. The authenticated user must be a member of both the source and destination accounts, and must have at least **Editor** role on the source account.

### Create Transfer

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
  "notes": "Monthly transfer to personal"
}
```

**Response** `201 Created`
```json
{
  "id": "uuid",
  "localId": "client-generated-uuid",
  "fromAccountId": "source-account-uuid",
  "fromCurrency": "USD",
  "fromAmount": 1000.00,
  "toAccountId": "destination-account-uuid",
  "toCurrency": "EUR",
  "toAmount": 920.00,
  "exchangeRate": 0.92,
  "date": "2024-01-15T00:00:00Z",
  "notes": "Monthly transfer to personal",
  "userId": "user-uuid",
  "createdAt": "2024-01-15T12:00:00Z",
  "updatedAt": "2024-01-15T12:00:00Z"
}
```

### List Transfers

```http
GET /account-transfers
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
[
  {
    "id": "uuid",
    "localId": "client-generated-uuid",
    "fromAccountId": "source-account-uuid",
    "fromCurrency": "USD",
    "fromAmount": 1000.00,
    "toAccountId": "destination-account-uuid",
    "toCurrency": "EUR",
    "toAmount": 920.00,
    "exchangeRate": 0.92,
    "date": "2024-01-15T00:00:00Z",
    "notes": "Monthly transfer to personal",
    "userId": "user-uuid",
    "createdAt": "2024-01-15T12:00:00Z",
    "updatedAt": "2024-01-15T12:00:00Z"
  }
]
```

### Delete Transfer

```http
DELETE /account-transfers/:id
Authorization: Bearer <token>
```

**Response** `204 No Content`

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

Accepts a receipt image (camera/gallery) or a PDF file encoded as base64.

```http
POST /ai/scan-receipt
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "imageBase64": "<base64-encoded file>",
  "userPrompt": "Split equally between two people",
  "mimeType": "application/pdf"
}
```

**Body Parameters**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `imageBase64` | string | Yes | Base64-encoded image (JPEG/PNG) or PDF file |
| `userPrompt` | string | No | Additional instructions for the AI |
| `mimeType` | string | No | Set to `application/pdf` for PDF files; omit for images |

**PDF processing logic:**
- Text-based PDFs (e.g. digital invoices) — text is extracted and sent to AI as plain text (cheaper)
- Scanned/image PDFs — the full PDF file is sent to AI for visual analysis

**Response** `200 OK`
```json
{
  "amount": 11.32,
  "discountAmount": null,
  "currencyCode": "USD",
  "description": "Whole Foods Market (2 items)",
  "categoryId": "uuid",
  "categorySuggestion": "Groceries",
  "merchant": "Whole Foods Market",
  "date": "2024-01-15",
  "confidence": 0.88,
  "receiptItems": [
    { "description": "Organic Apples", "quantity": 1, "unitPrice": 5.99, "totalPrice": 5.99 },
    { "description": "Almond Milk", "quantity": 1, "unitPrice": 4.49, "totalPrice": 4.49 }
  ]
}
```

### Suggest Tags

```http
GET /ai/suggest-tags
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `description` | string | Expense description (required) |
| `merchant` | string | Merchant name (optional) |

**Response** `200 OK`
```json
{
  "tags": [
    {
      "name": "business-lunch",
      "confidence": 0.92,
      "source": "history",
      "existingTagId": "uuid"
    },
    {
      "name": "client-meeting",
      "confidence": 0.78,
      "source": "ai",
      "existingTagId": null
    }
  ]
}
```

**AI cost**: 0.5 units (only when history provides < 3 results)

**Source values**: `history` (from similar past expenses), `ai` (GPT-4 generated)

### Suggest Project

```http
POST /ai/suggest-project
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "description": "Paint for kitchen walls",
  "date": "2026-02-10",
  "locationName": "Home Depot"
}
```

**Response** `200 OK`
```json
{
  "projectId": "uuid",
  "projectName": "Kitchen Renovation",
  "confidence": 0.88
}
```

Returns `null` if no suitable project found (confidence < 0.6).

**AI cost**: 0.5 units

### Suggest Splits

```http
POST /ai/suggest-splits
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "id": "expense-uuid",
  "description": "Walmart groceries and cleaning supplies",
  "amount": 85.50,
  "items": [
    { "description": "Apples", "totalPrice": 5.99 },
    { "description": "Chicken breast", "totalPrice": 12.99 },
    { "description": "Floor cleaner", "totalPrice": 8.49 },
    { "description": "Sponges", "totalPrice": 3.99 }
  ]
}
```

**Response** `200 OK`
```json
{
  "shouldSplit": true,
  "confidence": 0.91,
  "suggestedSplits": [
    {
      "categoryName": "Food & Dining",
      "amount": 18.98,
      "percentage": 22.2,
      "reasoning": "Grocery items: apples, chicken breast"
    },
    {
      "categoryName": "Household",
      "amount": 12.48,
      "percentage": 14.6,
      "reasoning": "Cleaning supplies: floor cleaner, sponges"
    }
  ]
}
```

**AI cost**: 1.0 unit

### Chat with AI Assistant

Chat with the AI assistant to get financial advice and **execute actions** like creating expenses, budgets, or querying data.

```http
POST /ai/chat
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "conversationId": "uuid" (optional),
  "message": "How much did I spend on food this month?"
}
```

**Response (Query)** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "This month you've spent $342.50 on Food & Dining, which is 68% of your $500 budget. You have $157.50 remaining with 15 days left in the month."
}
```

**Response (Action Required - Write)** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "I'd like to add expense 20.00 PLN for groceries. Please confirm or cancel this action.",
  "pendingAction": {
    "id": "action-uuid",
    "actionType": "create_expense",
    "data": {
      "amount": 20,
      "currencyCode": "PLN",
      "description": "groceries",
      "categoryName": "Shopping",
      "date": "2026-02-21"
    },
    "displaySummary": "add expense 20.00 PLN for \"groceries\" [Shopping]"
  }
}
```

**Response (Action Executed - Read)** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "Here are your expenses for last week...",
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

**AI Functions:**
- `create_expense` — Create expense (requires confirmation)
- `create_income` — Create income (requires confirmation)
- `create_budget` — Create budget (requires confirmation)
- `get_expenses` — Query expenses (executes immediately)
- `get_budget_status` — Query budget status (executes immediately)
- `get_category_breakdown` — Query spending by category (executes immediately)

**Language Detection:**
The AI automatically detects the user's language from the conversation history and message content (Russian, Ukrainian, Belarusian, German, Spanish, French, Polish, English) and responds in the same language.

---

### Confirm Chat Action

Confirm a pending write action (create_expense, create_income, create_budget).

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

**Response** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "Expense created successfully: 20.00 PLN for groceries.",
  "actionResult": {
    "actionType": "create_expense",
    "success": true,
    "data": {
      "id": "expense-uuid",
      "amount": 20,
      "currencyCode": "PLN",
      "description": "groceries",
      "category": "Shopping",
      "date": "2026-02-21"
    }
  }
}
```

---

### Reject Chat Action

Reject a pending write action.

```http
POST /ai/chat/reject
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "conversationId": "uuid",
  "actionId": "action-uuid",
  "reason": "Changed my mind" (optional)
}
```

**Response** `200 OK`
```json
{
  "conversationId": "uuid",
  "message": "Action cancelled. I won't create that expense."
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

### Get Tag Breakdown

```http
GET /analytics/tags
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
  "tags": [
    {
      "tagId": "uuid",
      "tagName": "business-trip",
      "color": "#3498DB",
      "amount": 1250.00,
      "count": 8,
      "percentage": 35.2
    }
  ]
}
```

### Get Project Breakdown

```http
GET /analytics/projects
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
  "projects": [
    {
      "projectId": "uuid",
      "projectName": "Kitchen Renovation",
      "totalExpenses": 3200.00,
      "totalIncome": 0,
      "expenseCount": 8,
      "budget": 5000.00,
      "isArchived": false
    }
  ]
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

## Gamification

All gamification endpoints require `X-Account-Id` header.

### Get Gamification Profile

```http
GET /gamification/profile
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
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

### Check Achievements

Evaluates all achievement rules, updates streak, and returns newly unlocked badges.

```http
POST /gamification/check
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
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

**Note:** Achievement checks are also triggered automatically (fire-and-forget) when creating expenses, incomes, or budgets.

### Get Achievement Definitions

Returns all available achievement definitions. No authentication required.

```http
GET /gamification/definitions
```

**Response** `200 OK`
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

**Achievement categories:** `budget`, `tracking`, `streak`, `milestone`, `savings`

**Rarity levels:** `common`, `rare`, `epic`, `legendary`

**XP system:** 100 XP per level. Achievement XP ranges from 10 (common) to 500 (legendary).

---

## Investments

Investment portfolio tracking with real-time prices from Twelve Data API. Requires `X-Account-Id` header. Requires an **investment** type account (`type: 'investment'`).

### Search Assets

```http
GET /investments/assets/search?q=AAPL
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (symbol or company name) |

**Response** `200 OK`
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

### List Holdings

```http
GET /investments/holdings
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
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
    "notes": "Long-term hold",
    "syncVersion": 1,
    "createdAt": "2026-01-15T10:00:00Z"
  }
]
```

### Create Holding

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
  "notes": "Long-term hold"
}
```

**Asset Type Values**: `stock`, `crypto`, `etf`, `bond`, `commodity`

**Response** `201 Created`
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

### Delete Holding

```http
DELETE /investments/holdings/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

**Note:** Deleting a holding also deletes all associated transactions.

### List Transactions

```http
GET /investments/transactions?holdingId=uuid
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `holdingId` | UUID | Filter by holding (optional) |

**Response** `200 OK`
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
    "notes": "Initial purchase",
    "syncVersion": 1,
    "createdAt": "2026-01-15T10:00:00Z"
  }
]
```

### Create Transaction

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
  "notes": "Initial purchase"
}
```

**Transaction Type Values**: `buy`, `sell`

**Response** `201 Created`

**Note:** Creating a transaction automatically updates the holding's `quantity`, `averageCostBasis`, and `totalInvested` fields.

### Update Transaction

```http
PATCH /investments/transactions/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "quantity": 15,
  "pricePerUnit": 164.00,
  "notes": "Adjusted purchase"
}
```

**Response** `200 OK`

### Delete Transaction

```http
DELETE /investments/transactions/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Get Portfolio Summary

Returns aggregated portfolio metrics with current market values.

```http
GET /investments/summary
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
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

### Get Portfolio Analytics

Returns historical performance data with optional benchmark comparison.

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

**Body Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | `week`, `month`, `quarter`, `year`, `all` |
| `benchmark` | string | Benchmark symbol (optional): `SPY`, `QQQ`, `DIA`, `IWM` |

**Response** `200 OK`
```json
{
  "dates": ["2026-01-15", "2026-01-16", "2026-01-17"],
  "values": [4980.00, 5050.00, 5325.00],
  "investedValues": [4980.00, 4980.00, 4980.00],
  "benchmarkValues": [0, 0.45, 1.23],
  "benchmarkName": "SPY"
}
```

**Performance Calculation:**
```
Return % = ((End Value - Start Value) / Start Value) × 100
```

**Benchmark Values:** Normalized percentages relative to the first day (benchmarkValues[0] = 0, subsequent values = cumulative % change).

### Get Asset Price History

```http
GET /investments/holdings/:id/price-history?days=30
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `days` | number | Number of days (default: 30) |

**Response** `200 OK`
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

### Refresh Prices

Manually trigger price refresh for all holdings in the portfolio.

```http
POST /investments/refresh-prices
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "refreshed": 5,
  "failed": 0,
  "message": "Prices updated successfully"
}
```

**Note:** Prices are automatically updated every 15 minutes for active portfolios. Use this endpoint to force an immediate refresh.

### AI Portfolio Insights

Get AI-generated insights for investment portfolio analysis. Requires Pro+ subscription.

```http
GET /investments/insights?language=en
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| language | string | Language code (en, ru, ua, de, es, fr, pl, be) |

**Response** `200 OK`
```json
{
  "insights": [
    {
      "id": "uuid",
      "insightType": "concentration_risk",
      "title": "High Concentration in AAPL",
      "description": "Apple Inc represents 45% of your portfolio, which exceeds the recommended 25% threshold for single-asset concentration.",
      "severity": "warning",
      "chartConfig": {
        "chartType": "donut",
        "title": "Portfolio Allocation",
        "data": [
          { "label": "AAPL", "value": 45, "color": "#FF6B6B" },
          { "label": "GOOGL", "value": 30 },
          { "label": "Others", "value": 25 }
        ]
      },
      "actionSuggestion": "Consider diversifying by reducing AAPL position to below 25% of portfolio value.",
      "generatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "generatedAt": "2024-01-15T10:30:00Z",
  "portfolioSnapshotAt": "2024-01-15T10:30:00Z"
}
```

**Insight Types:**
| Type | Description | Severity Triggers |
|------|-------------|-------------------|
| `concentration_risk` | Single asset dominates portfolio | Critical: >40%, Warning: >25% |
| `sector_imbalance` | Portfolio heavily weighted to one asset type | Critical: >70%, Warning: >50% |
| `underperformer` | Asset significantly lagging benchmark | Critical: <-30%, Warning: <-15% |
| `overperformer` | Asset significantly beating benchmark | Info: >+20% |
| `benchmark_deviation` | Portfolio straying from benchmark | Critical: >25%, Warning: >15% |
| `diversification_gap` | Missing asset types | Critical: <2 types, Warning: <3 types |
| `cost_basis_alert` | High unrealized gains/losses | Critical: >50% or <-30% |
| `fee_impact` | Transaction fees eating returns | Critical: >5%, Warning: >2% |

**Notes:**
- Insights are cached for 24 hours
- Costs 2.5 AI credits per request
- Requires Pro+ subscription tier

---

## Reports

All report endpoints require JWT authentication and the `X-Account-Id` header.

### Generate Report

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

**Format values**: `csv`, `pdf`, `excel`

**Response** `201 Created`
```json
{
  "reportId": "uuid",
  "status": "completed",
  "downloadUrl": "/reports/uuid/download",
  "fileName": "report-2025-01-01-2025-01-31.pdf",
  "fileSize": 102400
}
```

**Notes:**
- `csv` format is available on all subscription tiers
- `pdf` and `excel` formats require Pro+ subscription tier
- Accounts with `encryptionTier >= 2` will receive a `403 Forbidden` response
- `categoryIds`, `tagIds`, `projectIds`, `currencyCode`, `includeExpenses`, and `includeIncomes` are all optional filters

### List Reports

```http
GET /reports
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
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

**Notes:**
- Returns the last 20 reports
- Reports expire after 7 days

### Download Report

```http
GET /reports/:id/download
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK` — Binary file

The response `Content-Type` depends on the report format:
| Format | Content-Type |
|--------|-------------|
| `csv` | `text/csv` |
| `pdf` | `application/pdf` |
| `excel` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |

The response includes a `Content-Disposition: attachment; filename="<fileName>"` header.

### Monthly Digest

```http
GET /reports/monthly-digest?month=2025-01
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "digest": {
    "periodLabel": "January 2025",
    "totalIncome": 5000.00,
    "totalExpenses": 3200.00,
    "savingsRate": 36.0,
    "topCategories": [
      {
        "categoryId": "uuid",
        "name": "Groceries",
        "amount": 850.00,
        "percentage": 26.56
      },
      {
        "categoryId": "uuid",
        "name": "Rent",
        "amount": 1200.00,
        "percentage": 37.50
      }
    ],
    "incomeChange": 5.2,
    "expenseChange": -3.1
  },
  "generatedAt": "2025-02-01T08:00:00Z"
}
```

**Notes:**
- Requires Pro+ subscription tier
- Results are cached for 7 days

### Get Report Preferences

```http
GET /reports/preferences
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "weeklyEmailEnabled": false,
  "weeklyEmailDay": 1,
  "monthlyDigestEnabled": true
}
```

### Update Report Preferences

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

**Response** `200 OK`
```json
{
  "weeklyEmailEnabled": true,
  "weeklyEmailDay": 1,
  "monthlyDigestEnabled": true
}
```

**Notes:**
- `weeklyEmailDay` accepts values `0` (Sunday) through `6` (Saturday)
- `weeklyEmailEnabled` requires Business subscription tier
- `monthlyDigestEnabled` requires Pro+ subscription tier

---

## Backups

All backup endpoints require JWT authentication and the `X-Account-Id` header.

### Export Backup

```http
POST /backups/export
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK` — JSON backup file containing all account data.
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

**Notes:**
- Available on all subscription tiers
- The `data` arrays contain the full records for each entity type

### Restore Backup

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

**Response** `200 OK`
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

**Notes:**
- `data` is the JSON string of a previously exported backup
- When `overwrite` is `true`, existing account data is replaced entirely; when `false`, backup data is merged with existing records
- The `errors` array contains any entity-level errors encountered during restoration

### Backup History

```http
GET /backups/history
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
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
