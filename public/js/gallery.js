// Galerie: Kacheln (Thumbnails), Nachladen beim Scrollen, Live-Aktualisierung, Lightbox.
const { slug, pageSize } = JSON.parse(document.getElementById('page-data').textContent);
const $ = (id) => document.getElementById(id);
const enc = encodeURIComponent;
const POLL_MS = 15000;

const els = {
  gallery: $('gallery'), count: $('count'), sort: $('sort'), refresh: $('refresh'), empty: $('empty'),
  more: $('more'), moreBtn: $('more-btn'), lightbox: $('lightbox'), img: $('lb-img'), counter: $('lb-counter'),
  meta: $('lb-meta'), download: $('lb-download'), share: $('lb-share'), stage: $('lb-stage'),
};

let photos = [];
let signature = '';
let shown = 0;
let current = null; // Dateiname des Fotos in der Lightbox
let firstLoad = true;
const tiles = new Map();
const known = new Set();

const keyOf = (p) => `${p.name}@${p.v}`;
const urlOf = (kind, p) => `/${kind}/${enc(slug)}/${enc(p.name)}?v=${p.v}`;
const indexOf = (name) => photos.findIndex((p) => p.name === name);
const formatSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.round(b / 1024)} KB`);
const formatDate = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

async function load() {
  try {
    const res = await fetch(`/api/${enc(slug)}/photos`, { cache: 'no-cache' });
    if (res.status === 401) return location.reload();
    if (!res.ok) return;
    const list = (await res.json()).photos || [];
    const sig = list.map(keyOf).join('|');
    if (sig === signature) return;
    signature = sig;
    photos = list;
    sortPhotos();
    render(Math.max(shown, pageSize));
    firstLoad = false;
  } catch (err) {
    console.warn('Fotos konnten nicht geladen werden', err);
  }
}

function sortPhotos() {
  const oldest = els.sort.value === 'oldest';
  photos.sort((a, b) => (oldest ? a.v - b.v : b.v - a.v));
}

function tile(p) {
  const key = keyOf(p);
  let el = tiles.get(key);
  if (el) return el;
  el = document.createElement('button');
  el.type = 'button';
  el.className = 'tile';
  el.setAttribute('aria-label', `Foto vom ${formatDate(p.modified)} öffnen`);
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = '';
  img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
  img.src = urlOf('thumb', p);
  el.append(img);
  if (!firstLoad && !known.has(p.name)) el.classList.add('is-new');
  known.add(p.name);
  el.addEventListener('click', () => open(indexOf(p.name)));
  tiles.set(key, el);
  return el;
}

function render(count) {
  shown = Math.min(count, photos.length);
  els.gallery.replaceChildren(...photos.slice(0, shown).map(tile));
  const keep = new Set(photos.map(keyOf));
  for (const key of tiles.keys()) if (!keep.has(key)) tiles.delete(key);
  els.count.textContent = `${photos.length} ${photos.length === 1 ? 'Foto' : 'Fotos'}`;
  els.empty.hidden = photos.length !== 0;
  updateMore();
  if (els.lightbox.open && current) updateMeta();
}

function loadMore() {
  if (shown >= photos.length) return;
  const end = Math.min(shown + pageSize, photos.length);
  els.gallery.append(...photos.slice(shown, end).map(tile));
  shown = end;
  updateMore();
}

// Sobald der "Mehr"-Bereich in die Nähe kommt, nachladen. Neu beobachten, damit es auch bei großen Bildschirmen weiterläuft.
const observer = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); }, { rootMargin: '1200px 0px' })
  : null;

function updateMore() {
  els.more.hidden = shown >= photos.length;
  if (!observer) return;
  observer.unobserve(els.more);
  if (!els.more.hidden) observer.observe(els.more);
}

// ---------- Lightbox ----------

function open(i) {
  if (i < 0 || !photos.length) return;
  show(i);
  if (!els.lightbox.open) els.lightbox.showModal();
}

function show(i) {
  const idx = (i + photos.length) % photos.length;
  const p = photos[idx];
  current = p.name;
  els.img.classList.add('is-loading');
  els.img.onload = els.img.onerror = () => els.img.classList.remove('is-loading');
  els.img.src = urlOf('preview', p);
  els.download.href = `/download/${enc(slug)}/${enc(p.name)}`;
  els.download.setAttribute('download', p.name);
  updateMeta();
  // Nachbarn vorladen, damit Blättern sofort geht
  for (const j of [idx + 1, idx - 1]) {
    const n = photos[(j + photos.length) % photos.length];
    if (n && n !== p) new Image().src = urlOf('preview', n);
  }
}

function updateMeta() {
  const idx = indexOf(current);
  if (idx < 0) return;
  const p = photos[idx];
  els.counter.textContent = `${idx + 1} / ${photos.length}`;
  els.meta.textContent = `${formatDate(p.modified)} · ${formatSize(p.size)}`;
}

const step = (d) => { const i = indexOf(current); if (i >= 0) show(i + d); };

async function share() {
  const p = photos[indexOf(current)];
  if (!p) return;
  try {
    const blob = await (await fetch(`/download/${enc(slug)}/${enc(p.name)}`)).blob();
    const file = new File([blob], p.name, { type: blob.type || 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('Teilen fehlgeschlagen', err);
  }
}

if (navigator.canShare?.({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] })) els.share.hidden = false;

$('lb-prev').addEventListener('click', () => step(-1));
$('lb-next').addEventListener('click', () => step(1));
$('lb-close').addEventListener('click', () => els.lightbox.close());
els.share.addEventListener('click', share);
els.lightbox.addEventListener('close', () => { current = null; els.img.removeAttribute('src'); });
els.lightbox.addEventListener('click', (e) => { if (e.target === els.lightbox || e.target === els.stage) els.lightbox.close(); });
document.addEventListener('keydown', (e) => {
  if (!els.lightbox.open) return;
  if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
});

let touchX = null;
els.stage.addEventListener('touchstart', (e) => { touchX = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
els.stage.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
});

// ---------- Steuerung ----------

els.sort.addEventListener('change', () => { sortPhotos(); render(Math.max(shown, pageSize)); });
els.refresh.addEventListener('click', () => { signature = ''; load(); });
els.moreBtn.addEventListener('click', loadMore);
setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
load();
