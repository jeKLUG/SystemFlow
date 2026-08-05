# Dokumentation – SystemFlow

Übersicht der Projektdokumentation.

| Datei | Inhalt |
|-------|--------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Aufbau und Deployment |
| [API.md](API.md) | Schnittstellen (aktuell: keine Backend-API) |
| [CHANGELOG.md](CHANGELOG.md) | Änderungen |
| [TODO-DOCS.md](TODO-DOCS.md) | Offene Dokumentationspunkte |

## Kurzbeschreibung

SystemFlow ist eine statische Single-Page-Webapp zur lokalen Verwaltung von System-Flows (Name + Status). Daten liegen im Browser-`localStorage`. Auslieferung erfolgt über Nginx (Docker). Auf Linux startet und aktualisiert `scripts/deploy.sh` die App als systemd-Dienst `systemflow`.
