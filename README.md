# AI Budget Assistant

**AI-powered budget app for individuals and families.**
Track expenses by voice or receipt photo, set budgets and savings goals, manage subscriptions, import bank statements, and budget together in real time.

**[Open the app](https://app.ai-budget.pl)** · **[Google Play](https://play.google.com/store/apps/details?id=com.budget.assistant)** · **[Website](https://ai-budget.pl)**

---

## Screenshots

<p align="center">
  <img src="https://ai-budget.pl/assets/screens/en/01-home.png" width="160" alt="Home dashboard" />
  <img src="https://ai-budget.pl/assets/screens/en/02-ai-chat.png" width="160" alt="AI assistant" />
  <img src="https://ai-budget.pl/assets/screens/en/03-receipt-scan.png" width="160" alt="Receipt scanning" />
  <img src="https://ai-budget.pl/assets/screens/en/04-analytics.png" width="160" alt="Analytics" />
  <img src="https://ai-budget.pl/assets/screens/en/05-budget-detail.png" width="160" alt="Budgets" />
  <img src="https://ai-budget.pl/assets/screens/en/06-bank-import.png" width="160" alt="Bank import" />
</p>

---

## Features

- **Voice capture** — say what you spent, AI logs it instantly via Whisper
- **Receipt scanning** — photograph a receipt, AI extracts amount, merchant, and category
- **Bank notification capture** — Android intercepts bank push notifications and creates expenses on-device (40+ European banks, no credentials)
- **Bank import** — Wise, mBank, PKO BP, Revolut, Erste, Alior, universal CSV/PDF
- **AI chat** — ask financial questions or give commands in natural language (GPT-4)
- **Shared accounts** — family budgeting with owner/editor/viewer roles, activity feed, group purchase voting
- **Budgets & goals** — category budgets with history, savings goals with contribution log
- **Subscription manager** — track recurring charges with renewal reminders
- **Bots** — Telegram, WhatsApp, Slack: log expenses and chat with AI without opening the app
- **Safe-to-spend** — daily spendable amount calculated from balance minus upcoming obligations
- **Anomaly detection** — duplicate charges, price increases, spending spikes
- **Offline-first** — works without internet, end-to-end encryption, syncs when connected
- **Multi-currency** — USD, EUR, PLN, GBP, UAH, RUB with live exchange rates
- **9 languages** — EN, PL, DE, ES, FR, RU, UA, BE, NL

---

## Architecture

Turborepo monorepo with 5 packages:

| Package | Tech | Purpose |
|---|---|---|
| `apps/api` | NestJS 10 + Prisma 5 + PostgreSQL + Redis | REST API |
| `apps/mobile` | Expo 54 + React Native 0.81 + Zustand + SQLite | Mobile app (Android / Web) |
| `apps/admin` | Next.js 16 + shadcn/ui + Recharts | Admin dashboard |
| `packages/shared-types` | TypeScript | Shared entities and DTOs |
| `packages/shared-utils` | Zod + formatting | Shared validation and utilities |

---

## Documentation

### Developer Docs

| Language | Files |
|---|---|
| English | [README](docs/en/README.md) · [Architecture](docs/en/ARCHITECTURE.md) · [API](docs/en/API.md) · [Setup](docs/en/SETUP.md) · [Encryption](docs/en/ENCRYPTION.md) |
| Russian | [README](docs/ru/README.md) · [Architecture](docs/ru/ARCHITECTURE.md) · [API](docs/ru/API.md) · [Setup](docs/ru/SETUP.md) · [Encryption](docs/ru/ENCRYPTION.md) |

### User Docs

Available in 9 languages — [English](user_docs/en/00-index.md) · [Polski](user_docs/pl/00-index.md) · [Русский](user_docs/ru/00-index.md) · [Deutsch](user_docs/de/00-index.md) · [Español](user_docs/es/00-index.md) · [Français](user_docs/fr/00-index.md) · [Українська](user_docs/ua/00-index.md) · [Беларуская](user_docs/be/00-index.md) · [Nederlands](user_docs/nl/00-index.md)

---

## Quick Start

```bash
npm install          # install all dependencies
npm run dev          # start all dev servers (API + mobile + admin)
npm run dev:web      # mobile app in browser (localhost:8081)
```

See [docs/en/SETUP.md](docs/en/SETUP.md) for full setup including environment variables.

---

## License

Proprietary. © 2026 [MICODE sp. z o.o.](https://mi-code.pl/)
