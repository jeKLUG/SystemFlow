# API

Alle geschützten Routen erfordern eine gültige Session (Cookie). Basis: `/api`.

## Auth

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| POST | `/api/auth/login` | `{ username, password }` – Session 30 Tage |
| POST | `/api/auth/logout` | Session beenden |
| GET | `/api/auth/me` | Aktueller Benutzer |
| POST | `/api/auth/change-password` | `{ currentPassword, newPassword }` |

## Preise / Konto (Rechnungsvorbereitung)

Keine Lexware-Anbindung – Stammdaten für spätere Abrechnung aus der Historie.

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET/PUT | `/api/settings/org` | Standard-Stundensatz, Währung, MwSt.-Hinweis, Notiz |
| GET | `/api/price-items?activeOnly=&kind=` | Preiskatalog |
| POST | `/api/price-items` | Position anlegen (`hourly`\|`fixed`\|`unit`) |
| PUT/DELETE | `/api/price-items/:id` | Aktualisieren / löschen |
| GET | `/api/customers/:id/billing-preview?from=&to=` | Abrechenbare Zeiten als Positionen + Summen |

Zeitbuchungen speichern `rateSnapshot` / `amountSnapshot` und optional `priceItemId`.

## Kunden

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/customers?q=&status=&limit=&offset=&sort=&ids=` | Paginierte Liste `{ items, total, limit, offset }` |
| GET | `/api/customers/:id` | Detail |
| POST | `/api/customers` | Anlegen |
| PUT | `/api/customers/:id` | Aktualisieren |
| DELETE | `/api/customers/:id` | Löschen (inkl. Dokumente) |
| GET | `/api/stats` | `{ customerCount, activeCount }` |

Body (POST/PUT): `name` (Kurzname), optional `company`, `contactPerson`, `email`, `phone`, `mobile`, `address`, `zip`, `city`, `country`, `vatId`, `website`, `notes`, `status` (`active`\|`inactive`).

## Wiki / Dokumente

Typen: `article` \| `documentation` \| `note` \| `workflow` \| `protocol`. Optional `projectId`.

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/documents?customerId=&type=&projectId=` | Liste |
| GET | `/api/documents/recent` | Zuletzt bearbeitet |
| GET | `/api/documents/:id` | Detail inkl. TipTap-JSON |
| POST | `/api/documents` | Anlegen (`templateId` optional) |
| PUT | `/api/documents/:id` | Titel/Typ/Inhalt/Projekt |
| DELETE | `/api/documents/:id` | Löschen |

## Projekte

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/customers/:id/projects` | Liste inkl. `loggedHours`, Budget-Rest |
| POST | `/api/customers/:id/projects` | Anlegen |
| GET | `/api/projects/:id` | Detail |
| PUT | `/api/projects/:id` | Aktualisieren; bei geändertem `hourlyRate` werden Projekt-Zeiten neu berechnet (`recalculatedEntries`) |
| DELETE | `/api/projects/:id` | Löschen (Zeiten behalten, Projekt-Bezug wird gelöst) |

Body: `name`, optional `description`, `status` (`planned`\|`active`\|`on_hold`\|`done`), `startDate`, `endDate`, `budgetHours`, `budgetAmount`, `hourlyRate`.

## Zeiterfassung

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/customers/:id/time-entries?projectId=&from=&to=` | Einträge + `summary` |
| GET | `/api/customers/:id/time-summary` | Gesamtstunden |
| POST | `/api/customers/:id/time-entries` | Buchen |
| PUT | `/api/time-entries/:id` | Aktualisieren |
| DELETE | `/api/time-entries/:id` | Löschen |

Body: `workDate`, `startTime` + `endTime` (`HH:mm`, Stunden werden berechnet), optional `description`, `projectId`, `billable`. Alternativ weiterhin `hours` ohne Uhrzeiten.

## Anlagen

Inventar pro Kunde: Geräte, Netzwerkkomponenten, Lizenzen.

Typen (`kind`): `pc` · `laptop` · `server` · `firewall` · `switch` · `router` · `access_point` · `printer` · `nas` · `ups` · `phone` · `license` · `network` · `other`.

Status: `active` · `spare` · `retired`.

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/customers/:id/assets` | Anlagenliste |
| POST | `/api/customers/:id/assets` | Anlage anlegen |
| PUT | `/api/assets/:id` | Aktualisieren |
| DELETE | `/api/assets/:id` | Löschen |

Body: `name`, optional `kind`, `status`, `manufacturer`, `model`, `serialNumber`, `hostname`, `ipAddress`, `macAddress`, `location`, `vlan`, `os`, `managementUrl`, `warrantyUntil`, `notes`.

Suche findet auch Hostname, IP, MAC und Standort.

## Historie

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/customers/:id/activities` | Timeline |
| POST | `/api/customers/:id/activities` | Eintrag anlegen |
| DELETE | `/api/activities/:id` | Löschen |

## Vorlagen & Suche

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/templates` | Vorlagen-Metadaten |
| GET | `/api/templates/:id` | Vorlage inkl. TipTap-Inhalt |
| GET | `/api/search?q=` | Volltextsuche (Kunden, Dokumente, Anlagen, Historie) |

Dokument anlegen akzeptiert optional `templateId`.

## Aufgaben

| Methode | Pfad |
|---------|------|
| GET | `/api/tasks?openOnly=` |
| GET/POST | `/api/customers/:id/tasks` |
| PUT/DELETE | `/api/tasks/:id` |

## Verträge / SLA

| Methode | Pfad |
|---------|------|
| GET/POST | `/api/customers/:id/contracts` |
| PUT/DELETE | `/api/contracts/:id` |

## Anhänge

| Methode | Pfad |
|---------|------|
| GET/POST | `/api/customers/:id/attachments` |
| GET | `/api/attachments/:id/download` |
| DELETE | `/api/attachments/:id` |

## Erinnerungen & Export

| Methode | Pfad |
|---------|------|
| GET | `/api/reminders?days=` |
| GET | `/api/customers/:id/export` (ZIP) |

## Health

| Methode | Pfad |
|---------|------|
| GET | `/api/health` |
