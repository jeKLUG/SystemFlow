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
| API | `apps/api` | Auth, Kunden, Dokumente, Monitoring-Ingest |
| Web | `apps/web` | UI, TipTap-Editor (Lesen standardmäßig, Bearbeiten per Button; Panels, Codeblock mit Zeilen/Kopieren, Checklisten) |
| Agent | `apps/agent` | Windows-/Linux-Dienst, Heartbeat |
| Android | `apps/android-app` | WebView-Hülle (APK) |
| Deploy | `scripts/deploy.sh` | Clone/Pull, Build, systemd |
| Compose | `docker-compose.yml` | Container + Volume |

## Datenmodell

- **users** – Admin (V1: ein Benutzer aus Env)
- **customer_users** – ein Portal-Login pro Kundenakte (bcrypt; getrennt von Admin-`users`; `lastLoginAt` bei Anmeldung; `email` für Mails; `mailNotifyJson` je Typ, nur Staff setzt)
- **customers** – Stammdaten
- **tickets** / **ticket_messages** – Helpdesk (Status, Priorität, öffentlicher Dialog, interne Notizen, öffentliche Lösung `resolution` als TipTap-JSON; Nachrichten `kind` `comment` \| `resolution`)
- **projects** – Projekte inkl. Status, Zeitraum, Budget (Stunden/Euro), Stundensatz
- **documents** – Wiki/Notizen (TipTap-JSON), Typ `article` \| `documentation` \| `note` \| `workflow` \| `protocol`; `customerId` optional (Schnellnotiz ohne Kunde), optional `projectId`
- **time_entries** – Zeiteinträge inkl. optionalem Preiskatalog-Satz und Betrags-Snapshot; `readyForInvoice` (zur Rechnung vorgemerkt) und `billed`; optional `ticket_id` (Verknüpfung mit Support-Ticket); optional mehrere Positionen in **time_entry_lines** (Snapshots ändern sich nicht nachträglich bei Katalog-/Satzupdates)
- **time_entry_lines** – 1–n Leistungen je Zeiteintrag (Katalog oder virtueller Standard-/Projekt-Stundensatz; Menge, Preis-Snapshot)
- **org_settings** – Standard-Stundensatz, Währung, MwSt.-Hinweis (UI: Preise-App); Firmenanschrift (UI: Konto) als Auftragnehmer auf Verträgen/PDF; `monitoringEnrollmentKey` für Agent-Anmeldung
- **price_items** – Preiskatalog (`hourly` / `fixed` / `unit`; UI: Preise-App unter `/prices`)
- **assets** – Inventar je Kunde (Geräte, Lizenzen, Software; Zuordnung Kundeneigentum / verliehen / bei uns). Formularfelder je `kind` (PC ≠ Firewall ≠ Lizenz). Agent füllt leere Felder (Host/IP/MAC, Hersteller/Modell/SN, CPU/RAM/Disk, OS/BIOS) bei PC/Notebook/Server/NAS.
- **monitoring_agents** / **monitoring_samples** / **monitoring_agent_packages** – Live-Agenten (Windows/Linux) mit Heartbeat, Inventar-Zuordnung, 30-Tage-Verlauf; aktuelles Binary je Plattform (`windows-amd64`, `linux-amd64`, `linux-arm64`) in den Uploads
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

Staff-Start (`/`): eine Reihe Kennzahlen (Tickets, Aufgaben, Termine, Flotte, Abläufe, Kontakte), Donuts zu Aufgaben/Tickets/Flotte, Wochenbalken der Termine, Fokus-Liste und Kalender/Abläufe. Überfälliges (SLA, Aufgaben, Monitoring) als Kapseln am Kopf.

Nav „Tickets“ (`/tickets`): Helpdesk-Queue mit Restzeit für Reaktion/Lösung. Anlegen wie im Kundenportal (Editor, Priorität mit SLA-Zeiten, Anhänge) plus Kundenwahl. Ticketdetail: Kopf mit Status/Priorität als Badges und Zeiten als Kacheln; rechte Leiste gegliedert in Steuerung, Zeiten und Arbeit; Staff kann das Ticket löschen (Nachrichten/Anhänge weg, Aufgaben und Zeiten bleiben). Anhänge und Kommentarfeld über dem Verlauf (neueste Kommentare zuerst; Staff/Kunde, interne Notizen gestrichelt); Kommentare im TipTap-Editor. Status `resolved`/`closed` nur mit dokumentierter öffentlicher Lösung (Kunde sieht sie im Portal). Kundenakte-Tab „Tickets“. Kundenportal unter `/portal` (Login `/portal/login`): kompakte Ticketzeilen (Nummer, Titel, Status); erledigte mit Haken und Grün. Beim Anlegen zeigt jede Priorität Reaktions-/Lösungszeit aus dem Vertrag.
Nav „Monitoring“ (`/monitoring`): Flotte, Warnungszeilen, Agent-Zuordnung, Kundenzeilen. Kundenseite (`/monitoring/customers/:id`): Diagramme, Meldungen, durchsuchbare Geräteliste und Gerätedetail. Agent einrichten (`/monitoring/setup`): Enrollment-Key, Pakete, Install-Skripte.
Nav „Aufgaben“ (`/tasks`): globale To-dos (mit/ohne Kunde) plus Ablauf-Block (Garantien/Verträge). Kundenbezogene Tasks bleiben unter `/customers/:id/tasks` synchron.
Nav „Preise“ (`/prices`): Preiskatalog (Stunde/Pauschale/Stück) und Standardpreise; Konto (`/settings`) enthält Firmenanschrift (Lesemodus, Bearbeitung nach „Bearbeiten“; Auftragnehmer auf Verträgen/PDF), Passwort, E-Mail (SMTP/Typen als kompakte Zeilen, Bearbeitung im Dialog) und Sicherung.
Kalender unter `/calendar`: Vollflächen-UI mit Monats-/Wochen-/Tagesansicht, Termin anlegen und bearbeiten per Modal, Detailbereich mit Bearbeiten/Löschen.

## Zeitzone

Kalendertage (`YYYY-MM-DD`) und „heute“ laufen über `Europe/Berlin` (API: Env `APP_TIMEZONE`, Web: Browser-Lokalzeit + `parseDateOnly`). Reines Datum darf nicht als UTC-Mitternacht geparst werden – sonst erscheint in DE oft der Vortag. Docker-Container sind oft UTC; die API nutzt deshalb explizit die App-Zeitzone für Erinnerungen, Aufgaben und Termine.

## Auth

Session-Cookie (`systemhaus_session`) via `@fastify/secure-session` (Cookie + Session-`expiry` 30 Tage bei „Angemeldet bleiben“, sonst 12 h; Sliding über `/api/auth/me` bzw. `/api/portal/auth/me`). Passwort mit bcrypt.

- **Staff:** `users`, Login `/login`, APIs mit `requireAdmin` (bestehende `/api/*`). Session `role=admin`.
- **Kundenportal:** `customer_users` (ein Login je Kunde, in der Kundenakte gesetzt), Login `/portal/login`, APIs unter `/api/portal/*` mit `requirePortal`. Session `role=customer` + `customerId`. Startseite `/portal` mit Kennzahlen und Diagrammen aus `GET /api/portal/overview`. Konto `/portal/account`: volle Breite, Profilkarte, E-Mail für Benachrichtigungen (Kunde ändert nur die Adresse; Typen zeigt das Portal nur an), Passwort ändern. Kein Zugriff auf Tresor, Preise, Zeiten, Backup, andere Kunden. Interne Ticket-Notizen, `notes` (Kunde/Vertrag/Inventar) und Monitoring-Warnungskonfiguration werden nicht ausgeliefert. Freigegebenes Inventar zeigt, ob Monitoring aktiv ist.

Admin wird einmalig geseedet; Passwort nur bei `ADMIN_PASSWORD_FORCE=1` überschrieben.

## E-Mail-Benachrichtigungen

SMTP liegt in `org_settings` (Passwort AES-256-GCM mit Schlüssel aus `SESSION_SECRET`). Staff-Mails gehen an eine Sammeladresse; Kunden an `customer_users.email`, sonst die Stammdaten-E-Mail am Kunden. Globale Typ-Schalter in `/settings` (SMTP, Staff und Kunde als kompakte Zeilen, Bearbeiten öffnet einen Dialog). Die Typen sind nach Tickets, Terminen und Monitoring gruppiert; Erinnerungszeitpunkte hängen an „Erinnerung“. Welche Typen ein Kunde bekommt, stellt Staff in der Kundenakte (`mailNotifyJson`); Versand nur wenn global und je Kunde an. Das Portal zeigt die Typen, speichert aber nur die E-Mail. Versand synchron beim Ereignis (Fehler nur im Log). HTML-Mails im App-Look (dunkel, Akzent `#3b82f6`, Infotabelle, Button); Klartext-Alternative und bei Terminen `.ics`. Erinnerungen (24h / 1h / morgens 08:00) laufen im API-Prozess. Interne Ticket-Notizen erzeugen keine Mail. Monitoring-Ticket und Entwarnung an Staff und Kunde. Keine Einladungs-Mails.

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

## Monitoring

Staff-Nav **Monitoring** (`/monitoring`): Flotten-Dashboard, aktuelle Warnungen als kompakte Zeilen (Gerät, Ursache, Ticket), Zuordnung unzugeordneter Agenten zum Inventar, Kunden als Zeilen mit Geräte-/Warnungszahlen. Kundenseite (`/monitoring/customers/:customerId`): Status-Diagramme, Meldungen, durchsuchbare Geräteliste; Gerätedetail mit Verlauf (30 Tage) unter `/monitoring/customers/:customerId/devices/:assetId`. Rote Kapseln am Gerät sind aktuelle Störungen; „Ticket-Typen“ sind die Schalter, welche Probleme ein Ticket erzeugen. Kundenportal hat keine Monitoring-Diagramme; im Inventar steht, ob ein Gerät überwacht wird.

- **Inventar:** Am Asset `monitoringEnabled` (Zuordnungsziel) und je Warnungstyp aktiv/Priorität (`monitoringAlertsJson`). Konfiguration im Gerätedetail hinter „Warnungen konfigurieren“. Datenträger zusätzlich: Standard-Belegt-% und je Laufwerk eigener Schwellwert (`disk.volumes`). Ohne aktivierte Typen bleibt ein PC nach Feierabend still – nur Anzeige online/offline.
- **Agent** (`apps/agent`, Go, ab 1.0.6): Windows-Dienst `SystemhausAgent` (Start automatisch, Neustart nach Absturz) bzw. Linux-systemd `systemhaus-agent` (`Restart=always`). Meldet Laufwerke, **verbaute Hardware** (System/Mainboard/BIOS, CPU, RAM-Riegel, physische Datenträger inkl. Health/SMART, GPU, NICs; Windows per WMI, alle 6 h), Sitzung, Gateway/DNS/DHCP, öffentliche IP, fehlgeschlagene Auto-Start-Dienste und installierte Software (alle 6 h). Im Gerätedetail als Überblickskarten (CPU/RAM/Speicher/Grafik ohne USB-Dongle), Netzpanel mit LAN/WAN/Gateway/DNS und Adaptern, Datenträger als Karten mit Belegung und Hardware-Chips, Dienste und kompakte Softwareliste (Treffer im Inventar hervorgehoben). Push jede Minute an `POST /api/monitoring/heartbeat`. Enrollment mit Schlüssel von `/monitoring/setup` (`POST /api/monitoring/enroll`). Gleiche Machine-ID (`MachineGuid` `/etc/machine-id`) erzeugt keinen zweiten Pending-Eintrag. Staff kann unzugeordnet oder am Gerät **Client löschen**: Heartbeat-Flag `uninstall`, Agent deinstalliert den Dienst inkl. Binary/Config und verschwindet aus der Flotte.
- **Pakete:** Unter `/monitoring/setup` ein aktuelles Binary je Plattform (`windows-amd64`, `linux-amd64`, `linux-arm64`) plus Versionsnummer. Dateien unter `uploads/agent-packages/` (im Backup enthalten). Download öffentlich mit Enrollment-Key oder Agent-Token.
- **Updates:** Agent vergleicht täglich die Server-Version und ersetzt sich selbst (SHA-256). Staff kann am Gerät in Monitoring ein Sofort-Update anstoßen (`updateNow` im Heartbeat). Windows: der Apply-Schritt läuft als abgekoppelter Prozess in `%TEMP%` (sonst beendet `sc stop` den Updater mit). Download mit Bearer-Token und Enrollment-Key; Fehler in `%ProgramData%\SystemhausEss\update.log`. Agenten vor 1.0.6 einmal per Install-Skript oder Paket 1.0.6 ersetzen, sonst bleiben die neuen Felder leer.
- **Deinstallation:** Staff „Client löschen“ setzt `uninstallRequestedAt` (und stößt bei älteren Agenten ein Update an). Agent ab 1.0.4 erhält `uninstall` im Heartbeat, beendet den Dienst und löscht Binary/Config; der Server entfernt den Agenten (Verlauf, offene Monitoring-Tickets am zugeordneten Gerät werden geschlossen). Inventar-Eintrag bleibt. Agenten vor 1.0.4 bleiben als „Wird entfernt“ sichtbar, bis 1.0.4 läuft oder Staff „Sofort aus Liste nehmen“ wählt.
- **Offline:** kein Heartbeat > 2 Minuten.
- **Schwellwerte:** CPU/RAM > 90 % über 5 Minuten; Event-Log/Journal-Fehler; ausstehende Updates; Datenträger-Gesundheit (SMART/HealthStatus warn/fail); fehlgeschlagene Auto-Start-Dienste; Neustart ausstehend. Datenträger voll: Standard 90 % belegt, je Laufwerk am Gerät überschreibbar; ein Ticket pro Laufwerk über dem Wert. Übrige Typen: ein Ticket pro Typ (Heartbeat und Offline-Prüfung nicht parallel). Auto-Close wenn ok oder deaktiviert. Quelle `monitoring`. Geräte mit gespeichertem `monitoringAlertsJson` haben die neuen Typen (`smart`, `services`, `reboot`) zunächst aus – unter „Warnungen konfigurieren“ einschalten.
- **Speicher:** letzter Voll-Snapshot am Agenten; numerische Minuten-Samples 30 Tage (`monitoring_samples`). API-Prozess prüft alle 30 s Offline und räumt alte Samples stündlich.
- **Erreichbarkeit:** Agenten müssen die Server-URL per HTTP oder HTTPS erreichen (Kunden-Firewall nach außen). Enrollment-Key und Install-Skripte unter `/monitoring/setup`.

Installation: in `/monitoring/setup` (Button „Agent einrichten“) Windows-PowerShell- bzw. Linux-Bash-Skript kopieren und als Administrator bzw. root ausführen. Das Skript hält den Dienst an, lädt nach `%TEMP%` bzw. temp, prüft SHA-256 und ersetzt die Binary erst danach. Der Dienst liegt unter `%ProgramData%\SystemhausEss\systemhaus-agent.exe` bzw. `/usr/local/bin/systemhaus-agent`. Manuell weiterhin `install --server … --key …`.

Config: Windows `%ProgramData%\SystemhausEss\agent.json`, Linux `/etc/systemhaus-agent/agent.json`. Version steht in `apps/agent/VERSION` (Heartbeat, `systemhaus-agent version`, Marker `SYSFLW_AGENT_VERSION=`). CI (`.github/workflows/monitoring-agent.yml`) benennt Artefakte `systemhaus-agent-<os>-<arch>-<version>` und setzt unter Windows die Dateiversion. Upload liest die Version aus der Binary; ein nur im Formular eingetragenes „1.0.6“ bei einer älteren Datei wird abgelehnt.
