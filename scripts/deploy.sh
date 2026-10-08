#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/ai-budget"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

if docker compose version &>/dev/null; then
  DC="docker compose"
else
  DC="docker-compose"
fi

cd "$APP_DIR"

# Inbound e-mail container (ABA-644). It sits behind the `inbound-mail` compose profile, so the
# regular deploy never starts it and host port 25 stays closed. It is built/started here ONLY
# when .env.production carries INBOUND_MAIL_CONTAINER=true (set by hand per docs/ops/inbound-mail.md).
inbound_mail_enabled() {
  local v
  v="$(grep -E '^INBOUND_MAIL_CONTAINER=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'"'"' \r' || true)"
  [[ "$v" == "true" ]]
}

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found in $APP_DIR" >&2
  exit 1
fi
if ! grep -q "POSTGRES_PASSWORD=" "$ENV_FILE" || grep -q "POSTGRES_PASSWORD=$" "$ENV_FILE"; then
  echo "ERROR: POSTGRES_PASSWORD is not set in $ENV_FILE" >&2
  exit 1
fi

echo "=== Pulling latest code ==="
git fetch origin
git reset --hard origin/development

echo "=== Cleaning up stale containers ==="
docker container prune -f 2>/dev/null || true

echo "=== Building containers ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile migrate build api admin migrator
if inbound_mail_enabled; then
  echo "=== Building inbound-mail (INBOUND_MAIL_CONTAINER=true) ==="
  $DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile inbound-mail build inbound-mail
fi

echo "=== Starting infrastructure ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis

echo "Waiting for postgres to be healthy..."
for i in $(seq 1 30); do
  status=$($DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q postgres | xargs docker inspect --format='{{.State.Health.Status}}' 2>/dev/null || echo "starting")
  if [[ "$status" == "healthy" ]]; then
    echo "Postgres is healthy."
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "ERROR: Postgres did not become healthy in time" >&2
    $DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs postgres
    exit 1
  fi
  echo "  ($i/30) postgres status: $status — waiting 3s..."
  sleep 3
done

echo "=== Running database migrations ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile migrate run --rm migrator

echo "=== Starting application services ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate api admin

# No --force-recreate: compose recreates it only when its image or config changed, so an
# unrelated deploy does not drop in-flight SMTP sessions (senders would just retry, but why).
if inbound_mail_enabled; then
  echo "=== Starting inbound-mail ==="
  $DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile inbound-mail up -d inbound-mail
else
  echo "inbound-mail not enabled (INBOUND_MAIL_CONTAINER != true) - port 25 stays closed."
fi

echo "=== Waiting for services to start ==="
sleep 10

echo "=== Connecting shared nginx to budget network ==="
if docker ps -q -f name=accounting-nginx | grep -q .; then
  docker network connect ai-budget_budget-network accounting-nginx 2>/dev/null || true
  docker exec accounting-nginx nginx -s reload 2>/dev/null || true
  echo "accounting-nginx connected and reloaded."
else
  echo "WARNING: accounting-nginx not found."
fi

echo "=== Health checks ==="
$DC -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo "=== Cleaning up old images and build cache ==="
docker image prune -f
# Build cache accumulates several GB per deploy (images are built on the VPS)
# and was the main cause of the disk filling to 89% (ABA-165). Prune it each deploy.
docker builder prune -af

echo "=== Deployment complete ==="
