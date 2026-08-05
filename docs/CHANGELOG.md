# Changelog

## 1.2.1 – 2026-08-05

- Session bleibt über Reload (HTTP-Cookies, 30 Tage, stabiler Session-Key)
- Passwort ändern in Einstellungen; Env überschreibt Passwort nicht mehr bei jedem Start
- SaaS-Layout: Sidebar, Mobile-Tabbar, poliertes Login

## 1.2.0 – 2026-08-05

- Aufgaben mit Fälligkeit und Erledigt-Status
- Dateianhänge (Upload/Download) an Kunde und Dokument
- Ablauf-Erinnerungen (Garantien, Verträge, Aufgaben)
- Vertrags-/SLA-Stammdaten (ohne Rechnungen)
- Schnellnotiz-UI + FAB für Handy
- Kunden-Export als ZIP (Stammdaten, Anlagen, Dokumente, Anhänge)

## 1.1.1 – 2026-08-05

- Erweiterte Kundenfelder: Firma, Ansprechpartner, Mobil, PLZ/Ort/Land, USt-IdNr., Website
- Suche und Listen nutzen die neuen Firmenfelder

## 1.1.0 – 2026-08-05

- Anlagen/Geräte pro Kunde (Typ, Seriennummer, Garantie)
- Einsatz-Historie als Timeline (manuell + Auto bei Dokument/Anlage)
- Dokumentvorlagen: Wartungsprotokoll, Übergabe, Störungsbericht
- Globale Volltextsuche über Kunden, Dokumente, Anlagen, Historie

## 1.0.2 – 2026-08-05

- Deploy: Docker-Build mit sichtbarer Ausgabe; systemd nutzt `bash -lc` + `--env-file`
- LF-Zeilenenden für `docker-compose.yml` / `Dockerfile` / Shell-Skripte

## 1.0.1 – 2026-08-05

- `deploy.sh`: lokale Änderungen im Installationsordner werden beim Update verworfen (`.env` bleibt erhalten)

## 1.0.0 – 2026-08-05

- Systemhaus-Ess: Kundenverwaltung und Dokumente
- Admin-Login mit Session-Cookie
- TipTap-Editor (Notizen, Protokolle, Dokumentationen) mit Autosave
- React-Frontend, Fastify-API, SQLite (libsql)
- Docker Compose + systemd-Deploy (`systemhaus-ess`)
- Keine Lexware-/Rechnungsfunktionen (bewusst out of scope)

## 0.2.0 – 2026-08-05

- Deploy-Skript und systemd für die frühere Demo-Webapp

## 0.1.0 – 2026-08-05

- Initiale Demo-Webapp (durch Systemhaus-Ess ersetzt)
