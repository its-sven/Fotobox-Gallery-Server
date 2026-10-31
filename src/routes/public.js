import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { listPhotos } from '../images.js';
import { LIMITS, clearFailures, isUnlocked, lock, lockedMinutes, pinKey, recordFailure, unlock } from '../security.js';
import { findEvent, loadEvents, loadSettings } from '../store.js';
import { galleryPage, homePage, latestPage, messagePage, pinPage } from '../views/public.js';

const router = Router();
const seg = encodeURIComponent;

router.get('/', async (req, res) => {
  res.send(homePage({ settings: await loadSettings(), events: await loadEvents() }));
});

function pinError(req, event) {
  const minutes = lockedMinutes(pinKey(req, event));
  if (minutes) return `Zu viele Fehlversuche. Bitte in ${minutes} Min. erneut versuchen.`;
  return req.query.error ? 'Der PIN stimmt leider nicht.' : '';
}

const closed = () => messagePage({ title: 'Geschlossen', heading: 'Galerie nicht verfügbar', text: 'Diese Fotobox-Galerie ist archiviert oder existiert nicht.' });

router.post('/:slug/login', async (req, res) => {
  const event = await findEvent(req.params.slug);
  if (!event || event.archived) return res.status(404).send(closed());
  const target = `/${seg(event.slug)}`;
  if (event.accessMode === 'none') return res.redirect(target);
  const key = pinKey(req, event);
  if (lockedMinutes(key)) return res.redirect(target);
  const ok = await bcrypt.compare(String(req.body.pin || '').trim(), event.pinHash || '');
  if (!ok) {
    recordFailure(key, LIMITS.pin);
    return res.redirect(`${target}?error=1`);
  }
  clearFailures(key);
  unlock(req, event);
  res.redirect(target);
});

router.post('/:slug/logout', (req, res) => {
  lock(req, req.params.slug);
  res.redirect(`/${seg(req.params.slug)}`);
});

router.get('/:slug', async (req, res) => {
  const event = await findEvent(req.params.slug);
  if (!event || event.archived) return res.status(404).send(closed());
  const settings = await loadSettings();
  if (isUnlocked(req, event)) return res.send(galleryPage({ settings, event }));
  const error = pinError(req, event);
  if (event.publicLatest) return res.send(latestPage({ settings, event, latest: (await listPhotos(event))[0], error }));
  res.send(pinPage({ settings, event, error }));
});

export default router;
