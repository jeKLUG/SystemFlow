# API

Alle **Staff**-Routen erfordern eine Admin-Session. Portal-Routen liegen unter `/api/portal/*`. Basis: `/api`.

## Auth

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| POST | `/api/auth/login` | Staff `{ username, password, rememberMe? }` – Session 30 Tage (oder 12 h ohne „Angemeldet bleiben“) |
| POST | `/api/auth/logout` | Session beenden |
| GET | `/api/auth/me` | Aktueller Staff-Benutzer (`role: admin`) |
| POST | `/api/auth/change-password` | `{ currentPassword, newPassword }` |

## Preise (Rechnungsvorbereitung)

UI: eigene App unter `/prices` (Navbar „Preise“). Keine Lexware-Anbindung – Stammdaten für spätere Abrechnung aus der Historie.

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET/PUT | `/api/settings/org` | Standard-Stundensatz, Währung, MwSt.-Hinweis, Notiz |
| GET/PUT | `/api/settings/mail` | SMTP (Host, Port, STARTTLS/SSL/none, User, Passwort verschlüsselt), Absender, Reply-To, Staff-Sammeladresse, öffentliche App-URL, Typ-Schalter Staff/Kunde, Erinnerungen (24h / 1h / 08:00). GET ohne Passwort, nur `smtpPasswordSet` |
| POST | `/api/settings/mail/test` | Testmail an die Staff-Sammeladresse |
| GET | `/api/price-items?activeOnly=&kind=` | Preiskatalog |
| POST | `/api/price-items` | Position anlegen (`hourly`\|`fixed`\|`unit`); Artikelnummer (`sku`) wird als `ART-YYYY-NNN` vergeben, falls leer |
| PUT/DELETE | `/api/price-items/:id` | Aktualisieren / löschen |
| GET | `/api/customers/:id/billing-preview?from=&to=` | Abrechenbare Zeiten als Positionen + Summen |

Zeitbuchungen speichern `rateSnapshot` / `amountSnapshot`, optional `priceItemId` und `lines[]` (Katalog- oder Stundensatz-Positionen; ohne Positionen kein automatischer Betrag). Preis-Snapshots bleiben bei Katalog-/Satzänderungen unverändert.

## Kunden / Kontakte

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/customers?q=&status=&kind=&limit=&offset=&sort=&ids=` | Paginierte Liste `{ items, total, limit, offset }`. `kind`: `contact` \| `customer` \| `all` |
| GET | `/api/customers/:id` | Detail |
| POST | `/api/customers` | Anlegen (`kind` optional, Default `contact`) |
| PUT | `/api/customers/:id` | Aktualisieren |
| DELETE | `/api/customers/:id` | Löschen (inkl. Dokumente) |

Feld `kind`: `contact` (einfacher Kontakt) oder `customer` (Kunde). Bestehende Datensätze ohne Spalte werden beim Start auf `customer` migriert.
| GET | `/api/stats` | `{ customerCount, activeCount }` |

Body (POST/PUT): `name` (Kurzname), optional `company`, `contactPerson`, `email`, `phone`, `mobile`, `address`, `zip`, `city`, `country`, `vatId`, `website`, `notes`, `status` (`active`\|`inactive`).

## Tickets (Staff)

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/tickets/stats` | `{ openCount, waitingCount, slaBreachedCount }` |
| GET | `/api/tickets?customerId=&status=&priority=&slaBreached=` | Queue; `status=open_any` = offen/in Bearbeitung/wartet |
| POST | `/api/tickets` | Anlegen (`customerId`, `title`, `description?` TipTap-JSON, `priority?`, `contractId?`); UI hängt Dateien direkt nach dem Anlegen an |
| GET/PUT | `/api/tickets/:id` | Detail inkl. Thread/Anhängen; Status/Priorität; beim Wechsel auf `resolved`/`closed` ist `resolution` (TipTap-JSON) Pflicht |
| DELETE | `/api/tickets/:id` | Ticket löschen (Nachrichten und Anhänge weg; Aufgaben/Zeiten behalten die Verknüpfung nicht, Einträge bleiben) |
| POST | `/api/tickets/:id/messages` | `{ body, visibility }` – `body` TipTap-JSON oder Klartext, `visibility` public/internal |
| POST | `/api/tickets/:id/attachments` | Multipart-Upload |
| GET | `/api/tickets/:id/attachments/:attachmentId/download` | Download |
| POST | `/api/tickets/:id/task` | Aufgabe aus Ticket |
| POST | `/api/tickets/:id/time-entry` | `{ hours, workDate? }` Zeitbuchung |
| GET/PUT/DELETE | `/api/customers/:id/portal-user` | Portal-Login (`username`, `password?`, `enabled`, `email` für Mails); GET enthält `lastLoginAt`. PUT `{ enabled }` schaltet ohne Passwort; Zugangsdaten nur mit `username`/`password` |

Status: `open` \| `in_progress` \| `waiting_customer` \| `resolved` \| `closed`. Priorität: `low` \| `normal` \| `high` \| `critical`. Quelle: `portal` \| `staff` \| `monitoring`. Nummern `T-1001`…. SLA aus aktivem Vertrag (Kalenderstunden, keine Servicezeiten-Berechnung).

## Kundenportal

Portal-UI: `/portal`, Login `/portal/login` (getrennt vom Staff-Login).

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| POST | `/api/portal/auth/login` | `{ username, password, rememberMe? }` |
| POST | `/api/portal/auth/logout` | Session beenden |
| GET | `/api/portal/auth/me` | Portal-Benutzer |
| POST | `/api/portal/auth/change-password` | `{ currentPassword, newPassword }` |
| GET/PUT | `/api/portal/account` | E-Mail und Opt-in je Typ (`notify`); `allowed` sind die vom Staff global freigegebenen Typen |
| GET | `/api/portal/overview` | Kennzahlen plus Ticket-Verteilung (`ticketsByStatus`, offene `ticketsByPriority`, `ticketsWeek` 7 Tage, `recentTickets`) sowie `wikiCount`/`fileCount` |
| GET/POST | `/api/portal/tickets` | Eigene Tickets (POST JSON: Titel, Beschreibung als TipTap-JSON, Priorität) |
| GET | `/api/portal/tickets/:id` | Öffentliche Nachrichten, Anhänge und `resolution` |
| POST | `/api/portal/tickets/:id/messages` | Öffentliche Antwort (`body` TipTap-JSON oder Klartext) |
| POST | `/api/portal/tickets/:id/attachments` | Anhang (multipart `file`); Portal-UI hängt Dateien direkt nach dem Anlegen an |
| GET | `/api/portal/attachments/:id/download` | Ticket-, Wiki-/Inventar-Datei, explizit `portalVisible` oder Datei in einem freigegebenen Ordner |
| GET | `/api/portal/contracts` | Aktive/pausierte Verträge ohne `notes` |
| GET | `/api/portal/documents` | Nur `portalVisible` Wiki-Seiten |
| GET | `/api/portal/documents/:id` | Read-only |
| GET | `/api/portal/files` | Freigegebene Dateien (einzeln oder über Ordner; ohne `storedName`, mit `folderId`) |
| GET | `/api/portal/folders` | Freigegebene Ordner inkl. Unterordner |
| GET | `/api/portal/assets` | Nur `portalVisible`, ohne `notes` und Warnungs-Konfiguration; `monitoringEnabled` bleibt |

## Wiki / Dokumente

Typen: `article` \| `documentation` \| `note` \| `workflow` \| `protocol`. Optional `projectId`.  
`customerId` optional (Schnellnotiz ohne Kundenbezug; später per PUT zuordenbar).

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/documents?customerId=&type=&projectId=&unassigned=` | Liste (`unassigned=1` = ohne Kunde) |
| GET | `/api/documents/recent` | Zuletzt bearbeitet (inkl. ohne Kunde) |
| GET | `/api/documents/:id` | Detail inkl. TipTap-JSON |
| POST | `/api/documents` | Anlegen (`templateId` optional; `customerId` optional) |
| PUT | `/api/documents/:id` | Titel/Typ/Inhalt/Projekt/`customerId`/`portalVisible` |
| DELETE | `/api/documents/:id` | Löschen |

## Projekte

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/customers/:id/projects` | Liste inkl. `loggedHours`, Budget-Rest |
| POST | `/api/customers/:id/projects` | Anlegen |
| GET | `/api/projects/:id` | Detail |
| PUT | `/api/projects/:id` | Aktualisieren; geänderter `hourlyRate` gilt nur für **neue** Buchungen (bestehende Snapshots bleiben) |
| DELETE | `/api/projects/:id` | Löschen (Zeiten behalten, Projekt-Bezug wird gelöst) |

Body: `name`, optional `description`, `status` (`planned`\|`active`\|`on_hold`\|`done`), `startDate`, `endDate`, `budgetHours`, `budgetAmount`, `hourlyRate`.

## Zeiterfassung

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/customers/:id/time-entries?projectId=&from=&to=` | Einträge + `summary` |
| GET | `/api/customers/:id/time-summary` | Gesamtstunden |
| POST | `/api/customers/:id/time-entries` | Buchen |
| POST | `/api/customers/:id/time-clock/in` | Einstempeln (laufender Eintrag: `startTime`, `endTime` leer, `hours` 0) |
| POST | `/api/customers/:id/time-clock/out` | Ausstempeln (setzt `endTime`, berechnet Stunden) |
| PUT | `/api/time-entries/:id` | Aktualisieren (Zeiten/Stunden nachträglich anpassen, optional `ticketId`) |
| DELETE | `/api/time-entries/:id` | Löschen |
| GET | `/api/customers/:id/time/report.pdf?month=YYYY-MM` | Monatsreport-PDF (Stunden, Beträge, Status) |

Body (Buchen): `workDate`, `startTime` + `endTime` (`HH:mm`, Stunden werden berechnet), optional `description`, `projectId`, `ticketId` (Ticket desselben Kunden), `priceItemId`, `lines` (`[{ priceItemId, quantity? }]` – 1–n Positionen; Menge default: gebuchte Stunden bei `hourly`, sonst 1), `billable`, `readyForInvoice`, `billed`. Alternativ `hours` ohne Uhrzeiten, oder `running: true` mit `startTime` für manuelles Starten.

`lines[].priceItemId` kann eine Katalog-ID sein oder virtuell `__org_hourly__` (Standard-Stundensatz) bzw. `__project_hourly__` (Projekt-Stundensatz, Projekt erforderlich). Ohne `lines` und ohne `priceItemId` entsteht **kein** automatischer Betrag. Legacy: nur `priceItemId` ohne `lines` setzt weiterhin den Katalog-Satz.

Antworten enthalten `lines` mit Snapshots (`nameSnapshot`, `kindSnapshot`, `quantity`, `unitPriceSnapshot`, `amountSnapshot`).

Body (Clock-in): optional `startTime`, `workDate`, `description`, `projectId`, `ticketId`, `priceItemId`, `billable`. Ohne `priceItemId` kein Stundensatz-Snapshot. Ohne Zeiten: App-Zeitzone (`APP_TIMEZONE`, Standard `Europe/Berlin`). Pro Kunde nur eine laufende Stempeluhr (409 bei Konflikt).

Body (Clock-out): optional `endTime`, `description`, `entryId`, `ticketId`. Gleiche Minute wie Start → 1 Minute (nicht 24 h).

Antworten der Zeitliste enthalten optional `ticketNumber` und `ticketTitle`.

`readyForInvoice` = zur Rechnung vorgemerkt (Lexware bleibt extern). `billed` = bereits abgerechnet.
`summary` enthält u. a. `unbilledHours`/`unbilledAmount` sowie `readyForInvoiceHours`/`readyForInvoiceAmount`.

## Inventar

Inventar pro Kunde: Geräte, Netzwerkkomponenten, Lizenzen, Software – inkl. Zuordnung (Kundeneigentum, von euch verliehen, Kundengerät bei euch).

Typen (`kind`): `pc` · `laptop` · `tablet` · `server` · `firewall` · `switch` · `router` · `access_point` · `printer` · `nas` · `ups` · `phone` · `monitor` · `accessory` · `software` · `license` · `network` · `other`.

Zuordnung (`ownership`): `customer` · `loaned` · `held` (Standard: `customer`).

Status: `active` · `spare` · `retired`. Optional `portalVisible` (Default aus) für das Kundenportal. Optional `monitoringEnabled` und `monitoringAlerts` (pro Typ `enabled` + `priority`; `disk` zusätzlich `warnUsedPct` und `volumes` je Laufwerk) für den Staff-Agent.

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/customers/:id/assets` | Inventarliste (inkl. Monitoring-Status, falls Agent gekoppelt) |
| POST | `/api/customers/:id/assets` | Eintrag anlegen |
| PUT | `/api/assets/:id` | Aktualisieren |
| DELETE | `/api/assets/:id` | Löschen |

Body: `name`, optional `kind` (steuert die sinnvollen Felder in der UI), `ownership`, `status`, plus typabhängig z. B. `cpu`/`ramGb`/`diskGb`/`os` (Clients), `firmware`/`ports`/`secondaryIp`/`managementUrl` (Netzwerk), `serialNumber` als Lizenzschlüssel (Software). Agent füllt leere Felder am zugeordneten Inventar. `monitoringEnabled` / `monitoringAlerts` vor allem bei PC/Notebook/Server/NAS.

Suche findet auch Hostname, IP, MAC und Standort.

## Monitoring

Staff-UI `/monitoring` (Flotte) und `/monitoring/setup` (Pakete, Key, Install-Skripte). Agenten ohne Session, mit Enrollment-Key bzw. Geräte-Token. Heartbeat-Takt 1 Minute, offline nach 2 Minuten. Verlauf 30 Tage.

Agent (öffentlich, ohne Staff-Session):

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| POST | `/api/monitoring/enroll` | `{ enrollmentKey, machineId, hostname?, os?, osVersion?, ip?, agentVersion? }` → `{ agentId, token, assigned, assetId }` |
| POST | `/api/monitoring/heartbeat` | Header `Authorization: Bearer <token>`. Body: CPU/RAM/`disks[]`/`hardware`/`platform`. Antwort: `{ ok, assigned, updateNow, uninstall, latestAgent?: { platform, version, sha256 } }` |
| GET | `/api/monitoring/agent/latest?platform=` | Aktuelles Paket-Metadatum. Auth: Staff-Cookie, Query `key=` (Enrollment) oder Bearer-Token |
| GET | `/api/monitoring/agent/download/:platform` | Binary (`windows-amd64` \| `linux-amd64` \| `linux-arm64`). Gleiche Auth wie latest |

Staff:

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/monitoring/settings` | `{ enrollmentKey, platforms[], packages[] }` |
| POST | `/api/monitoring/settings/rotate-key` | Neuen Enrollment-Key erzeugen (gleiche Antwortform) |
| POST | `/api/monitoring/agent-packages` | Multipart `platform`, `version`, `file` – Version wird aus der Binary gelesen (`SYSFLW_AGENT_VERSION=`), Formularwert muss dazu passen |
| DELETE | `/api/monitoring/agent-packages/:platform` | Paket löschen |
| GET | `/api/monitoring/stats` | `{ warningCount, pendingCount }` (Navbar-Badge) |
| GET | `/api/monitoring/overview` | Flotte, Warnungen, Kundenliste; Geräte inkl. `agentVersion` / `agentOutdated` |
| GET | `/api/monitoring/pending` | Unzugeordnete Agenten + zuordbare Assets |
| POST | `/api/monitoring/pending/:id/assign` | `{ assetId }` – Asset muss `monitoringEnabled` haben und frei sein |
| POST | `/api/monitoring/agents/:id/uninstall` | Remote-Deinstallation: Agent erhält `uninstall` beim nächsten Heartbeat und wird danach aus der Flotte gelöscht |
| DELETE | `/api/monitoring/agents/:id` | Sofort aus der Liste nehmen (ohne zu warten); Dienst bleibt, bis der Befehl ankommt oder lokal deinstalliert wird |
| GET | `/api/monitoring/customers/:customerId` | Geräte des Kunden; UI: `/monitoring/customers/:customerId` |
| GET | `/api/monitoring/devices/:assetId?from=&to=` | Snapshot + Samples (`from`/`to` Unix-ms) |
| PATCH | `/api/monitoring/devices/:assetId` | `{ monitoringEnabled?, monitoringAlerts? }` – je Typ `{ enabled, priority }`; `disk` zusätzlich `{ warnUsedPct, volumes: { "C:": { enabled, warnUsedPct } } }` |
| POST | `/api/monitoring/devices/:assetId/update-agent` | Sofort-Update: Agent zieht das aktuelle Paket beim nächsten Heartbeat |

Ticket-Quelle zusätzlich `monitoring`. Pro Gerät und Warnungstyp höchstens ein offenes Ticket; Datenträger **je Laufwerk** (`openTicketsJson` Key `disk:C:`). Heartbeat und Offline-Loop serialisieren den Sync pro Agent; bestehende offene Tickets mit gleichem Titel werden wiederverwendet, Dubletten geschlossen. Priorität aus der Geräte-Konfiguration, Auto-Close mit Lösungstext wenn der Typ bzw. das Laufwerk wieder ok ist.

## Historie

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/customers/:id/activities` | Timeline |
| POST | `/api/customers/:id/activities` | Eintrag anlegen |
| DELETE | `/api/activities/:id` | Löschen |

## Passworttresor

Siehe auch [SECURITY-VAULT.md](SECURITY-VAULT.md). Freischaltung mit eigener Vault-Passphrase; DEK nur im RAM.

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/vault/status` | `configured`, `unlocked`, `expiresAt` |
| POST | `/api/vault/setup` | Einrichten `{ passphrase, confirm }` |
| POST | `/api/vault/unlock` | Freischalten |
| POST | `/api/vault/lock` | Sperren |
| POST | `/api/vault/change-passphrase` | Passphrase ändern |
| GET | `/api/vault/entries?customerId=` | Meta-Liste (ohne Geheimnisse) |
| POST | `/api/vault/entries` | Anlegen |
| PUT | `/api/vault/entries/:id` | Aktualisieren |
| GET | `/api/vault/entries/:id/reveal` | Klartext (zeitlich begrenzt in der UI) |
| DELETE | `/api/vault/entries/:id` | Löschen |
| POST | `/api/vault/entries/:id/share` | Einweg-Share: `{ expiresInHours, maxViews, fieldsMode: password\|credentials\|full, includeNotes?, includeTotp? }` → `{ path, pin, fieldsMode, … }` |
| GET | `/api/vault/shares` | Eigene Shares (ohne Geheimnisse) |
| GET | `/api/vault/shares/:id/events` | Abruf-Protokoll: `{ at, ip, outcome }` ohne Klartext |
| DELETE | `/api/vault/shares/:id` | Eigenen Share widerrufen |
| GET | `/api/public/vault-shares/:token` | Öffentlich: Status ohne Auth; unbekannt → 404 |
| POST | `/api/public/vault-shares/:token/open` | Öffentlich: `{ pin }` → Klartext, Abruf zählen; nach maxViews Ciphertext weg |

Body: `title`, optional `category`, `favorite`, `tags[]`, `customerId`, `username`, `password`, `url`, `notes`, `totpSecret` (Base32 oder nach Client-Normalisierung).  
Kategorien: `vpn` · `admin` · `hosting` · `email` · `firewall` · `remote` · `wifi` · `database` · `cloud` · `license` · `office` · `isp` · `other`.

## Vorlagen & Suche

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/templates` | Vorlagen-Metadaten |
| GET | `/api/templates/:id` | Vorlage inkl. TipTap-Inhalt |
| GET | `/api/search?q=&types=` | Suche (Fuzzy-LIKE, Snippets). `types`: `contact,customer,wiki,file,asset,activity,folder` |
| POST | `/api/customers/:id/promote` | Kontakt → Kunde (`kind=customer`) + `missing[]` Hinweise |

Dokument anlegen akzeptiert optional `templateId`.

## Aufgaben

Query: `view=today|upcoming|inbox|all|done`, optional `projectId` (`none` = ohne Projekt), `openOnly`, `scope=all|customer|internal`.

| Methode | Pfad |
|---------|------|
| GET | `/api/tasks?openOnly=&view=&projectId=&scope=&limit=` |
| POST | `/api/tasks` (`customerId` optional = intern) |
| GET/POST | `/api/customers/:id/tasks` |
| PUT/DELETE | `/api/tasks/:id` |

`customerId` kann `null` sein (interne Aufgabe). Kundenaufgaben erscheinen weiterhin unter dem Kunden-Tab.

## Verträge / SLA

Detaillierte SLA-Felder: Status, Vertragsnr. (automatisch `SLA-YYYY-NNN` beim Anlegen), Servicezeiten, inkl. Stunden/Monat, Preis entweder monatlich oder jährlich (EUR), Reaktions-/Lösungszeiten P1–P4, Vor-Ort, Kontakte/Eskalation. `description` (Leistungsumfang) speichert TipTap-JSON wie Wiki-Seiten; Legacy-Klartext bleibt kompatibel. `slaResponseHours` bleibt als Legacy-Spiegel von „Normal (P3)“.

| Methode | Pfad |
|---------|------|
| GET/POST | `/api/customers/:id/contracts` |
| PUT/DELETE | `/api/contracts/:id` |
| GET | `/api/contracts/:id/pdf` | SLA/Vertrag als schlichtes PDF (Kopfzeile mit Logo/Titel, Seitenzahl) |

## Anhänge / Dokumentenablage

Ordnerhierarchie pro Kunde (`file_folders`). Dateien können in Ordnern liegen; Wiki-/Anlagen-/E-Mail-Anhänge bleiben ohne Ordner und erscheinen nicht in der Datei-Ablage. `portalVisible` an einem Ordner gibt ihn samt Inhalt und Unterordnern im Kundenportal frei (ohne das Flag auf Kinder zu kopieren).

| Methode | Pfad |
|---------|------|
| GET/POST | `/api/customers/:id/folders` |
| PUT | `/api/folders/:id` (Name, Elternordner, `portalVisible`) |
| GET/POST | `/api/customers/:id/attachments` (`folderId=root`, optional `documentId` / `assetId` / `emailId`; ohne `emailId` werden E-Mail-Anhänge ausgeblendet) |
| PUT | `/api/attachments/:id` (Name, Beschreibung, Ordner, `portalVisible`) |
| GET | `/api/attachments/:id/download?inline=1` |
| DELETE | `/api/attachments/:id` |

## Kunden-E-Mails (Archiv)

Mailverkehr manuell ablegen oder als `.eml` importieren (kein IMAP). Anhänge über `emailId` an `attachments`.

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/customers/:id/emails?q=&direction=` | Liste (`inbound`\|`outbound`\|`internal`); inkl. `attachmentCount`, `emlAttachmentId` |
| POST | `/api/customers/:id/emails` | Ablegen |
| POST | `/api/customers/:id/emails/import` | Multipart: eine/mehrere `.eml` → Felder + Original + Anhänge |
| GET/PUT/DELETE | `/api/emails/:id` | Detail (inkl. Anhänge) / ändern / löschen |

Body (manuell): `subject`, `sentAt` (YYYY-MM-DD), optional `fromAddress`, `toAddress`, `ccAddress`, `direction`, `bodyText`, `notes`.

Import (`multipart/form-data`, Feld `files`): parst Betreff, Von/An/Cc, Datum, Textkörper und Dateianhänge; Richtung wird anhand Kunden-E-Mail und Domain `systemhaus-ess.de` geschätzt. Antwort: `{ count, imported[], errors[] }`.

## Termine / Kalender

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/appointments?from=&to=&customerId=` | Liste im Zeitraum |
| POST | `/api/appointments` | Anlegen |
| GET/PUT/DELETE | `/api/appointments/:id` | Detail / aktualisieren / löschen |
| GET | `/api/customers/:id/appointments` | Termine eines Kunden |

Body: `title`, `kind` (`customer`\|`internal`\|`personal`\|`other`), `startDate`, optional `endDate`, `startTime`/`endTime` (`HH:mm`), `allDay`, `customerId`, `location`, `description`.

## Erinnerungen & Export

| Methode | Pfad |
|---------|------|
| GET | `/api/reminders?days=` |
| GET | `/api/customers/:id/export` (ZIP) |
| GET | `/api/customers/:id/visit/pdf` | Besuchsblatt-PDF: Kontakt, Anlagen, letzte Einsätze, Reminder (Garantie/Vertrag/Termin), Vault-Hinweise ohne Secrets, offene Aufgaben/Zeiten |
| GET | `/api/customers/:id/wiki/pdf` | Alle Wiki-Seiten als schlichtes PDF (Kopfzeile mit Logo/Titel, Seitenzahl, Bilder) |
| GET | `/api/documents/:id/pdf` | Eine Wiki-Seite als PDF (gleiches Layout) |

## Systemsicherung

Siehe auch [BACKUP.md](BACKUP.md).

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/admin/backup` | ZIP: SQLite-Snapshot + `uploads/` |
| GET | `/api/admin/backup/info` | Größen-/Pfad-Meta |
| POST | `/api/admin/backup/restore` | multipart `file` – ersetzt Daten, Prozess-Neustart |

## Health

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/health` | Liveness |
| GET | `/api/version` | `buildId` (Deploy), ob `webDist` vorhanden |
