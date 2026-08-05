# API

Alle geschützten Routen erfordern eine gültige Session (Cookie). Basis: `/api`.

## Auth

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| POST | `/api/auth/login` | `{ username, password }` |
| POST | `/api/auth/logout` | Session beenden |
| GET | `/api/auth/me` | Aktueller Benutzer |

## Kunden

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/customers?q=` | Liste / Suche |
| GET | `/api/customers/:id` | Detail |
| POST | `/api/customers` | Anlegen |
| PUT | `/api/customers/:id` | Aktualisieren |
| DELETE | `/api/customers/:id` | Löschen (inkl. Dokumente) |
| GET | `/api/stats` | `{ customerCount, activeCount }` |

Body (POST/PUT): `name` (Kurzname), optional `company`, `contactPerson`, `email`, `phone`, `mobile`, `address`, `zip`, `city`, `country`, `vatId`, `website`, `notes`, `status` (`active`\|`inactive`).

## Dokumente

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/documents?customerId=` | Liste |
| GET | `/api/documents/recent` | Zuletzt bearbeitet |
| GET | `/api/documents/:id` | Detail inkl. TipTap-JSON |
| POST | `/api/documents` | Anlegen |
| PUT | `/api/documents/:id` | Titel/Typ/Inhalt |
| DELETE | `/api/documents/:id` | Löschen |

## Anlagen

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/customers/:id/assets` | Anlagenliste |
| POST | `/api/customers/:id/assets` | Anlage anlegen |
| PUT | `/api/assets/:id` | Aktualisieren |
| DELETE | `/api/assets/:id` | Löschen |

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
