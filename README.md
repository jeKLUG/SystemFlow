# Systemhaus-Ess

Interne Organisations-App für **Systemhaus-Ess**: Kunden verwalten und Dokumente (Notizen, Protokolle, Dokumentationen) im Browser schreiben. Rechnungen bleiben in **Lexware** (keine Integration).

## Features

- Moderne Dark-UI mit blauer Akzentfarbe (Handy + Desktop)
- Admin-Login
- Kunden anlegen, suchen, bearbeiten
- Inventar (Geräte, Lizenzen, Software, Leihgaben) inkl. Seriennummer und Garantie
- Einsatz-Historie (Timeline)
- Aufgaben, Verträge/SLA, Ablauf-Erinnerungen
- Dateianhänge und Kunden-Export (ZIP)
- TipTap-Editor mit Vorlagen + Schnellnotiz (Handy)
- Globale Volltextsuche
- Docker-Deploy auf Linux inkl. systemd

## Login (Standard)

| Feld | Wert |
|------|------|
| Benutzer | `admin` |
| Passwort | `changeme` (bitte in `.env` ändern) |

## Linux-Server: ein Befehl

Standard ist HTTPS unter **https://systemflow.systemhaus-ess.de**. Die App bindet nur `127.0.0.1` (interner Port **8082**), der Reverse-Proxy (Caddy oder vorhandenes Nginx) holt das Let's-Encrypt-Zertifikat. Der frühere öffentliche Port **8081** bleibt frei (z. B. für SArch). DNS-A/AAAA für `systemflow.systemhaus-ess.de` muss auf den Server zeigen; Cloud-Firewall **80** und **443**.

```bash
curl -fsSL https://raw.githubusercontent.com/jeKLUG/SystemFlow/main/scripts/deploy.sh | sudo bash
```

Anderer interner Port oder Domain:

```bash
curl -fsSL https://raw.githubusercontent.com/jeKLUG/SystemFlow/main/scripts/deploy.sh | sudo SYSTEMHAUS_PORT=8082 SYSTEMFLOW_DOMAIN=systemflow.systemhaus-ess.de bash
```

Nur HTTP ohne Proxy (nicht empfohlen):

```bash
curl -fsSL https://raw.githubusercontent.com/jeKLUG/SystemFlow/main/scripts/deploy.sh | sudo SYSTEMFLOW_HTTP_ONLY=1 bash
```

Update später:

```bash
sudo /opt/systemflow/scripts/deploy.sh
```

| Aktion | Befehl |
|--------|--------|
| Status | `sudo systemctl status systemhaus-ess` |
| Stop | `sudo systemctl stop systemhaus-ess` |
| Start | `sudo systemctl start systemhaus-ess` |

## Lokal entwickeln

```bash
npm install
npm run dev:api    # http://localhost:3000
npm run dev:web    # http://localhost:5173 (proxied /api)
```

Produktion lokal bauen:

```bash
npm run build
set DATABASE_PATH=./data/systemhaus.sqlite
set WEB_DIST=./apps/web/dist
set SESSION_SECRET=dev-secret-key-32bytes-minimum!!
npm start
```

## Umgebungsvariablen

Siehe [`.env.example`](.env.example):

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `SYSTEMFLOW_DOMAIN` | `systemflow.systemhaus-ess.de` | Öffentliche HTTPS-Domain (Deploy) |
| `SYSTEMHAUS_BIND` | `127.0.0.1` | Docker-Bind (localhost hinter Proxy) |
| `SYSTEMHAUS_PORT` | `8082` | Interner Host-Port (Docker) |
| `COOKIE_SECURE` | `true` (Deploy mit Domain) | Secure-Flag der Session-Cookies |
| `ADMIN_USERNAME` | `admin` | Login |
| `ADMIN_PASSWORD` | `changeme` | Login |
| `SESSION_SECRET` | (generiert beim Deploy) | Cookie-Signatur |
| `DATABASE_PATH` | `./data/systemhaus.sqlite` | SQLite-Datei |

## Projektstruktur

```
apps/api/     Fastify API + SQLite (libsql)
apps/web/     React + Vite + TipTap
scripts/      deploy.sh
docs/         Dokumentation
```

## Dokumentation

Siehe [docs/README.md](docs/README.md).
