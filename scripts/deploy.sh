#!/usr/bin/env bash
# SystemFlow deploy – Update, Build und Dauerbetrieb auf Linux
#
# Usage:
#   sudo ./scripts/deploy.sh
#   sudo SYSTEMFLOW_PORT=8080 SYSTEMFLOW_DIR=/opt/systemflow ./scripts/deploy.sh
#
# Einzeiler (Repo muss auf GitHub erreichbar sein):
#   curl -fsSL https://raw.githubusercontent.com/YeSkorpion/SystemFlow/main/scripts/deploy.sh | sudo bash
#
set -euo pipefail

REPO_URL="${SYSTEMFLOW_REPO:-https://github.com/YeSkorpion/SystemFlow.git}"
INSTALL_DIR="${SYSTEMFLOW_DIR:-/opt/systemflow}"
PORT="${SYSTEMFLOW_PORT:-8080}"
BRANCH="${SYSTEMFLOW_BRANCH:-main}"
SERVICE_NAME="systemflow"
COMPOSE_FILE="docker-compose.yml"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "Bitte mit root/sudo ausführen: sudo $0"
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

compose_up() {
  local mode
  mode="$(compose_args)"
  if [[ "${mode}" == "compose" ]]; then
    "$(docker_bin)" compose up -d --build --remove-orphans
  else
    docker-compose up -d --build --remove-orphans
  fi
}

compose_down() {
  local mode
  mode="$(compose_args)"
  if [[ "${mode}" == "compose" ]]; then
    "$(docker_bin)" compose down
  else
    docker-compose down
  fi
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log "Docker nicht gefunden – installiere Docker (get.docker.com)…"
    curl -fsSL https://get.docker.com | sh
  fi

  systemctl enable --now docker >/dev/null 2>&1 || true

  if ! docker info >/dev/null 2>&1; then
    die "Docker läuft nicht. Prüfe: systemctl status docker"
  fi
  compose_args >/dev/null
  ok "Docker bereit"
}

sync_repo() {
  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    log "Aktualisiere Repository in ${INSTALL_DIR}…"
    git -C "${INSTALL_DIR}" fetch --prune origin
    git -C "${INSTALL_DIR}" checkout "${BRANCH}"
    git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}"
  elif [[ -f "${INSTALL_DIR}/${COMPOSE_FILE}" ]]; then
    warn "Kein Git-Repo in ${INSTALL_DIR} – nutze vorhandene Dateien (kein Pull)."
  else
    log "Klone ${REPO_URL} nach ${INSTALL_DIR}…"
    mkdir -p "$(dirname "${INSTALL_DIR}")"
    git clone --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}"
  fi
  ok "Quellcode aktuell"
}

# Nach Clone/Pull die installierte Skript-Version ausführen (wichtig für curl|bash).
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
  log "Starte installiertes Deploy-Skript…"
  export SYSTEMFLOW_DEPLOY_REEXEC=1
  export SYSTEMFLOW_REPO SYSTEMFLOW_DIR SYSTEMFLOW_PORT SYSTEMFLOW_BRANCH
  exec bash "${installed}"
}

write_env() {
  cat > "${INSTALL_DIR}/.env" <<EOF
SYSTEMFLOW_PORT=${PORT}
EOF
  ok "Port ${PORT} in ${INSTALL_DIR}/.env"
}

install_systemd() {
  local unit="/etc/systemd/system/${SERVICE_NAME}.service"
  local docker_path
  docker_path="$(docker_bin)"
  local mode
  mode="$(compose_args)"

  local start_cmd stop_cmd
  if [[ "${mode}" == "compose" ]]; then
    start_cmd="${docker_path} compose up -d --build --remove-orphans"
    stop_cmd="${docker_path} compose down"
  else
    local dc
    dc="$(command -v docker-compose)"
    start_cmd="${dc} up -d --build --remove-orphans"
    stop_cmd="${dc} down"
  fi

  log "Installiere systemd-Dienst ${SERVICE_NAME}.service…"
  cat > "${unit}" <<EOF
[Unit]
Description=SystemFlow Webapp (Docker Compose)
Documentation=file://${INSTALL_DIR}/README.md
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=-${INSTALL_DIR}/.env
ExecStart=${start_cmd}
ExecStop=${stop_cmd}
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}.service" >/dev/null
  ok "systemd-Dienst aktiviert (Start bei Boot)"
}

start_service() {
  log "Starte / aktualisiere SystemFlow…"
  systemctl restart "${SERVICE_NAME}.service"
  sleep 2
  if systemctl is-active --quiet "${SERVICE_NAME}.service"; then
    ok "Dienst läuft"
  else
    warn "systemd meldet Probleme – Container-Status:"
    docker ps -a --filter "name=systemflow" || true
    systemctl --no-pager --full status "${SERVICE_NAME}.service" || true
    die "Start fehlgeschlagen"
  fi
}

print_summary() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [[ -z "${ip}" ]] && ip="SERVER-IP"

  cat <<EOF

----------------------------------------
  SystemFlow ist aktiv
----------------------------------------
  URL:     http://${ip}:${PORT}
  Lokal:   http://127.0.0.1:${PORT}
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

  write "${INSTALL_DIR}"
  write_env
  install_systemd
  start_service
  print_summary
}

main "$@"
