#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${PM2_APP_NAME:-whs-beta-rc}"
ENV_FILE="${ENV_FILE:-.env}"
ENV_TEMPLATE="${ENV_TEMPLATE:-.env.beta-rc.example}"

echo "[deploy] starting beta-RC deploy in $(pwd)"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ENV_TEMPLATE" ]]; then
    cp "$ENV_TEMPLATE" "$ENV_FILE"
    echo "[deploy] created $ENV_FILE from $ENV_TEMPLATE"
  elif [[ -f ".env.example" ]]; then
    cp ".env.example" "$ENV_FILE"
    echo "[deploy] created $ENV_FILE from .env.example"
  else
    echo "[deploy] ERROR: no env template found"
    exit 1
  fi
  echo "[deploy] edit $ENV_FILE and set real values before rerunning"
  exit 1
fi

if grep -qE '^SESSION_SECRET=CHANGE_ME' "$ENV_FILE"; then
  if command -v openssl >/dev/null 2>&1; then
    secret="$(openssl rand -base64 48 | tr -d '\n')"
    sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${secret}|" "$ENV_FILE"
    echo "[deploy] generated SESSION_SECRET in $ENV_FILE"
  else
    echo "[deploy] WARNING: openssl not found; keep SESSION_SECRET set manually"
  fi
fi

auth_dir="$(grep -E '^WWEBJS_AUTH_DIR=' "$ENV_FILE" | head -n1 | cut -d'=' -f2- || true)"
if [[ -z "$auth_dir" ]]; then
  auth_dir="/var/www/paredes_devs/whs-auth"
  if grep -qE '^WWEBJS_AUTH_DIR=' "$ENV_FILE"; then
    sed -i "s|^WWEBJS_AUTH_DIR=.*|WWEBJS_AUTH_DIR=${auth_dir}|" "$ENV_FILE"
  else
    printf '\nWWEBJS_AUTH_DIR=%s\n' "$auth_dir" >> "$ENV_FILE"
  fi
fi

mkdir -p "$auth_dir" logs/pm2
echo "[deploy] ensured directories: $auth_dir and logs/pm2"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[deploy] ERROR: pm2 is not installed. Run: npm i -g pm2"
  exit 1
fi

echo "[deploy] installing dependencies"
npm ci

echo "[deploy] building application"
npm run build

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "[deploy] reloading pm2 app: $APP_NAME"
  pm2 reload ecosystem.config.cjs --env production
else
  echo "[deploy] starting pm2 app: $APP_NAME"
  pm2 start ecosystem.config.cjs --env production
fi

pm2 save

echo "[deploy] health check"
curl -fsS "http://127.0.0.1:5000/api/health" || {
  echo "[deploy] WARNING: health check failed"
  exit 1
}

echo
echo "[deploy] done"
echo "[deploy] pm2 status:"
pm2 status
