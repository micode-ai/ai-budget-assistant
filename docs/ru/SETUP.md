# Руководство по установке

## Требования

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **PostgreSQL** 14+
- **Redis** (опционально, для кэширования)
- **OpenAI API ключ**
- **Expo CLI** (для мобильной разработки)
- **Android Studio** или **Xcode** (для нативных сборок)

## Установка

### 1. Клонирование репозитория

```bash
git clone https://github.com/your-org/ai-budget-assistant.git
cd ai-budget-assistant
```

### 2. Установка зависимостей

```bash
# Установить все зависимости
npm install
```

### 3. Настройка окружения

#### Бэкенд (.env)

Создайте файл `apps/api/.env`:

```env
# База данных
DATABASE_URL=postgresql://user:password@localhost:5432/budget_assistant

# Redis (опционально)
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=ваш-супер-секретный-ключ-минимум-32-символа
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=sk-ваш-openai-api-ключ

# Сервер
PORT=3000
CORS_ORIGIN=*

# Firebase (опционально, для push-уведомлений)
FIREBASE_PROJECT_ID=ваш-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
```

#### Мобильное приложение (.env)

Создайте файл `apps/mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```

### 4. Настройка базы данных

```bash
# Перейти в директорию API
cd apps/api

# Сгенерировать Prisma клиент
npm run prisma generate

# Выполнить миграции
npm run prisma migrate dev

# (Опционально) Заполнить тестовыми данными
npm run prisma db seed
```

### 5. Запуск серверов разработки

```bash
# Из корневой директории — запустить все сервисы
npm run dev

# Или запустить по отдельности:

# Терминал 1 — Бэкенд
cd apps/api
npm run dev

# Терминал 2 — Мобильное приложение
cd apps/mobile
npm start
```

## Разработка

### Запуск бэкенда

```bash
cd apps/api

# Режим разработки с hot reload
npm run dev

# Продакшен сборка
npm run build
npm start:prod

# Запуск тестов
npm test
npm test:e2e
```

### Запуск мобильного приложения

```bash
cd apps/mobile

# Запустить Expo сервер разработки
npm start

# Запустить на iOS симуляторе
npm run ios

# Запустить на Android эмуляторе
npm run android

# Запустить в браузере
npm run web
```

### Запуск тестов

```bash
# Из корня — запустить все тесты
npm test

# Только тесты API
cd apps/api && npm test

# Режим наблюдения
npm test:watch

# Отчёт о покрытии
npm test:coverage
```

### Сборка для продакшена

```bash
# Собрать все пакеты
npm run build

# Собрать конкретный пакет
npm run build -w @budget/api
npm run build -w @budget/mobile
```

## Мобильная разработка

### Настройка iOS

1. Установите Xcode из App Store
2. Установите Command Line Tools:
   ```bash
   xcode-select --install
   ```
3. Установите CocoaPods:
   ```bash
   sudo gem install cocoapods
   ```
4. Запустите iOS приложение:
   ```bash
   cd apps/mobile
   npm run ios
   ```

### Настройка Android

1. Установите Android Studio
2. Установите Android SDK (API 33+)
3. Создайте Android Virtual Device (AVD)
4. Настройте переменные окружения:

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
   Или добавьте переменную `ANDROID_HOME` через Параметры системы → Переменные среды.

5. Сгенерируйте нативный проект (только при первом запуске):
   ```bash
   cd apps/mobile
   npx expo prebuild --platform android
   ```

6. Запустите Android приложение:
   ```bash
   cd apps/mobile
   npm run android
   ```

> **Важно**: Приложение использует нативную сборку (`expo run:android`), а не Expo Go, так как требует разрешение `DETECT_SCREEN_CAPTURE` для Android 14+.

### Сборка нативных приложений

#### iOS

```bash
cd apps/mobile

# Сборка для разработки
eas build --platform ios --profile development

# Сборка для продакшена
eas build --platform ios --profile production

# Отправка в App Store
eas submit --platform ios
```

#### Android

```bash
cd apps/mobile

# Сборка APK для тестирования
eas build --platform android --profile preview

# Сборка AAB для Play Store
eas build --platform android --profile production

# Отправка в Play Store
eas submit --platform android
```

## Развёртывание через Docker

### Бэкенд

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

### Запуск через Docker

```bash
# Сборка и запуск сервисов
docker-compose up -d

# Просмотр логов
docker-compose logs -f api

# Остановка сервисов
docker-compose down
```

## Параметры конфигурации

### Конфигурация бэкенда

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `DATABASE_URL` | Строка подключения PostgreSQL | обязательно |
| `REDIS_URL` | Строка подключения Redis | опционально |
| `JWT_SECRET` | Секрет для подписи JWT | обязательно |
| `JWT_EXPIRES_IN` | Время жизни access токена | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Время жизни refresh токена | `7d` |
| `OPENAI_API_KEY` | API ключ OpenAI | обязательно |
| `PORT` | Порт сервера | `3000` |
| `CORS_ORIGIN` | Разрешённые источники | `*` |

### Конфигурация мобильного приложения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `EXPO_PUBLIC_API_URL` | URL бэкенда API | обязательно |

### Конфигурация Expo приложения

Отредактируйте `apps/mobile/app.json`:

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

## Устранение неполадок

### Частые проблемы

#### Ошибка подключения к базе данных

```
Error: P1001: Can't reach database server
```

**Решение**: Убедитесь, что PostgreSQL запущен и `DATABASE_URL` указан правильно.

```bash
# Проверить статус PostgreSQL
sudo systemctl status postgresql

# Запустить PostgreSQL
sudo systemctl start postgresql
```

#### Prisma клиент не найден

```
Error: @prisma/client did not initialize yet
```

**Решение**: Перегенерируйте Prisma клиент.

```bash
cd apps/api
npm run prisma generate
```

#### Проблемы с кэшем Metro Bundler

```
Error: Unable to resolve module
```

**Решение**: Очистите кэш Metro.

```bash
cd apps/mobile
npm start --clear
```

#### Ошибка сборки iOS

```
Error: Command PhaseScriptExecution failed
```

**Решение**: Очистите derived data и переустановите pods.

```bash
cd apps/mobile/ios
rm -rf ~/Library/Developer/Xcode/DerivedData
pod deintegrate
pod install
```

#### Ошибка сборки Android

```
Error: Could not find com.android.tools.build:gradle
```

**Решение**: Синхронизируйте Gradle и очистите кэш.

```bash
cd apps/mobile/android
./gradlew clean
./gradlew --refresh-dependencies
```

### Получение помощи

- Проверьте [GitHub Issues](https://github.com/your-org/ai-budget-assistant/issues)
- Изучите [Документацию API](./API.md)
- Смотрите [Архитектуру](./ARCHITECTURE.md) для понимания дизайна системы

## Справочник скриптов

### Корневой пакет

| Скрипт | Описание |
|--------|----------|
| `npm run dev` | Запустить все сервисы в режиме разработки |
| `npm run build` | Собрать все пакеты |
| `npm test` | Запустить все тесты |
| `npm run lint` | Линтинг всех пакетов |
| `npm run clean` | Очистить артефакты сборки |

### API пакет

| Скрипт | Описание |
|--------|----------|
| `npm run dev` | Запустить с hot reload |
| `npm run build` | Собрать для продакшена |
| `npm start:prod` | Запустить продакшен сборку |
| `npm test` | Запустить юнит-тесты |
| `npm test:e2e` | Запустить E2E тесты |
| `npm run prisma studio` | Открыть Prisma Studio |

### Мобильный пакет

| Скрипт | Описание |
|--------|----------|
| `npm start` | Запустить Expo сервер |
| `npm run ios` | Запустить на iOS |
| `npm run android` | Запустить на Android |
| `npm run web` | Запустить в браузере |
| `npm run build:ios` | Собрать iOS приложение |
| `npm run build:android` | Собрать Android приложение |
