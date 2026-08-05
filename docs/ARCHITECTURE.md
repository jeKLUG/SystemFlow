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
- **projects** – Projekte inkl. Status, Zeitraum, Budget (Stunden/Euro), Stundensatz
- **documents** – Kunden-Wiki (TipTap-JSON), Typ `article` \| `documentation` \| `note` \| `workflow` \| `protocol`, optional `projectId`
- **time_entries** – Zeiteinträge (Datum, Stunden, Beschreibung, optional Projekt, abrechenbar)
- **assets** – Anlagen/Geräte je Kunde
- **activities** – Einsatz-Historie (manuell + automatisch)
- **tasks** – offene Punkte mit Fälligkeit
- **contracts** – Verträge/SLA (keine Rechnungen)
- **attachments** – Dateien unter `UPLOAD_DIR` (Volume `/data/uploads`)
- **Vorlagen** – fest im Code (`apps/api/src/lib/templates.ts`)

## Kunden-UI

Unter `/customers/:id` Tabs: Übersicht · Wiki · Projekte · Zeiten · Anlagen · Betrieb (Aufgaben, Verträge, Historie, Anhänge).

## Auth

Session-Cookie (`systemhaus_session`) via `@fastify/secure-session`, Passwort mit bcrypt. Admin wird einmalig geseedet; Passwort nur bei `ADMIN_PASSWORD_FORCE=1` überschrieben.

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
