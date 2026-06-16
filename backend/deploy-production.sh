#!/usr/bin/env bash
#
# deploy-production.sh — one-shot Postgres-primary production deploy for RunningGround.
#
# Run ON the production droplet, from inside RunningGround/backend (after git clone):
#     cd RunningGround/backend && bash deploy-production.sh
#
# Idempotent — safe to re-run. It will:
#   1. ensure a 2GB swapfile exists (build OOM guard on a small box)
#   2. git pull --ff-only the deploy branch (best-effort)
#   3. ensure .env.production exists; STOP if it still has change-this-* placeholders
#   4. validate the env (npm run validate:production) — abort unless "ready"
#   5. DNS sanity check (domain must resolve to this droplet's public IP)
#   6. bring up postgres + api + caddy (npm run docker:public:production)
#   7. wait for health, confirm schema tables exist
#   8. install the nightly pg_backup.sh cron (if not already present)
#
# The ONLY things this script does NOT do (by design): fill your secrets into
# .env.production, and set Cloudflare DNS — both are yours to do.
#
# Env overrides: DEPLOY_BRANCH (default fix/countdown-local-tick),
#   SKIP_DNS_CHECK=1, SKIP_SWAP=1, SKIP_CRON=1.

set -euo pipefail

DEPLOY_BRANCH="${DEPLOY_BRANCH:-fix/countdown-local-tick}"
PROJECT_NAME="runningground-production"
ENV_FILE=".env.production"
COMPOSE_FILE="compose.public.yaml"

c_ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
c_info() { printf '\033[36m▸\033[0m %s\n' "$*"; }
c_warn() { printf '\033[33m!\033[0m %s\n' "$*"; }
c_err()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; }
die()    { c_err "$*"; exit 1; }

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 && SUDO="sudo" || die "need root (for swap) but sudo not found; run as root"
fi

# --- sanity: must be in backend/ -------------------------------------------------
[ -f "$COMPOSE_FILE" ] || die "run this from RunningGround/backend (no $COMPOSE_FILE here)"
command -v docker >/dev/null 2>&1 || die "docker not installed — install Docker Engine + compose plugin first"
docker compose version >/dev/null 2>&1 || die "docker compose v2 plugin not available"

DC=(docker compose -p "$PROJECT_NAME" --env-file "./$ENV_FILE" -f "./$COMPOSE_FILE")

# --- 1. swap ---------------------------------------------------------------------
if [ "${SKIP_SWAP:-0}" = "1" ]; then
  c_info "skipping swap (SKIP_SWAP=1)"
elif [ "$(swapon --show --noheadings 2>/dev/null | wc -l)" -gt 0 ]; then
  c_ok "swap already present ($(free -h | awk '/Swap/{print $2}'))"
else
  c_info "creating 2GB swapfile…"
  $SUDO fallocate -l 2G /swapfile || $SUDO dd if=/dev/zero of=/swapfile bs=1M count=2048
  $SUDO chmod 600 /swapfile
  $SUDO mkswap /swapfile >/dev/null
  $SUDO swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab 2>/dev/null || echo '/swapfile none swap sw 0 0' | $SUDO tee -a /etc/fstab >/dev/null
  $SUDO sysctl -q vm.swappiness=10 || true
  c_ok "swap on ($(free -h | awk '/Swap/{print $2}'))"
fi

# --- 2. pull latest --------------------------------------------------------------
if git rev-parse --git-dir >/dev/null 2>&1; then
  c_info "syncing branch $DEPLOY_BRANCH…"
  git fetch --quiet origin "$DEPLOY_BRANCH" && git checkout --quiet "$DEPLOY_BRANCH" && \
    git pull --ff-only --quiet origin "$DEPLOY_BRANCH" && c_ok "code up to date" || \
    c_warn "git pull skipped/failed (continuing with current checkout)"
else
  c_warn "not a git repo (continuing with current files)"
fi

# --- 3. env file -----------------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  cp .env.production.example "$ENV_FILE"
  c_warn "created $ENV_FILE from the example."
fi

if grep -q 'change-this' "$ENV_FILE"; then
  echo
  c_err "STOP — $ENV_FILE still has placeholder secrets. Fill these by hand:"
  grep -n 'change-this' "$ENV_FILE" | sed 's/=.*change-this/=<FILL ME>/' | sed 's/^/    /'
  echo
  echo "    Edit it:        nano $ENV_FILE"
  echo "    Keep in sync:   POSTGRES_PASSWORD must equal the password inside BACKEND_POSTGRES_DATABASE_URL"
  echo "    Then re-run:    bash deploy-production.sh"
  exit 2
fi
c_ok "$ENV_FILE has no placeholders"

# --- 4. validate -----------------------------------------------------------------
c_info "validating production env…"
if npm run --silent validate:production 2>&1 | tee /tmp/rg_validate.log | grep -q '\[backend-release-check\] ready'; then
  c_ok "env validation: ready"
else
  tail -20 /tmp/rg_validate.log
  die "env validation did NOT report 'ready' — fix the errors above and re-run"
fi

# --- 5. DNS sanity ---------------------------------------------------------------
DOMAIN="$(grep -E '^PUBLIC_DOMAIN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '[:space:]')"
if [ "${SKIP_DNS_CHECK:-0}" = "1" ]; then
  c_info "skipping DNS check (SKIP_DNS_CHECK=1)"
elif [ -z "$DOMAIN" ]; then
  c_warn "PUBLIC_DOMAIN not set in $ENV_FILE — skipping DNS check"
else
  PUBIP="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || curl -fsS --max-time 8 https://ifconfig.me 2>/dev/null || true)"
  RESOLVED="$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || true)"
  if [ -n "$PUBIP" ] && [ "$RESOLVED" = "$PUBIP" ]; then
    c_ok "DNS ok — $DOMAIN → $RESOLVED (this droplet)"
  else
    c_warn "DNS: $DOMAIN resolves to '${RESOLVED:-?}', this droplet is '${PUBIP:-?}'."
    c_warn "Caddy can't get an HTTPS cert until $DOMAIN points here. Set the Cloudflare A record first."
    read -r -p "    Continue anyway? [y/N] " ans
    [ "${ans:-N}" = "y" ] || [ "${ans:-N}" = "Y" ] || die "aborted — set DNS then re-run (or SKIP_DNS_CHECK=1)"
  fi
fi

# --- 6. bring up the stack -------------------------------------------------------
c_info "building + starting postgres + api + caddy (this builds on the droplet; a few minutes)…"
npm run --silent docker:public:production
c_ok "compose up issued"

# --- 7. wait for health ----------------------------------------------------------
c_info "waiting for the api container to become healthy…"
for i in $(seq 1 60); do
  state="$("${DC[@]}" ps --format '{{.Service}} {{.Health}}' 2>/dev/null | awk '$1=="api"{print $2}')"
  [ "$state" = "healthy" ] && { c_ok "api container healthy"; break; }
  [ "$i" -eq 60 ] && { "${DC[@]}" ps; "${DC[@]}" logs --tail 40 api; die "api did not become healthy in time"; }
  sleep 3
done

c_info "checking schema tables…"
TBLS="$("${DC[@]}" exec -T postgres psql -U "$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2-)" -d "$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2-)" -tAc "select count(*) from information_schema.tables where table_schema='public';" 2>/dev/null || echo 0)"
[ "${TBLS:-0}" -ge 5 ] && c_ok "schema present ($TBLS tables incl. app_store)" || c_warn "only ${TBLS:-0} tables found — if this is a fresh volume the schema should have auto-applied; check logs"

if [ -n "$DOMAIN" ]; then
  c_info "checking public health endpoint (TLS cert may take ~30s on first issue)…"
  for i in $(seq 1 20); do
    if curl -fsS --max-time 8 "https://$DOMAIN/api/health" 2>/dev/null | grep -q '"status"'; then
      c_ok "https://$DOMAIN/api/health → ok"; break
    fi
    [ "$i" -eq 20 ] && c_warn "public health not green yet — TLS/DNS may still be settling; check: ${DC[*]} logs -f caddy"
    sleep 6
  done
fi

# --- 8. backup cron --------------------------------------------------------------
if [ "${SKIP_CRON:-0}" = "1" ]; then
  c_info "skipping cron (SKIP_CRON=1)"
else
  BACKUP_SH="$(pwd)/pg_backup.sh"
  chmod +x "$BACKUP_SH" 2>/dev/null || true
  CRON_LINE="15 3 * * * $BACKUP_SH >> $(pwd)/backups/postgres/backup.log 2>&1"
  if crontab -l 2>/dev/null | grep -qF "$BACKUP_SH"; then
    c_ok "backup cron already installed"
  else
    ( crontab -l 2>/dev/null; echo "$CRON_LINE" ) | crontab -
    c_ok "nightly backup cron installed (03:15)"
  fi
fi

echo
c_ok "DEPLOY DONE — RunningGround production is up on Postgres."
[ -n "$DOMAIN" ] && echo "    https://$DOMAIN/api/health"
echo "    logs:    ${DC[*]} logs -f"
echo "    backup:  bash pg_backup.sh   (manual run)"
