# Passworttresor – Sicherheit

## Ziel

Zugangsdaten (VPN, Admin, Hosting, …) **verschlüsselt at rest** speichern. Ohne Vault-Passphrase sind die Geheimnisse auch bei Zugriff auf die SQLite-Datei nicht lesbar.

## Modell

1. Beim Einrichten wird ein zufälliger **DEK** (256 Bit) erzeugt.
2. Aus der **Vault-Passphrase** wird mit **scrypt** ein **KEK** abgeleitet.
3. Der DEK wird mit **AES-256-GCM** (KEK) gewrappt in `vault_meta` gespeichert.
4. Pro Eintrag werden Benutzername, Passwort, URL und Notizen jeweils mit dem DEK und AES-256-GCM verschlüsselt (`vault_entries`).
5. Nach Freischalten liegt der DEK **nur im Server-RAM** (Map, TTL ~15 Min., Sliding). **Nicht** im Session-Cookie.
6. Logout löscht den DEK aus dem RAM.

## Was absichtlich nicht passiert

- Keine Klartext-Passwörter in Listen-APIs
- Kein Mitliefern im Kunden-ZIP-Export
- Keine Ableitung aus dem Login-Passwort (eigene Passphrase)
- Rate-Limit bei Fehlversuchen (Lockout nach mehreren Fehlversuchen)

## Betriebshinweise

- Starke Vault-Passphrase (≥12 Zeichen), getrennt vom Login hinterlegen.
- Ohne Passphrase: **keine Wiederherstellung** der Einträge.
- TLS (HTTPS) vor Internet-Zugriff empfohlen – sonst könnte die Passphrase im Klartext über die Leitung gehen.
- Container-Neustart sperrt den Tresor (RAM weg).
- Backups der SQLite-Datei enthalten Ciphertexte – die Passphrase zusätzlich sicher verwahren (nicht in derselben Backup-Datei).

## Organisation

- **Kategorien** (Klartext-Metadaten): VPN, Admin, Hosting, E-Mail, Firewall, Remote, WLAN, Datenbank, Cloud, Lizenz, Microsoft 365, Provider, Sonstiges
- **Tags** und **Favoriten** sind Klartext zur Filterung (keine Geheimnisse)
- Geheimnisse (Benutzer, Passwort, URL, Notizen) bleiben AES-256-GCM-verschlüsselt
- **Passwort-Generator** läuft im Browser; der Verlauf liegt nur in `localStorage` (nicht auf dem Server)

## API (Kurz)

| Aktion | Pfad |
|--------|------|
| Status | `GET /api/vault/status` |
| Einrichten | `POST /api/vault/setup` |
| Freischalten | `POST /api/vault/unlock` |
| Sperren | `POST /api/vault/lock` |
| Passphrase ändern | `POST /api/vault/change-passphrase` |
| Einträge (Meta) | `GET /api/vault/entries` |
| Anlegen / Aktualisieren | `POST/PUT /api/vault/entries` – inkl. `category`, `favorite`, `tags` |
| Anzeigen (Klartext) | `GET /api/vault/entries/:id/reveal` |
