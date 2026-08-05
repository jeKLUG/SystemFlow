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

Body (POST/PUT): `name`, optional `email`, `phone`, `address`, `notes`, `status` (`active`\|`inactive`).

## Dokumente

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/documents?customerId=` | Liste |
| GET | `/api/documents/recent` | Zuletzt bearbeitet |
| GET | `/api/documents/:id` | Detail inkl. TipTap-JSON |
| POST | `/api/documents` | Anlegen |
| PUT | `/api/documents/:id` | Titel/Typ/Inhalt |
| DELETE | `/api/documents/:id` | Löschen |

## Health

| Methode | Pfad |
|---------|------|
| GET | `/api/health` |
