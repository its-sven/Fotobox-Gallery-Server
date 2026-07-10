# Fotobox Gallery Server v1.0

Eigene Fotobox-Webseite für Linux-Server mit Adminbereich, optionalem PIN-Schutz, Live-Bild und Archivierung.


## URLs

```text
https://fotobox.example.com/Sommerfest2026
https://fotobox.example.com/Geburtstag
https://fotobox.example.com/Admin
```

## Ordnerstruktur

```text
/opt/fotobox/
├── config/
│   ├── events.json
│   ├── settings.json
│   └── favicon.ico          # optional
└── events/
    ├── Sommerfest2026/
    └── Geburtstag/
```

## Installation mit Docker Compose

```bash
unzip fotobox-gallery-server-v3.zip
cd fotobox-gallery-server-v3
sudo mkdir -p /opt/fotobox/events /opt/fotobox/config
cp .env.example .env
nano .env
sudo docker compose up -d --build
```


## Seitennamen ändern

Empfohlen über das Adminpanel:

```text
/Admin → Globale Seiteneinstellungen
```

Alternativ als Startwerte über `.env`:

```env
SITE_EYEBROW=Fotobox
SITE_TITLE=Fotobox Galerie
```

Sobald `settings.json` existiert, gelten die Werte aus dem Adminpanel.

## Favicon hinterlegen

Lege dein Icon auf dem Server hier ab:

```text
/opt/fotobox/config/favicon.ico
```

Danach ggf. Container neu starten oder Browsercache leeren:

```bash
sudo docker compose restart
```

## Caddy Reverse Proxy

```caddyfile
fotobox.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

## Sicherheitshinweise

- Ändere unbedingt `ADMIN_PASSWORD`.
- Setze `SESSION_SECRET` auf eine lange zufällige Zeichenfolge.
- Gib `/opt/fotobox/events` nicht zusätzlich als statischen Webordner frei.
- Lass Bilder nur über diese App ausliefern, damit der PIN-Schutz greift.

## Öffentliche Basis-URL optional fest hinterlegen

Standard: Das Adminpanel nutzt automatisch die aktuell geöffnete Domain im Browser. Optional kannst du in `.env` setzen:

```env
PUBLIC_BASE_URL=https://fotos.example.com
```

