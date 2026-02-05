# AI Budget Assistant - Remaining Tasks

## Completed Features

- [x] Monorepo setup (Turborepo + pnpm)
- [x] Mobile app (Expo + TypeScript + Expo Router)
- [x] Backend API (NestJS + PostgreSQL + Prisma)
- [x] Shared packages (types + utils)
- [x] JWT Authentication
- [x] SQLite local database (Drizzle ORM)
- [x] Zustand state management
- [x] Expense CRUD (local + API)
- [x] Category management
- [x] Budget CRUD
- [x] Voice input (Whisper API)
- [x] AI Chat assistant (GPT-4)
- [x] Receipt OCR scanning (GPT-4 Vision)
- [x] Analytics dashboard with charts
- [x] Basic sync mechanism

---

## Remaining Tasks

### High Priority

#### Push Notifications
- [ ] Setup Firebase Cloud Messaging
- [ ] Create notification service on backend
- [ ] Register device tokens on mobile
- [ ] Budget alert notifications
- [ ] Daily/weekly spending summary notifications

#### Scheduled Jobs
- [ ] Setup Bull/Agenda for job scheduling
- [ ] Daily budget check job
- [ ] Weekly spending report generation
- [ ] Cleanup old sync logs

#### Export Functionality
- [ ] PDF report generation (backend)
- [ ] CSV export for expenses
- [ ] Export UI in analytics screen
- [ ] Share functionality

### Medium Priority

#### Sync Improvements
- [ ] Background sync (expo-background-fetch)
- [ ] Conflict resolution UI
- [ ] Sync status indicators
- [ ] Retry mechanism with exponential backoff
- [ ] Offline mode indicator

#### Performance
- [ ] FlatList optimization (memo, getItemLayout)
- [ ] Image caching for receipts
- [ ] Query result caching
- [ ] Bundle size optimization

#### UX Enhancements
- [ ] Biometric authentication
- [ ] Onboarding flow
- [ ] Skeleton loaders
- [ ] Pull-to-refresh everywhere
- [ ] Haptic feedback

### Low Priority

#### Testing
- [ ] Unit tests for stores
- [ ] Unit tests for hooks
- [ ] API integration tests
- [ ] E2E tests with Detox
- [ ] Backend unit tests

#### DevOps
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Staging environment
- [ ] Error tracking (Sentry)
- [ ] Analytics (Mixpanel/Amplitude)

#### App Store
- [ ] App icons and splash screen
- [ ] Screenshots for stores
- [ ] App Store listing
- [ ] Google Play listing
- [ ] Privacy policy
- [ ] Terms of service

---

## Environment Setup

### Backend
```bash
cd apps/api
cp .env.example .env
# Configure DATABASE_URL, OPENAI_API_KEY, JWT_SECRET
docker-compose up -d  # PostgreSQL + Redis
pnpm run start:dev
```

### Mobile
```bash
cd apps/mobile
# Configure EXPO_PUBLIC_API_URL in .env
pnpm run start
```

---

## API Keys Required
- `OPENAI_API_KEY` - For Whisper, GPT-4, GPT-4 Vision
- `JWT_SECRET` - For authentication
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection (optional, for sessions)
- `FIREBASE_*` - For push notifications (when implemented)
