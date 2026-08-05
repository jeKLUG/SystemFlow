#!/usr/bin/env bash
# Systemhaus-Ess deploy â€“ Update, Build und Dauerbetrieb auf Linux
#
# Usage:
#   sudo ./scripts/deploy.sh
#   sudo SYSTEMHAUS_PORT=8081 ./scripts/deploy.sh
#
# Einzeiler:
#   curl -fsSL https://raw.githubusercontent.com/jeKLUG/SystemFlow/main/scripts/deploy.sh | sudo bash
#
set -euo pipefail

REPO_URL="${SYSTEMFLOW_REPO:-${SYSTEMHAUS_REPO:-https://github.com/jeKLUG/SystemFlow.git}}"
INSTALL_DIR="${SYSTEMFLOW_DIR:-${SYSTEMHAUS_DIR:-/opt/systemflow}}"
PORT="${SYSTEMHAUS_PORT:-${SYSTEMFLOW_PORT:-8081}}"
BRANCH="${SYSTEMFLOW_BRANCH:-${SYSTEMHAUS_BRANCH:-main}}"
SERVICE_NAME="systemhaus-ess"
COMPOSE_FILE="docker-compose.yml"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32mâœ“\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mâœ—\033[0m %s\n' "$*" >&2; exit 1; }

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "Bitte mit root/sudo ausfÃ¼hren: sudo $0"
  fi
}

docker_bin() {
  command -v docker || die "docker nicht im PATH"
}

compose_args() {
  if docker compose version >/dev/null 2>&1; then
    echo "compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    echo "legacy"
  else
    die "Docker Compose fehlt. Installiere Docker inkl. Compose-Plugin."
  fi
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log "Docker nicht gefunden â€“ installiere Docker (get.docker.com)â€¦"
    curl -fsSL https://get.docker.com | sh
  fi

  systemctl enable --now docker >/dev/null 2>&1 || true

  if ! docker info >/dev/null 2>&1; then
    die "Docker lÃ¤uft nicht. PrÃ¼fe: systemctl status docker"
  fi
  compose_args >/dev/null
  ok "Docker bereit"
}

sync_repo() {
  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    log "Aktualisiere Repository in ${INSTALL_DIR}â€¦"
    # Lokale Ã„nderungen am Deploy-Tree verwerfen (.env bleibt untracked)
    git -C "${INSTALL_DIR}" fetch --prune origin
    git -C "${INSTALL_DIR}" checkout -f "${BRANCH}"
    git -C "${INSTALL_DIR}" reset --hard "origin/${BRANCH}"
    git -C "${INSTALL_DIR}" clean -fd --exclude=.env --exclude=data
  elif [[ -f "${INSTALL_DIR}/${COMPOSE_FILE}" ]]; then
    warn "Kein Git-Repo in ${INSTALL_DIR} â€“ nutze vorhandene Dateien (kein Pull)."
  else
    log "Klone ${REPO_URL} nach ${INSTALL_DIR}â€¦"
    mkdir -p "$(dirname "${INSTALL_DIR}")"
    git clone --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
  fi
  ok "Quellcode aktuell"
}

reexec_installed_if_needed() {
  local installed="${INSTALL_DIR}/scripts/deploy.sh"
  if [[ ! -f "${installed}" ]]; then
    return 0
  fi
  if [[ "${SYSTEMFLOW_DEPLOY_REEXEC:-}" == "1" ]]; then
    return 0
  fi

  local self="${BASH_SOURCE[0]:-}"
  if [[ -n "${self}" && -f "${self}" ]]; then
    local self_real installed_real
    self_real="$(readlink -f "${self}" 2>/dev/null || realpath "${self}" 2>/dev/null || echo "${self}")"
    installed_real="$(readlink -f "${installed}" 2>/dev/null || realpath "${installed}" 2>/dev/null || echo "${installed}")"
    if [[ "${self_real}" == "${installed_real}" ]]; then
      return 0
    fi
  fi

  chmod +x "${installed}"
  log "Starte installiertes Deploy-Skriptâ€¦"
  export SYSTEMFLOW_DEPLOY_REEXEC=1
  export SYSTEMFLOW_REPO SYSTEMHAUS_REPO SYSTEMFLOW_DIR SYSTEMHAUS_DIR
  export SYSTEMFLOW_PORT SYSTEMHAUS_PORT SYSTEMFLOW_BRANCH SYSTEMHAUS_BRANCH
  export SESSION_SECRET ADMIN_USERNAME ADMIN_PASSWORD
  exec bash "${installed}"
}

write_env() {
  local env_file="${INSTALL_DIR}/.env"
  if [[ -f "${env_file}" ]]; then
    # Port aktualisieren, Secrets behalten
    if grep -q '^SYSTEMHAUS_PORT=' "${env_file}"; then
      sed -i "s/^SYSTEMHAUS_PORT=.*/SYSTEMHAUS_PORT=${PORT}/" "${env_file}"
    elif grep -q '^SYSTEMFLOW_PORT=' "${env_file}"; then
      sed -i "s/^SYSTEMFLOW_PORT=.*/SYSTEMHAUS_PORT=${PORT}/" "${env_file}"
    else
      echo "SYSTEMHAUS_PORT=${PORT}" >> "${env_file}"
    fi
  else
    local secret
    secret="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    cat > "${env_file}" <<EOF
SYSTEMHAUS_PORT=${PORT}
SESSION_SECRET=${secret}
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
EOF
    warn "Standard-Passwort ist 'changeme' â€“ bitte in ${env_file} Ã¤ndern!"
  fi
  ok "Env in ${env_file} (Port ${PORT})"
}

install_systemd() {
  local unit="/etc/systemd/system/${SERVICE_NAME}.service"

  # Alten Demo-Dienst entfernen, falls vorhanden
  if systemctl list-unit-files | grep -q '^systemflow\.service'; then
    systemctl disable --now systemflow.service >/dev/null 2>&1 || true
  fi

  log "Installiere systemd-Dienst ${SERVICE_NAME}.serviceâ€¦"
  # bash -c: zuverlÃ¤ssig mit docker compose Plugin und .env
  cat > "${unit}" <<EOF
[Unit]
Description=Systemhaus-Ess (Docker Compose)
Documentation=file://${INSTALL_DIR}/README.md
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
EnvironmentFile=-${INSTALL_DIR}/.env
ExecStart=/bin/bash -lc 'cd "${INSTALL_DIR}" && docker compose --env-file .env up -d --build --remove-orphans'
ExecStop=/bin/bash -lc 'cd "${INSTALL_DIR}" && docker compose --env-file .env down'
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}.service" >/dev/null
  ok "systemd-Dienst aktiviert (Start bei Boot)"
}

# Beendet Prozesse, die auf dem Deploy-Port lauschen (z. B. alter node).
free_port() {
  local port="$1"
  if ! ss -lnt "sport = :${port}" 2>/dev/null | grep -q ":${port}"; then
    return 0
  fi

  warn "Port ${port} belegt â€“ beende lauschende Prozesseâ€¦"
  ss -lntp "sport = :${port}" 2>/dev/null || true

  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
  fi

  # PIDs aus ss (users:(("node",pid=123,fd=20)))
  local pids
  pids="$(
    ss -lntp "sport = :${port}" 2>/dev/null \
      | grep -oE 'pid=[0-9]+' \
      | cut -d= -f2 \
      | sort -u \
      || true
  )"
  if [[ -n "${pids}" ]]; then
    # shellcheck disable=SC2086
    kill ${pids} >/dev/null 2>&1 || true
    sleep 1
    # shellcheck disable=SC2086
    kill -9 ${pids} >/dev/null 2>&1 || true
  fi

  sleep 1
}

compose_up() {
  local mode
  mode="$(compose_args)"
  cd "${INSTALL_DIR}"

  # Alten Container/Port freigeben, sonst "address already in use"
  log "Stoppe ggf. vorhandenen Containerâ€¦"
  if [[ "${mode}" == "compose" ]]; then
    docker compose --env-file .env down --remove-orphans >/dev/null 2>&1 || true
  else
    docker-compose --env-file .env down --remove-orphans >/dev/null 2>&1 || true
  fi
  docker rm -f systemhaus-ess >/dev/null 2>&1 || true

  # Freigeben: oft ein alter Node-Prozess (frÃ¼herer Non-Docker-Start)
  free_port "${PORT}"

  if ss -lnt "sport = :${PORT}" 2>/dev/null | grep -q ":${PORT}"; then
    warn "Port ${PORT} ist noch belegt:"
    ss -lntp "sport = :${PORT}" 2>/dev/null || true
    die "Port ${PORT} freigeben oder mit SYSTEMHAUS_PORT=<frei> neu deployen"
  fi

  if [[ "${mode}" == "compose" ]]; then
    docker compose --env-file .env up -d --build --remove-orphans --force-recreate
  else
    docker-compose --env-file .env up -d --build --remove-orphans --force-recreate
  fi
}

start_service() {
  log "Starte / aktualisiere Systemhaus-Ess (Docker Build)â€¦"
  if ! compose_up; then
    warn "Docker Compose fehlgeschlagen."
    warn "Port-Check:"
    ss -lntp "sport = :${PORT}" 2>/dev/null || true
    docker ps -a --filter "name=systemhaus" || true
    docker compose --env-file "${INSTALL_DIR}/.env" -f "${INSTALL_DIR}/docker-compose.yml" logs --tail=40 || true
    die "Start fehlgeschlagen â€“ siehe Ausgabe oben"
  fi

  # Nicht systemctl restart â€“ das wÃ¼rde den frischen Container erst stoppen
  systemctl reset-failed "${SERVICE_NAME}.service" >/dev/null 2>&1 || true
  systemctl start "${SERVICE_NAME}.service" >/dev/null 2>&1 || true
  sleep 2
  if docker ps --filter "name=systemhaus-ess" --filter "status=running" --format '{{.Names}}' | grep -q systemhaus-ess; then
    ok "Container lÃ¤uft"
  else
    warn "Container nicht aktiv:"
    docker ps -a --filter "name=systemhaus" || true
    docker compose --env-file "${INSTALL_DIR}/.env" -f "${INSTALL_DIR}/docker-compose.yml" logs --tail=80 || true
    die "Start fehlgeschlagen"
  fi
}

print_summary() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [[ -z "${ip}" ]] && ip="SERVER-IP"

  cat <<EOF

----------------------------------------
  Systemhaus-Ess ist aktiv
----------------------------------------
  URL:     http://${ip}:${PORT}
  Login:   admin / (siehe ${INSTALL_DIR}/.env)
  Ordner:  ${INSTALL_DIR}
  Dienst:  systemctl status ${SERVICE_NAME}
  Update:  sudo ${INSTALL_DIR}/scripts/deploy.sh
  Stop:    sudo systemctl stop ${SERVICE_NAME}
  Start:   sudo systemctl start ${SERVICE_NAME}
----------------------------------------

EOF
}

main() {
  require_root
  command -v git >/dev/null 2>&1 || die "git fehlt. Installiere: apt install git / dnf install git"
  command -v curl >/dev/null 2>&1 || die "curl fehlt."

  ensure_docker
  sync_repo
  reexec_installed_if_needed

  if [[ ! -f "${INSTALL_DIR}/${COMPOSE_FILE}" ]]; then
    die "Keine ${COMPOSE_FILE} in ${INSTALL_DIR}"
  fi
  chmod +x "${INSTALL_DIR}/scripts/deploy.sh" 2>/dev/null || true

  write_env
  install_systemd
  start_service
  print_summary
}

main "$@"
