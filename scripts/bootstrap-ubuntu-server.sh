#!/usr/bin/env bash

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "[bootstrap] Please run this script as root." >&2
  exit 1
fi

USERNAME="${SUDO_USER:-${BOOTSTRAP_USER:-root}}"
ENABLE_UFW="${ENABLE_UFW:-true}"

log() {
  printf '[bootstrap] %s\n' "$1"
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

log "Updating apt package index..."
apt-get update -y

log "Installing base packages..."
apt-get install -y \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  git \
  unzip \
  jq \
  ufw

if ! command_exists docker; then
  log "Installing Docker Engine and Compose plugin..."
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.asc ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi

  ARCH="$(dpkg --print-architecture)"
  CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
  cat >/etc/apt/sources.list.d/docker.list <<EOF
deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable
EOF

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  log "Docker is already installed. Skipping package install."
fi

log "Enabling Docker service..."
systemctl enable docker
systemctl restart docker

if id -u "${USERNAME}" >/dev/null 2>&1 && [[ "${USERNAME}" != "root" ]]; then
  log "Adding ${USERNAME} to docker group..."
  usermod -aG docker "${USERNAME}" || true
fi

if [[ "${ENABLE_UFW}" == "true" ]]; then
  log "Configuring UFW..."
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
else
  log "Skipping UFW configuration because ENABLE_UFW=${ENABLE_UFW}."
fi

log "Bootstrap complete."
log "Recommended next steps:"
log "1. Reconnect SSH so docker group changes apply."
log "2. Clone the runningground repository."
log "3. Copy backend/.env.preview.example or backend/.env.production.example."
log "4. Run the public deploy commands from docs/digitalocean-cloudflare-caddy-runbook.md."
