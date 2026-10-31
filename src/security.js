import crypto from 'node:crypto';
import { ADMIN_ENABLED, ADMIN_PASSWORD } from './config.js';
import { findEvent } from './store.js';

// ---------- Fehlversuche begrenzen (im Speicher, pro IP) ----------

const WINDOW_MS = 15 * 60_000;
export const LIMITS = { admin: 10, pin: 30 };
const failures = new Map();

export function lockedMinutes(key) {
  const f = failures.get(key);
  return f?.locked && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 60_000) : 0;
}

export function recordFailure(key, max) {
  const now = Date.now();
  let f = failures.get(key);
  if (!f || f.until <= now) f = { count: 0, until: now + WINDOW_MS };
  f.count++;
  f.locked = f.count >= max;
  failures.set(key, f);
}

export function clearFailures(key) {
  failures.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, f] of failures) if (f.until <= now) failures.delete(key);
}, 10 * 60_000).unref();

export const adminKey = (req) => `admin:${req.ip}`;
export const pinKey = (req, event) => `pin:${req.ip}:${event.slug}`;

// ---------- Admin ----------

export function checkAdminPassword(value) {
  if (!ADMIN_ENABLED) return false;
  const hash = (v) => crypto.createHash('sha256').update(String(v)).digest();
  return crypto.timingSafeEqual(hash(value), hash(ADMIN_PASSWORD));
}

export function isAdmin(req) {
  return req.session?.admin === true;
}

export function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  if (req.method === 'GET') return res.redirect('/Admin');
  res.status(401).send('Nicht angemeldet');
}

// ---------- Events / PIN ----------

export function isUnlocked(req, event) {
  return Boolean(event) && !event.archived && (event.accessMode === 'none' || req.session?.events?.[event.slug] === true);
}

export function unlock(req, event) {
  req.session.events = { ...req.session.events, [event.slug]: true };
}

export function lock(req, slug) {
  if (req.session?.events) delete req.session.events[slug];
}

/** Lädt das Event aus `:slug` nach `req.event`; antwortet 401, wenn es nicht freigeschaltet ist. */
export async function requireEvent(req, res, next) {
  const event = await findEvent(req.params.slug);
  if (!isUnlocked(req, event)) return res.status(401).json({ error: 'PIN erforderlich' });
  req.event = event;
  next();
}
