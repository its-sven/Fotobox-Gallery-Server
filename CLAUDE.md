# CLAUDE.md – Fotobox Galerie

Selbst gehostete Foto-Galerie für Fotobox-Events. Die Fotobox synchronisiert Bilder per Dateisystem nach `DATA_ROOT/events/<slug>/`; dieser Server zeigt sie (optional PIN-geschützt) an, bietet Downloads/ZIP und einen Adminbereich. Betrieb per Docker Compose hinter einem Reverse Proxy. Installations-/Betriebsanleitung für Menschen: `README.md`.

## Stack

- Node ≥ 22, **ESM** (`"type": "module"`), **Express 5** (async-Fehler landen automatisch im Error-Handler – kein Wrapper nötig).
- Kein Build-Schritt, kein Frontend-Framework. HTML wird serverseitig per Tagged Template `html\`…\`` erzeugt; Client-JS/CSS liegen als echte Dateien in `public/` (ausgeliefert unter `/assets`).
- Abhängigkeiten: `express`, `express-session` (eigener Speicher-Store), `bcryptjs` (PIN-Hashes), `sharp` (Vorschaubilder), `yazl` (ZIP-Stream), `multer` (Favicon-Upload), `qrcode`.
- Docker: `node:24-alpine`, `npm ci` mit `package-lock.json`, Entrypoint `docker-entrypoint.sh` (startet als root, korrigiert Rechte, wechselt per `su-exec` auf `PUID:PGID`).

## Struktur

```
server.js                 Einstieg: Datenordner prüfen, App starten, Hintergrund-Scan, sauberes Beenden
src/config.js             alle Umgebungsvariablen und Konstanten (VARIANTS, RESERVED, PAGE_SIZE …)
src/store.js              events.json/settings.json: mtime-Cache, atomares Schreiben, serialisierte Schreibzugriffe
src/images.js             Fotoliste, Pfadprüfung, Vorschaubilder (sharp), Prioritäts-Warteschlange, Hintergrund-Scan + Aufräumen
src/security.js           Rate-Limit, Admin-Passwort, Event-Freischaltung, Middlewares
src/sessions.js           In-Memory-Session-Store mit Ablauf-Bereinigung
src/app.js                Express-Setup, Sicherheits-Header (CSP), Static, Router, 404/500
src/routes/admin.js       /Admin… (Login, Dashboard, Events, Bilder löschen, QR, Einstellungen, Favicon)
src/routes/media.js       /api, /thumb, /preview, /media, /download, /public-media …
src/routes/public.js      /, /:slug (Galerie / PIN / neuestes Bild), Login/Logout pro Event – MUSS zuletzt gemountet werden
src/views/layout.js       html``-Template (escaped automatisch), raw(), icon(), page(), hero(), notice()
src/views/public.js       Seiten für Gäste
src/views/admin.js        Seiten für den Admin
public/css/app.css        komplettes Design, Hell/Dunkel über CSS-Variablen
public/js/slug.js         slugify/finalSlug/slugProblem – wird von Browser UND Server importiert
public/js/gallery.js      Galerie-Client (Polling, Kacheln, Lightbox, Teilen)
public/js/admin.js        Admin-Client (URL-Name live prüfen, PIN-Toggle, Kopieren, data-confirm, Löschen per fetch)
public/js/latest.js       Auto-Reload der „Neuestes Bild“-Seite
scripts/                  gen-test-photos.js, smoke-test.sh
```

## Daten

```
DATA_ROOT (/opt/fotobox)
├── config/events.json     {events:[{slug,title,folder,accessMode:'pin'|'none',pinHash,publicLatest,allowZipDownload,archived,createdAt}]}
├── config/settings.json   {siteEyebrow, siteTitle}
├── config/favicon.ico
├── events/<slug>/         Originale – von der Fotobox befüllt, nur beim Admin-Löschen anfassen
└── cache/<slug>/<thumb|preview>/<sha1(name|size|mtime)>.webp
```

- Immer über `store.js` lesen/schreiben (`loadEvents`, `findEvent`, `createEvent`, `updateEvent`, `loadSettings`, `saveSettings`). Neue Event-Felder in `normalize()` mit Default versehen (Altbestand!).
- `listPhotos(e)` ist gecacht (10 s / Ordner-mtime) und liefert eine **geteilte** Liste – nicht verändern.
- Cache-Dateinamen hängen an Name+Größe+mtime; der Hintergrund-Scan (`startBackgroundWork`) erzeugt fehlende Varianten mit niedriger Priorität und löscht verwaiste.

## Konventionen

- UI-Texte **Deutsch**, Gäste werden geduzt.
- HTML nur über `html\`…\`` bauen – Werte werden escaped. Für vertrauenswürdiges Markup `html`/`raw()`/`icon()` verwenden. Pfadsegmente in URLs mit `seg()` (= `encodeURIComponent`).
- Kein Inline-JavaScript (CSP `script-src 'self'`): Verhalten über `data-*`-Attribute + Code in `public/js/*.js`. Daten an den Client per `jsonData({...})` → `#page-data`.
- Bilder nur über `sendImage(req,res,event,file,size)` ausliefern (Pfadprüfung, Cache-Header, Fallback aufs Original). Galerieansichten nie mit Originalen bestücken – `thumb`/`preview` mit `?v=<mtime>` (dann `immutable`).
- Neue Top-Level-Pfade in `RESERVED` (config.js) eintragen, sonst kann ein Event-Slug sie belegen. Express matcht case-insensitive.
- Code-Stil: kleine, benannte Funktionen, sprechende Namen, Kommentare nur wo nötig (auf Deutsch).

## Stolperfallen

- HTML-`pattern` wird mit dem `v`-Flag kompiliert → `-` in Zeichenklassen escapen (`[A-Za-z0-9_\-]`; im Template-String `\\-`).
- `.btn{display:inline-flex}` würde `hidden` überschreiben → `[hidden]{display:none!important}` steht in app.css.
- Grids mit `minmax(0,1fr)` anlegen, sonst sprengen lange Links/Inputs auf dem Handy das Layout.
- Express 5: `req.body` ist ohne Body `undefined` → in app.js auf `{}` gesetzt. Pfad-Syntax: keine Regex-Parameter mehr (`/:size(thumb|preview)` geht nicht).
- `res.sendFile` immer mit absoluten Pfaden (`DATA_ROOT` wird per `path.resolve` absolut gemacht) und `{ dotfiles: 'allow' }`.
- Sessions und Rate-Limits liegen im Speicher – Neustart = alle abgemeldet.
- Docker Desktop (macOS): Bind-Mounts werden mit den Rechten des Mac-Benutzers geschrieben; `chown` im Container hilft dort nicht. Der Entrypoint erkennt das per echtem Schreibtest und gibt eine Anleitung aus.

## Prüfen

```bash
npm run check                                               # Syntax aller Dateien
npm run dev                                                 # http://localhost:3000, Passwort "dev", Daten ./data
node scripts/gen-test-photos.js data/events/<slug> 100
scripts/smoke-test.sh http://localhost:3000 dev ./data      # 48 Checks, braucht frische Daten (rm -rf data)
CONTAINER=<name> scripts/smoke-test.sh http://localhost:<port> <pw>   # gegen einen Test-Container
```

Bei UI-Änderungen zusätzlich im Browser prüfen: Desktop + 375 px, Hell + Dunkel, keine horizontale Scrollbar (`document.documentElement.scrollWidth`).
