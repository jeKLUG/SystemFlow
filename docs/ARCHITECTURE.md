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
| Web | `apps/web` | UI, TipTap-Editor (Lesen standardmäßig, Bearbeiten per Button; Panels, Codeblock mit Zeilen/Kopieren, Checklisten) |
| Android | `apps/android-app` | WebView-Hülle (APK) |
| Deploy | `scripts/deploy.sh` | Clone/Pull, Build, systemd |
| Compose | `docker-compose.yml` | Container + Volume |

## Datenmodell

- **users** – Admin (V1: ein Benutzer aus Env)
- **customer_users** – ein Portal-Login pro Kundenakte (bcrypt; getrennt von Admin-`users`; `lastLoginAt` bei Anmeldung)
- **customers** – Stammdaten
- **tickets** / **ticket_messages** – Helpdesk (Status, Priorität, öffentlicher Dialog, interne Notizen, öffentliche Lösung `resolution` als TipTap-JSON; Nachrichten `kind` `comment` \| `resolution`)
- **projects** – Projekte inkl. Status, Zeitraum, Budget (Stunden/Euro), Stundensatz
- **documents** – Wiki/Notizen (TipTap-JSON), Typ `article` \| `documentation` \| `note` \| `workflow` \| `protocol`; `customerId` optional (Schnellnotiz ohne Kunde), optional `projectId`
- **time_entries** – Zeiteinträge inkl. optionalem Preiskatalog-Satz und Betrags-Snapshot; `readyForInvoice` (zur Rechnung vorgemerkt) und `billed`; optional mehrere Positionen in **time_entry_lines** (Snapshots ändern sich nicht nachträglich bei Katalog-/Satzupdates)
- **time_entry_lines** – 1–n Leistungen je Zeiteintrag (Katalog oder virtueller Standard-/Projekt-Stundensatz; Menge, Preis-Snapshot)
- **org_settings** – Standard-Stundensatz, Währung, MwSt.-Hinweis (UI: Preise-App)
- **price_items** – Preiskatalog (`hourly` / `fixed` / `unit`; UI: Preise-App unter `/prices`)
- **assets** – Inventar je Kunde (Geräte, Lizenzen, Software; Zuordnung Kundeneigentum / verliehen / bei uns; Host/IP/MAC, Standort, Garantie). Liste kompakt; Detailvorschau und Anlegen/Bearbeiten als Modal.
- **activities** – Einsatz-Historie (manuell + automatisch)
- **tasks** – offene Punkte mit Fälligkeit
- **contracts** – Verträge/SLA (keine Rechnungen; optional Preis monatlich/jährlich in EUR; Leistungsumfang als TipTap-JSON)
- **attachments** – Dateien unter `UPLOAD_DIR` (Volume `/data/uploads`), optional `folder_id` / `document_id` / `asset_id` / `email_id` / `ticket_id`; `portal_visible` gibt einzelne Ablage-Dateien im Kundenportal frei
- **documents** / **assets** – optional `portal_visible` (Default aus): Freigabe für das Kundenportal
- **customer_emails** – archivierter Mailverkehr je Kunde (Betreff, Von/An, Datum, Text, Richtung); Import aus `.eml` via `mailparser`
- **file_folders** – Ordnerhierarchie der Kunden-Dokumentenablage; `portal_visible` gibt den Ordner inkl. Unterordner und Dateien im Kundenportal frei
- **vault_meta** / **vault_entries** / **vault_shares** / **vault_share_events** – Passworttresor (AES-256-GCM; Einweg-Shares mit PIN + Abruf-Protokoll; siehe [SECURITY-VAULT.md](SECURITY-VAULT.md))
- **appointments** – Termine (Kunde / intern / persönlich)
- **Vorlagen** – fest im Code (`apps/api/src/lib/templates.ts`)

Rechnungsstellung bleibt in Lexware; Systemhaus-Ess liefert Historie, Preis-Snapshots, Vormerk-Status und Monatsreport-PDF zur Vorbereitung.

PDF-Exporte (Wiki, SLA, Besuchsblatt) nutzen gemeinsames Chrome in `apps/api/src/lib/pdf-chrome.ts`. Das Besuchsblatt (`GET /api/customers/:id/visit/pdf`) bündelt Kontakt, aktive Anlagen, letzte Einsätze, offene Reminder (Garantie/Vertrag/Termin), Vault-Hinweise ohne Secrets sowie offene Aufgaben und nicht abgerechnete Zeiten für den Vor-Ort-Einsatz.

## Kontakte-UI

Unter Nav „Kontakte“ (`/customers`): Liste mit Filter Kontakt/Kunde. Detail unter `/customers/:id` Tabs: Übersicht · Dokumente (Wiki / Dateien / E-Mails / Verträge) · Projekte · Aufgaben · Tickets · Zeiten · Inventar · Protokoll (Einsatz-Historie).

Stammdaten-Tabelle `customers` mit Feld `kind` (`contact` \| `customer`).

Mobil (≤860px): Sticky Topbar (Menü / Marke / Aufgaben) und Tabbar (Start · Kontakte · Notiz · Tresor · Termin) mit Safe-Area; globale Suche in der Sidebar unter dem Logo (Menü öffnen); Bottom-Sheets; Kontakt-Reiter fest unter der Topbar (scrollen nicht weg, Kurzlabels); größere Touch-Targets (`--mobile-hit` ≥ 3 rem); Inputs 16 px; Seiten-Padding über `--mobile-page-pad-x` / `--mobile-tabbar-h`.

Desktop: Sidebar mit Logo und globaler Suche darunter (Kontakte, Wiki, Dateien, Ordner, Inventar, Historie). Alte Route `/search` leitet auf `/` um.

PWA: `vite-plugin-pwa` – Shell offline, NetworkFirst für Lese-APIs; zusätzlich lokale Snapshots (`offlineCache`) für Dashboard, Kontaktliste und Kalender.

Nav „Tickets“ (`/tickets`): Helpdesk-Queue mit Restzeit für Reaktion/Lösung. Anlegen wie im Kundenportal (Editor, Priorität mit SLA-Zeiten, Anhänge) plus Kundenwahl. Ticketdetail: Anhänge und Kommentarfeld über dem Verlauf (neueste Kommentare zuerst; Staff/Kunde, interne Notizen gestrichelt); Kommentare im TipTap-Editor. Status `resolved`/`closed` nur mit dokumentierter öffentlicher Lösung (Kunde sieht sie im Portal). Kundenakte-Tab „Tickets“. Kundenportal unter `/portal` (Login `/portal/login`): Ticketkarten mit Status, Priorität, Zeiten und SLA; beim Anlegen zeigt jede Priorität Reaktions-/Lösungszeit aus dem Vertrag.
Nav „Aufgaben“ (`/tasks`): globale To-dos (mit/ohne Kunde) plus Ablauf-Block (Garantien/Verträge). Kundenbezogene Tasks bleiben unter `/customers/:id/tasks` synchron.
Nav „Preise“ (`/prices`): Preiskatalog (Stunde/Pauschale/Stück) und Standardpreise; Konto (`/settings`) enthält nur Passwort und Sicherung.
Kalender unter `/calendar`: Vollflächen-UI mit Monats-/Wochen-/Tagesansicht, Termin anlegen und bearbeiten per Modal, Detailbereich mit Bearbeiten/Löschen.

## Zeitzone

Kalendertage (`YYYY-MM-DD`) und „heute“ laufen über `Europe/Berlin` (API: Env `APP_TIMEZONE`, Web: Browser-Lokalzeit + `parseDateOnly`). Reines Datum darf nicht als UTC-Mitternacht geparst werden – sonst erscheint in DE oft der Vortag. Docker-Container sind oft UTC; die API nutzt deshalb explizit die App-Zeitzone für Erinnerungen, Aufgaben und Termine.

## Auth

Session-Cookie (`systemhaus_session`) via `@fastify/secure-session` (Cookie + Session-`expiry` 30 Tage bei „Angemeldet bleiben“, sonst 12 h; Sliding über `/api/auth/me` bzw. `/api/portal/auth/me`). Passwort mit bcrypt.

- **Staff:** `users`, Login `/login`, APIs mit `requireAdmin` (bestehende `/api/*`). Session `role=admin`.
- **Kundenportal:** `customer_users` (ein Login je Kunde, in der Kundenakte gesetzt), Login `/portal/login`, APIs unter `/api/portal/*` mit `requirePortal`. Session `role=customer` + `customerId`. Startseite `/portal` mit Kennzahlen und Diagrammen aus `GET /api/portal/overview`. Kein Zugriff auf Tresor, Preise, Zeiten, Backup, andere Kunden. Interne Ticket-Notizen, `notes` (Kunde/Vertrag/Inventar) werden nicht ausgeliefert.

Admin wird einmalig geseedet; Passwort nur bei `ADMIN_PASSWORD_FORCE=1` überschrieben.

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
