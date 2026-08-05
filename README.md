# SystemFlow

Schlanke Webapp im Dark Design mit blauer Akzentfarbe. Statische Dateien – einfach auf einem Linux-Server hosten.

## Features

- Dark UI mit blauer Akzentfarbe
- Flows anlegen, Status setzen, löschen
- Persistenz im Browser (`localStorage`)
- Demo-Daten auf Knopfdruck
- Deployment per Docker / Nginx

## Schnellstart lokal

Ohne Docker (Python 3):

```bash
cd public
python3 -m http.server 8080
```

Dann im Browser: http://localhost:8080

Mit Docker Compose:

```bash
docker compose up --build -d
```

App: http://localhost:8080

## Linux-Server (Docker)

```bash
git clone <dein-repo> SystemFlow
cd SystemFlow
docker compose up --build -d
```

Port in `docker-compose.yml` anpassen (Standard: Host `8080` → Container `80`).

## Linux-Server (Nginx ohne Docker)

```bash
sudo mkdir -p /var/www/systemflow
sudo cp -r public/* /var/www/systemflow/
```

Nginx-Serverblock (Beispiel):

```nginx
server {
    listen 80;
    server_name systemflow.example.com;
    root /var/www/systemflow;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Projektstruktur

```
public/          # Web-Assets (HTML/CSS/JS)
nginx/           # Nginx-Konfiguration für Docker
Dockerfile
docker-compose.yml
docs/            # Dokumentation
```

## Dokumentation

Siehe [docs/README.md](docs/README.md).
