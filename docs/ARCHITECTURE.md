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
| Android | `apps/android-app` | WebView-Hülle (APK) |
| Deploy | `scripts/deploy.sh` | Clone/Pull, Build, systemd |
| Compose | `docker-compose.yml` | Container + Volume |

## Datenmodell

- **users** – Admin (V1: ein Benutzer aus Env)
- **customers** – Stammdaten
- **projects** – Projekte inkl. Status, Zeitraum, Budget (Stunden/Euro), Stundensatz
- **documents** – Kunden-Wiki (TipTap-JSON), Typ `article` \| `documentation` \| `note` \| `workflow` \| `protocol`, optional `projectId`
- **time_entries** – Zeiteinträge inkl. optionalem Preiskatalog-Satz und Betrags-Snapshot
- **org_settings** – Standard-Stundensatz, Währung, MwSt.-Hinweis (unter Konto)
- **price_items** – Preiskatalog (`hourly` / `fixed` / `unit`)
- **assets** – Anlagen/Inventar je Kunde (Typ, Status, Host/IP/MAC, Standort, Garantie)
- **activities** – Einsatz-Historie (manuell + automatisch)
- **tasks** – offene Punkte mit Fälligkeit
- **contracts** – Verträge/SLA (keine Rechnungen)
- **attachments** – Dateien unter `UPLOAD_DIR` (Volume `/data/uploads`), optional `folder_id` / `document_id` / `asset_id` / `email_id`
- **customer_emails** – archivierter Mailverkehr je Kunde (Betreff, Von/An, Datum, Text, Richtung)
- **file_folders** – Ordnerhierarchie der Kunden-Dokumentenablage
- **vault_meta** / **vault_entries** – Passworttresor (AES-256-GCM, eigene Passphrase; siehe [SECURITY-VAULT.md](SECURITY-VAULT.md))
- **appointments** – Termine (Kunde / intern / persönlich)
- **Vorlagen** – fest im Code (`apps/api/src/lib/templates.ts`)

Rechnungsstellung bleibt in Lexware; Systemhaus-Ess liefert Historie + Preis-Snapshots zur Vorbereitung.

## Kontakte-UI

Unter Nav „Kontakte“ (`/customers`): Liste mit Filter Kontakt/Kunde. Detail unter `/customers/:id` Tabs: Übersicht · Dokumente (Wiki / Dateiablage / E-Mails / Verträge) · Projekte · Aufgaben · Zeiten · Geräte & Netzwerk · Protokoll (Einsatz-Historie).

Stammdaten-Tabelle `customers` mit Feld `kind` (`contact` \| `customer`).

Mobil (≤860px): Sticky Topbar/Tabbar mit Safe-Area, Bottom-Sheets, sticky Kontakt-Tabs, größere Touch-Targets (`--mobile-hit`), Seiten-Padding über `--mobile-page-pad-x` / `--mobile-tabbar-h`.

PWA: `vite-plugin-pwa` – Shell offline, NetworkFirst für Lese-APIs; zusätzlich lokale Snapshots (`offlineCache`) für Dashboard, Kontaktliste und Kalender.

Nav „Aufgaben“ (`/tasks`): globale To-dos (mit/ohne Kunde) plus Ablauf-Block (Garantien/Verträge). Kundenbezogene Tasks bleiben unter `/customers/:id/tasks` synchron.
Kalender unter `/calendar`: Vollflächen-UI mit Monats-/Wochen-/Tagesansicht, festen Tageszellen, Termin-Anlage per Modal/FAB, animierter Detailseiteleiste.

## Zeitzone

Kalendertage (`YYYY-MM-DD`) und „heute“ laufen über `Europe/Berlin` (API: Env `APP_TIMEZONE`, Web: Browser-Lokalzeit + `parseDateOnly`). Reines Datum darf nicht als UTC-Mitternacht geparst werden – sonst erscheint in DE oft der Vortag. Docker-Container sind oft UTC; die API nutzt deshalb explizit die App-Zeitzone für Erinnerungen, Aufgaben und Termine.

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

Daten liegen im Volume `systemhaus-data` und überleben Updates. Systemsicherung (Download/Restore) siehe [BACKUP.md](BACKUP.md).
