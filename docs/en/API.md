# API Reference

Base URL: `/api/v1`

All endpoints except authentication require a valid JWT token in the Authorization header:
```
Authorization: Bearer <access_token>
```

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
  "timezone": "Europe/London"
}
```

**Response** `200 OK`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Smith",
  "currencyCode": "EUR",
  "timezone": "Europe/London"
}
```

---

## Expenses

### List Expenses

```http
GET /expenses
Authorization: Bearer <token>
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
      "currencyCode": "USD",
      "description": "Lunch at restaurant",
      "date": "2024-01-15T12:30:00Z",
      "location": "New York, NY",
      "notes": "Business lunch",
      "receiptUrl": "https://storage.example.com/receipts/uuid.jpg",
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
Content-Type: application/json

{
  "clientId": "client-generated-uuid",
  "categoryId": "uuid",
  "amount": 29.99,
  "currencyCode": "USD",
  "description": "Lunch at restaurant",
  "date": "2024-01-15T12:30:00Z",
  "location": "New York, NY",
  "notes": "Business lunch",
  "isRecurring": false,
  "source": "manual"
}
```

**Response** `201 Created`
```json
{
  "id": "uuid",
  "clientId": "client-generated-uuid",
  "categoryId": "uuid",
  "amount": 29.99,
  "syncVersion": 1,
  "createdAt": "2024-01-15T12:35:00Z"
}
```

### Get Single Expense

```http
GET /expenses/:id
Authorization: Bearer <token>
```

**Response** `200 OK`
```json
{
  "id": "uuid",
  "clientId": "client-uuid",
  "categoryId": "uuid",
  "amount": 29.99,
  "currencyCode": "USD",
  "description": "Lunch at restaurant",
  "date": "2024-01-15T12:30:00Z",
  "category": {
    "id": "uuid",
    "name": "Food & Dining",
    "icon": "utensils",
    "color": "#FF6B6B"
  }
}
```

### Update Expense

```http
PATCH /expenses/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 35.50,
  "description": "Lunch at Italian restaurant"
}
```

**Response** `200 OK`
```json
{
  "id": "uuid",
  "amount": 35.50,
  "description": "Lunch at Italian restaurant",
  "syncVersion": 2,
  "updatedAt": "2024-01-15T14:00:00Z"
}
```

### Delete Expense

```http
DELETE /expenses/:id
Authorization: Bearer <token>
```

**Response** `204 No Content`

---

## Budgets

### List Budgets

```http
GET /budgets
Authorization: Bearer <token>
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
      "startDate": "2024-01-01T00:00:00Z",
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
Content-Type: application/json

{
  "clientId": "client-generated-uuid",
  "name": "Monthly Food Budget",
  "amount": 500.00,
  "currencyCode": "USD",
  "period": "monthly",
  "startDate": "2024-01-01T00:00:00Z",
  "categoryId": "uuid",
  "alertThreshold": 80
}
```

**Period Values**: `daily`, `weekly`, `monthly`, `yearly`, `custom`

**Response** `201 Created`
```json
{
  "id": "uuid",
  "clientId": "client-generated-uuid",
  "name": "Monthly Food Budget",
  "amount": 500.00,
  "syncVersion": 1
}
```

### Get Budget Progress

```http
GET /budgets/:id/progress
Authorization: Bearer <token>
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
  "dailyAllowance": 11.63,
  "onTrack": true
}
```

### Update Budget

```http
PATCH /budgets/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 600.00,
  "alertThreshold": 75
}
```

**Response** `200 OK`
```json
{
  "id": "uuid",
  "amount": 600.00,
  "alertThreshold": 75,
  "syncVersion": 2
}
```

### Delete Budget

```http
DELETE /budgets/:id
Authorization: Bearer <token>
```

**Response** `204 No Content`

---

## Categories

### List Categories

```http
GET /categories
Authorization: Bearer <token>
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
    },
    {
      "id": "uuid",
      "name": "Restaurants",
      "icon": "restaurant",
      "color": "#FF8888",
      "type": "expense",
      "isSystem": false,
      "parentId": "parent-uuid",
      "syncVersion": 1
    }
  ]
}
```

### Create Category

```http
POST /categories
Authorization: Bearer <token>
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

**Response** `201 Created`
```json
{
  "id": "uuid",
  "name": "Coffee Shops",
  "icon": "coffee",
  "color": "#8B4513",
  "type": "expense",
  "isSystem": false,
  "syncVersion": 1
}
```

### Update Category

```http
PATCH /categories/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Coffee & Tea",
  "color": "#654321"
}
```

**Response** `200 OK`
```json
{
  "id": "uuid",
  "name": "Coffee & Tea",
  "color": "#654321",
  "syncVersion": 2
}
```

### Delete Category

```http
DELETE /categories/:id
Authorization: Bearer <token>
```

**Response** `204 No Content`

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

### Get Spending Summary

```http
GET /analytics/summary
Authorization: Bearer <token>
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
    },
    {
      "categoryId": "uuid",
      "categoryName": "Transportation",
      "amount": 385.00,
      "percentage": 17.9,
      "count": 8
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
    },
    {
      "period": "2024-01-08",
      "total": 525.50,
      "count": 15
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

### Push Changes

```http
POST /sync/push
Authorization: Bearer <token>
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
    },
    {
      "serverId": "server-uuid",
      "serverVersion": 3,
      "status": "updated"
    }
  ],
  "conflicts": [
    {
      "serverId": "server-uuid",
      "clientVersion": 2,
      "serverVersion": 4,
      "serverData": { ... },
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
      "data": { ... },
      "syncVersion": 2,
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "categories": [ ... ],
  "budgets": [ ... ],
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
| `403` | Forbidden - Insufficient permissions |
| `404` | Not Found - Resource doesn't exist |
| `409` | Conflict - Sync version mismatch |
| `422` | Unprocessable Entity - Validation error |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error |

### Rate Limits

- Authentication endpoints: 10 requests/minute
- AI endpoints: 30 requests/minute
- Other endpoints: 100 requests/minute
