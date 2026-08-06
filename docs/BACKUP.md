# Backup & Restore

Systemhaus-Ess speichert die Produktivdaten in SQLite (`DATABASE_PATH`) und Datei-Uploads unter `UPLOAD_DIR` (Docker-Volume `systemhaus-data` → `/data`).

## Browser (empfohlen)

1. **Konto → Sicherung → Backup herunterladen**  
   Erzeugt eine ZIP mit:
   - `systemhaus.sqlite` (konsistenter Snapshot via `VACUUM INTO`)
   - `uploads/` (Anhänge, Wiki-Bilder, …)
   - `manifest.json` und `RESTORE.md`
2. **Backup importieren…**  
   Lädt dieselbe ZIP hoch, ersetzt Datenbank + Uploads und startet den Dienst neu.  
   Vor dem Import wird die bisherige Instanz unter `.pre-restore-*` neben der DB abgelegt.

API:

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `GET` | `/api/admin/backup` | ZIP-Download |
| `GET` | `/api/admin/backup/info` | Größen-/Pfad-Meta |
| `POST` | `/api/admin/backup/restore` | multipart `file` = ZIP |

Auth: Session erforderlich (`requireAuth`). Upload-Limit: 512 MB.

## Manuell (Server)

1. Dienst/Container stoppen  
2. `systemhaus.sqlite` nach `DATABASE_PATH` kopieren  
3. Inhalt von `uploads/` nach `UPLOAD_DIR` kopieren  
4. Dienst starten  

## Hinweise

- Der Passworttresor liegt in der DB; die **Tresor-Passphrase** bleibt Nutzer-Geheimnis und steckt nicht im Klartext in der ZIP.
- Nach Restore die App neu laden / anmelden.
- Regelmäßig Backups außer Haus lagern (nicht nur auf demselben Volume).
