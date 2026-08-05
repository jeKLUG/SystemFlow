# SystemFlow

Schlanke Webapp im Dark Design mit blauer Akzentfarbe. Statische Dateien – einfach auf einem Linux-Server hosten.

## Linux-Server: ein Befehl

Installieren, updaten und als Dauer-Dienst starten:

```bash
curl -fsSL https://raw.githubusercontent.com/YeSkorpion/SystemFlow/main/scripts/deploy.sh | sudo bash
```

Oder lokal im Repo:

```bash
sudo ./scripts/deploy.sh
```

Das Skript:

1. installiert Docker falls nötig  
2. klont/aktualisiert nach `/opt/systemflow`  
3. baut und startet den Container  
4. richtet den systemd-Dienst `systemflow` ein (Start nach Reboot)

Danach erreichbar unter **http://SERVER-IP:8080**

### Nützliche Befehle

| Aktion | Befehl |
|--------|--------|
| Update | `sudo /opt/systemflow/scripts/deploy.sh` |
| Status | `sudo systemctl status systemflow` |
| Stop | `sudo systemctl stop systemflow` |
| Start | `sudo systemctl start systemflow` |

### Optionen

```bash
sudo SYSTEMFLOW_PORT=80 SYSTEMFLOW_DIR=/opt/systemflow ./scripts/deploy.sh
```

| Variable | Default | Bedeutung |
|----------|---------|-----------|
| `SYSTEMFLOW_PORT` | `8080` | Host-Port |
| `SYSTEMFLOW_DIR` | `/opt/systemflow` | Installationsordner |
| `SYSTEMFLOW_REPO` | GitHub-URL | Git-Remote |
| `SYSTEMFLOW_BRANCH` | `main` | Branch |

## Features

- Dark UI mit blauer Akzentfarbe
- Flows anlegen, Status setzen, löschen
- Persistenz im Browser (`localStorage`)
- Demo-Daten auf Knopfdruck
- Deployment per Docker / Nginx + systemd

## Schnellstart lokal

Ohne Docker (Python 3):

```bash
cd public
python3 -m http.server 8080
```

Mit Docker Compose:

```bash
docker compose up --build -d
```

App: http://localhost:8080

## Projektstruktur

```
public/            # Web-Assets (HTML/CSS/JS)
nginx/             # Nginx-Konfiguration für Docker
scripts/deploy.sh  # Update + systemd-Dienst
Dockerfile
docker-compose.yml
docs/              # Dokumentation
```

## Dokumentation

Siehe [docs/README.md](docs/README.md).
