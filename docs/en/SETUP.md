# Setup Guide

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **PostgreSQL** 14+
- **Redis** (optional, for caching)
- **OpenAI API Key**
- **Expo CLI** (for mobile development)
- **Android Studio** or **Xcode** (for native builds)

## Installation

### 1. Clone Repository

```bash
git clone https://github.com/your-org/ai-budget-assistant.git
cd ai-budget-assistant
```

### 2. Install Dependencies

```bash
# Install all dependencies
npm install
```

### 3. Environment Configuration

#### Backend (.env)

Create `apps/api/.env`:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/budget_assistant

# Redis (optional)
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-key-minimum-32-characters
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key

# Server
PORT=3000
CORS_ORIGIN=*

# Firebase (optional, for push notifications)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
```

#### Mobile (.env)

Create `apps/mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```

### 4. Database Setup

```bash
# Navigate to API directory
cd apps/api

# Generate Prisma client
npm run prisma generate

# Run migrations
npm run prisma migrate dev

# (Optional) Seed database with sample data
npm run prisma db seed
```

### 5. Start Development Servers

```bash
# From root directory - start all services
npm run dev

# Or start individually:

# Terminal 1 - Backend
cd apps/api
npm run dev

# Terminal 2 - Mobile
cd apps/mobile
npm start
```

## Development

### Running the Backend

```bash
cd apps/api

# Development mode with hot reload
npm run dev

# Production build
npm run build
npm start:prod

# Run tests
npm test
npm test:e2e
```

### Running the Mobile App

```bash
cd apps/mobile

# Start Expo development server
npm start

# Run on iOS Simulator
npm run ios

# Run on Android Emulator
npm run android

# Run on Web
npm run web
```

### Running Tests

```bash
# From root - run all tests
npm test

# API tests only
cd apps/api && npm test

# Watch mode
npm test:watch

# Coverage report
npm test:coverage
```

### Building for Production

```bash
# Build all packages
npm run build

# Build specific package
npm run build -w @budget/api
npm run build -w @budget/mobile
```

## Mobile Development

### iOS Setup

1. Install Xcode from App Store
2. Install Command Line Tools:
   ```bash
   xcode-select --install
   ```
3. Install CocoaPods:
   ```bash
   sudo gem install cocoapods
   ```
4. Run iOS app:
   ```bash
   cd apps/mobile
   npm run ios
   ```

### Android Setup

1. Install Android Studio
2. Install Android SDK (API 33+)
3. Create Android Virtual Device (AVD)
4. Set environment variables:

   **Linux/macOS:**
   ```bash
   export ANDROID_HOME=$HOME/Android/Sdk
   export PATH=$PATH:$ANDROID_HOME/emulator
   export PATH=$PATH:$ANDROID_HOME/tools
   export PATH=$PATH:$ANDROID_HOME/tools/bin
   export PATH=$PATH:$ANDROID_HOME/platform-tools
   ```

   **Windows (PowerShell):**
   ```powershell
   [Environment]::SetEnvironmentVariable("ANDROID_HOME", "D:\ProgramData\Local\Android\Sdk", "User")
   ```
   Or add `ANDROID_HOME` variable via System Properties → Environment Variables.

5. Generate native project (first time only):
   ```bash
   cd apps/mobile
   npx expo prebuild --platform android
   ```

6. Run Android app:
   ```bash
   cd apps/mobile
   npm run android
   ```

> **Important**: The app uses native build (`expo run:android`), not Expo Go, because it requires the `DETECT_SCREEN_CAPTURE` permission for Android 14+.

### Building Native Apps

#### iOS

```bash
cd apps/mobile

# Build for development
eas build --platform ios --profile development

# Build for production
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios
```

#### Android

```bash
cd apps/mobile

# Build APK for testing
eas build --platform android --profile preview

# Build AAB for Play Store
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android
```

## Docker Deployment

### Backend

```dockerfile
# apps/api/Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["node", "dist/main.js"]
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/budget_assistant
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - db
      - redis

  db:
    image: postgres:14-alpine
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=budget_assistant
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

### Running with Docker

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

## Configuration Options

### Backend Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `REDIS_URL` | Redis connection string | optional |
| `JWT_SECRET` | Secret for signing JWTs | required |
| `JWT_EXPIRES_IN` | Access token expiry | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token expiry | `7d` |
| `OPENAI_API_KEY` | OpenAI API key | required |
| `PORT` | Server port | `3000` |
| `CORS_ORIGIN` | Allowed origins | `*` |

### Mobile Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `EXPO_PUBLIC_API_URL` | Backend API URL | required |

### Expo App Configuration

Edit `apps/mobile/app.json`:

```json
{
  "expo": {
    "name": "Budget Assistant",
    "slug": "budget-assistant",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.yourcompany.budgetassistant"
    },
    "android": {
      "package": "com.yourcompany.budgetassistant"
    }
  }
}
```

## Troubleshooting

### Common Issues

#### Database Connection Failed

```
Error: P1001: Can't reach database server
```

**Solution**: Ensure PostgreSQL is running and `DATABASE_URL` is correct.

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Start PostgreSQL
sudo systemctl start postgresql
```

#### Prisma Client Not Found

```
Error: @prisma/client did not initialize yet
```

**Solution**: Regenerate Prisma client.

```bash
cd apps/api
npm run prisma generate
```

#### Metro Bundler Cache Issues

```
Error: Unable to resolve module
```

**Solution**: Clear Metro cache.

```bash
cd apps/mobile
npm start --clear
```

#### iOS Build Failed

```
Error: Command PhaseScriptExecution failed
```

**Solution**: Clear derived data and reinstall pods.

```bash
cd apps/mobile/ios
rm -rf ~/Library/Developer/Xcode/DerivedData
pod deintegrate
pod install
```

#### Android Build Failed

```
Error: Could not find com.android.tools.build:gradle
```

**Solution**: Sync Gradle and clear cache.

```bash
cd apps/mobile/android
./gradlew clean
./gradlew --refresh-dependencies
```

### Getting Help

- Check [GitHub Issues](https://github.com/your-org/ai-budget-assistant/issues)
- Review [API Documentation](./API.md)
- See [Architecture](./ARCHITECTURE.md) for system design

## Scripts Reference

### Root Package

| Script | Description |
|--------|-------------|
| `npm run dev` | Start all services in development |
| `npm run build` | Build all packages |
| `npm test` | Run all tests |
| `npm run lint` | Lint all packages |
| `npm run clean` | Clean all build artifacts |

### API Package

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with hot reload |
| `npm run build` | Build for production |
| `npm start:prod` | Run production build |
| `npm test` | Run unit tests |
| `npm test:e2e` | Run E2E tests |
| `npm run prisma studio` | Open Prisma Studio |

### Mobile Package

| Script | Description |
|--------|-------------|
| `npm start` | Start Expo server |
| `npm run ios` | Run on iOS |
| `npm run android` | Run on Android |
| `npm run web` | Run on Web |
| `npm run build:ios` | Build iOS app |
| `npm run build:android` | Build Android app |
