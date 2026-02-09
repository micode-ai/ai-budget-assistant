# AI Budget Assistant

AI-powered personal finance management application with voice input, receipt scanning, and intelligent expense categorization.

## Overview

AI Budget Assistant is a cross-platform mobile application that helps users track expenses, manage budgets, and gain insights into their spending habits using artificial intelligence.

### Key Features

- **Expense Tracking** - Manual entry, voice input, and receipt scanning
- **Expense Items** - Itemized receipts with line items (quantity, unit price)
- **AI-Powered Categorization** - Automatic expense categorization using GPT-4
- **Voice Input** - Transcribe expenses using Whisper API
- **Receipt Scanning** - Extract data from receipts using GPT-4 Vision
- **Budget Management** - Set and track budgets with threshold alerts
- **Multi-Account Support** - Personal, business, and shared accounts with role-based access (owner/editor/viewer)
- **Wallet & Currency Exchange** - Multi-currency wallet balances and exchange rate tracking
- **Smart Insights** - Spending anomaly detection and budget exhaustion predictions
- **Push Notifications** - Budget alerts and spending anomaly notifications (Expo Push)
- **AI Chat Assistant** - Get personalized financial advice
- **Analytics** - Visual spending trends and category breakdowns
- **Shared Accounts** - Invite members via invite codes, track shared activity
- **Offline-First** - Full functionality without internet connection
- **Cross-Platform** - iOS, Android, and Web support

## Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile | React Native / Expo 50 |
| State Management | Zustand |
| Data Fetching | TanStack React Query |
| Local Database | SQLite + Drizzle ORM |
| Backend | NestJS 10 |
| Database | PostgreSQL + Prisma |
| Cache | Redis |
| Authentication | JWT + Passport |
| AI/ML | OpenAI (GPT-4, Whisper, Vision) |
| Build System | Turborepo |
| Package Manager | npm |

## Project Structure

```
ai-budget-assistant/
├── apps/
│   ├── api/                 # NestJS backend
│   │   ├── prisma/          # Database schema
│   │   └── src/
│   │       └── modules/     # Feature modules
│   └── mobile/              # Expo React Native app
│       ├── app/             # Screens (Expo Router)
│       └── src/
│           ├── components/  # UI components
│           ├── db/          # SQLite schema
│           ├── services/    # API client
│           └── stores/      # Zustand stores
├── packages/
│   ├── shared-types/        # TypeScript definitions
│   └── shared-utils/        # Validation & utilities
└── docs/                    # Documentation
```

## Documentation

- [Architecture](./ARCHITECTURE.md) - System design and data flow
- [API Reference](./API.md) - Backend API endpoints
- [Setup Guide](./SETUP.md) - Installation and configuration

## Quick Start

```bash
# Install dependencies
npm install

# Start development
npm run dev

# Build for production
npm run build
```

## Requirements

- Node.js >= 20.0.0
- npm >= 10.0.0
- PostgreSQL 14+
- Redis (optional)
- OpenAI API key

## License

MIT
