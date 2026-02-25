#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${PM2_APP_NAME:-whs-beta-rc}"
REMOTE="${DEPLOY_REMOTE:-origin}"
BRANCH="${DEPLOY_BRANCH:-main}"
INSTALL_MODE="${DEPLOY_INSTALL_MODE:-auto}" # auto|always|never
HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:5000/api/health}"

echo "[deploy-fast] starting in $(pwd)"

if ! command -v npm >/dev/null 2>&1; then
  echo "[deploy-fast] ERROR: npm is not installed"
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[deploy-fast] ERROR: pm2 is not installed. Run: npm i -g pm2"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[deploy-fast] ERROR: current directory is not a git repository"
  exit 1
fi

before_head="$(git rev-parse HEAD)"
echo "[deploy-fast] pulling ${REMOTE}/${BRANCH}"
git pull --ff-only "$REMOTE" "$BRANCH"
after_head="$(git rev-parse HEAD)"

needs_install=false
install_reason="skipped by default"

case "$INSTALL_MODE" in
  always)
    needs_install=true
    install_reason="DEPLOY_INSTALL_MODE=always"
    ;;
  never)
    needs_install=false
    install_reason="DEPLOY_INSTALL_MODE=never"
    ;;
  auto)
    if [[ ! -d node_modules ]]; then
      needs_install=true
      install_reason="node_modules is missing"
    elif [[ "$before_head" != "$after_head" ]] && \
      git diff --name-only "$before_head" "$after_head" | grep -Eq '(^|/)(package\.json|package-lock\.json)$'; then
      needs_install=true
      install_reason="dependency manifest changed in pulled commits"
    else
      install_reason="no dependency manifest changes detected"
    fi
    ;;
  *)
    echo "[deploy-fast] ERROR: DEPLOY_INSTALL_MODE must be auto|always|never"
    exit 1
    ;;
esac

if [[ "$needs_install" == "true" ]]; then
  echo "[deploy-fast] installing dependencies (${install_reason})"
  npm ci
else
  echo "[deploy-fast] skipping npm ci (${install_reason})"
fi

echo "[deploy-fast] building application"
npm run build

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  echo "[deploy-fast] reloading pm2 app: $APP_NAME"
  pm2 reload ecosystem.config.cjs --env production
else
  echo "[deploy-fast] starting pm2 app: $APP_NAME"
  pm2 start ecosystem.config.cjs --env production
fi

pm2 save

echo "[deploy-fast] health check: $HEALTH_URL"
curl -fsS "$HEALTH_URL" || {
  echo "[deploy-fast] WARNING: health check failed"
  exit 1
}

echo
echo "[deploy-fast] done"
pm2 status "$APP_NAME"
