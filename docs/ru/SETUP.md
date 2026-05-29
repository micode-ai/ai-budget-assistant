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
# В продакшене добавьте connection_limit=10 к строке подключения, чтобы
# ограничить пул соединений Prisma (как в docker-compose.prod.yml),
# например ...:5432/ai_budget?connection_limit=10
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
# В dev можно использовать '*'. В ПРОДАКШЕНЕ это должен быть явный список
# источников через запятую (никогда не '*'): при включённых credentials cors
# трактует '*' как буквальный origin, поэтому браузер админки не получает
# Access-Control-Allow-Origin и логин ломается.
# напр. CORS_ORIGIN=https://admin.ai-budget.pl,https://ai-budget.pl
CORS_ORIGIN=*

# Push-уведомления используют Expo Push API — дополнительная настройка не требуется.

# Telegram (опционально, для системных уведомлений)
# Telegram (бот для in-app команд; этот же токен использует
# uptime-check GitHub Actions workflow для алертов о падениях)
TELEGRAM_BOT_TOKEN=ваш-токен-telegram-бота
TELEGRAM_CHAT_ID=ваш-chat-id

# WhatsApp Business Cloud API (Meta). Scope токена: whatsapp_business_messaging.
WHATSAPP_ACCESS_TOKEN=ваш-meta-access-token
WHATSAPP_PHONE_NUMBER_ID=ваш-phone-number-id
WHATSAPP_BUSINESS_ACCOUNT_ID=ваш-business-account-id
WHATSAPP_VERIFY_TOKEN=ваш-webhook-verify-token
# HMAC-ключ для проверки подписи входящих вебхуков.
WHATSAPP_APP_SECRET=ваш-app-secret
# Показывается в мобильном приложении как wa.me deep link.
WHATSAPP_BUSINESS_PHONE_NUMBER=+1234567890
WHATSAPP_API_VERSION=v21.0

# Stripe (подписки). apiVersion в коде зафиксирован на
# '2026-01-28.clover' — должен совпадать с SDK из package-lock.json.
STRIPE_SECRET_KEY=sk_live_or_test_...

# Sentry (опционально, для ловли необработанных ошибок в проде)
SENTRY_DSN=https://<key>@<org>.ingest.<region>.sentry.io/<project>
```

#### Мобильное приложение (.env)

Создайте файл `apps/mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://localhost:3000/api/v1
```

#### Firebase (`google-services.json`)

Файл `apps/mobile/google-services.json` **не хранится в репозитории** — Android
API‑ключ Firebase распознаётся GitHub как секрет. Каждый разработчик подставляет
свою копию локально.

1. Скопируйте шаблон:
   ```bash
   cp apps/mobile/google-services.example.json apps/mobile/google-services.json
   ```
2. Скачайте настоящий `google-services.json` из
   [Firebase Console](https://console.firebase.google.com/) → *Project settings*
   → *Your apps* → Android‑приложение `com.budget.assistant` и замените шаблон.
3. Убедитесь, что Android API‑ключ ограничен по **package name** + **SHA‑1**
   в
   [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).

Для CI добавьте содержимое файла в секрет GitHub Actions `GOOGLE_SERVICES_JSON`
— воркфлоу `mobile-build` и `mobile-eas-build` записывают его в
`apps/mobile/google-services.json` перед сборкой.

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

## Production-деплой

Источник истины для прода — закоммиченный `docker-compose.prod.yml` на
Hetzner VPS. Ключевые отличия от dev compose выше:

- **API не пробрасывает порт на хост** — `budget-api-prod` доступен только
  через docker network; `shared-nginx` (отдельный стек) терминирует TLS
  для `api.ai-budget.pl` и проксирует upstream. Не делай `curl
  localhost:3000` с VPS — работать не будет. Только публичный URL.
- **Volumes** `ai-budget_postgres_data` и `ai-budget_redis_data` ОБЯЗАНЫ
  пережить деплои. Никогда не запускай `docker volume prune` без
  фильтров.
- **`env_file`** читается только при создании контейнера (не на
  `docker restart`). Чтобы подхватить новые переменные:
  ```bash
  cd /opt/ai-budget
  docker compose -f docker-compose.prod.yml --env-file .env.production \
    up -d --force-recreate api
  ```

### CI/CD

`.github/workflows/deploy.yml` триггерится на push в `development` при
изменениях в `apps/api/**`, `apps/admin/**`, `packages/**`, `docker/**`,
`docker-compose.prod.yml`, `scripts/deploy.sh`. Workflow:

1. SSH на VPS, запускает `scripts/deploy.sh` (git reset, `npm install` с
   копией `package-lock.json`, `prisma migrate deploy`,
   `up -d --force-recreate api admin`, затем `docker image prune -f` +
   `docker builder prune -af` — чистит build-кэш на каждом деплое).
2. Verify-step опрашивает `https://api.ai-budget.pl/api/v1/health` до 120с
   и валит run с дампом логов, если сервис не стал healthy.

### Snap-докер заморожен

После аварии 2026-04-27, когда `snap` авто-обновил Docker и угнал
`/var/run/docker.sock` у apt-демона, snap-версия Docker заморожена
и отключена:

```bash
snap refresh --hold docker
snap disable docker
```

Прод-контейнерами должен управлять только apt-`dockerd`. Не включай
snap обратно. Системный data-root — `/var/lib/docker`, его сохраняем.

### Гигиена диска

`scripts/deploy.sh` уже выполняет `docker image prune -f` + `docker builder prune -af`
на каждом деплое — именно build-кэш был главной причиной заполнения диска до 89%
(ABA-168), т.к. образы собираются на VPS. Ручная чистка теперь нужна редко:

```bash
journalctl --vacuum-size=500M    # обрезать journal-логи (~2-3 GB)
apt-get clean                    # apt-кеш (~400 МБ)
docker builder prune -af         # весь build-cache (без volumes)
docker image prune -f            # dangling untagged образы
# НИКОГДА: docker system prune --volumes  (затрёт данные postgres)
```

Чтобы понять, что занимает диск, не заходя по SSH вручную, запустите workflow
**Infra Diagnostics** (`.github/workflows/infra-diagnostics.yml`, ручной
`workflow_dispatch`). Он выполняет `scripts/infra-diagnostics.sh` по SSH и
печатает в лог `df -h`, `docker system df` и разбивку `du`.

## Резервное копирование БД

Production-PostgreSQL резервируется каждую ночь и вне хоста (ABA-166). Раннер
бэкапа не касается live-данных и держит только **публичный** ключ шифрования,
поэтому даже полностью скомпрометированный CI не сможет прочитать прошлые
бэкапы.

### Ночной workflow

`.github/workflows/backup-db.yml` запускается по cron `0 2 * * *` (02:00 UTC),
а также вручную через `workflow_dispatch`. Выполняется на раннере GitHub Actions
(не на VPS) и делает:

1. SSH на VPS и `docker exec budget-db-prod pg_dump -Fc` (custom format) —
   см. `scripts/backup-db.sh`.
2. Sanity-проверка дампа: минимальный размер (10 КБ) и количество объектов по
   `pg_restore --list` (≥ 10). Подозрительный дамп валит run.
3. Шифрование через `age` (асимметричное) публичным ключом получателя — у
   раннера никогда нет приватного ключа.
4. Публикация зашифрованного архива как Release-ассета
   (`ai_budget-YYYY-MM-DD.dump.age`, тег `backup-YYYY-MM-DD`) в **приватном**
   репозитории бэкапов `BACKUP_REPO`.
5. Очистка старых бэкапов по схеме GFS (`scripts/prune-backups.sh`):
   **7 daily** + **4 weekly** (якоря по воскресеньям) + **6 monthly** (якоря на
   1-е число); всё остальное удаляется.
6. При сбое — алерт в Telegram через `TELEGRAM_BOT_TOKEN` /
   `TELEGRAM_CHAT_ID`.

### Охват и RPO

- **RPO ≤ 24 ч** (худший случай = данные, записанные с момента последнего
  дампа в 02:00 UTC).
- **Redis НЕ резервируется** — это только кеш, он восстанавливается.
- **Изображения чеков хранятся в БД**, поэтому `pg_dump` уже включает их;
  отдельного бэкапа блобов нет.

### Ключ расшифровки (offline)

**Приватный** ключ `age` хранится offline у владельца (например, в менеджере
паролей). Его **нет** в CI, и это единственное, чем можно расшифровать любой
бэкап. Потеря ключа = потеря всех бэкапов. Полная процедура восстановления
(скачать → расшифровать → проверить в scratch-БД → восстановить в продакшен)
описана в [`docs/ops/restore-runbook.md`](../ops/restore-runbook.md).

### Необходимые GitHub Secrets

| Секрет | Назначение |
|--------|------------|
| `AGE_PUBLIC_KEY` | публичный ключ получателя `age1...`, которым шифрует раннер |
| `BACKUP_REPO` | `owner/repo` приватного репозитория бэкапов с Release-ассетами |
| `BACKUP_REPO_TOKEN` | PAT с правом `contents:write` на репо бэкапов (публикация + очистка) |
| `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` | доступ к VPS для дампа (переиспользуются из deploy) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | алерты о сбоях (переиспользуются из uptime/ops) |

## Мониторинг и observability

### Health-эндпоинт

`GET /api/v1/health` (публичный, без auth):

```json
{
  "status": "ok",
  "db": "ok",
  "uptimeSeconds": 384,
  "timestamp": "2026-04-27T18:22:48.653Z"
}
```

Возвращает HTTP `503` с `db: "fail"`, если Postgres недоступен.
Используется:

- Docker `HEALTHCHECK` в `docker/Dockerfile.api` (требует HTTP 200).
- CI verify-step (ждёт до 120с после `force-recreate`).
- Внешний uptime-монитор (ниже).

### Uptime-монитор

`.github/workflows/uptime-check.yml` запускается каждые 5 минут:

1. Curl-ит публичный `/api/v1/health` с retries.
2. При не-200 или транспортной ошибке шлёт сообщение в Telegram через
   `TELEGRAM_BOT_TOKEN` в `TELEGRAM_CHAT_ID` (оба хранятся как GitHub
   Actions secrets, НЕ в repo env).
3. Run помечается `failure` — красный в Actions UI.

Чтобы переопределить URL (например, для staging-пинга), задай repo-переменную
`HEALTH_URL`.

### Наблюдение за инфраструктурой (диск + контейнеры)

`.github/workflows/infra-watch.yml` запускается каждые 30 минут:

1. Заходит по SSH на VPS и передаёт `scripts/infra-check.sh` через соединение
   (`ssh … 'bash -s' < scripts/infra-check.sh`), поэтому не зависит от того,
   прошёл ли деплой.
2. Скрипт проверяет занятость корневого диска `/` (алерт, если выше
   `DISK_THRESHOLD`, по умолчанию `85`%) и что каждый прод-контейнер
   (`budget-db-prod`, `budget-redis-prod`, `budget-api-prod`,
   `budget-admin-prod`) запущен и не `unhealthy`.
3. При любой проблеме собранная сводка отправляется в Telegram (те же секреты,
   что у uptime-монитора). Новых секретов не требуется.

Дополняет uptime-монитор контролем заполнения диска и состоянием каждого
контейнера — того, что HTTP-проба не видит.

### Ротация логов

`docker-compose.prod.yml` задаёт драйвер логов `json-file` с
`max-size: "10m"` / `max-file: "3"` для `postgres`, `redis`, `api` и `admin`
(лимит ~30 МБ на контейнер), чтобы логи не переполнили диск. Лимит применяется
после того, как следующий `up -d` пересоздаст контейнеры.

### Восстановление после сбоя (Disaster recovery)

- `docs/ops/restore-runbook.md` — восстановление БД на работающем сервере.
- `docs/ops/disaster-recovery-runbook.md` — поднятие всего стека после полной
  потери VPS.

Обоим нужен **офлайн-приватный ключ `age`** (расшифровывает бэкапы). Для полного
поднятия дополнительно нужна **офлайн-копия `.env.production`** — секреты прода
существуют только на VPS, поэтому держите копию в менеджере паролей. Redis —
только кэш и намеренно **не** персистится (восстанавливается сам после рестарта).

### Sentry

`apps/api/src/instrument.ts` импортируется самой первой строкой в
`main.ts`, чтобы хуки встали до загрузки остальных модулей. Если
`SENTRY_DSN` задан, `@sentry/node` v8 инициализируется с:

- `tracesSampleRate: 0.1` в production, иначе `0`
- `release: process.env.GIT_SHA`, если выставлен на деплое
- Express-error-handler подключается после старта Nest через
  `Sentry.setupExpressErrorHandler(...)`

Без `SENTRY_DSN` SDK работает no-op и ничего не отправляет.

Чтобы проверить связь без редеплоя, отправь тестовое событие изнутри
работающего контейнера:

```bash
docker exec -e SENTRY_DSN="$DSN" budget-api-prod node -e \
  'const S=require("@sentry/node"); S.init({dsn:process.env.SENTRY_DSN}); \
   S.captureException(new Error("boot test")); S.close(5000)'
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
| `CORS_ORIGIN` | Разрешённые источники. Прод: явный список через запятую, никогда `*` | `*` |
| `STRIPE_SECRET_KEY` | Ключ Stripe (apiVersion закреплён `2026-01-28.clover`) | для биллинга |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота (in-app + ops-алерты) | опционально |
| `TELEGRAM_CHAT_ID` | Chat ID для системных и uptime-уведомлений | опционально |
| `WHATSAPP_ACCESS_TOKEN` | Access-токен Meta Cloud API (scope `whatsapp_business_messaging`) | опционально |
| `WHATSAPP_PHONE_NUMBER_ID` | ID номера телефона WhatsApp | опционально |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | ID бизнес-аккаунта WhatsApp | опционально |
| `WHATSAPP_VERIFY_TOKEN` | Токен верификации вебхука | опционально |
| `WHATSAPP_APP_SECRET` | HMAC-ключ для проверки подписи входящих вебхуков | опционально |
| `WHATSAPP_BUSINESS_PHONE_NUMBER` | Номер, показываемый как `wa.me` deep link в приложении | опционально |
| `WHATSAPP_API_VERSION` | Версия Meta Graph API (напр. `v21.0`) | опционально |
| `SENTRY_DSN` | DSN Sentry; без него SDK работает no-op | опционально |

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
