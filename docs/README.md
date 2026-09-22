# Dokumentation – Systemhaus-Ess

| Datei | Inhalt |
|-------|--------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Aufbau und Deployment |
| [API.md](API.md) | HTTP-API |
| [CHANGELOG.md](CHANGELOG.md) | Änderungen |
| [TODO-DOCS.md](TODO-DOCS.md) | Offene Punkte |
| [SECURITY-VAULT.md](SECURITY-VAULT.md) | Passworttresor / Verschlüsselung |
| [BACKUP.md](BACKUP.md) | Systemsicherung Download/Restore |
| [ANDROID.md](ANDROID.md) | Android-WebView-App / APK |

Der Windows-/Linux-Monitoring-Agent liegt unter `apps/agent` (Version in `apps/agent/VERSION`). Binaries unter Monitoring → Agent einrichten (`/monitoring/setup`) hochladen; Install-Skripte von dort kopieren. CI-Build: `.github/workflows/monitoring-agent.yml` (Artefakte mit Versionsnummer im Namen).

Systemhaus-Ess ist die interne App für Kontakte/Kundenstammdaten, Wiki, E-Mail-Archiv, Projekte/Budget, Zeiterfassung, Inventar, Einsatz-Historie, Tickets/Helpdesk, **Geräte-Monitoring**, **Marketing/Akquise** und Vorlagen/Suche. Kunden nutzen das Portal unter `/portal`. Lexware bleibt extern für Rechnungen.
