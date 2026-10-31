import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { CACHE_ROOT, IMAGE_EXT, PREGENERATE, SCAN_INTERVAL_MS, VARIANTS } from './config.js';
import { loadEvents } from './store.js';

sharp.cache(false);

let cacheRoot = CACHE_ROOT;

/** Prüft den Cache-Ordner; ist er nicht beschreibbar, wird ein temporärer Ordner genutzt. */
export async function initCache() {
  try {
    await fs.mkdir(cacheRoot, { recursive: true });
    await fs.access(cacheRoot, fs.constants.W_OK);
  } catch {
    const fallback = path.join(os.tmpdir(), 'fotobox-cache');
    console.warn(`Hinweis: ${cacheRoot} ist nicht beschreibbar – Vorschaubilder landen in ${fallback} und gehen beim Neuerstellen des Containers verloren.`);
    cacheRoot = fallback;
    await fs.mkdir(cacheRoot, { recursive: true });
  }
}

// ---------- Fotoliste ----------

const listCache = new Map();

/** Fotos eines Events, neueste zuerst. Ergebnis wird geteilt – nicht verändern. */
export async function listPhotos(event) {
  const dir = await fs.stat(event.folder).catch(() => null);
  if (!dir) return [];
  const cached = listCache.get(event.folder);
  if (cached && cached.mtimeMs === dir.mtimeMs && Date.now() - cached.at < 10_000) return cached.list;
  const entries = await fs.readdir(event.folder, { withFileTypes: true });
  const names = entries
    .filter((d) => d.isFile() && !d.name.startsWith('.') && IMAGE_EXT.has(path.extname(d.name).toLowerCase()))
    .map((d) => d.name);
  const list = (await Promise.all(names.map(async (name) => {
    const st = await fs.stat(path.join(event.folder, name)).catch(() => null);
    return st && { name, size: st.size, modified: st.mtime.toISOString(), v: Math.round(st.mtimeMs) };
  }))).filter(Boolean).sort((a, b) => b.v - a.v);
  listCache.set(event.folder, { mtimeMs: dir.mtimeMs, at: Date.now(), list });
  return list;
}

export function forgetPhotoList(event) {
  listCache.delete(event.folder);
}

/** Dateiname aus der URL prüfen: keine Pfadanteile, keine versteckten Dateien. */
export function cleanFileName(name) {
  const n = String(name || '');
  return !n || n.startsWith('.') || /[/\\\0]/.test(n) || n.includes('..') ? null : n;
}

export function photoPath(event, name) {
  const root = path.resolve(event.folder);
  const full = path.resolve(root, name);
  return full.startsWith(root + path.sep) ? full : null;
}

// ---------- Vorschaubilder ----------

function variantPath(event, photo, size) {
  const key = crypto.createHash('sha1').update(`${photo.name}|${photo.size}|${photo.v}`).digest('hex');
  return path.join(cacheRoot, event.slug, size, `${key}.webp`);
}

async function exists(file) {
  return fs.access(file).then(() => true, () => false);
}

// Warteschlange: Anfragen von Besuchern (high) haben Vorrang vor der Hintergrund-Erzeugung (low).
const MAX_JOBS = 2;
const jobs = new Map();
const high = [];
const low = [];
let running = 0;
let runningLow = 0;

function pump() {
  while (running < MAX_JOBS) {
    let job = high.shift();
    if (!job) {
      if (runningLow >= 1 || !low.length) break;
      job = low.shift();
    }
    job.started = true;
    running++;
    if (job.low) runningLow++;
    job.fn().then(job.resolve, job.reject).finally(() => {
      running--;
      if (job.low) runningLow--;
      jobs.delete(job.out);
      pump();
    });
  }
}

function schedule(out, fn, priority) {
  let job = jobs.get(out);
  if (job) {
    if (priority === 'high' && job.low && !job.started) {
      low.splice(low.indexOf(job), 1);
      job.low = false;
      high.push(job);
      pump();
    }
    return job.promise;
  }
  job = { out, fn, low: priority === 'low', started: false };
  job.promise = new Promise((resolve, reject) => Object.assign(job, { resolve, reject }));
  jobs.set(out, job);
  (job.low ? low : high).push(job);
  pump();
  return job.promise;
}

async function render(src, out, size) {
  const o = VARIANTS[size];
  const tmp = `${out}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.mkdir(path.dirname(out), { recursive: true });
  try {
    await sharp(src, { failOn: 'none' })
      .rotate()
      .resize(o.px, o.px, { fit: o.fit, withoutEnlargement: true })
      .webp({ quality: o.quality })
      .toFile(tmp);
    await fs.rename(tmp, out);
  } catch (err) {
    await fs.rm(tmp, { force: true });
    throw err;
  }
  return out;
}

/** Liefert den Pfad des Vorschaubilds und erzeugt es bei Bedarf. */
async function ensureVariant(event, photo, size, priority = 'high') {
  const out = variantPath(event, photo, size);
  if (await exists(out)) return out;
  const src = photoPath(event, photo.name);
  return schedule(out, () => render(src, out, size), priority);
}

async function photoInfo(event, name) {
  const full = photoPath(event, name);
  const st = full && await fs.stat(full).catch(() => null);
  return st?.isFile() ? { full, photo: { name, size: st.size, v: Math.round(st.mtimeMs) } } : null;
}

/**
 * Sendet ein Foto: als Vorschaubild (size = 'thumb' | 'preview') oder als Original (size leer).
 * Schlägt die Umrechnung fehl (z. B. BMP), wird das Original geschickt.
 */
export async function sendImage(req, res, event, name, size) {
  const file = cleanFileName(name);
  const info = event && file && await photoInfo(event, file);
  if (!info) return res.sendStatus(404);
  let out = null;
  if (size) {
    out = await ensureVariant(event, info.photo, size).catch((err) => {
      console.warn(`Vorschau für ${event.slug}/${file} fehlgeschlagen, sende Original: ${err.message}`);
      return null;
    });
  }
  res.setHeader('Cache-Control', out && req.query.v ? 'private, max-age=31536000, immutable' : 'private, max-age=300');
  res.sendFile(out || info.full, { dotfiles: 'allow' });
}

/** Entfernt die Vorschaubilder eines Fotos (vor dem Löschen des Originals aufrufen). */
export async function dropVariants(event, name) {
  const info = await photoInfo(event, name);
  if (!info) return;
  await Promise.all(Object.keys(VARIANTS).map((size) => fs.rm(variantPath(event, info.photo, size), { force: true })));
}

// ---------- Hintergrund: vorab erzeugen + verwaiste Vorschaubilder entfernen ----------

const failed = new Set();

async function warmEvent(event, list) {
  for (const photo of list) {
    for (const size of Object.keys(VARIANTS)) {
      const out = variantPath(event, photo, size);
      if (failed.has(out) || jobs.has(out) || await exists(out)) continue;
      schedule(out, () => render(photoPath(event, photo.name), out, size), 'low').catch((err) => {
        failed.add(out);
        console.warn(`Vorschau für ${event.slug}/${photo.name} nicht möglich: ${err.message}`);
      });
    }
  }
}

async function cleanEvent(event, list) {
  for (const size of Object.keys(VARIANTS)) {
    const dir = path.join(cacheRoot, event.slug, size);
    const files = await fs.readdir(dir).catch(() => []);
    if (!files.length) continue;
    const keep = new Set(list.map((p) => path.basename(variantPath(event, p, size))));
    for (const f of files) {
      if (keep.has(f) || jobs.has(path.join(dir, f.replace(/\.[0-9a-f]{8}\.tmp$/, '')))) continue;
      await fs.rm(path.join(dir, f), { force: true });
    }
  }
}

async function cleanRemovedEvents(events) {
  const known = new Set(events.map((e) => e.slug));
  for (const dir of await fs.readdir(cacheRoot).catch(() => [])) {
    if (known.has(dir)) continue;
    // Nur echte Cache-Ordner (enthalten ausschließlich thumb/preview) löschen – Schutz vor falsch gesetztem CACHE_ROOT.
    const inside = await fs.readdir(path.join(cacheRoot, dir)).catch(() => null);
    if (inside && inside.every((name) => name in VARIANTS)) await fs.rm(path.join(cacheRoot, dir), { recursive: true, force: true });
  }
}

/** Startet den periodischen Scan. Läuft unabhängig von Besuchern. */
export function startBackgroundWork() {
  let rounds = 0;
  const tick = async () => {
    try {
      const events = await loadEvents();
      const cleanup = rounds++ % 20 === 0; // ca. alle 10 Minuten
      if (cleanup) await cleanRemovedEvents(events);
      for (const event of events) {
        if (!PREGENERATE && !cleanup) break;
        const list = await listPhotos(event);
        if (PREGENERATE && !event.archived) await warmEvent(event, list);
        if (cleanup) await cleanEvent(event, list);
      }
    } catch (err) {
      console.warn('Hintergrund-Scan fehlgeschlagen:', err.message);
    }
    setTimeout(tick, SCAN_INTERVAL_MS).unref();
  };
  setTimeout(tick, 2000).unref();
}
