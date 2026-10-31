import { Router } from 'express';
import yazl from 'yazl';
import { cleanFileName, listPhotos, photoPath, sendImage } from '../images.js';
import { isAdmin, isUnlocked, requireAdmin, requireEvent } from '../security.js';
import { findEvent } from '../store.js';

const router = Router();

// Bilderliste für die Galerie (wird alle 15 s abgefragt; Express setzt ein ETag → 304 ohne Inhalt)
router.get('/api/:slug/photos', requireEvent, async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-cache');
  res.json({ title: req.event.title, slug: req.event.slug, photos: await listPhotos(req.event) });
});

// Vorschaubilder: Gäste mit freigeschaltetem Event oder Admin (auch für archivierte Events)
for (const size of ['thumb', 'preview']) {
  router.get(`/${size}/:slug/:file`, async (req, res) => {
    const event = await findEvent(req.params.slug);
    if (!event) return res.sendStatus(404);
    if (!isAdmin(req) && !isUnlocked(req, event)) return res.sendStatus(401);
    await sendImage(req, res, event, req.params.file, size);
  });
}

router.get('/media/:slug/:file', requireEvent, (req, res) => sendImage(req, res, req.event, req.params.file));
router.get('/admin-media/:slug/:file', requireAdmin, async (req, res) => sendImage(req, res, await findEvent(req.params.slug), req.params.file));

router.get('/download/:slug.zip', requireEvent, async (req, res) => {
  const event = req.event;
  if (!event.allowZipDownload) return res.sendStatus(403);
  const photos = await listPhotos(event);
  const zip = new yazl.ZipFile();
  res.attachment(`${event.slug}.zip`);
  res.setHeader('Cache-Control', 'no-store');
  zip.outputStream.on('error', (err) => { console.error('ZIP:', err.message); res.destroy(err); });
  zip.on('error', (err) => { console.error('ZIP:', err.message); res.destroy(err); });
  res.on('close', () => { if (!res.writableFinished) zip.outputStream.destroy(); });
  zip.outputStream.pipe(res);
  // Fotos sind bereits komprimiert → speichern statt erneut zu komprimieren (spart viel CPU)
  for (const p of photos) zip.addFile(photoPath(event, p.name), p.name, { compress: false, mtime: new Date(p.modified) });
  zip.end();
});

router.get('/download/:slug/:file', requireEvent, (req, res) => {
  const file = cleanFileName(req.params.file);
  const full = file && photoPath(req.event, file);
  if (!full) return res.sendStatus(404);
  res.download(full, file, { dotfiles: 'allow' }, (err) => { if (err && !res.headersSent) res.sendStatus(404); });
});

// Öffentlich: nur das jeweils neueste Bild, wenn im Event erlaubt
async function publicLatest(req) {
  const event = await findEvent(req.params.slug);
  if (!event || event.archived || !event.publicLatest) return {};
  return { event, latest: (await listPhotos(event))[0] };
}

router.get('/public-media/:slug/:file', async (req, res) => {
  const { event, latest } = await publicLatest(req);
  if (!event) return res.sendStatus(404);
  if (!latest || latest.name !== req.params.file) return res.sendStatus(403);
  await sendImage(req, res, event, latest.name, 'preview');
});

router.get('/public-download/:slug/latest', async (req, res) => {
  const { event, latest } = await publicLatest(req);
  if (!event || !latest) return res.sendStatus(404);
  res.download(photoPath(event, latest.name), latest.name, { dotfiles: 'allow' });
});

export default router;
