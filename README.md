# Fotobox Galerie

Selbst gehostete Foto-Galerie für Fotobox-Events. Die Fotobox legt ihre Bilder per Sync in einen Ordner auf dem Server, die Gäste sehen sie live im Browser – optional mit PIN-Schutz.

**Funktionen**

- Galerie pro Event unter einer eigenen Adresse, z. B. `https://fotos.example.com/Sommerfest-2026`
- Optionaler PIN, optional „Neuestes Bild öffentlich“ (z. B. für einen Bildschirm vor Ort)
- Schnelle Galerie: kleine Vorschaubilder (WebP), Nachladen beim Scrollen, Live-Aktualisierung alle 15 s mit „Neu“-Markierung
- Vollbildansicht mit Wischen/Pfeiltasten, Download des Originals, Teilen auf dem Handy, „Alle herunterladen“ als ZIP
- Adminbereich: Galerien anlegen/bearbeiten/archivieren, Bilder löschen, QR-Code zum Ausdrucken, Seitentitel und Favicon
- Helles und dunkles Design (folgt der Einstellung des Geräts)

---

## Installation auf einem Linux-Server (Docker)

### 0. Voraussetzungen

- Linux-Server mit **Docker** und **Docker Compose** (Plugin `docker compose`)
  ```bash
  curl -fsSL https://get.docker.com | sudo sh
  ```
- Ein Reverse Proxy mit HTTPS davor (z. B. Caddy, Nginx Proxy Manager, Traefik)

### 1. Alte Installation entfernen (nur falls vorhanden)

```bash
cd /opt/fotobox-gallery-server         # bzw. dein bisheriger Ordner mit der docker-compose.yml
sudo docker compose down
sudo docker image rm fotobox-gallery-server-fotobox fotobox-gallery 2>/dev/null
cd / && sudo rm -rf /opt/fotobox-gallery-server
```

Die **Fotos und Einstellungen in `/opt/fotobox` bleiben dabei erhalten** und werden von der neuen Version übernommen. Nur wenn wirklich alles weg soll (alle Galerien und Fotos!):

```bash
sudo rm -rf /opt/fotobox
```

### 2. Code holen

```bash
sudo git clone https://github.com/its-sven/Fotobox-Gallery-Server /opt/fotobox-gallery-server
cd /opt/fotobox-gallery-server
```

### 3. Konfiguration anlegen

```bash
sudo cp .env.example .env
sudo sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$(openssl rand -hex 32)/" .env
sudo nano .env
```

In der `.env` mindestens setzen:

| Eintrag | Bedeutung |
|---|---|
| `ADMIN_PASSWORD` | Passwort für `/Admin`. Solange hier der Beispielwert steht, bleibt der Admin gesperrt. |
| `SESSION_SECRET` | Wurde oben schon zufällig erzeugt. |
| `PUID` / `PGID` | Benutzer, als der die App läuft. Am besten der Benutzer, mit dem die Fotobox die Bilder hochlädt (`id -u fotobox`, `id -g fotobox`). Lädt die Fotobox als root hoch, passt der Standard `1000`. |
| `PUBLIC_BASE_URL` | Optional, z. B. `https://fotos.example.com` – wird für Links und QR-Codes genutzt. Leer = aktuell aufgerufene Domain. |

Alle Einträge sind in der `.env.example` kommentiert.

### 4. Starten

```bash
sudo docker compose up -d --build
sudo docker compose ps          # Status muss nach ~15 s "healthy" sein
sudo docker compose logs -f     # Ctrl+C zum Beenden
```

Im Log sollte stehen: `Fotobox Galerie läuft auf Port 3000 …`

Den Datenordner (`/opt/fotobox` mit `config/`, `events/`, `cache/`) legt der Container selbst an und setzt die Rechte passend für `PUID:PGID`. Du musst dafür **nichts** mit `chown` machen.

### 5. Reverse Proxy

Der Container lauscht auf Port `3000`. Beispiel für Caddy:

```caddyfile
fotos.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

Läuft die Seite **ohne HTTPS** (nur im lokalen Netz), in der `.env` `COOKIE_SECURE=false` setzen – sonst funktionieren Login und PIN nicht.

### 6. Erste Galerie anlegen

1. `https://fotos.example.com/Admin` öffnen und mit dem `ADMIN_PASSWORD` einloggen
2. Unter **Neue Galerie** Anzeigename, URL-Name und PIN eintragen → **Galerie anlegen**
3. Der Link und ein **QR-Code** (PNG zum Drucken) stehen direkt bereit

### 7. Fotobox anbinden

Die Fotobox (bzw. dein Sync-Tool) muss die Bilder in den Ordner der Galerie schreiben:

```text
/opt/fotobox/events/<URL-Name>/        z. B. /opt/fotobox/events/Sommerfest-2026/
```

Unterstützt: JPG, PNG, WebP, GIF, AVIF, BMP. Unterordner und versteckte Dateien (`.xyz`, `._IMG.jpg`) werden ignoriert. Neue Fotos erscheinen nach spätestens 15 Sekunden bei allen Gästen.

---

## Update

```bash
cd /opt/fotobox-gallery-server
sudo git pull
sudo docker compose up -d --build
```

## Backup

Wichtig sind nur `/opt/fotobox/config` (Galerien, PINs, Einstellungen) und `/opt/fotobox/events` (Fotos). `/opt/fotobox/cache` enthält nur Vorschaubilder und kann jederzeit gelöscht werden.

```bash
sudo tar czf fotobox-backup-$(date +%F).tar.gz -C /opt fotobox/config fotobox/events
```

---

## Regeln für den URL-Namen

Der **Anzeigename** ist frei wählbar. Der **URL-Name** wird Teil des Links und des Ordnernamens:

- erlaubt sind nur `A–Z`, `a–z`, `0–9`, `-` und `_`, 2 bis 80 Zeichen
- Leerzeichen und Punkte werden beim Tippen automatisch zu `-`, Umlaute zu `ae/oe/ue/ss`, alles andere wird entfernt (mit Hinweis)
- der URL-Name wird aus dem Anzeigenamen vorgeschlagen; vergebene und reservierte Namen (`Admin`, `api`, `thumb`, …) werden sofort markiert
- Groß-/Kleinschreibung spielt beim Aufruf keine Rolle; nachträglich ändern lässt sich der URL-Name nicht

## Vorschaubilder & Leistung

- Kacheln: 480×480 px, Vollansicht: max. 1920 px, jeweils WebP. Downloads und ZIP liefern immer die **Originale**.
- Neue Fotos werden alle 30 s erkannt und die Vorschaubilder im Hintergrund erzeugt (`PREGENERATE=true`), damit Gäste nicht warten müssen. Anfragen von Gästen haben dabei Vorrang.
- Vorschaubilder gelöschter Fotos werden automatisch aufgeräumt.
- Die Galerie zeigt zunächst 60 Bilder und lädt beim Scrollen nach.

## Sicherheit

- Ohne eigenes `ADMIN_PASSWORD` ist der Admin-Login gesperrt.
- Fehlversuche werden begrenzt: Admin 10, PIN 30 Versuche pro IP in 15 Minuten.
- Bilder werden nur über die App ausgeliefert (PIN-Prüfung). `/opt/fotobox` **nicht** zusätzlich als Webordner freigeben.
- Die App läuft im Container nicht als root.

## Fehlerbehebung

**`EACCES: permission denied … /opt/fotobox/config/…` bzw. „Datenordner ist nicht beschreibbar“**
Die App darf nicht in den Datenordner schreiben.
- Prüfen, dass in der `docker-compose.yml` **kein** `user:` steht (ältere Versionen hatten das) und mit `sudo docker compose up -d --build` neu starten – der Container korrigiert die Rechte dann selbst.
- Hilft das nicht (z. B. bei NFS/SMB-Freigaben): `sudo chown -R 1000:1000 /opt/fotobox` (Zahlen = `PUID:PGID`).
- **Docker Desktop (Mac/Windows):** Der Ordner muss deinem eigenen Benutzer gehören: `sudo chown -R $(id -u):$(id -g) /opt/fotobox` – oder in der `.env` `DATA_PATH=./fotobox-data` setzen.

**Admin-Login zeigt „deaktiviert“** – `ADMIN_PASSWORD` in der `.env` setzen, dann `sudo docker compose up -d`.

**Login/PIN „vergisst“ sich sofort** – Seite läuft ohne HTTPS, aber `COOKIE_SECURE=true`. Entweder HTTPS über den Proxy oder `COOKIE_SECURE=false`.

**Nach jedem Neustart muss der PIN neu eingegeben werden** – das ist so gewollt: Sitzungen liegen nur im Arbeitsspeicher.

**Vorschaubilder sehen falsch aus / Speicherplatz** – `sudo rm -rf /opt/fotobox/cache/*`; sie werden automatisch neu erzeugt.

**Logs ansehen** – `sudo docker compose logs -f`

---

## Lokale Entwicklung

```bash
npm install
npm run dev                 # http://localhost:3000, Daten in ./data, Admin-Passwort "dev"
npm run check               # Syntax-Check aller Dateien
node scripts/gen-test-photos.js data/events/<URL-Name> 100   # Testfotos erzeugen
scripts/smoke-test.sh http://localhost:3000 dev ./data       # kompletter Funktionstest (nur Testinstanz!)
```

Aufbau des Codes und Konventionen: siehe [CLAUDE.md](CLAUDE.md).
