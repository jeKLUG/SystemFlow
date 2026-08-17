# Changelog

## 1.5.51 – 2026-08-17

- Reiter „Ablauf“ → „Aufgaben“ (`/tasks`): globale Aufgabenliste, Anlegen mit/ohne Kunde, Ansichten Heute/Geplant/Inbox; Abläufe (Garantien/Verträge) darunter
- Tasks: `customerId` optional für interne Aufgaben; `POST /api/tasks`

## 1.5.50 – 2026-08-17

- Wiki-PDF: keine Ketten leerer Seiten mehr (leere TipTap-Absätze werden entfernt, Page-Breaks entschärft); Layout etwas klarer

## 1.5.49 – 2026-08-17

- Suche: Typ-Filter (Kontakt/Kunde/Wiki/Dateien/…), tipptolerante LIKE-Muster, Kontext-Snippets
- Kontakt → Kunde: Ein-Klick-Upgrade (`POST /api/customers/:id/promote`) inkl. fehlender Stammdaten-Hinweise
- PWA / Offline-Lesemodus: Installierbare App, Service Worker, Snapshots für Dashboard, Kontakte und Kalender

## 1.5.48 – 2026-08-17

- Mobile: großes UX-Polish – Tokens/Safe-Area, Topbar & Tabbar, Bottom-Sheets mit Griff, Listen/Chips, Kontakt-Hub, Dashboard-KPIs 2×2, Touch-Targets, Padding-Fix ≤640px

## 1.5.47 – 2026-08-17

- Bereich „Kunden“ → „Kontakte“: einfache Kontakte und Kunden anlegbar (`kind`: contact/customer), Filter und Badges

## 1.5.46 – 2026-08-17

- Fix: DB-Start crashte auf bestehenden Installationen (`no such column: email_id`) – Index erst nach Spalten-Migration
- Dashboard: Diagramme „Aufgaben“ und „Woche“ wieder nebeneinander (auch mobil)

## 1.5.45 – 2026-08-17

- Deploy: Port explizit auf 0.0.0.0, längerer Health-Check mit Diagnose, systemd startet ohne erneutes `--build`

## 1.5.44 – 2026-08-17

- Deploy: UTF-8-BOM entfernt, UFW/firewalld-Port öffnen, lokaler Health-Check nach Start

## 1.5.43 – 2026-08-17

- Mobile: dichtere Seiten/KPIs, Chart+Legende nebeneinander, sticky Kunden-Tabs, E-Mail- und Modal-Sheets verbessert

## 1.5.42 – 2026-08-17

- Dashboard: Aufgaben- und Wochen-Diagramm nebeneinander; Prioritäten-Widget entfernt

## 1.5.41 – 2026-08-17

- Kunden: E-Mail-Archiv (Tab „E-Mails“) – Korrespondenz ablegen, suchen, Anhänge (.eml/PDF/…) zuordnen

## 1.5.40 – 2026-08-17

- Dashboard: kompakter Aufbau – 4 KPIs, 3 Diagramme, Fokus-Liste statt voller Aufgaben-/Nebenpanels

## 1.5.39 – 2026-08-06

- Sicherung: Vollbackup (SQLite + Uploads) im Browser herunterladen und wiederherstellen (Konto → Sicherung)
- Wiki-PDF: Inline-Bilder aus Anhängen werden echt eingebettet
- Wiki-Vorlagen: IT-Übergabe, Projektabschluss, Vor-Ort-Protokoll; bestehende Protokolle erweitert

## 1.5.38 – 2026-08-06

- Dashboard mobil: alle Blöcke (KPIs, Quick-Links, Tabs, Charts) einspaltig – keine Mehrspalten-Zeilen
- Dashboard-Diagramme: schlankere Donuts/Balken, Legende ohne Überlappung

## 1.5.37 – 2026-08-06

- UI-Polish: Surfaces, Shell, Badges, Empty States, Fokus und Motion – konsistenter SaaS-Look auf Desktop, Tablet und Mobil

## 1.5.36 – 2026-08-06

- Übersicht: Dashboard mit Donut-/Balken-/Wochen-Diagrammen zu Aufgaben, Terminen, Abläufen und Kunden

## 1.5.35 – 2026-08-06

- Kalender mobil: Monat mit Dots, Woche als Tagesstreifen, Raster oben / Agenda darunter

## 1.5.34 – 2026-08-06

- Mobile: doppeltes Padding behoben, Übersicht kompakter, Sticky-Tabs/Tabbar ohne Überlagerung

## 1.5.33 – 2026-08-06

- Android-App: wieder AGP 8.7.3 + Gradle 8.9 (kompatibel mit Android Studio); Gradle-JDK 17 verwenden

## 1.5.32 – 2026-08-06

- Android-App: Gradle 9.1 + AGP 9.0 (kompatibel mit JDK 25)

## 1.5.31 – 2026-08-06

- Android-WebView-App unter `apps/android-app` (APK via Android Studio / CI)

## 1.5.30 – 2026-08-06

- Mobile: Icon-Tabbar, Hamburger-Menü, größere Touch-Flächen, sticky Kunden-Tabs, Dashboard/Tasks gestapelt

## 1.5.29 – 2026-08-06

- Einsatz-Historie: kompakte Timeline, Filter nach Art, Löschen nur bei Hover

## 1.5.28 – 2026-08-06

- Modal: Fokus springt beim Tippen nicht mehr weg (Initialfokus nur beim Öffnen, nicht auf den Schließen-Button)

## 1.5.27 – 2026-08-06

- Aufgabenliste: kompaktere Hero-KPIs, Filter ohne Extra-Labels und einzeilige Task-Zeilen

## 1.5.26 – 2026-08-06

- Wiki-Anhänge: Upload speichert wieder `documentId` (Multipart-Felder vor der Datei / robustes Parts-Parsing)

## 1.5.25 – 2026-08-06

- SLA/Verträge: PDF-Export als druckfertiger Vertragsbogen (Parteien, SLA-Matrix, Kontakte, Unterschrift)

## 1.5.24 – 2026-08-06

- Zeiterfassung: Status „abgerechnet“ je Eintrag, Kennzahlen für offene Stunden/Beträge

## 1.5.23 – 2026-08-06

- Wiki: PDF-Export einzelner Seiten und aller Wiki-Einträge je Kunde (Deckblatt, Inhaltsverzeichnis, formatierter Inhalt)
- Dateiablage: kompakteres Aktionsmenü mit Icons, ohne doppelten Download-Eintrag

## 1.5.22 – 2026-08-06

- Wiki-Editor: kompakte Toolbar ohne Text-Überlagerung, Inhalt scrollt darunter

## 1.5.21 – 2026-08-06

- Branding: Haus-Logo in Sidebar/Login, Untertitel „IT Workspace“ entfernt

## 1.5.20 – 2026-08-06

- Dateiablage: Ordner- und Dateikarten mit vollflächiger Vorschau, Typ-Badge und Hover-Aktionen
- Dateiablage: Aktionsleiste (Download/Menü) oben rechts auf der Vorschau statt am Kartenfuß

## 1.5.19 – 2026-08-06

- Wiki-Seiten: Autosave entfernt, manueller Speichern-Button

## 1.5.18 – 2026-08-06

- Wiki-Editor: Icon-Toolbar, Inline-Bilder mit Upload/Paste/Drop und Skalierung

## 1.5.17 – 2026-08-06

- Passworttresor: 2FA/TOTP pro Eintrag (verschlüsseltes Secret, Live-Code mit Countdown)

## 1.5.16 – 2026-08-06

- Dokumente-Hub: Wiki und Dateiablage unter einem Tab, Ablage aus Betrieb entfernt
- Globale Suche findet Dateien (Name/Beschreibung) und Ordner

## 1.5.15 – 2026-08-06

- Kundenkopf: Quicklinks (Notiz, Kalender, Tresor, Export) entfernt
- Sidebar-Profilbereich: Karte mit Status-Avatar, Konto- und Abmelden-Icons

## 1.5.14 – 2026-08-06

- Dokumentenablage: Ordner, Drag&Drop, Kachel/Liste, Vorschau, Verschieben/Umbenennen
- Aufgaben: Kennzahlen, Sortierung/Filter, Schnell-Fälligkeit, Duplizieren, Erledigte löschen

## 1.5.13 – 2026-08-06

- Einsatz-Historie: kompakte Timeline, farbige Typ-Streifen, manueller Eintrag per Plus/Modal

## 1.5.12 – 2026-08-06

- Zeiterfassung: Historie nach Tagen, Buchung per Uhr-Icon/Modal
- Projektkarten mit Metric-Tiles, Statusstreifen und klarer Budget-Progress

## 1.5.11 – 2026-08-06

- Aufgaben-UI: Hero mit integriertem Schnelladd, kompakte Icons, klarerer Leerzustand und Mobile-Layout

## 1.5.10 – 2026-08-06

- Einheitliche Plattform-Checkboxen (Accent-Check, Hover/Focus) in Kalender, Zeiten, Tresor, Aufgaben

## 1.5.9 – 2026-08-06

- Aufgaben als eigener Kundenreiter (Ansichten, Priorität, Projektfilter, Modal)
- Betrieb ohne Aufgaben – nur noch SLAs, Historie und Anhänge

## 1.5.8 – 2026-08-06

- Kalender: Tagesübersicht über dem Raster, Toolbar mit Segment-Switch und klarerer Navigation
- Tagesübersicht als horizontale Agenda mit leerem Zustand und Meta-Pill

## 1.5.7 – 2026-08-05

- Kalender-Polish: Einblend-Animationen, sanfte Hover-States, Mobile-FAB und Bottom-Sheet-Modal
- Feste Monatszellen, Legende scrollbar auf schmalen Screens, `prefers-reduced-motion`

## 1.5.6 – 2026-08-05

- Kalender: Termin anlegen per Plus-Icon im Modal (nicht mehr in der Seitenleiste)
- Monatsraster mit fester Tageshöhe – Zellen dehnen sich nicht mehr mit Terminen
- SLAs detaillierter (P1–P4, Servicezeiten, Eskalation) mit Übersicht + Anlege-Modal

## 1.5.5 – 2026-08-05

- Zeitsystem: lokale/DE-Daten statt UTC (`YYYY-MM-DD` Anzeige, heutiges Datum, Erinnerungen)
- Zeiterfassung: Folgebuchung setzt Endzeit +1h statt identischer Start/Ende

## 1.5.4 – 2026-08-05

- SaaS-UI: verfeinertes Designsystem, Sidebar mit Gruppen/Icons, Dashboard-Karten, klarere Controls
- Login und Kundentabs optisch vereinheitlicht

## 1.5.3 – 2026-08-05

- Kalender: Vollflächen-Layout, Monats-/Wochen-/Tagesansicht, farbige Termine in der Fläche
- Großer „Termin anlegen“-Button, Zeitleiste 07–20 Uhr, Detailseiteleiste

## 1.5.2 – 2026-08-05

- UI-Polish: Buttons/Chips/Badges zentriert, einheitliche Toolbars, Listen-Actions, Leerzustände
- Responsives Layout für Tresor, Anlagen, Kunden, Kalender und Mobile-Navigation

## 1.5.1 – 2026-08-05

- Tresor: mehr Kategorien, Tags, Favoriten, Suche/Filter, Sortierung, Gruppierung
- Passwort-Generator mit Stärkeanzeige und lokalem Verlauf; Einträge bearbeiten

## 1.5.0 – 2026-08-05

- Anlagen-Reiter: erweiterte Typen (Notebook, Switch, Router, AP, NAS, …), Status aktiv/Ersatz/außer Betrieb
- Netzwerkfelder: Hostname, IP, MAC, VLAN, Standort, OS, Management-URL
- UI: Suche, Status-/Typ-Filter, Gruppierung, Bearbeiten, Kennzahlen

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
