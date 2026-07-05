#!/usr/bin/env bash
#
# pg_backup.sh — nightly Postgres backup for RunningGround production.
#
# Runs `pg_dump -Fc` INSIDE the running dockerized `postgres` service (compose
# service name: postgres, image postgres:16-alpine), streams the custom-format
# dump to stdout, gzips it to a timestamped file on the host, and prunes dumps
# older than RETENTION_DAYS.
#
# Captures the ENTIRE database in one logical dump: the whole-store app_store
# jsonb row (id=1) AND every relational table (users, sessions, runs,
# social_accounts, integration_imports, friendships, market_items, ...),
# plus indexes, triggers and the set_updated_at() function.
#
# Usage:  ./pg_backup.sh
# Cron:   see the crontab line in docs/digitalocean-cloudflare-caddy-runbook.md.
#
# Overridable via env:
#   BACKEND_COMPOSE_DIR / BACKEND_COMPOSE_FILE / BACKEND_ENV_FILE
#   BACKEND_BACKUP_DIR / BACKEND_BACKUP_RETENTION_DAYS / BACKEND_PG_SERVICE
#   BACKEND_COMPOSE_PROJECT (compose -p project name; default runningground-production)

set -euo pipefail

# --- Resolve paths relative to the compose project, not the caller's CWD ------
# This script lives next to compose.public.yaml in backend/. Resolve that dir so
# cron (which runs with a bare environment) finds the compose file and .env.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
COMPOSE_DIR="${BACKEND_COMPOSE_DIR:-$SCRIPT_DIR}"
COMPOSE_FILE="${BACKEND_COMPOSE_FILE:-$COMPOSE_DIR/compose.public.yaml}"
ENV_FILE="${BACKEND_ENV_FILE:-$COMPOSE_DIR/.env.production}"
COMPOSE_PROJECT="${BACKEND_COMPOSE_PROJECT:-runningground-production}"

# Where dumps land on the host, and how long we keep them.
BACKUP_DIR="${BACKEND_BACKUP_DIR:-$COMPOSE_DIR/backups/postgres}"
RETENTION_DAYS="${BACKEND_BACKUP_RETENTION_DAYS:-14}"
PG_SERVICE="${BACKEND_PG_SERVICE:-postgres}"

log() { printf '[pg_backup] %s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

# --- Preconditions ------------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "docker not found on PATH"
[ -f "$COMPOSE_FILE" ] || fail "compose file not found: $COMPOSE_FILE"
[ -f "$ENV_FILE" ]     || fail "env file not found: $ENV_FILE"

# Pick `docker compose` (v2) over legacy `docker-compose` (v1).
if docker compose version >/dev/null 2>&1; then
  DC=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DC=(docker-compose)
else
  fail "neither 'docker compose' nor 'docker-compose' is available"
fi
COMPOSE=("${DC[@]}" -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

# --- Read DB name/user from the SAME env the compose uses ---------------------
# set -a so every var sourced from the env file is exported for our use below.
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${POSTGRES_DB:?POSTGRES_DB is not set in $ENV_FILE}"
: "${POSTGRES_USER:?POSTGRES_USER is not set in $ENV_FILE}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is not set in $ENV_FILE}"

# --- Ensure the postgres service is actually up and accepting connections -----
CID="$("${COMPOSE[@]}" ps -q "$PG_SERVICE" 2>/dev/null || true)"
[ -n "$CID" ] || fail "postgres service '$PG_SERVICE' is not running (compose ps -q returned nothing)"
"${COMPOSE[@]}" exec -T "$PG_SERVICE" \
  pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1 \
  || fail "postgres is not ready (pg_isready failed inside the container)"

# --- Take the dump ------------------------------------------------------------
mkdir -p "$BACKUP_DIR" || fail "could not create backup dir: $BACKUP_DIR"

TS="$(date '+%Y%m%d-%H%M%S')"
OUT="$BACKUP_DIR/runningground-${POSTGRES_DB}-${TS}.dump.gz"
TMP="$OUT.partial"

log "starting pg_dump of db='$POSTGRES_DB' (service='$PG_SERVICE') -> $OUT"

# pg_dump -Fc to stdout inside the container; gzip on the host to a .partial.
# PGPASSWORD is set in the container's exec env (not on the host arg list).
# PIPESTATUS check is the load-bearing safety: set -o pipefail alone can be
# defeated, so we assert pg_dump's own exit status was 0 before publishing.
set +e
"${COMPOSE[@]}" exec -T \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  "$PG_SERVICE" \
  pg_dump -Fc --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip -c > "$TMP"
PIPE_STATUS=("${PIPESTATUS[@]}")
set -e

if [ "${PIPE_STATUS[0]}" -ne 0 ]; then
  rm -f "$TMP"
  fail "pg_dump failed (exit ${PIPE_STATUS[0]})"
fi
if [ "${PIPE_STATUS[1]}" -ne 0 ]; then
  rm -f "$TMP"
  fail "gzip failed (exit ${PIPE_STATUS[1]})"
fi
if [ ! -s "$TMP" ]; then
  rm -f "$TMP"
  fail "dump file is empty — refusing to publish a zero-byte backup"
fi

# Atomically publish only after every stage succeeded.
mv -f "$TMP" "$OUT"
SIZE="$(du -h "$OUT" | cut -f1)"
log "backup OK: $OUT ($SIZE)"

# --- Prune old dumps ----------------------------------------------------------
log "pruning dumps older than ${RETENTION_DAYS} day(s) in $BACKUP_DIR"
find "$BACKUP_DIR" -type f -name "runningground-${POSTGRES_DB}-*.dump.gz" \
  -mtime +"$RETENTION_DAYS" -print -delete >&2 || \
  log "WARN: prune step reported an error (continuing; today's backup is safe)"

# Clean up any stale .partial files from previously crashed runs.
find "$BACKUP_DIR" -type f -name "*.dump.gz.partial" -mmin +60 -delete 2>/dev/null || true

# --- Offsite copy (the load-bearing half of disaster recovery) ----------------
# A backup on the SAME droplet disk as postgres_data dies WITH the droplet. Push
# every fresh dump to object storage (DigitalOcean Spaces / any S3-compatible) via
# rclone so a droplet/disk loss is recoverable. Configure a single env var in
# .env.production:
#
#   BACKEND_BACKUP_RCLONE_REMOTE=spaces:<BACKUP_BUCKET>/postgres
#
# where `spaces` is an rclone remote (`rclone config`, type=s3, provider=DigitalOcean,
# endpoint=<region>.digitaloceanspaces.com). Retention on the remote mirrors local.
#
# Design: the LOCAL dump already succeeded and is safe before we get here. If offsite
# is unconfigured we WARN loudly (so it can't silently stay off) but exit 0 — a
# missing remote must not fail the local backup. If offsite IS configured and the
# push FAILS, we exit non-zero so cron mail / monitoring flags it, while the local
# dump remains on disk.
OFFSITE_REMOTE="${BACKEND_BACKUP_RCLONE_REMOTE:-}"

if [ -z "$OFFSITE_REMOTE" ]; then
  log "WARN: BACKEND_BACKUP_RCLONE_REMOTE is not set — backup is LOCAL-ONLY on this droplet's disk."
  log "WARN: a droplet/disk loss would lose all data. Configure an rclone remote to enable offsite copy."
  log "done (local-only)"
  exit 0
fi

if ! command -v rclone >/dev/null 2>&1; then
  fail "BACKEND_BACKUP_RCLONE_REMOTE is set but 'rclone' is not installed — cannot push offsite. Install rclone or unset the var."
fi

log "pushing $OUT -> $OFFSITE_REMOTE/$(basename "$OUT")"
if ! rclone copyto --s3-no-check-bucket "$OUT" "$OFFSITE_REMOTE/$(basename "$OUT")" 2>&1 | sed 's/^/[pg_backup:rclone] /' >&2; then
  fail "offsite push FAILED — local dump is safe at $OUT, but it is NOT replicated. Investigate rclone/remote now."
fi
log "offsite copy OK"

# Prune remote dumps older than retention so the bucket doesn't grow unbounded.
# min-age uses rclone's duration syntax; a prune failure is non-fatal (today's
# offsite copy already landed) but is logged.
if ! rclone delete --min-age "${RETENTION_DAYS}d" "$OFFSITE_REMOTE" 2>&1 | sed 's/^/[pg_backup:rclone] /' >&2; then
  log "WARN: remote prune reported an error (continuing; today's offsite copy is safe)"
fi

log "done"
