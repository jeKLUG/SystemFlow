#!/usr/bin/env bash
# Systemhaus-Ess deploy – Update, Build und Dauerbetrieb auf Linux
#
# Standard: App nur auf 127.0.0.1 (interner Port, Default 8082), oeffentlich
# HTTPS unter https://systemflow.systemhaus-ess.de (Caddy oder bestehendes Nginx).
# Fremde Dienste auf 8081 (z. B. SArch) werden nicht beendet.
#
# Usage:
#   sudo ./scripts/deploy.sh
#   sudo SYSTEMFLOW_DOMAIN=systemflow.systemhaus-ess.de ./scripts/deploy.sh
#   sudo SYSTEMFLOW_HTTP_ONLY=1 SYSTEMHAUS_PORT=8082 ./scripts/deploy.sh
#
# Einzeiler:
#   curl -fsSL https://raw.githubusercontent.com/jeKLUG/SystemFlow/main/scripts/deploy.sh | sudo bash
#
set -euo pipefail

REPO_URL="${SYSTEMFLOW_REPO:-${SYSTEMHAUS_REPO:-https://github.com/jeKLUG/SystemFlow.git}}"
INSTALL_DIR="${SYSTEMFLOW_DIR:-${SYSTEMHAUS_DIR:-/opt/systemflow}}"
BRANCH="${SYSTEMFLOW_BRANCH:-${SYSTEMHAUS_BRANCH:-main}}"
SERVICE_NAME="systemhaus-ess"
COMPOSE_FILE="docker-compose.yml"
DEFAULT_DOMAIN="systemflow.systemhaus-ess.de"
DEFAULT_INTERNAL_PORT="8082"
CADDYFILE="/etc/caddy/Caddyfile"
NGINX_SITE_NAME="systemflow"

PORT_EXPLICIT=0
if [[ -n "${SYSTEMHAUS_PORT:-${SYSTEMFLOW_PORT:-}}" ]]; then
  PORT_EXPLICIT=1
fi
PORT="${SYSTEMHAUS_PORT:-${SYSTEMFLOW_PORT:-${DEFAULT_INTERNAL_PORT}}}"
BIND="${SYSTEMHAUS_BIND:-}"
DOMAIN="${SYSTEMFLOW_DOMAIN:-${DEFAULT_DOMAIN}}"
DOMAIN_SET=0
if [[ -n "${SYSTEMFLOW_DOMAIN+x}" ]]; then
  DOMAIN_SET=1
  DOMAIN="${SYSTEMFLOW_DOMAIN}"
fi
TLS_EMAIL="${SYSTEMFLOW_TLS_EMAIL:-}"
HTTP_ONLY="${SYSTEMFLOW_HTTP_ONLY:-0}"
COOKIE_SECURE_VALUE="${COOKIE_SECURE:-}"

if [[ "${HTTP_ONLY}" == "1" ]]; then
  DOMAIN=""
fi

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    die "Bitte mit root/sudo ausfuehren: sudo $0"
  fi
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
    log "Docker nicht gefunden – installiere Docker (get.docker.com)…"
    curl -fsSL https://get.docker.com | sh
  fi

  systemctl enable --now docker >/dev/null 2>&1 || true

  if ! docker info >/dev/null 2>&1; then
    die "Docker laeuft nicht. Pruefe: systemctl status docker"
  fi
  compose_args >/dev/null
  ok "Docker bereit"
}

sync_repo() {
  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    log "Aktualisiere Repository in ${INSTALL_DIR}…"
    # Lokale Aenderungen am Deploy-Tree verwerfen (.env bleibt untracked)
    git -C "${INSTALL_DIR}" fetch --prune origin
    git -C "${INSTALL_DIR}" checkout -f "${BRANCH}"
    git -C "${INSTALL_DIR}" reset --hard "origin/${BRANCH}"
    git -C "${INSTALL_DIR}" clean -fd --exclude=.env --exclude=data
  elif [[ -f "${INSTALL_DIR}/${COMPOSE_FILE}" ]]; then
    warn "Kein Git-Repo in ${INSTALL_DIR} – nutze vorhandene Dateien (kein Pull)."
  else
    log "Klone ${REPO_URL} nach ${INSTALL_DIR}…"
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

  # BOM/CRLF absichern (Windows-Editoren)
  if command -v sed >/dev/null 2>&1; then
    sed -i '1s/^\xEF\xBB\xBF//' "${installed}" 2>/dev/null || true
    sed -i 's/\r$//' "${installed}" 2>/dev/null || true
  fi

  chmod +x "${installed}"
  log "Starte installiertes Deploy-Skript…"
  export SYSTEMFLOW_DEPLOY_REEXEC=1
  export SYSTEMFLOW_REPO SYSTEMHAUS_REPO SYSTEMFLOW_DIR SYSTEMHAUS_DIR
  export SYSTEMFLOW_PORT SYSTEMHAUS_PORT SYSTEMFLOW_BRANCH SYSTEMHAUS_BRANCH
  export SYSTEMFLOW_DOMAIN SYSTEMFLOW_TLS_EMAIL SYSTEMFLOW_HTTP_ONLY SYSTEMHAUS_BIND
  export COOKIE_SECURE SESSION_SECRET ADMIN_USERNAME ADMIN_PASSWORD
  exec bash "${installed}"
}

env_get() {
  local file="$1" key="$2"
  [[ -f "${file}" ]] || return 0
  grep -E "^${key}=" "${file}" 2>/dev/null | tail -n 1 | cut -d= -f2- || true
}

env_set() {
  local file="$1" key="$2" val="$3"
  if grep -qE "^${key}=" "${file}" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "${file}"
  else
    printf '%s=%s\n' "${key}" "${val}" >> "${file}"
  fi
}

tcp_port_in_use() {
  local port="$1"
  ss -lnt "sport = :${port}" 2>/dev/null | grep -q ":${port}"
}

port_proc() {
  local port="$1"
  ss -lntp "sport = :${port}" 2>/dev/null | grep -oE '"[^"]+"' | head -n 1 | tr -d '"' || true
}

https_enabled() {
  [[ -n "${DOMAIN}" ]]
}

resolve_bind_and_port() {
  local env_file="${INSTALL_DIR}/.env"
  local existing_port
  existing_port="$(env_get "${env_file}" SYSTEMHAUS_PORT)"
  if [[ -z "${existing_port}" ]]; then
    existing_port="$(env_get "${env_file}" SYSTEMFLOW_PORT)"
  fi

  if [[ "${HTTP_ONLY}" == "1" ]]; then
    DOMAIN=""
  elif [[ "${DOMAIN_SET}" -eq 1 ]]; then
    DOMAIN="${SYSTEMFLOW_DOMAIN}"
  else
    local existing_domain
    existing_domain="$(env_get "${env_file}" SYSTEMFLOW_DOMAIN)"
    DOMAIN="${existing_domain:-${DEFAULT_DOMAIN}}"
  fi

  if [[ "${PORT_EXPLICIT}" -ne 1 ]]; then
    if https_enabled; then
      # Alter oeffentlicher Default 8081 weicht SArch; intern 8082.
      if [[ -z "${existing_port}" || "${existing_port}" == "8081" ]]; then
        PORT="${DEFAULT_INTERNAL_PORT}"
      else
        PORT="${existing_port}"
      fi
    else
      PORT="${existing_port:-${DEFAULT_INTERNAL_PORT}}"
    fi
  fi

  if https_enabled; then
    BIND="${BIND:-127.0.0.1}"
    COOKIE_SECURE_VALUE="true"
  else
    BIND="${BIND:-0.0.0.0}"
    if [[ -z "${COOKIE_SECURE_VALUE}" ]]; then
      COOKIE_SECURE_VALUE="$(env_get "${env_file}" COOKIE_SECURE)"
    fi
    COOKIE_SECURE_VALUE="${COOKIE_SECURE_VALUE:-false}"
  fi
}

write_env() {
  local env_file="${INSTALL_DIR}/.env"
  if [[ ! -f "${env_file}" ]]; then
    local secret
    secret="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    cat > "${env_file}" <<EOF
SYSTEMHAUS_PORT=${PORT}
SYSTEMHAUS_BIND=${BIND}
SESSION_SECRET=${secret}
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
COOKIE_SECURE=${COOKIE_SECURE_VALUE}
EOF
    warn "Standard-Passwort ist 'changeme' – bitte in ${env_file} aendern!"
  fi

  env_set "${env_file}" SYSTEMHAUS_PORT "${PORT}"
  env_set "${env_file}" SYSTEMHAUS_BIND "${BIND}"
  env_set "${env_file}" COOKIE_SECURE "${COOKIE_SECURE_VALUE}"
  if https_enabled; then
    env_set "${env_file}" SYSTEMFLOW_DOMAIN "${DOMAIN}"
  fi

  local extra=""
  if https_enabled; then
    extra=", Domain ${DOMAIN}"
  fi
  ok "Env in ${env_file} (Bind ${BIND}:${PORT}${extra})"
}

open_firewall() {
  local ports=()
  if https_enabled; then
    ports=(80 443)
  else
    ports=("${PORT}")
  fi

  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi 'Status: active'; then
    local p
    for p in "${ports[@]}"; do
      log "Oeffne UFW-Port ${p}/tcp…"
      ufw allow "${p}/tcp" comment 'Systemhaus-Ess' >/dev/null 2>&1 || ufw allow "${p}/tcp" >/dev/null || true
    done
    ok "UFW: TCP ${ports[*]} erlaubt"
  elif command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld 2>/dev/null; then
    local p
    for p in "${ports[@]}"; do
      log "Oeffne firewalld-Port ${p}/tcp…"
      firewall-cmd --permanent --add-port="${p}/tcp" >/dev/null 2>&1 || true
    done
    firewall-cmd --reload >/dev/null 2>&1 || true
    ok "firewalld: TCP ${ports[*]} erlaubt"
  else
    warn "Keine aktive Host-Firewall erkannt – ggf. Cloud-Firewall (Hetzner/Contabo) TCP ${ports[*]} freigeben"
  fi
}

install_systemd() {
  local unit="/etc/systemd/system/${SERVICE_NAME}.service"

  # Alten Demo-Dienst entfernen, falls vorhanden
  if systemctl list-unit-files | grep -q '^systemflow\.service'; then
    systemctl disable --now systemflow.service >/dev/null 2>&1 || true
  fi

  log "Installiere systemd-Dienst ${SERVICE_NAME}.service…"
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
ExecStart=/bin/bash -lc 'cd "${INSTALL_DIR}" && docker compose --env-file .env up -d --remove-orphans'
ExecStop=/bin/bash -lc 'cd "${INSTALL_DIR}" && docker compose --env-file .env down'
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}.service" >/dev/null
  ok "systemd-Dienst aktiviert (Start bei Boot)"
}

write_proxy_snippets() {
  mkdir -p "${INSTALL_DIR}"
  cat > "${INSTALL_DIR}/caddy.snippet" <<EOF
# BEGIN SYSTEMFLOW
${DOMAIN} {
	encode gzip
	reverse_proxy 127.0.0.1:${PORT}
}
# END SYSTEMFLOW
EOF
  cat > "${INSTALL_DIR}/nginx.snippet.conf" <<EOF
server {
	listen 80;
	server_name ${DOMAIN};

	client_max_body_size 512m;

	location / {
		proxy_pass http://127.0.0.1:${PORT};
		proxy_http_version 1.1;
		proxy_set_header Host \$host;
		proxy_set_header X-Real-IP \$remote_addr;
		proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto \$scheme;
		proxy_set_header Upgrade \$http_upgrade;
		proxy_set_header Connection "upgrade";
		proxy_read_timeout 3600;
		proxy_send_timeout 3600;
	}
}
EOF
}

caddy_block() {
  cat <<EOF
# BEGIN SYSTEMFLOW
${DOMAIN} {
	encode gzip
	reverse_proxy 127.0.0.1:${PORT}
}
# END SYSTEMFLOW
EOF
}

upsert_caddy_site() {
  mkdir -p /etc/caddy
  touch "${CADDYFILE}"
  if grep -qF '# BEGIN SYSTEMFLOW' "${CADDYFILE}"; then
    sed -i '/# BEGIN SYSTEMFLOW/,/# END SYSTEMFLOW/d' "${CADDYFILE}"
  fi
  printf '\n%s\n' "$(caddy_block)" >> "${CADDYFILE}"
}

ensure_caddy() {
  if command -v caddy >/dev/null 2>&1; then
    return 0
  fi
  if ! command -v apt-get >/dev/null 2>&1; then
    return 1
  fi
  log "Installiere Caddy…"
  apt-get update -qq
  if apt-get install -y -qq caddy; then
    return 0
  fi
  warn "Caddy nicht in den Distro-Paketen – versuche offizielles Repository…"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg >/dev/null 2>&1 || true
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
}

reload_caddy() {
  if ! caddy validate --config "${CADDYFILE}" --adapter caddyfile >/dev/null 2>&1; then
    warn "Caddyfile ungueltig:"
    caddy validate --config "${CADDYFILE}" --adapter caddyfile || true
    return 1
  fi
  if systemctl is-active --quiet caddy 2>/dev/null; then
    systemctl reload caddy
  else
    systemctl enable --now caddy >/dev/null 2>&1 || systemctl start caddy
  fi
}

nginx_proxy_server() {
  local listen_tls="$1"
  if [[ "${listen_tls}" == "1" ]]; then
    cat <<EOF
server {
	listen 80;
	server_name ${DOMAIN};
	location /.well-known/acme-challenge/ {
		root /var/www/html;
	}
	location / {
		return 301 https://\$host\$request_uri;
	}
}
server {
	listen 443 ssl;
	server_name ${DOMAIN};

	ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
	ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

	client_max_body_size 512m;

	location / {
		proxy_pass http://127.0.0.1:${PORT};
		proxy_http_version 1.1;
		proxy_set_header Host \$host;
		proxy_set_header X-Real-IP \$remote_addr;
		proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto https;
		proxy_set_header Upgrade \$http_upgrade;
		proxy_set_header Connection "upgrade";
		proxy_read_timeout 3600;
		proxy_send_timeout 3600;
	}
}
EOF
  else
    cat <<EOF
server {
	listen 80;
	server_name ${DOMAIN};

	client_max_body_size 512m;

	location / {
		proxy_pass http://127.0.0.1:${PORT};
		proxy_http_version 1.1;
		proxy_set_header Host \$host;
		proxy_set_header X-Real-IP \$remote_addr;
		proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto \$scheme;
		proxy_set_header Upgrade \$http_upgrade;
		proxy_set_header Connection "upgrade";
		proxy_read_timeout 3600;
		proxy_send_timeout 3600;
	}
}
EOF
  fi
}

nginx_site_path() {
  if [[ -d /etc/nginx/sites-available ]]; then
    echo "/etc/nginx/sites-available/${NGINX_SITE_NAME}"
  elif [[ -d /etc/nginx/conf.d ]]; then
    echo "/etc/nginx/conf.d/${NGINX_SITE_NAME}.conf"
  else
    echo ""
  fi
}

write_nginx_site() {
  local tls="$1"
  local path
  path="$(nginx_site_path)"
  [[ -n "${path}" ]] || return 1
  nginx_proxy_server "${tls}" > "${path}"
  if [[ -d /etc/nginx/sites-enabled ]]; then
    ln -sfn "${path}" "/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"
  fi
  nginx -t
  systemctl reload nginx
}

ensure_certbot() {
  if command -v certbot >/dev/null 2>&1; then
    return 0
  fi
  command -v apt-get >/dev/null 2>&1 || return 1
  log "Installiere certbot…"
  apt-get update -qq
  apt-get install -y -qq certbot python3-certbot-nginx
}

issue_nginx_cert() {
  local args=(--nginx -d "${DOMAIN}" --non-interactive --agree-tos --redirect)
  if [[ -n "${TLS_EMAIL}" ]]; then
    args+=(-m "${TLS_EMAIL}")
  else
    args+=(--register-unsafely-without-email)
  fi
  certbot "${args[@]}"
}

setup_https_proxy() {
  https_enabled || return 0

  write_proxy_snippets

  local proc80 proc443
  proc80="$(port_proc 80)"
  proc443="$(port_proc 443)"

  local nginx_active=0 caddy_active=0
  if systemctl is-active --quiet nginx 2>/dev/null || [[ "${proc80}" == *nginx* ]]; then
    nginx_active=1
  fi
  if systemctl is-active --quiet caddy 2>/dev/null || command -v caddy >/dev/null 2>&1 && [[ "${proc80}" == *caddy* ]]; then
    caddy_active=1
  fi
  if command -v caddy >/dev/null 2>&1 && [[ "${caddy_active}" -eq 0 && "${nginx_active}" -eq 0 ]]; then
    caddy_active=1
  fi

  if [[ "${nginx_active}" -eq 1 ]]; then
    log "Nginx erkannt – richte vHost ${DOMAIN} ein…"
    if [[ -d /etc/letsencrypt/live/${DOMAIN} ]]; then
      write_nginx_site 1
    else
      write_nginx_site 0
      if ensure_certbot; then
        if issue_nginx_cert; then
          write_nginx_site 1 || true
        else
          warn "Let's Encrypt via certbot fehlgeschlagen – HTTP-vHost bleibt, Zertifikat spaeter: certbot --nginx -d ${DOMAIN}"
        fi
      else
        warn "certbot nicht installierbar – ${DOMAIN} laeuft vorerst per HTTP hinter Nginx"
      fi
    fi
    ok "Nginx: ${DOMAIN} → 127.0.0.1:${PORT}"
    return 0
  fi

  if [[ "${caddy_active}" -eq 1 ]] || { ! tcp_port_in_use 80 && ! tcp_port_in_use 443; }; then
    if ! command -v caddy >/dev/null 2>&1; then
      ensure_caddy || {
        warn "Caddy konnte nicht installiert werden. Snippets liegen in ${INSTALL_DIR}/caddy.snippet"
        return 0
      }
    fi
    if tcp_port_in_use 80 && [[ "${proc80}" != *caddy* && -n "${proc80}" ]]; then
      warn "Port 80 gehoert ${proc80} – Caddy nicht gestartet. Snippet: ${INSTALL_DIR}/caddy.snippet"
      return 0
    fi
    log "Caddy: Site ${DOMAIN} → 127.0.0.1:${PORT}"
    upsert_caddy_site
    if reload_caddy; then
      ok "Caddy aktiv (${DOMAIN}, Let's Encrypt automatisch)"
    else
      warn "Caddy-Reload fehlgeschlagen – manuell: ${INSTALL_DIR}/caddy.snippet in ${CADDYFILE} uebernehmen"
    fi
    return 0
  fi

  warn "Port 80/443 belegt durch ${proc80:-unbekannt}/${proc443:-unbekannt} – kein Reverse-Proxy gesetzt."
  warn "App lauscht intern auf ${BIND}:${PORT}. Bitte im bestehenden Proxy Host ${DOMAIN} → 127.0.0.1:${PORT} eintragen."
  warn "Vorlagen: ${INSTALL_DIR}/caddy.snippet  ${INSTALL_DIR}/nginx.snippet.conf"
}

check_public_https() {
  https_enabled || return 0
  local url="https://${DOMAIN}/api/health"
  local code
  log "Pruefe oeffentliches HTTPS (${url})…"
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "${url}" 2>/dev/null || true)"
  if [[ "${code}" == "200" ]]; then
    ok "HTTPS erreichbar (${DOMAIN})"
  else
    warn "https://${DOMAIN} antwortet noch nicht (HTTP ${code:-n/a}). DNS, Cloud-Firewall 80/443 und Zertifikatausstellung pruefen."
  fi
}

# Beendet keine fremden Dienste. Nach compose down sollte der interne Port frei sein.
ensure_port_free() {
  local port="$1"
  if ss -lnt "sport = :${port}" 2>/dev/null | grep -q ":${port}"; then
    warn "Port ${port} ist noch belegt:"
    ss -lntp "sport = :${port}" 2>/dev/null || true
    die "Internen Port ${port} nicht belegen (SArch und andere Dienste bleiben unangetastet). SYSTEMHAUS_PORT=<frei> setzen."
  fi
}

compose_up() {
  local mode
  mode="$(compose_args)"
  cd "${INSTALL_DIR}"

  log "Stoppe ggf. vorhandenen Container…"
  if [[ "${mode}" == "compose" ]]; then
    docker compose --env-file .env down --remove-orphans >/dev/null 2>&1 || true
  else
    docker-compose --env-file .env down --remove-orphans >/dev/null 2>&1 || true
  fi
  docker rm -f systemhaus-ess >/dev/null 2>&1 || true

  # SYSTEMFLOW_NO_CACHE=1 erzwingt Rebuild ohne Docker-Layer-Cache (bei „alte UI“ nutzen)
  log "Baue Image…"
  local build_flags=(--pull)
  local build_id
  build_id="$(git -C "${INSTALL_DIR}" rev-parse --short HEAD 2>/dev/null || date -u +%Y%m%d%H%M)"
  build_flags+=(--build-arg "BUILD_ID=${build_id}")
  if [[ "${SYSTEMFLOW_NO_CACHE:-0}" == "1" ]]; then
    warn "SYSTEMFLOW_NO_CACHE=1 – baue ohne Cache (dauert laenger)"
    build_flags+=(--no-cache)
  fi
  if [[ "${mode}" == "compose" ]]; then
    if ! docker compose --env-file .env build "${build_flags[@]}"; then
      die "Docker-Build fehlgeschlagen – es wird kein alter Container gestartet"
    fi
  else
    if ! docker-compose --env-file .env build "${build_flags[@]}"; then
      die "Docker-Build fehlgeschlagen – es wird kein alter Container gestartet"
    fi
  fi

  ensure_port_free "${PORT}"

  log "Starte Container…"
  if [[ "${mode}" == "compose" ]]; then
    docker compose --env-file .env up -d --remove-orphans --force-recreate
  else
    docker-compose --env-file .env up -d --remove-orphans --force-recreate
  fi
}

health_check() {
  local url="http://127.0.0.1:${PORT}/api/health"
  local i code
  log "Pruefe Erreichbarkeit lokal (${url})…"
  for i in $(seq 1 30); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "${url}" 2>/dev/null || true)"
    if [[ "${code}" == "200" ]]; then
      ok "Health-Check OK (lokal ${BIND}:${PORT})"
      return 0
    fi
    # Container evtl. noch am Neustart
    if ! docker ps --filter "name=systemhaus-ess" --filter "status=running" --format '{{.Names}}' | grep -q systemhaus-ess; then
      warn "Container nicht running (Versuch ${i}/30)…"
      docker ps -a --filter "name=systemhaus-ess" || true
    fi
    sleep 2
  done

  warn "Health-Check lokal fehlgeschlagen – Diagnose:"
  echo "--- curl ---"
  curl -v --max-time 5 "${url}" || true
  echo "--- ports ---"
  ss -lntp "sport = :${PORT}" 2>/dev/null || ss -lntp | grep "${PORT}" || true
  docker port systemhaus-ess 2>/dev/null || true
  echo "--- docker ps ---"
  docker ps -a --filter "name=systemhaus" || true
  echo "--- logs ---"
  docker logs systemhaus-ess --tail 100 2>&1 || true
  die "App antwortet nicht auf Port ${PORT}"
}

start_service() {
  log "Starte / aktualisiere Systemhaus-Ess (Docker Build)…"
  if ! compose_up; then
    warn "Docker Compose fehlgeschlagen."
    warn "Port-Check:"
    ss -lntp "sport = :${PORT}" 2>/dev/null || true
    docker ps -a --filter "name=systemhaus" || true
    docker compose --env-file "${INSTALL_DIR}/.env" -f "${INSTALL_DIR}/docker-compose.yml" logs --tail=40 || true
    die "Start fehlgeschlagen – siehe Ausgabe oben"
  fi

  # systemd nur markieren/aktivieren – kein zweites --build (das wuerde den Start verzoegern)
  systemctl reset-failed "${SERVICE_NAME}.service" >/dev/null 2>&1 || true
  systemctl start "${SERVICE_NAME}.service" >/dev/null 2>&1 || true

  sleep 3
  if docker ps --filter "name=systemhaus-ess" --filter "status=running" --format '{{.Names}}' | grep -q systemhaus-ess; then
    ok "Container laeuft"
  else
    warn "Container nicht aktiv:"
    docker ps -a --filter "name=systemhaus" || true
    docker logs systemhaus-ess --tail 100 2>&1 || true
    die "Start fehlgeschlagen"
  fi

  health_check
}

print_summary() {
  local ip url
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [[ -z "${ip}" ]] && ip="SERVER-IP"
  if https_enabled; then
    url="https://${DOMAIN}"
  else
    url="http://${ip}:${PORT}"
  fi

  cat <<EOF

----------------------------------------
  Systemhaus-Ess ist aktiv
----------------------------------------
  URL:     ${url}
  Intern:  http://127.0.0.1:${PORT}
  Login:   admin / (siehe ${INSTALL_DIR}/.env)
  Ordner:  ${INSTALL_DIR}
  Dienst:  systemctl status ${SERVICE_NAME}
  Update:  sudo bash ${INSTALL_DIR}/scripts/deploy.sh
  Stop:    sudo systemctl stop ${SERVICE_NAME}
  Start:   sudo systemctl start ${SERVICE_NAME}

  Wenn von aussen nicht erreichbar:
  - DNS A/AAAA: ${DOMAIN:-'(HTTP-only)'} → diese Server-IP
  - Cloud-Firewall: TCP 80 und 443 freigeben (nicht den internen Port)
  - Lokal testen: curl -s http://127.0.0.1:${PORT}/api/health
  - Logs:         docker logs systemhaus-ess --tail 80
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

  resolve_bind_and_port
  write_env
  open_firewall
  install_systemd
  start_service
  setup_https_proxy
  check_public_https
  print_summary
}

main "$@"
