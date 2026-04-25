#!/usr/bin/env bash

set -euo pipefail

PASS_COUNT=0
WARN_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf '[ready] PASS %s\n' "$1"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  printf '[ready] WARN %s\n' "$1"
}

check_command() {
  local name="$1"

  if command -v "$name" >/dev/null 2>&1; then
    pass "command available: $name"
  else
    warn "command missing: $name"
  fi
}

printf '[ready] RunningGround Ubuntu server readiness check\n'

if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  pass "os detected: ${PRETTY_NAME:-unknown}"
else
  warn 'cannot read /etc/os-release'
fi

check_command docker
check_command git
check_command curl
check_command jq

if docker compose version >/dev/null 2>&1; then
  pass 'docker compose plugin available'
else
  warn 'docker compose plugin missing'
fi

if systemctl is-enabled docker >/dev/null 2>&1; then
  pass 'docker service enabled'
else
  warn 'docker service not enabled'
fi

if systemctl is-active docker >/dev/null 2>&1; then
  pass 'docker service active'
else
  warn 'docker service not active'
fi

CURRENT_USER_NAME="${SUDO_USER:-${USER:-root}}"

if id -nG "$CURRENT_USER_NAME" 2>/dev/null | tr ' ' '\n' | grep -qx docker; then
  pass "user in docker group: $CURRENT_USER_NAME"
else
  warn "user not in docker group yet: $CURRENT_USER_NAME"
fi

if command -v ufw >/dev/null 2>&1; then
  UFW_STATUS="$(ufw status 2>/dev/null || true)"

  if printf '%s\n' "$UFW_STATUS" | grep -q "Status: active"; then
    pass 'ufw active'
  else
    warn 'ufw not active'
  fi

  for rule in "OpenSSH" "80/tcp" "443/tcp"; do
    if printf '%s\n' "$UFW_STATUS" | grep -q "$rule"; then
      pass "ufw rule present: $rule"
    else
      warn "ufw rule missing: $rule"
    fi
  done
else
  warn 'ufw command missing'
fi

if [[ -d /var/lib/docker ]]; then
  pass 'docker data directory present'
else
  warn 'docker data directory missing'
fi

printf '[ready] summary: %s pass, %s warn\n' "$PASS_COUNT" "$WARN_COUNT"

if [[ "$WARN_COUNT" -gt 0 ]]; then
  exit 1
fi
