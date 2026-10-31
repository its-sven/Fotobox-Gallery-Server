import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import { finalSlug, slugProblem } from '../../public/js/slug.js';
import { ADMIN_ENABLED, EVENTS_ROOT, FAVICON_FILE, PUBLIC_BASE_URL, RESERVED } from '../config.js';
import { cleanFileName, dropVariants, forgetPhotoList, listPhotos, photoPath } from '../images.js';
import { LIMITS, adminKey, checkAdminPassword, clearFailures, lockedMinutes, recordFailure, requireAdmin } from '../security.js';
import { createEvent, findEvent, loadEvents, loadSettings, saveSettings, updateEvent } from '../store.js';
import { dashboardPage, editPage, loginPage, photosPage, qrPage } from '../views/admin.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 } });
const seg = encodeURIComponent;

/** Basis-URL für Links/QR-Codes: PUBLIC_BASE_URL oder die aufgerufene Domain (hinter dem Proxy). */
const baseUrl = (req) => PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
const exists = (file) => fs.access(file).then(() => true, () => false);

const FLASH = {
  settings: { settings: 'Einstellungen gespeichert.' },
  favicon: { favicon: 'Favicon wurde hochgeladen.' },
  faviconDeleted: { favicon: 'Favicon wurde entfernt.' },
  faviconError: { faviconError: 'Bitte eine gültige .ico-Datei bis maximal 1 MB hochladen.' },
};

async function renderDashboard(req, res, { form = {}, createError = '' } = {}) {
  const events = await loadEvents();
  const withStats = await Promise.all(events.map(async (e) => {
    const photos = await listPhotos(e).catch(() => []);
    return { ...e, photoCount: photos.length, lastPhoto: photos[0]?.modified };
  }));
  res.status(createError ? 400 : 200).send(dashboardPage({
    settings: await loadSettings(),
    events: withStats,
    base: baseUrl(req),
    form: { title: '', slug: '', accessMode: 'pin', pin: '', publicLatest: false, allowZipDownload: true, ...form },
    createError,
    created: createError ? '' : String(req.query.created || ''),
    flash: FLASH[req.query.done] || {},
    hasFavicon: await exists(FAVICON_FILE),
    reserved: [...RESERVED],
  }));
}

router.get('/Admin', async (req, res) => {
  if (req.session?.admin) return renderDashboard(req, res);
  const minutes = lockedMinutes(adminKey(req));
  const error = minutes ? `Zu viele Fehlversuche. Bitte in ${minutes} Min. erneut versuchen.` : req.query.error ? 'Passwort falsch.' : '';
  res.send(loginPage({ error, disabled: !ADMIN_ENABLED }));
});

router.post('/Admin/login', (req, res, next) => {
  const key = adminKey(req);
  if (lockedMinutes(key)) return res.redirect('/Admin');
  if (!checkAdminPassword(req.body.password || '')) {
    if (ADMIN_ENABLED) recordFailure(key, LIMITS.admin);
    return res.redirect('/Admin?error=1');
  }
  clearFailures(key);
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.admin = true;
    res.redirect('/Admin');
  });
});

router.post('/Admin/logout', (req, res) => req.session.destroy(() => res.redirect('/Admin')));

// Ab hier nur noch für eingeloggte Admins
router.use('/Admin', requireAdmin);

router.post('/Admin/settings', async (req, res) => {
  const current = await loadSettings();
  await saveSettings({
    siteEyebrow: String(req.body.siteEyebrow || '').trim().slice(0, 60) || current.siteEyebrow,
    siteTitle: String(req.body.siteTitle || '').trim().slice(0, 120) || current.siteTitle,
  });
  res.redirect('/Admin?done=settings#settings');
});

router.post('/Admin/favicon', (req, res, next) => upload.single('favicon')(req, res, (err) => (err ? res.redirect('/Admin?done=faviconError#settings') : next())), async (req, res) => {
  const name = String(req.file?.originalname || '').toLowerCase();
  const type = String(req.file?.mimetype || '').toLowerCase();
  if (!req.file || !(name.endsWith('.ico') || type === 'image/x-icon' || type === 'image/vnd.microsoft.icon')) {
    return res.redirect('/Admin?done=faviconError#settings');
  }
  await fs.writeFile(FAVICON_FILE, req.file.buffer);
  res.redirect('/Admin?done=favicon#settings');
});

router.post('/Admin/favicon/delete', async (req, res) => {
  await fs.rm(FAVICON_FILE, { force: true });
  res.redirect('/Admin?done=faviconDeleted#settings');
});

router.post('/Admin/events', async (req, res) => {
  const form = {
    title: String(req.body.title || '').trim().slice(0, 120),
    slug: finalSlug(req.body.slug),
    accessMode: req.body.accessMode === 'none' ? 'none' : 'pin',
    pin: String(req.body.pin || '').trim(),
    publicLatest: req.body.publicLatest === '1',
    allowZipDownload: req.body.allowZipDownload === '1',
  };
  if (!form.title) return renderDashboard(req, res, { form, createError: 'Bitte einen Anzeigenamen eingeben.' });
  if (form.accessMode === 'pin' && !form.pin) return renderDashboard(req, res, { form, createError: 'Bitte einen PIN eingeben oder „Ohne PIN“ wählen.' });
  const event = {
    slug: form.slug,
    title: form.title,
    folder: path.join(EVENTS_ROOT, form.slug),
    accessMode: form.accessMode,
    pinHash: form.accessMode === 'pin' ? await bcrypt.hash(form.pin, 10) : null,
    publicLatest: form.publicLatest,
    allowZipDownload: form.allowZipDownload,
    archived: false,
    createdAt: new Date().toISOString(),
  };
  const result = await createEvent(event, (events) => slugProblem(form.slug, new Set(events.map((e) => e.slug.toLowerCase())), RESERVED));
  if (result.error) return renderDashboard(req, res, { form, createError: result.error });
  res.redirect(`/Admin?created=${seg(event.slug)}#create`);
});

async function loadEventOr404(req, res) {
  const event = await findEvent(req.params.slug);
  if (!event) res.redirect('/Admin');
  return event;
}

router.get('/Admin/events/:slug/edit', async (req, res) => {
  const event = await loadEventOr404(req, res);
  if (event) res.send(editPage({ event, saved: req.query.saved, error: req.query.error ? 'Für „Mit PIN“ muss ein PIN gesetzt werden.' : '' }));
});

router.post('/Admin/events/:slug/edit', async (req, res) => {
  const event = await loadEventOr404(req, res);
  if (!event) return;
  const accessMode = req.body.accessMode === 'none' ? 'none' : 'pin';
  const pin = String(req.body.pin || '').trim();
  const target = `/Admin/events/${seg(event.slug)}/edit`;
  if (accessMode === 'pin' && !pin && !event.pinHash) return res.redirect(`${target}?error=1`);
  const pinHash = accessMode === 'none' ? null : pin ? await bcrypt.hash(pin, 10) : event.pinHash;
  await updateEvent(event.slug, (e) => ({
    ...e,
    title: String(req.body.title || '').trim().slice(0, 120) || e.title,
    accessMode,
    pinHash,
    publicLatest: req.body.publicLatest === '1',
    allowZipDownload: req.body.allowZipDownload === '1',
    archived: req.body.archived === '1',
  }));
  res.redirect(`${target}?saved=1`);
});

router.post('/Admin/events/:slug/toggle-archive', async (req, res) => {
  const event = await loadEventOr404(req, res);
  if (!event) return;
  await updateEvent(event.slug, (e) => ({ ...e, archived: !e.archived }));
  res.redirect('/Admin');
});

router.get('/Admin/events/:slug/photos', async (req, res) => {
  const event = await loadEventOr404(req, res);
  if (event) res.send(photosPage({ event, photos: await listPhotos(event) }));
});

router.post('/Admin/events/:slug/photos/delete', async (req, res) => {
  const event = await findEvent(req.params.slug);
  const file = event && cleanFileName(req.body.file);
  const full = file && photoPath(event, file);
  let ok = false;
  if (full && await exists(full)) {
    await dropVariants(event, file);
    await fs.unlink(full);
    forgetPhotoList(event);
    ok = true;
  }
  if (req.accepts(['html', 'json']) === 'json') return res.status(ok ? 200 : 404).json({ ok });
  res.redirect(`/Admin/events/${seg(req.params.slug)}/photos`);
});

router.get('/Admin/events/:slug/qr', async (req, res) => {
  const event = await loadEventOr404(req, res);
  if (event) res.send(qrPage({ event, url: `${baseUrl(req)}/${event.slug}` }));
});

router.get('/Admin/events/:slug/qr.:format', async (req, res) => {
  const event = await findEvent(req.params.slug);
  if (!event || !['svg', 'png'].includes(req.params.format)) return res.sendStatus(404);
  const url = `${baseUrl(req)}/${event.slug}`;
  if (req.params.format === 'svg') return res.type('image/svg+xml').send(await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' }));
  res.type('png').send(await QRCode.toBuffer(url, { type: 'png', width: 1200, margin: 2, errorCorrectionLevel: 'M' }));
});

export default router;
