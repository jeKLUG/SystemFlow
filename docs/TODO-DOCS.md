# TODO – Dokumentation

- [ ] Domain / TLS (Let's Encrypt) für Produktions-Setup beschreiben
- [ ] Screenshot der UI für README ergänzen
- [x] Firewall-Hinweise (ufw/firewalld) für `SYSTEMHAUS_PORT` – Deploy öffnet UFW/firewalld; Cloud-Firewall ggf. manuell
- [x] Backup-Hinweis für Volume `systemhaus-data` / SQLite-Datei → siehe [BACKUP.md](BACKUP.md)
- [ ] PWA: Installieren erfordert HTTPS (oder localhost); Icon als PNG optional ergänzen
- [ ] Optional: Monitoring-Schwellwerte CPU/RAM je Gerät statt fester V1-Defaults
- [x] Monitoring-Warnungen je Typ und Gerät inkl. Ticket-Priorität
- [x] Monitoring-Datenträger: Liste aller Laufwerke, Schwellwert und Ticket je Festplatte
- [x] Monitoring: verbaute Hardware-Komponenten (CPU/RAM/Platten/GPU) in der Geräteansicht
- [x] Monitoring: Agent-Pakete im Portal, Install-Skripte, Auto-Start/Recovery, Self-Update
- [x] E-Mail-Benachrichtigungen (SMTP in Einstellungen; Tickets, Termine, Monitoring). Keine Einladungs-Mails.
- [ ] Optional: mehrere Portal-Benutzer pro Kunde
- [ ] Optional: SLA nach Servicezeiten (`coverageHours`) statt Kalenderstunden
- [ ] Optional: Zeiterfassung mit Tages-/Monatsreports als eigenen Report-Endpunkt
- [x] Wiki-PDF: Inline-Bilder aus Uploads einbetten
