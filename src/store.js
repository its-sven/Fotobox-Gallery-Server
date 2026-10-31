import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_ROOT, DEFAULT_SETTINGS, EVENTS_FILE, EVENTS_ROOT, SETTINGS_FILE } from './config.js';

// JSON-Dateien werden anhand ihrer mtime im Speicher gehalten und atomar (tmp + rename) geschrieben.
const cache = new Map();

async function readJson(file, fallback) {
  const st = await fs.stat(file).catch(() => null);
  if (!st) return structuredClone(fallback);
  let entry = cache.get(file);
  if (entry?.mtimeMs !== st.mtimeMs) {
    entry = { mtimeMs: st.mtimeMs, data: JSON.parse(await fs.readFile(file, 'utf8')) };
    cache.set(file, entry);
  }
  return structuredClone(entry.data);
}

async function writeJson(file, data) {
  const json = JSON.stringify(data, null, 2);
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.writeFile(tmp, json);
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
  cache.set(file, { mtimeMs: (await fs.stat(file)).mtimeMs, data: structuredClone(data) });
}

// Schreibzugriffe nacheinander ausführen, damit sich zwei Admin-Aktionen nicht gegenseitig überschreiben.
let queue = Promise.resolve();
function exclusive(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

function normalize(e) {
  return {
    publicLatest: false,
    archived: false,
    accessMode: e.pinHash ? 'pin' : 'none',
    allowZipDownload: true,
    ...e,
    folder: e.folder || path.join(EVENTS_ROOT, e.slug),
  };
}

export async function loadEvents() {
  const data = await readJson(EVENTS_FILE, { events: [] });
  return (data.events || []).map(normalize);
}

export async function findEvent(slug) {
  const lower = String(slug).toLowerCase();
  return (await loadEvents()).find((e) => e.slug.toLowerCase() === lower) || null;
}

/** Legt ein Event an; `validate(events)` darf eine Fehlermeldung liefern (wird innerhalb der Sperre geprüft). */
export function createEvent(event, validate) {
  return exclusive(async () => {
    const events = await loadEvents();
    const problem = validate?.(events);
    if (problem) return { error: problem };
    await fs.mkdir(event.folder, { recursive: true });
    events.push(event);
    await writeJson(EVENTS_FILE, { events });
    return { event };
  });
}

export function updateEvent(slug, fn) {
  return exclusive(async () => {
    const events = await loadEvents();
    const i = events.findIndex((e) => e.slug === slug);
    if (i < 0) return null;
    events[i] = await fn(events[i]);
    await writeJson(EVENTS_FILE, { events });
    return events[i];
  });
}

export async function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(await readJson(SETTINGS_FILE, {})) };
}

export function saveSettings(settings) {
  return exclusive(() => writeJson(SETTINGS_FILE, settings));
}

/** Legt die Grundstruktur an und bricht mit einer verständlichen Meldung ab, wenn Rechte fehlen. */
export async function ensureDataDirs() {
  try {
    await fs.mkdir(EVENTS_ROOT, { recursive: true });
    await fs.mkdir(CONFIG_ROOT, { recursive: true });
    if (!(await exists(EVENTS_FILE))) await writeJson(EVENTS_FILE, { events: [] });
    if (!(await exists(SETTINGS_FILE))) await writeJson(SETTINGS_FILE, DEFAULT_SETTINGS);
    await fs.access(CONFIG_ROOT, fs.constants.W_OK);
    await fs.access(EVENTS_ROOT, fs.constants.W_OK);
  } catch (err) {
    if (err.code !== 'EACCES' && err.code !== 'EPERM') throw err;
    const who = typeof process.getuid === 'function' ? `${process.getuid()}:${process.getgid()}` : 'dieser Benutzer';
    throw new Error(
      `Keine Schreibrechte auf ${err.path || CONFIG_ROOT} (Prozess läuft als ${who}).\n` +
      `Lösung: sudo chown -R ${who} ${path.dirname(CONFIG_ROOT)}\n` +
      `Docker: In der docker-compose.yml kein "user:" setzen – das Start-Skript korrigiert die Rechte selbst (siehe README, Abschnitt Fehlerbehebung).`,
    );
  }
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}
