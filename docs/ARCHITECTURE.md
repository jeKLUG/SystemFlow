# Architektur

## Überblick

```
Browser (HTML/CSS/JS)
        │
        ▼
  Nginx (Port 80)
        │
        ▼
  static files in /usr/share/nginx/html
```

Kein Anwendungsserver und keine Datenbank. Persistenz ausschließlich clientseitig.

## Komponenten

| Komponente | Pfad | Rolle |
|------------|------|-------|
| UI | `public/index.html` | Markup, Struktur |
| Styles | `public/styles.css` | Dark Theme, Layout, Motion |
| Logik | `public/app.js` | CRUD für Flows, `localStorage` |
| Reverse Proxy / Static | `nginx/default.conf` | Auslieferung im Container |
| Container | `Dockerfile` | `nginx:1.27-alpine` + Assets |
| Orchestrierung | `docker-compose.yml` | Build + Port-Mapping `8080:80` |

## Datenmodell (Client)

```json
{
  "id": "f_…",
  "name": "Backup-Pipeline",
  "status": "running|healthy|degraded|stopped",
  "createdAt": "ISO-8601"
}
```

Speicher-Key: `systemflow.flows.v1`

## Deployment-Varianten

1. **Docker Compose** – empfohlen für Linux-Server
2. **Nginx/Apache** – `public/` als Document Root
3. **Ad-hoc** – `python3 -m http.server` nur für lokale Tests
