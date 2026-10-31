import { createApp } from './src/app.js';
import { ADMIN_ENABLED, DATA_ROOT, PORT, PREGENERATE, SESSION_SECRET_SET } from './src/config.js';
import { initCache, startBackgroundWork } from './src/images.js';
import { ensureDataDirs } from './src/store.js';

process.on('unhandledRejection', (err) => console.error('Unbehandelter Fehler:', err));

if (!ADMIN_ENABLED) console.warn('WARNUNG: ADMIN_PASSWORD ist nicht gesetzt (oder noch der Beispielwert) – der Admin-Login bleibt gesperrt, bis in der .env ein eigenes Passwort steht.');
if (!SESSION_SECRET_SET) console.warn('Hinweis: SESSION_SECRET ist nicht gesetzt – alle Logins gehen bei jedem Neustart verloren.');

try {
  await ensureDataDirs();
  await initCache();
} catch (err) {
  console.error(`\nFEHLER beim Vorbereiten von ${DATA_ROOT}:\n${err.message}\n`);
  process.exit(1);
}

const server = createApp().listen(PORT, () => {
  console.log(`Fotobox Galerie läuft auf Port ${PORT} (Daten: ${DATA_ROOT}, Vorschaubilder vorab: ${PREGENERATE ? 'ja' : 'nein'})`);
});
startBackgroundWork();

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
