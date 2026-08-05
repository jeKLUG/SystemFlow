# Architektur

## Überblick

```
Browser (React SPA)
        │
        ▼
  Fastify (API + Static)
        │
        ▼
  SQLite (libsql, Volume /data)
```

## Komponenten

| Komponente | Pfad | Rolle |
|------------|------|-------|
| API | `apps/api` | Auth, Kunden, Dokumente |
| Web | `apps/web` | UI, TipTap-Editor |
| Deploy | `scripts/deploy.sh` | Clone/Pull, Build, systemd |
| Compose | `docker-compose.yml` | Container + Volume |

## Datenmodell

- **users** – Admin (V1: ein Benutzer aus Env)
- **customers** – Stammdaten
- **documents** – TipTap-JSON, Typ `note` \| `protocol` \| `documentation`
- **assets** – Anlagen/Geräte je Kunde
- **activities** – Einsatz-Historie (manuell + automatisch bei Dokument/Anlage)
- **tasks** – offene Punkte mit Fälligkeit
- **contracts** – Verträge/SLA (keine Rechnungen)
- **attachments** – Dateien unter `UPLOAD_DIR` (Volume `/data/uploads`)
- **Vorlagen** – fest im Code (`apps/api/src/lib/templates.ts`)

## Auth

Session-Cookie (`systemhaus_session`) via `@fastify/secure-session`, Passwort mit bcrypt. Admin-Passwort wird beim Start aus `ADMIN_PASSWORD` synchronisiert.

## Deploy-Flow

```
deploy.sh
  → Docker sicherstellen
  → git clone/pull
  → .env (Port, Secrets, Admin)
  → systemd systemhaus-ess.service
  → docker compose up -d --build
```

Daten liegen im Volume `systemhaus-data` und überleben Updates.
