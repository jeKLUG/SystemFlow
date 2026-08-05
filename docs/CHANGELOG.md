# Changelog

## 1.4.0 – 2026-08-05

- Passworttresor: AES-256-GCM, eigene Vault-Passphrase, DEK nur im RAM
- Zugänge pro Kunde (VPN, Admin, Hosting, …); Anzeigen zeitlich begrenzt; nicht im ZIP-Export
- Siehe `docs/SECURITY-VAULT.md`

## 1.4.0 – 2026-08-05

- Konto: Standard-Stundensatz, Währung, MwSt.-Hinweis und Preiskatalog (Stunde/Pauschale/Stück)
- Zeitbuchungen: Leistung/Satz wählbar, `rateSnapshot`/`amountSnapshot` für Rechnungsvorbereitung
- API `billing-preview` pro Kunde (Summen aus abrechenbaren Zeiten, ohne Lexware)

## 1.3.1 – 2026-08-05

- Zeiterfassung: Start-/Endzeit eingeben, Stunden werden automatisch berechnet
- Deploy: belegt Port (z. B. alter Node-Prozess) wird freigegeben

## 1.3.0 – 2026-08-05

- Kundenbereich mit Tabs: Übersicht, Wiki, Projekte, Zeiten, Anlagen, Betrieb
- Zeiterfassung pro Kunde (Stunden, Datum, Projekt, abrechenbar)
- Kunden-Wiki: Artikel, Dokumentation, Notizen, Workflows, Protokolle inkl. Suche/Filter
- Projekte mit Status, Zeitraum, Stunden-/Euro-Budget und Verbrauch aus gebuchten Zeiten
- ZIP-Export enthält Projekte, Zeiten und Wiki-Seiten

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
