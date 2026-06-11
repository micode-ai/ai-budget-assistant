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

### Forgot Password

Request a password reset code. Always returns 200 regardless of whether the email exists (prevents email enumeration).

```http
POST /auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response** `200 OK`
```json
{
  "message": "If this email is registered, a reset code has been sent"
}
```

**Rate limit:** 3 requests per email per 15 minutes. Returns `429 Too Many Requests` if exceeded.

### Reset Password

Verify the 6-digit code and set a new password.

```http
POST /auth/reset-password
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "NewSecurePass1"
}
```

**Response** `200 OK`
```json
{
  "message": "Password reset successfully"
}
```

**Errors:**
- `400 Bad Request` — Invalid or expired code
- `429 Too Many Requests` — Max 5 verification attempts per email per 15 minutes

**Password requirements:** Minimum 8 characters, at least one uppercase letter, one lowercase letter, and one number.

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

### Bulk Update Expenses

Bulk update or soft-delete multiple expenses in one call. Powers the mobile multi-select bulk delete / recategorize / tag actions.

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

**Guards:** `JwtAuthGuard` + `AccountContextGuard` + `ViewerBlockGuard` (write action — viewers blocked).

**Body** (`BulkUpdateExpensesDto`)
| Field | Type | Description |
|-------|------|-------------|
| `ids` | string[] | Required. 1–500 expense identifiers. |
| `categoryId` | string \| null | Optional. Reassign category; `null` clears it. |
| `tagIds` | string[] | Optional. Tags to append to each expense. |
| `isDeleted` | boolean | Optional. When `true`, soft-deletes the expenses (overrides `categoryId`/`tagIds`). |

**Behaviour:** Validates that the ids belong to the account. When `isDeleted: true`, the matched expenses are soft-deleted; otherwise the supplied `categoryId` and/or `tagIds` are applied (tags are appended, not replaced).

**Note:** `ids` and `tagIds` may be **server PKs or the mobile's local `clientId`s** (offline-first). The service resolves both via `OR: [{ id }, { clientId }]`, so synced and unsynced rows are matched alike.

**Response** `200 OK`
```json
{ "updated": 2 }
```

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

**Response:**
```json
{
  "imageBase64": "/9j/4AAQ...",
  "mimeType": "image/jpeg"
}
```

`mimeType` is `image/jpeg` for photos or `application/pdf` for PDF receipts (e.g. from Telegram).

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

`DELETE /categories/:id`

Soft-deletes a category. Requires `editor` role or higher.

```http
DELETE /categories/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response:** 200 OK with the updated category object.

**Error Responses:**
- `404 Not Found` — Category not found
- `409 Conflict` — Category has related records:

```json
{
  "statusCode": 409,
  "message": "Category has related records",
  "details": {
    "expenses": 5,
    "incomes": 0,
    "budgets": 1,
    "budgetCategories": 0,
    "splits": 0,
    "children": 0
  }
}
```

**Notes:**
- Both system and custom categories can be deleted
- System categories have `accountId: null` on the server — deletion hides them for all accounts
- Deletion is blocked if any related active (non-deleted) records exist

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

Requires `X-Account-Id` header. Available on all subscription tiers. Uses AI requests from monthly allowance.

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

Requires `X-Account-Id` header. Available on all subscription tiers. Uses AI requests from monthly allowance.

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
| `userPrompt` | string | No | A note for the AI about this receipt (max 300 chars). Treated as a passive annotation, not as an instruction. |
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
- `create_category` — Create expense/income category (requires confirmation)
- `get_expenses` — Query expenses (executes immediately)
- `get_budget_status` — Query budget status (executes immediately)
- `get_category_breakdown` — Query spending by category (executes immediately)

**Language Detection:**
The AI automatically detects the user's language from the conversation history and message content (Russian, Ukrainian, Belarusian, German, Spanish, French, Polish, English) and responds in the same language.

---

### Confirm Chat Action

Confirm a pending write action (create_expense, create_income, create_budget, create_category).

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

**Note:** `confirm`/`reject` are scoped to the user who initiated the pending action — only the sender who triggered the `pendingAction` can confirm or reject it, and only within their own account.

---

### List Chat Conversations

Returns the last 20 conversations for the account. Account-scoped: a conversation is visible when `accountId` matches the `X-Account-Id` header **AND** (`isShared` is true **OR** the conversation was created by the caller).

```http
GET /ai/chat/conversations
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
[
  {
    "id": "conversation-uuid",
    "title": "Food spending this month",
    "isShared": false,
    "lastMessageAt": "2026-05-20T14:30:00Z",
    "createdAt": "2026-05-20T14:00:00Z"
  }
]
```

---

### Get Conversation Messages

Returns the last 50 messages (user + assistant roles only) for a conversation. Same access predicate as the conversation list.

```http
GET /ai/chat/conversations/:id/messages
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
[
  {
    "id": "message-uuid",
    "role": "user",
    "content": "How much did I spend on food this month?",
    "senderUserId": "user-uuid",
    "createdAt": "2026-05-20T14:30:00Z"
  },
  {
    "id": "message-uuid",
    "role": "assistant",
    "content": "This month you've spent $342.50 on Food & Dining.",
    "createdAt": "2026-05-20T14:30:02Z"
  }
]
```

---

### Poll Conversation

Returns messages newer than the `since` timestamp and refreshes the caller's Redis presence marker for the conversation (TTL 45s). Used by the mobile client to live-update a focused shared conversation (polled every ~4s).

```http
GET /ai/chat/conversations/:id/poll?since=2026-05-20T14:30:00Z
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `since` | ISO 8601 | Return only messages created after this timestamp (optional) |

**Response** `200 OK`
```json
{
  "messages": [
    {
      "id": "message-uuid",
      "role": "user",
      "content": "@John can you check this?",
      "senderUserId": "user-uuid",
      "createdAt": "2026-05-20T14:31:00Z"
    }
  ]
}
```

---

### Toggle Conversation Sharing

Marks a conversation as shared (visible to all account members) or private (creator-only). **Owner-only** — only an account `owner` may change the sharing flag.

```http
PATCH /ai/chat/conversations/:id/shared
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "isShared": true
}
```

**Response** `200 OK`
```json
{
  "id": "conversation-uuid",
  "isShared": true
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

## Import

Bulk-create transactions from a Wise CSV statement. Both endpoints require `X-Account-Id`.

### Preview a Wise CSV upload

```http
POST /import/wise/preview
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: multipart/form-data

file=<wise-statement.csv>
```

Max file size: 5 MB. Parses with `papaparse`, strips BOM, classifies each row as `expense` / `income` / `fx`, pairs FX conversion rows by shared `Payment Reference + Date + opposite sign`, folds `Total fees` into the absolute amount, and dedups by checking the `externalRef = 'wise:<TransferWise ID>'` against existing `Expense`/`Income`/`CurrencyExchange` rows in the account.

**Response** `200 OK`
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

### Commit selected rows

```http
POST /import/wise/commit
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "rows": [ /* WiseImportRow[] — only rows the user kept */ ]
}
```

Wraps every insert in one `prisma.$transaction`. Rows with `alreadyImported: true` are dropped server-side. Each created record gets `source: 'import'` (on `Expense`) and the `externalRef`. Duplicate-key violations (`P2002`) are swallowed per row.

**Response** `200 OK`
```json
{
  "createdExpenses": 96,
  "createdIncomes": 19,
  "createdExchanges": 3
}
```

---

## Bank Import

Bulk-create transactions from a bank statement (CSV or PDF). All endpoints require `X-Account-Id` and are guarded by `JwtAuthGuard + AccountContextGuard`.

Supported banks: `mbank`, `pko`, `ing`, `millennium`, `pekao`, `erste` (PDF), `alior` (PDF), plus a `universal` column-mapping fallback. CSV encoding (UTF-8 / Windows-1250) is auto-detected. PDF statements (detected by the `%PDF` header) skip CSV header/mapping/fingerprint handling and have their text extracted before parsing.

### Preview a Bank Statement Upload

```http
POST /import/bank/preview?bankId=mbank&mappingId=<uuid>&encoding=auto
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: multipart/form-data

file=<statement.csv | statement.pdf>
```

Max file size: 5 MB. The parser is chosen in this order: `mappingId` → `bankId` → saved header-fingerprint → auto-detect. FX rows (same date, opposite sign, different currency) are paired into a single `fx` row. Each row gets a deterministic `externalRef` (`bank:<bankId>:<isoDate>:<signedAmountCents>:<sha256(normalizedDesc).slice(0,8)>`). Two dedup layers run: (1) exact `externalRef` match (re-import of the same file); (2) content match on `(date, signedAmountCents, currency)` against all account Expense/Income regardless of source. Matched rows are returned with `alreadyImported: true` (auto-unchecked in the UI).

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `bankId` | string | Force a specific bank parser (optional) |
| `mappingId` | string | Apply a saved column mapping (optional) |
| `encoding` | string | `auto`, `utf-8`, or `windows-1250` (optional) |

**Body Fields (multipart)**
| Field | Type | Description |
|-------|------|-------------|
| `file` | file | The statement file (CSV or PDF) |
| `mapping` | string | Inline `ColumnMapping` JSON for the universal parser (optional) |
| `delimiter` | string | CSV delimiter override (optional) |
| `amountFormat` | string | `polish` or `standard` (optional) |
| `dateFormat` | string | `auto`, `DD.MM.YYYY`, `DD-MM-YYYY`, or `YYYY-MM-DD` (optional) |

**Response** `200 OK`
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
      "suggestedCategoryName": "Groceries",
      "alreadyImported": false
    }
  ]
}
```

### Commit Selected Rows

```http
POST /import/bank/commit
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "rows": [ /* ImportRow[] — only rows the user kept */ ],
  "bankId": "mbank",
  "headerFingerprint": "a1b2c3d4",
  "saveMapping": { "name": "My mBank export" }
}
```

Writes every insert in one `prisma.$transaction` with `source: 'import'` and the deterministic `externalRef`. Rows with `alreadyImported: true` are dropped server-side; duplicate-key violations are counted as `skippedDuplicates`. An `ImportBatch` is created in the same transaction so the import can be rolled back later (see **Import Batches**). The optional `saveMapping` persists the column mapping (keyed by `headerFingerprint`) for auto-application on future imports.

**Response** `200 OK`
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

### List Saved Mappings

```http
GET /import/bank/mappings
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

Returns the account's saved column mappings (one per `headerFingerprint`).

### Create a Saved Mapping

```http
POST /import/bank/mappings
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: application/json

{
  "name": "My bank export",
  "headerFingerprint": "a1b2c3d4",
  "bankId": "universal",
  "mapping": { "date": "Data", "amount": "Kwota", "description": "Opis" },
  "delimiter": ";",
  "encoding": "windows-1250",
  "amountFormat": "polish",
  "dateFormat": "DD.MM.YYYY"
}
```

**Response** `201 Created` — the saved mapping.

### Delete a Saved Mapping

```http
DELETE /import/bank/mappings/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

### Request a New Bank

Forwards a bank-support request (name, optional notes, optional example statement) to the **ops Telegram chat** — never to the requesting user.

```http
POST /import/bank/request-bank
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
Content-Type: multipart/form-data

file=<example-statement.csv | example-statement.pdf>   (optional)
bankName=Revolut
notes=CSV export from the mobile app
```

Max file size: 5 MB.

**Response** `200 OK`
```json
{ "ok": true }
```

---

## Import Batches

Tracks committed imports (Wise + bank) so they can be rolled back. All endpoints require `X-Account-Id` and are guarded by `JwtAuthGuard + AccountContextGuard`.

### List Import Batches

Returns the last 20 import batches for the account. `canRollback` is `true` when the batch is still `committed` and within the 30-day rollback window.

```http
GET /import/batches
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
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

### Roll Back an Import Batch

Soft-deletes (`isDeleted: true`) every transaction created by the batch and clears their `externalRef` so the same file can be re-imported cleanly, then marks the batch `rolled_back`.

```http
DELETE /import/batches/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{ "rolledBack": 118 }
```

**Errors:**
- `404 Not Found` — Batch not found in this account
- `403 Forbidden` — Already rolled back, or the 30-day rollback window has expired

---

## WhatsApp

The WhatsApp bot runs on the Meta Business Cloud API. The webhook endpoints are **excluded from the `/api/v1` prefix** — their full path is `/whatsapp/webhook` (no version prefix). They are not JWT-guarded; inbound events are verified by HMAC signature instead.

### Webhook Verification (Handshake)

Meta sends a GET handshake when the webhook is registered. The endpoint echoes back the `hub.challenge` only when `hub.mode=subscribe` and `hub.verify_token` matches the configured `WHATSAPP_VERIFY_TOKEN`.

```http
GET /whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<challenge>
```

**Response** `200 OK` — plain-text `hub.challenge` value (or `403 Forbidden` on mismatch).

### Inbound Webhook Event

Receives WhatsApp message events. The request body is verified with an HMAC-SHA256 signature (`X-Hub-Signature-256` header) computed over the raw request body using `WHATSAPP_APP_SECRET`. On a valid signature the endpoint ACKs `200` immediately and dispatches the update asynchronously (Meta retries on any non-200).

```http
POST /whatsapp/webhook
X-Hub-Signature-256: sha256=<hmac>
Content-Type: application/json

{ /* Meta WhatsApp webhook payload */ }
```

**Response** `200 OK` (empty) on success, `401 Unauthorized` on an invalid/missing signature.

### Generate WhatsApp Link Code

JWT-guarded (also requires `X-Account-Id`). Generates a 6-hex linking code the user sends to the bot via a `wa.me` deep link to connect their WhatsApp number.

```http
POST /users/me/whatsapp-link-code
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "code": "a1b2c3",
  "expiresAt": "2026-05-20T14:10:00Z",
  "waPhoneNumber": "+15551234567"
}
```

### Get WhatsApp Link Status

```http
GET /users/me/whatsapp-link
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
{
  "linked": true,
  "waPhoneNumber": "+15559876543",
  "waProfileName": "John Doe",
  "linkedAt": "2026-05-19T10:00:00Z"
}
```

Returns `{ "linked": false }` when no WhatsApp number is linked.

### Unlink WhatsApp

```http
DELETE /users/me/whatsapp-link
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
{ "success": true }
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

Get AI-generated insights for investment portfolio analysis. Available on all subscription tiers. Uses AI requests from monthly allowance.

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
- Available on all subscription tiers

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
- All formats (CSV, PDF, Excel) are available on all subscription tiers
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
- Available on all subscription tiers
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
- `weeklyEmailEnabled` is available on all subscription tiers
- `monthlyDigestEnabled` is available on all subscription tiers

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

## Usage Details

#### Get Usage Details

```
GET /subscriptions/usage/details?month=3&year=2026
```

Returns detailed AI usage breakdown for a specific month.

**Query Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `month` | number | No | Month (1-12), defaults to current |
| `year` | number | No | Year, defaults to current |

**Response:**
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

## Referrals

All referral endpoints require JWT authentication. No `X-Account-Id` header needed.

### Get My Referral Code

```http
GET /referrals/my-code
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "code": "AB3XK7"
}
```

Generates a unique 6-character code on first call, returns existing code on subsequent calls.

### Get Referral Stats

```http
GET /referrals/stats
Authorization: Bearer <access_token>
```

**Response:**
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

`nextMilestone` is `null` when all milestones are reached.

Milestones:
- 5 qualified referrals → `free_pro_month` (Stripe promo code sent via email)
- 10 qualified referrals → `ambassador_badge`

### Get Referral List

```http
GET /referrals/list
Authorization: Bearer <access_token>
```

**Response:**
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

**Referral statuses:**
| Status | Description |
|---|---|
| `pending` | Registered, waiting 7 days + activity confirmation |
| `qualified` | Active user confirmed, +30 AI requests granted to referrer |
| `expired` | 30 days passed without qualification |

### Referral Code at Registration

Referral codes are applied during user registration via the optional `referralCode` field:

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

When a valid code is provided:
- A referral record is created with status `pending`
- The referred user's trial is extended by 7 days (14 days total)
- The referrer receives a push notification

---

## Alerts

Proactive anomaly alerts generated automatically on expense write events and after import commits. All endpoints require JWT + `X-Account-Id` header.

**Alert types:**
| Type | Description |
|------|-------------|
| `category_spike` | Category spending increased >50% vs the 30-day rolling average |
| `price_increase` | Same merchant charged >20% more than the previous transaction |
| `duplicate_charge` | Near-identical charge (same amount + merchant) within 24 hours |
| `recurring_suggestion` | Identical charge detected ≥3 months in a row — possible untracked subscription |

**Generation:** Alerts are produced synchronously on `POST /expenses` (manual/voice/OCR) and asynchronously after bank/Wise import commits. Each alert type uses a deterministic `dedupKey` (`@@unique([accountId, dedupKey])`) so the same event never produces duplicate rows.

**Push notifications:** sent via the `spending_anomaly` notification type, gated by the `anomalyAlerts` user preference (`GET/PATCH /users/me/notification-preferences`), capped at 3 pushes per account per calendar day.

### List Alerts

Returns the last 50 non-dismissed alerts for the account (newest first) plus the count of unread alerts.

```http
GET /alerts?unread=true
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| `unread` | boolean | When `true`, returns only alerts where `readAt` is null (optional) |

**Response** `200 OK`
```json
{
  "alerts": [
    {
      "id": "uuid",
      "accountId": "account-uuid",
      "userId": "user-uuid",
      "type": "category_spike",
      "params": {
        "categoryName": "Food & Dining",
        "currentAmount": 320.00,
        "avgAmount": 180.00,
        "spikePercent": 78
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

**`params` shape by type:**
| Type | Key fields |
|------|-----------|
| `category_spike` | `categoryName`, `currentAmount`, `avgAmount`, `spikePercent` |
| `price_increase` | `merchant`, `previousAmount`, `currentAmount`, `increasePercent` |
| `duplicate_charge` | `merchant`, `amount`, `currencyCode`, `previousExpenseId` |
| `recurring_suggestion` | `merchant`, `amount`, `currencyCode`, `monthCount` |

### Mark All Alerts Read

Marks all unread alerts in the account as read. **Viewer role blocked** (403).

```http
PATCH /alerts/read-all
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{ "updated": 3 }
```

### Mark One Alert Read

Marks a single alert as read. **Viewer role blocked** (403).

```http
PATCH /alerts/:id/read
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `200 OK`
```json
{
  "id": "uuid",
  "readAt": "2026-06-10T15:00:00Z"
}
```

**Errors:**
- `404 Not Found` — Alert not found in this account

### Dismiss Alert

Soft-hides an alert (sets `dismissedAt`). Dismissed alerts are excluded from `GET /alerts`. **Viewer role blocked** (403).

```http
DELETE /alerts/:id
Authorization: Bearer <token>
X-Account-Id: <account-uuid>
```

**Response** `204 No Content`

**Errors:**
- `404 Not Found` — Alert not found in this account

### Notification Preferences

The `anomalyAlerts` field is part of the standard notification preferences object:

```http
GET /users/me/notification-preferences
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
{
  "budgetAlerts": true,
  "sharedActivity": true,
  "debtReminders": true,
  "recurringExpenses": true,
  "subscriptionRenewals": true,
  "anomalyAlerts": true
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

**Response** `200 OK` — updated preferences object.

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
