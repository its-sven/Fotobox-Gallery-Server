#!/bin/sh
# Startet als root, legt die Ordnerstruktur an, korrigiert die Rechte
# und führt die App danach als PUID:PGID (ohne root) aus.

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_ROOT="${DATA_ROOT:-/opt/fotobox}"
CACHE_ROOT="${CACHE_ROOT:-$DATA_ROOT/cache}"

if [ "$(id -u)" != "0" ]; then
  exec "$@"
fi

mkdir -p "$DATA_ROOT/config" "$DATA_ROOT/events" "$CACHE_ROOT" 2>/dev/null
# Config und Cache gehören komplett der App
chown -R "$PUID:$PGID" "$DATA_ROOT/config" "$CACHE_ROOT" 2>/dev/null
# Event-Ordner: nur die Ordner selbst (neue Galerien anlegen, Bilder löschen),
# die Bilddateien der Fotobox bleiben unangetastet
chown "$PUID:$PGID" "$DATA_ROOT" "$DATA_ROOT/events" 2>/dev/null
find "$DATA_ROOT/events" -mindepth 1 -maxdepth 1 -type d -exec chown "$PUID:$PGID" {} + 2>/dev/null

# Echter Schreibtest (test -w reicht bei Docker Desktop nicht, dort entscheidet der Host)
if ! su-exec "$PUID:$PGID" sh -c "f='$DATA_ROOT/config/.schreibtest' && touch \"\$f\" && rm -f \"\$f\" && d='$DATA_ROOT/events/.schreibtest' && mkdir \"\$d\" && rmdir \"\$d\"" 2>/dev/null; then
  cat >&2 <<EOF

FEHLER: Der Datenordner ist für die App (Benutzer $PUID:$PGID) nicht beschreibbar
und die Rechte konnten nicht automatisch korrigiert werden.

Auf dem Docker-Host einmalig ausführen (Pfad = DATA_PATH aus der .env):
  sudo chown -R $PUID:$PGID /opt/fotobox

Docker Desktop (macOS/Windows): Der Ordner muss deinem eigenen Benutzer gehören:
  sudo chown -R \$(id -u):\$(id -g) /opt/fotobox
oder in der .env einen Ordner im Home-Verzeichnis nutzen, z. B. DATA_PATH=./fotobox-data

EOF
  sleep 30 # verhindert eine schnelle Neustart-Schleife
  exit 1
fi

exec su-exec "$PUID:$PGID" "$@"
