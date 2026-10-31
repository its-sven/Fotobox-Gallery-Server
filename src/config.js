import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const env = process.env;
const PLACEHOLDER_PASSWORDS = new Set(['', 'CHANGE_ME_NOW', 'BitteUnbedingtAendern']);
const PLACEHOLDER_SECRETS = new Set(['', 'BitteEineSehrLangeZufaelligeZeichenfolgeEintragen']);

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(APP_ROOT, 'public');

export const PORT = Number(env.PORT || 3000);
export const DATA_ROOT = path.resolve(env.DATA_ROOT || '/opt/fotobox');
export const EVENTS_ROOT = path.join(DATA_ROOT, 'events');
export const CONFIG_ROOT = path.join(DATA_ROOT, 'config');
export const CACHE_ROOT = path.resolve(env.CACHE_ROOT || path.join(DATA_ROOT, 'cache'));
export const EVENTS_FILE = path.join(CONFIG_ROOT, 'events.json');
export const SETTINGS_FILE = path.join(CONFIG_ROOT, 'settings.json');
export const FAVICON_FILE = path.join(CONFIG_ROOT, 'favicon.ico');

export const ADMIN_PASSWORD = env.ADMIN_PASSWORD || '';
/** Ohne echtes Passwort bleibt der Adminbereich gesperrt (kein Login mit Standardwert möglich). */
export const ADMIN_ENABLED = !PLACEHOLDER_PASSWORDS.has(ADMIN_PASSWORD);
export const SESSION_SECRET_SET = !PLACEHOLDER_SECRETS.has(env.SESSION_SECRET || '');
export const SESSION_SECRET = SESSION_SECRET_SET ? env.SESSION_SECRET : crypto.randomBytes(32).toString('hex');
export const COOKIE_SECURE = env.COOKIE_SECURE === 'true';

export const PUBLIC_BASE_URL = (env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
export const CREDIT_NAME = env.CREDIT_NAME ?? 'Sven Würth';
export const CREDIT_URL = env.CREDIT_URL ?? 'https://svenw.de';
export const DEFAULT_SETTINGS = { siteEyebrow: env.SITE_EYEBROW || 'Fotobox', siteTitle: env.SITE_TITLE || 'Fotobox Galerie' };

/** Vorschaubilder im Hintergrund erzeugen, sobald neue Fotos im Event-Ordner landen. */
export const PREGENERATE = env.PREGENERATE !== 'false';
export const SCAN_INTERVAL_MS = 30_000;

export const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);
export const VARIANTS = {
  thumb: { px: 480, fit: 'cover', quality: 70 },     // quadratische Kachel in der Galerie
  preview: { px: 1920, fit: 'inside', quality: 80 },  // Vollansicht / neuestes Bild
};
export const PAGE_SIZE = 60;

/** Pfade, die kein Event-URL-Name sein dürfen (kleingeschrieben; Express-Routing ist case-insensitive). */
export const RESERVED = new Set([
  'admin', 'admin-media', 'api', 'assets', 'download', 'favicon.ico', 'healthz',
  'media', 'preview', 'public-download', 'public-media', 'robots.txt', 'thumb',
]);
