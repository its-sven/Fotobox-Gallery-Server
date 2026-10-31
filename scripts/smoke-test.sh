#!/bin/bash
# Smoke-Test für eine FRISCHE Test-Instanz (legt die Events "Test-Fest-2026" und "Offen" an!).
# Nicht gegen die echte Galerie laufen lassen.
#
#   Lokal (npm run dev):   scripts/smoke-test.sh http://localhost:3000 dev ./data
#   Docker-Container:      CONTAINER=fotobox-gallery scripts/smoke-test.sh http://localhost:3000 <ADMIN_PASSWORD>
B=${1:?Basis-URL fehlt}; PW=${2:?Admin-Passwort fehlt}; DATA=${3:-./data}; T=$(mktemp -d); J=$T/a; G=$T/g; pass=0; fail=0
ok(){ if [ "$1" = "$2" ]; then pass=$((pass+1)); echo "  ok   $3"; else fail=$((fail+1)); echo "  FAIL $3 (erwartet '$2', bekommen '$1')"; fi; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
echo "== Basis"
ok "$(code $B/healthz)" 200 healthz
ok "$(code $B/)" 200 startseite
ok "$(curl -s -D - -o /dev/null $B/ | grep -ci content-security-policy)" 1 "CSP-Header"
ok "$(code $B/assets/css/app.css)" 200 "css"
ok "$(code $B/assets/js/gallery.js)" 200 "gallery.js"
ok "$(code $B/gibtsnicht/x/y)" 404 "404-seite"
echo "== Admin"
ok "$(code -X POST -d password=falsch $B/Admin/login)" 302 "falsches passwort"
ok "$(code -c $J -b $J -X POST -d password=$PW $B/Admin/login)" 302 "login"
ok "$(code -b $J $B/Admin)" 200 "dashboard"
ok "$(curl -s -b $J --data-urlencode title=X --data-urlencode 'slug=a.' -d accessMode=none $B/Admin/events | grep -c 'mindestens 2')" 1 "slug zu kurz"
ok "$(curl -s -b $J --data-urlencode title=X --data-urlencode 'slug=API' -d accessMode=none $B/Admin/events | grep -c 'reserviert')" 1 "slug reserviert"
ok "$(curl -s -b $J --data-urlencode title=X --data-urlencode 'slug=ok-slug' -d accessMode=pin $B/Admin/events | grep -c 'PIN eingeben')" 1 "pin fehlt"
ok "$(curl -s -b $J -o /dev/null -w '%{redirect_url}' --data-urlencode 'title=Test Fest' --data-urlencode 'slug=Test Fest 2026.' -d accessMode=pin -d pin=1234 -d allowZipDownload=1 $B/Admin/events | sed 's/.*created=//')" "Test-Fest-2026#create" "event anlegen (normalisiert)"
ok "$(curl -s -b $J --data-urlencode title=X --data-urlencode 'slug=test-fest-2026' -d accessMode=none $B/Admin/events | grep -c 'bereits vergeben')" 1 "duplikat"
ok "$(code -b $J -X POST --data-urlencode title=Offen --data-urlencode slug=Offen -d accessMode=none -d publicLatest=1 $B/Admin/events)" 302 "event ohne pin"
# Testfotos ablegen. Im Container gehören sie root – wie bei einer Fotobox, die als root synchronisiert.
addphotos() {
  if [ -n "$CONTAINER" ]; then
    node "$(dirname "$0")/gen-test-photos.js" "$T/p/$1" "$2" >/dev/null
    docker cp -q "$T/p/$1/." "$CONTAINER:/opt/fotobox/events/$1/"
    docker exec -u 0 "$CONTAINER" chown -R 0:0 "/opt/fotobox/events/$1/"
    docker exec -u 0 "$CONTAINER" chown 1000:1000 "/opt/fotobox/events/$1"
  else
    node "$(dirname "$0")/gen-test-photos.js" "$DATA/events/$1" "$2" >/dev/null
  fi
}
addphotos Test-Fest-2026 75; addphotos Offen 2
ok "$(code -b $J $B/Admin/events/Test-Fest-2026/photos)" 200 "admin bilder"
ok "$(code -b $J $B/Admin/events/Test-Fest-2026/qr)" 200 "qr seite"
ok "$(curl -s -b $J -o /dev/null -w '%{content_type}' $B/Admin/events/Test-Fest-2026/qr.png)" "image/png" "qr png"
ok "$(curl -s -b $J -o /dev/null -w '%{content_type}' $B/Admin/events/Test-Fest-2026/qr.svg)" "image/svg+xml; charset=utf-8" "qr svg"
ok "$(code $B/Admin/events/Test-Fest-2026/qr.png)" 302 "qr ohne login gesperrt"
ok "$(code -b $J $B/admin-media/Test-Fest-2026/IMG_0001.jpg)" 200 "admin original"
echo "== Gast"
ok "$(code $B/api/Test-Fest-2026/photos)" 401 "api ohne pin"
ok "$(code $B/thumb/Test-Fest-2026/IMG_0001.jpg)" 401 "thumb ohne pin"
ok "$(curl -s $B/Test-Fest-2026 | grep -c 'Galerie öffnen')" 1 "pin-seite"
ok "$(curl -s -c $G -b $G -o /dev/null -w '%{redirect_url}' -d pin=1234 $B/Test-Fest-2026/login | sed 's#.*/##')" "Test-Fest-2026" "pin login"
ok "$(curl -s -b $G $B/api/Test-Fest-2026/photos | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).photos.length))")" 75 "api liste"
ok "$(curl -s -b $G -o /dev/null -w '%{content_type}' "$B/thumb/Test-Fest-2026/IMG_0075.jpg?v=1")" image/webp "thumb webp"
ok "$(curl -s -b $G -D - -o /dev/null "$B/preview/Test-Fest-2026/IMG_0075.jpg?v=1" | grep -i cache-control | tr -d '\r')" "Cache-Control: private, max-age=31536000, immutable" "preview immutable"
ok "$(code -b $G $B/download/Test-Fest-2026/IMG_0001.jpg)" 200 "einzel-download"
curl -s -b $G -o $T/all.zip $B/download/Test-Fest-2026.zip; ok "$(unzip -l $T/all.zip | tail -1 | awk '{print $2}')" 75 "zip mit 75 dateien"
ok "$(code $B/download/Offen.zip)" 403 "zip deaktiviert"
ok "$(curl -s $B/Offen | grep -c 'Alle herunterladen')" 0 "kein zip-button"
E=$(curl -s -b $G -D - -o /dev/null $B/api/Test-Fest-2026/photos | grep -i '^etag' | cut -d' ' -f2 | tr -d '\r'); ok "$(code -b $G -H "If-None-Match: $E" $B/api/Test-Fest-2026/photos)" 304 "etag 304"
echo "== Angriffe"
for u in '/public-media/x/%25' '/media/Offen/%25' '/thumb/Offen/%25' '/thumb/Offen/..%2F..%2Fconfig%2Fevents.json' '/download/Offen/%2e%2e%2fx' '/thumb/Offen/.hidden.jpg'; do ok "$(code $B$u)" 404 "$u"; done
ok "$(curl -s -o /dev/null -w '%{redirect_url}' -X POST "$B/%2Fevil.com/logout" | sed "s#$B##")" "/%2Fevil.com" "kein open redirect"
for i in $(seq 1 30); do curl -s -o /dev/null -d pin=0000 -H 'X-Forwarded-For: 10.9.9.9' $B/Test-Fest-2026/login; done
ok "$(curl -s -H 'X-Forwarded-For: 10.9.9.9' $B/Test-Fest-2026 | grep -c 'Zu viele Fehlversuche')" 1 "pin rate limit"
ok "$(curl -s -o /dev/null -w '%{redirect_url}' -H 'X-Forwarded-For: 10.9.9.9' -d pin=1234 $B/Test-Fest-2026/login | grep -c error)" 0 "gesperrt: kein login (redirect ohne unlock)"
ok "$(code $B/healthz)" 200 "server lebt noch"
echo "== Öffentlich neuestes Bild"
curl -s -b $J -o /dev/null -d title=Test -d accessMode=pin -d publicLatest=1 -d allowZipDownload=1 $B/Admin/events/Test-Fest-2026/edit
L=$(curl -s $B/Test-Fest-2026 | grep -o '/public-media/[^"]*' | head -1 | sed 's/&amp;/\&/g')
ok "$(curl -s -o /dev/null -w '%{content_type}' "$B$L")" image/webp "public-media latest"
ok "$(code $B/public-media/Test-Fest-2026/IMG_0001.jpg)" 403 "altes bild nicht öffentlich"
ok "$(code $B/public-download/Test-Fest-2026/latest)" 200 "public download"
echo "== Löschen"
ok "$(curl -s -b $J -H 'Accept: application/json' -d file=IMG_0002.jpg $B/Admin/events/Test-Fest-2026/photos/delete)" '{"ok":true}' "bild löschen (json)"
ok "$(curl -s -b $G $B/api/Test-Fest-2026/photos | grep -c IMG_0002)" 0 "bild weg aus liste"
echo; echo "ERGEBNIS: $pass ok, $fail fehlgeschlagen"; rm -rf $T
