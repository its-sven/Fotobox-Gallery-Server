import fs from 'node:fs/promises';
import express from 'express';
import session from 'express-session';
import { COOKIE_SECURE, FAVICON_FILE, PUBLIC_DIR, SESSION_SECRET } from './config.js';
import adminRoutes from './routes/admin.js';
import mediaRoutes from './routes/media.js';
import publicRoutes from './routes/public.js';
import { MemorySessionStore } from './sessions.js';
import { messagePage } from './views/public.js';

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set(SECURITY_HEADERS);
    next();
  });
  app.get('/healthz', (req, res) => res.type('text').send('ok'));
  app.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nDisallow: /\n'));
  app.get('/favicon.ico', async (req, res) => {
    if (await fs.access(FAVICON_FILE).then(() => true, () => false)) return res.sendFile(FAVICON_FILE, { dotfiles: 'allow' });
    res.status(204).end();
  });
  app.use('/assets', express.static(PUBLIC_DIR, { index: false, maxAge: 0 }));

  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use((req, res, next) => {
    req.body ??= {};
    next();
  });
  app.use(session({
    name: 'fotobox.sid',
    store: new MemorySessionStore(),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE, maxAge: 12 * 60 * 60 * 1000 },
  }));

  app.use(adminRoutes);
  app.use(mediaRoutes);
  app.use(publicRoutes); // enthält /:slug – muss zuletzt kommen

  app.use((req, res) => {
    res.status(404).send(messagePage({ title: 'Nicht gefunden', heading: 'Seite nicht gefunden', text: 'Diese Adresse gibt es nicht.' }));
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return res.destroy();
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).send(messagePage({ title: 'Fehler', heading: 'Da ist etwas schiefgelaufen', text: 'Bitte versuche es gleich noch einmal.' }));
  });
  return app;
}
