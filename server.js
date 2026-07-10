const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const archiver = require('archiver');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_ROOT = process.env.DATA_ROOT || '/opt/fotobox';
const EVENTS_ROOT = process.env.EVENTS_ROOT || path.join(DATA_ROOT, 'events');
const CONFIG_ROOT = process.env.CONFIG_ROOT || path.join(DATA_ROOT, 'config');
const EVENTS_FILE = path.join(CONFIG_ROOT, 'events.json');
const SETTINGS_FILE = path.join(CONFIG_ROOT, 'settings.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CHANGE_ME_NOW';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DEFAULT_SITE_EYEBROW = process.env.SITE_EYEBROW || 'Fotobox';
const DEFAULT_SITE_TITLE = process.env.SITE_TITLE || 'Fotobox Galerie';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
const CREDIT_NAME = process.env.CREDIT_NAME || 'Sven Würth';
const CREDIT_URL = process.env.CREDIT_URL || 'https://svenw.de';
const IMAGE_EXT = new Set(['.jpg','.jpeg','.png','.webp','.gif','.bmp','.avif']);

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(session({
  name: 'fotobox.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true', maxAge: 1000*60*60*12 }
}));

async function ensureStorage(){
  await fsp.mkdir(EVENTS_ROOT, { recursive: true });
  await fsp.mkdir(CONFIG_ROOT, { recursive: true });
  if(!fs.existsSync(EVENTS_FILE)) await fsp.writeFile(EVENTS_FILE, JSON.stringify({ events: [] }, null, 2));
  if(!fs.existsSync(SETTINGS_FILE)) await fsp.writeFile(SETTINGS_FILE, JSON.stringify({ siteEyebrow: DEFAULT_SITE_EYEBROW, siteTitle: DEFAULT_SITE_TITLE }, null, 2));
}
async function loadSettings(){
  await ensureStorage();
  const s = JSON.parse(await fsp.readFile(SETTINGS_FILE, 'utf8'));
  return { siteEyebrow: s.siteEyebrow || DEFAULT_SITE_EYEBROW, siteTitle: s.siteTitle || DEFAULT_SITE_TITLE };
}
async function saveSettings(settings){ await fsp.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2)); }
async function loadEvents(){
  await ensureStorage();
  const data = JSON.parse(await fsp.readFile(EVENTS_FILE, 'utf8'));
  data.events = (data.events || []).map(e => ({ allowZipDownload: true, publicLatest: false, accessMode: e.pinHash ? 'pin' : 'none', archived: false, ...e }));
  return data;
}
async function saveEvents(data){ await fsp.writeFile(EVENTS_FILE, JSON.stringify(data, null, 2)); }
function normalizeSlug(input){
  const s = String(input || '').trim().replace(/\s+/g, '-');
  if(!/^[A-Za-z0-9_-]{2,80}$/.test(s)) return null;
  if(['Admin','admin','api','media','download','assets','favicon.ico'].includes(s)) return null;
  return s;
}
function safeFileName(name){
  const decoded = decodeURIComponent(String(name || ''));
  if(decoded.includes('/') || decoded.includes('\\') || decoded.includes('..')) return null;
  return decoded;
}
function isAdmin(req){ return req.session && req.session.admin === true; }
function requireAdmin(req,res,next){ if(isAdmin(req)) return next(); res.redirect('/Admin'); }
function isEventUnlocked(req, event){
  if(!event) return false;
  if(event.accessMode === 'none') return true;
  return req.session && req.session.events && req.session.events[event.slug] === true;
}
function requireEvent(req,res,next){
  findEvent(req.params.slug).then(event => {
    if(event && !event.archived && isEventUnlocked(req, event)) return next();
    res.status(401).json({ error: 'PIN erforderlich' });
  }).catch(next);
}
async function findEvent(slug){
  const data = await loadEvents();
  return data.events.find(e => e.slug.toLowerCase() === String(slug).toLowerCase());
}
async function updateEvent(slug, updater){
  const data = await loadEvents();
  const idx = data.events.findIndex(e => e.slug === slug);
  if(idx === -1) return null;
  data.events[idx] = await updater(data.events[idx]);
  await saveEvents(data);
  return data.events[idx];
}
async function listPhotos(event){
  const dir = event.folder;
  await fsp.mkdir(dir, { recursive: true });
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const photos = [];
  for(const ent of entries){
    if(!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if(!IMAGE_EXT.has(ext)) continue;
    const p = path.join(dir, ent.name);
    const st = await fsp.stat(p);
    photos.push({ name: ent.name, size: st.size, modified: st.mtime.toISOString() });
  }
  photos.sort((a,b)=> new Date(b.modified) - new Date(a.modified));
  return photos;
}
function photoPath(event, file){
  const full = path.resolve(path.join(event.folder, file));
  const root = path.resolve(event.folder);
  if(!full.startsWith(root + path.sep)) return null;
  return full;
}
function credit(){ return `<div class="credit">In Unterstützung und mit ❤️ von <a href="${escapeHtml(CREDIT_URL)}" target="_blank" rel="noopener">${escapeHtml(CREDIT_NAME)}</a></div>`; }
function htmlPage(title, body, extraHead=''){
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#111827"><link rel="icon" href="/favicon.ico"><title>${escapeHtml(title)}</title><style>${css()}</style>${extraHead}</head><body>${body}</body></html>`;
}
function escapeHtml(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function eventStatus(e){
  if(e.archived) return 'Archiviert/geschlossen';
  const access = e.accessMode === 'none' ? 'Ohne PIN' : 'Mit PIN';
  const latest = e.publicLatest ? ' · Neuestes Bild öffentlich' : '';
  return access + latest;
}
function css(){ return `:root{--bg:#0f172a;--ink:#111827;--muted:#64748b;--line:#e5e7eb;--card:#fff;--accent:#f59e0b;--green:#22c55e;--red:#ef4444}*{box-sizing:border-box}html,body{min-height:100%}body{margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#f3f4f6;color:var(--ink)}a{color:inherit}button,.btn,input,select{font:inherit}.wrap{min-height:100svh;display:flex;flex-direction:column}.hero{background:linear-gradient(135deg,#0f172a,#111827);color:white;padding:28px clamp(18px,5vw,64px);display:flex;justify-content:space-between;gap:20px;align-items:flex-end}.hero h1{font-size:clamp(2.1rem,7vw,4.4rem);line-height:.95;margin:0}.hero p{color:#cbd5e1;margin:.7rem 0 0}.pill{display:inline-block;color:#fbbf24;text-transform:uppercase;letter-spacing:.12em;font-weight:900;font-size:.82rem}.actions{display:flex;gap:10px;flex-wrap:wrap}.btn,button{border:0;border-radius:14px;padding:.82rem 1rem;background:#111827;color:#fff;text-decoration:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}.btn.secondary,button.secondary{background:#fff;color:#111827;border:1px solid var(--line)}.btn.ghost,button.ghost{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25)}.btn.danger,button.danger{background:var(--red)}.download-all{font-weight:900;background:#0f172a;box-shadow:0 10px 24px rgba(15,23,42,.18)}.panel{width:min(520px,calc(100vw - 32px));margin:8vh auto 24px;padding:28px;background:white;border-radius:28px;box-shadow:0 18px 54px rgba(15,23,42,.16)}.panel h1{margin-top:0;font-size:clamp(2rem,8vw,3.4rem)}label{font-weight:800;display:block;margin:14px 0 7px}.checklabel{display:flex;gap:10px;align-items:flex-start;font-weight:700}.checklabel input{width:auto;margin-top:4px}input,select{width:100%;border:1px solid var(--line);border-radius:14px;padding:.9rem;background:white;color:#111827}.error{background:#fee2e2;color:#991b1b;padding:12px 14px;border-radius:14px}.ok{background:#dcfce7;color:#166534;padding:12px 14px;border-radius:14px}.toolbar{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.94);backdrop-filter:blur(14px);border-bottom:1px solid var(--line);padding:14px clamp(18px,5vw,64px);display:grid;grid-template-columns:1fr auto auto;gap:10px}.toolbar select{max-width:210px}.status{padding:12px clamp(18px,5vw,64px);display:flex;justify-content:space-between;gap:16px;color:var(--muted)}.gallery{padding:10px clamp(18px,5vw,64px) 56px;display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px}.tile{position:relative;border:0;padding:0;aspect-ratio:1/1;overflow:hidden;border-radius:22px;background:#e2e8f0;box-shadow:0 8px 24px rgba(15,23,42,.1);color:white}.tile img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .22s ease}.tile:hover img{transform:scale(1.04)}.empty{text-align:center;border:2px dashed #cbd5e1;border-radius:26px;margin:24px clamp(18px,5vw,64px);padding:50px 20px;background:white;color:var(--muted)}dialog{border:0;padding:0}.lightbox{width:min(1120px,96vw);height:min(860px,94svh);max-width:none;max-height:none;background:#050505;color:white;border-radius:20px;overflow:hidden}.lightbox::backdrop{background:rgba(0,0,0,.78)}.lightbox-inner{height:100%;display:grid;grid-template-rows:1fr auto}.lightbox-stage{position:relative;min-height:0;display:flex;align-items:center;justify-content:center;padding:56px 14px 14px}.lightbox img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block}.icon{position:absolute;border-radius:999px;background:rgba(255,255,255,.17);width:48px;height:48px;padding:0;font-size:32px;z-index:3}.close{top:12px;right:12px}.prev,.next{top:50%;transform:translateY(-50%)}.prev{left:12px}.next{right:12px}.footerbar{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:12px 14px;background:#050505;border-top:1px solid rgba(255,255,255,.1);min-height:70px}.footerbar .meta{min-width:0;color:#cbd5e1;font-size:.92rem}.footerbar .btn{flex:0 0 auto;white-space:nowrap}.admin{padding:24px clamp(18px,5vw,64px);display:grid;gap:20px;flex:1}.card{background:white;border:1px solid var(--line);border-radius:24px;padding:20px;box-shadow:0 8px 26px rgba(15,23,42,.08)}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}.eventrow{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border-top:1px solid var(--line);padding:14px 0}.adminphotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}.adminphoto{background:#f8fafc;border:1px solid var(--line);border-radius:18px;overflow:hidden}.adminphoto img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block}.adminphoto form{padding:10px}.muted{color:var(--muted)}code{background:#f1f5f9;border-radius:8px;padding:2px 6px}.latest{padding:24px clamp(18px,5vw,64px);display:grid;place-items:center;flex:1}.latest-card{width:min(940px,100%);background:white;border-radius:28px;box-shadow:0 12px 36px rgba(15,23,42,.12);overflow:hidden}.latest-card img{display:block;width:100%;max-height:72svh;object-fit:contain;background:#050505}.latest-actions{padding:16px;display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.credit{text-align:center;color:#94a3b8;font-size:.78rem;padding:18px}.credit a{color:#64748b;text-decoration:none}.credit a:hover{text-decoration:underline}@media(max-width:760px){.hero{display:block;padding:24px 18px}.hero h1{font-size:clamp(2.2rem,15vw,4rem)}.actions{margin-top:18px}.toolbar{grid-template-columns:1fr;padding:12px 14px}.toolbar select{max-width:100%}.gallery{grid-template-columns:repeat(2,1fr);gap:10px;padding-left:14px;padding-right:14px}.status{display:block;padding-left:14px;padding-right:14px}.grid2,.grid3,.eventrow{grid-template-columns:1fr}.footerbar{font-size:.85rem;align-items:stretch}.footerbar .btn{min-width:128px}.btn,button{width:100%}.icon{width:42px;height:42px}.panel{margin:24px auto}.lightbox{width:100vw;height:100svh;border-radius:0}.lightbox-stage{padding-top:58px}.latest{padding:16px}.latest-actions{display:grid}}`; }

app.get('/favicon.ico', async (req,res)=>{
  const custom = path.join(CONFIG_ROOT, 'favicon.ico');
  if(fs.existsSync(custom)) return res.sendFile(custom);
  res.status(204).end();
});

app.get('/', async (req,res)=>{
  const data = await loadEvents();
  const settings = await loadSettings();
  const items = data.events.filter(e => !e.archived).map(e => `<a class="btn secondary" href="/${encodeURIComponent(e.slug)}">${escapeHtml(e.title || e.slug)}</a>`).join('');
  res.send(htmlPage(settings.siteTitle, `<div class="wrap"><header class="hero"><div><span class="pill">${escapeHtml(settings.siteEyebrow)}</span><h1>${escapeHtml(settings.siteTitle)}</h1></div><div class="actions"><a class="btn ghost" href="/Admin">Admin</a></div></header><main class="admin"><section class="card"><h2>Galerien</h2>${items || '<p class="muted">Aktuell sind keine öffentlichen Galerien aktiv.</p>'}</section></main>${credit()}</div>`));
});

app.get('/Admin', async (req,res)=>{
  if(!isAdmin(req)) return res.send(htmlPage('Admin Login', `<div class="wrap"><main class="panel"><h1>Admin</h1><p class="muted">Melde dich an, um Fotobox-Links zu verwalten.</p>${req.query.error?'<p class="error">Passwort falsch.</p>':''}<form method="post" action="/Admin/login"><label>Admin-Passwort</label><input name="password" type="password" autocomplete="current-password" required autofocus><br><br><button type="submit">Einloggen</button></form></main>${credit()}</div>`));
  const data = await loadEvents();
  const settings = await loadSettings();
  const rows = data.events.map(e => `<div class="eventrow"><div><strong>${escapeHtml(e.title)}</strong><br><span class="muted">URL: <code>/${escapeHtml(e.slug)}</code> · Ordner: <code>${escapeHtml(e.folder)}</code><br>Status: ${escapeHtml(eventStatus(e))}</span></div><div class="actions"><a class="btn secondary" href="/${encodeURIComponent(e.slug)}" target="_blank">Öffnen</a><a class="btn secondary" href="/Admin/events/${encodeURIComponent(e.slug)}/photos">Bilder</a><a class="btn secondary" href="/Admin/events/${encodeURIComponent(e.slug)}/edit">Bearbeiten</a><form method="post" action="/Admin/events/${encodeURIComponent(e.slug)}/toggle-archive"><button>${e.archived ? 'Wieder öffnen' : 'Archivieren'}</button></form><form method="post" action="/Admin/events/${encodeURIComponent(e.slug)}/delete" onsubmit="return confirm('Galerie-Link wirklich löschen? Der Ordner und die Fotos bleiben erhalten.');"><button class="danger">Link löschen</button></form></div></div>`).join('');
  res.send(htmlPage('Admin', `<div class="wrap"><header class="hero"><div><span class="pill">Admin</span><h1>Fotobox Verwaltung</h1><p>Erstelle, ändere, schließe oder archiviere Galerien.</p></div><div class="actions"><a class="btn ghost" href="/">Startseite</a><form method="post" action="/Admin/logout"><button class="ghost">Logout</button></form></div></header><main class="admin"><section class="card"><h2>Globale Seiteneinstellungen</h2>${req.query.settings?'<p class="ok">Seiteneinstellungen gespeichert.</p>':''}<form method="post" action="/Admin/settings"><div class="grid2"><div><label>Kleine Überschrift</label><input name="siteEyebrow" value="${escapeHtml(settings.siteEyebrow)}" placeholder="Fotobox"></div><div><label>Großer Seitentitel</label><input name="siteTitle" value="${escapeHtml(settings.siteTitle)}" placeholder="Fotobox Galerie"></div></div><p class="muted">Favicon: Datei als <code>/opt/fotobox/config/favicon.ico</code> ablegen.</p><button>Speichern</button></form></section><section class="card"><h2>Neue Galerie erstellen</h2>${req.query.ok?'<p class="ok">Galerie wurde erstellt.</p>':''}${req.query.created?`<div class="ok"><strong>Link erstellt:</strong><br><input id="createdLink" readonly value="${escapeHtml(((PUBLIC_BASE_URL || '').replace(/\/$/, '') || '') + '/' + req.query.created)}"><br><br><button type="button" onclick="const i=document.getElementById('createdLink'); if(!i.value.startsWith('http')) i.value=window.location.origin+i.value; i.select(); navigator.clipboard.writeText(i.value); this.textContent='Link kopiert';">Link kopieren</button><script>if(!document.getElementById('createdLink').value.startsWith('http')) document.getElementById('createdLink').value=window.location.origin+document.getElementById('createdLink').value;</script></div>`:''}${req.query.error?'<p class="error">Eingaben ungültig oder URL-Name bereits vorhanden.</p>':''}<form method="post" action="/Admin/events"><div class="grid2"><div><label>Anzeigename</label><input name="title" placeholder="Sommerfest 2026" required></div><div><label>URL-Name</label><input name="slug" placeholder="Sommerfest2026" required></div></div><div class="grid2"><div><label>Zugriff auf komplette Galerie</label><select name="accessMode"><option value="pin">Mit PIN</option><option value="none">Ohne PIN</option></select></div><div><label>PIN, nur wenn ausgewählt</label><input name="pin" inputmode="numeric" placeholder="2580"></div></div><label class="checklabel"><input type="checkbox" name="publicLatest" value="1"><span>Neuestes Bild öffentlich ohne Galerie-PIN anzeigen</span></label><br><button type="submit">Galerie anlegen</button></form></section><section class="card"><h2>Bestehende Galerien</h2>${rows || '<p class="muted">Noch keine Galerien vorhanden.</p>'}</section></main>${credit()}</div>`));
});
app.post('/Admin/login', async (req,res)=>{
  if(String(req.body.password || '') === ADMIN_PASSWORD){ req.session.admin = true; return res.redirect('/Admin'); }
  res.redirect('/Admin?error=1');
});
app.post('/Admin/logout', (req,res)=> req.session.destroy(()=>res.redirect('/Admin')));
app.post('/Admin/settings', requireAdmin, async (req,res)=>{
  await saveSettings({ siteEyebrow: String(req.body.siteEyebrow || DEFAULT_SITE_EYEBROW).trim().slice(0,60), siteTitle: String(req.body.siteTitle || DEFAULT_SITE_TITLE).trim().slice(0,120) });
  res.redirect('/Admin?settings=1');
});
app.post('/Admin/events', requireAdmin, async (req,res)=>{
  const slug = normalizeSlug(req.body.slug);
  const title = String(req.body.title || '').trim().slice(0,120);
  const accessMode = req.body.accessMode === 'none' ? 'none' : 'pin';
  const pin = String(req.body.pin || '').trim();
  if(!slug || !title || (accessMode === 'pin' && !pin)) return res.redirect('/Admin?error=1');
  const data = await loadEvents();
  if(data.events.some(e => e.slug.toLowerCase() === slug.toLowerCase())) return res.redirect('/Admin?error=1');
  const folder = path.join(EVENTS_ROOT, slug);
  await fsp.mkdir(folder, { recursive: true });
  const pinHash = accessMode === 'pin' ? await bcrypt.hash(pin, 10) : null;
  data.events.push({ slug, title, pinHash, accessMode, folder, createdAt: new Date().toISOString(), allowZipDownload: true, publicLatest: req.body.publicLatest === '1', archived: false });
  await saveEvents(data);
  res.redirect('/Admin?ok=1&created=' + encodeURIComponent(slug));
});
app.get('/Admin/events/:slug/edit', requireAdmin, async (req,res)=>{
  const event = await findEvent(req.params.slug);
  if(!event) return res.redirect('/Admin');
  res.send(htmlPage('Galerie bearbeiten', `<div class="wrap"><header class="hero"><div><span class="pill">Admin</span><h1>Galerie bearbeiten</h1><p>${escapeHtml(event.title)}</p></div><div class="actions"><a class="btn ghost" href="/Admin">Zurück</a></div></header><main class="admin"><section class="card">${req.query.ok?'<p class="ok">Gespeichert.</p>':''}${req.query.error?'<p class="error">Bitte PIN setzen, wenn Zugriff mit PIN gewählt ist.</p>':''}<form method="post" action="/Admin/events/${encodeURIComponent(event.slug)}/edit"><div class="grid2"><div><label>Anzeigename</label><input name="title" value="${escapeHtml(event.title)}" required></div><div><label>URL-Name</label><input value="${escapeHtml(event.slug)}" disabled></div></div><div class="grid2"><div><label>Zugriff auf komplette Galerie</label><select name="accessMode"><option value="pin" ${event.accessMode==='pin'?'selected':''}>Mit PIN</option><option value="none" ${event.accessMode==='none'?'selected':''}>Ohne PIN</option></select></div><div><label>Neuen PIN setzen, optional</label><input name="pin" inputmode="numeric" placeholder="leer lassen = bisherigen PIN behalten"></div></div><label class="checklabel"><input type="checkbox" name="publicLatest" value="1" ${event.publicLatest?'checked':''}><span>Neuestes Bild öffentlich ohne Galerie-PIN anzeigen</span></label><label class="checklabel"><input type="checkbox" name="archived" value="1" ${event.archived?'checked':''}><span>Archiviert/geschlossen</span></label><br><button>Speichern</button></form></section></main>${credit()}</div>`));
});
app.post('/Admin/events/:slug/edit', requireAdmin, async (req,res)=>{
  const event = await findEvent(req.params.slug);
  if(!event) return res.redirect('/Admin');
  const accessMode = req.body.accessMode === 'none' ? 'none' : 'pin';
  const pin = String(req.body.pin || '').trim();
  if(accessMode === 'pin' && !pin && !event.pinHash) return res.redirect(`/Admin/events/${encodeURIComponent(event.slug)}/edit?error=1`);
  await updateEvent(event.slug, async e => ({ ...e, title: String(req.body.title || e.title).trim().slice(0,120), accessMode, pinHash: accessMode === 'none' ? null : (pin ? await bcrypt.hash(pin, 10) : e.pinHash), publicLatest: req.body.publicLatest === '1', archived: req.body.archived === '1' }));
  res.redirect(`/Admin/events/${encodeURIComponent(event.slug)}/edit?ok=1`);
});
app.post('/Admin/events/:slug/delete', requireAdmin, async (req,res)=>{
  const data = await loadEvents();
  data.events = data.events.filter(e => e.slug !== req.params.slug);
  await saveEvents(data);
  res.redirect('/Admin');
});
app.post('/Admin/events/:slug/toggle-archive', requireAdmin, async (req,res)=>{
  await updateEvent(req.params.slug, e => ({ ...e, archived: !e.archived }));
  res.redirect('/Admin');
});
app.get('/Admin/events/:slug/photos', requireAdmin, async (req,res)=>{
  const event = await findEvent(req.params.slug);
  if(!event) return res.redirect('/Admin');
  const photos = await listPhotos(event);
  const cells = photos.map(p => `<div class="adminphoto"><img src="/admin-media/${encodeURIComponent(event.slug)}/${encodeURIComponent(p.name)}" alt=""><form method="post" action="/Admin/events/${encodeURIComponent(event.slug)}/photos/delete" onsubmit="return confirm('Bild wirklich löschen?');"><input type="hidden" name="file" value="${escapeHtml(p.name)}"><button class="danger">Bild löschen</button></form></div>`).join('');
  res.send(htmlPage('Bilder verwalten', `<div class="wrap"><header class="hero"><div><span class="pill">Admin</span><h1>Bilder verwalten</h1><p>${escapeHtml(event.title)}</p></div><div class="actions"><a class="btn ghost" href="/Admin">Zurück</a></div></header><main class="admin"><section class="card"><h2>${photos.length} Bilder</h2>${photos.length ? `<div class="adminphotos">${cells}</div>` : '<p class="muted">Noch keine Bilder vorhanden.</p>'}</section></main>${credit()}</div>`));
});
app.get('/admin-media/:slug/:file', requireAdmin, async (req,res)=>{
  const event = await findEvent(req.params.slug);
  const file = safeFileName(req.params.file);
  if(!event || !file) return res.sendStatus(404);
  const full = photoPath(event, file);
  if(!full) return res.sendStatus(403);
  res.sendFile(full);
});
app.post('/Admin/events/:slug/photos/delete', requireAdmin, async (req,res)=>{
  const event = await findEvent(req.params.slug);
  const file = safeFileName(req.body.file);
  if(event && file){ const full = photoPath(event, file); if(full && fs.existsSync(full)) await fsp.unlink(full); }
  res.redirect(`/Admin/events/${encodeURIComponent(req.params.slug)}/photos`);
});

app.get('/api/:slug/photos', requireEvent, async (req,res)=>{
  const event = await findEvent(req.params.slug);
  if(!event || event.archived) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({ title: event.title, slug: event.slug, photos: await listPhotos(event) });
});
app.get('/media/:slug/:file', requireEvent, async (req,res)=>{
  const event = await findEvent(req.params.slug);
  const file = safeFileName(req.params.file);
  if(!event || event.archived || !file) return res.sendStatus(404);
  const full = photoPath(event, file);
  if(!full) return res.sendStatus(403);
  res.sendFile(full);
});
app.get('/public-media/:slug/:file', async (req,res)=>{
  const event = await findEvent(req.params.slug);
  const file = safeFileName(req.params.file);
  if(!event || event.archived || !event.publicLatest || !file) return res.sendStatus(404);
  const photos = await listPhotos(event);
  if(!photos[0] || photos[0].name !== file) return res.sendStatus(403);
  const full = photoPath(event, file);
  if(!full) return res.sendStatus(403);
  res.sendFile(full);
});
app.get('/public-download/:slug/latest', async (req,res)=>{
  const event = await findEvent(req.params.slug);
  if(!event || event.archived || !event.publicLatest) return res.sendStatus(404);
  const photos = await listPhotos(event);
  if(!photos[0]) return res.sendStatus(404);
  const full = photoPath(event, photos[0].name);
  if(!full) return res.sendStatus(403);
  res.download(full, photos[0].name);
});
app.get('/download/:slug/:file', requireEvent, async (req,res)=>{
  const event = await findEvent(req.params.slug);
  const file = safeFileName(req.params.file);
  if(!event || event.archived || !file) return res.sendStatus(404);
  const full = photoPath(event, file);
  if(!full) return res.sendStatus(403);
  res.download(full, file);
});
app.get('/download/:slug.zip', requireEvent, async (req,res)=>{
  const event = await findEvent(req.params.slug);
  if(!event || event.archived) return res.sendStatus(404);
  const photos = await listPhotos(event);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${event.slug}.zip"`);
  const zip = archiver('zip', { zlib: { level: 6 } });
  zip.on('error', err => { throw err; });
  zip.pipe(res);
  for(const p of photos) zip.file(path.join(event.folder, p.name), { name: p.name });
  zip.finalize();
});

app.post('/:slug/login', async (req,res)=>{
  const event = await findEvent(req.params.slug);
  if(!event || event.archived) return res.status(404).send('Galerie nicht gefunden');
  if(event.accessMode === 'none') return res.redirect(`/${encodeURIComponent(event.slug)}`);
  const ok = await bcrypt.compare(String(req.body.pin || '').trim(), event.pinHash || '');
  if(!ok) return res.redirect(`/${encodeURIComponent(event.slug)}?error=1`);
  req.session.events = req.session.events || {};
  req.session.events[event.slug] = true;
  res.redirect(`/${encodeURIComponent(event.slug)}`);
});
app.post('/:slug/logout', async (req,res)=>{
  if(req.session.events) delete req.session.events[req.params.slug];
  res.redirect(`/${encodeURIComponent(req.params.slug)}`);
});
app.get('/:slug', async (req,res)=>{
  const event = await findEvent(req.params.slug);
  if(!event || event.archived) return res.status(404).send(htmlPage('Geschlossen', `<div class="wrap"><main class="panel"><h1>Galerie geschlossen</h1><p>Diese Fotobox-Galerie ist archiviert oder nicht verfügbar.</p><a class="btn" href="/">Zur Startseite</a></main>${credit()}</div>`));
  if(!isEventUnlocked(req, event)){
    if(event.publicLatest) return renderPublicLatest(req,res,event);
    return res.send(htmlPage(event.title, `<div class="wrap"><main class="panel"><h1>${escapeHtml(event.title)}</h1><p class="muted">Gib den PIN ein, um die Fotos anzusehen und herunterzuladen.</p>${req.query.error?'<p class="error">Der PIN stimmt leider nicht.</p>':''}<form method="post" action="/${encodeURIComponent(event.slug)}/login"><label>PIN</label><input name="pin" inputmode="numeric" autocomplete="one-time-code" required autofocus><br><br><button>Galerie öffnen</button></form></main>${credit()}</div>`));
  }
  renderGallery(req,res,event);
});
async function renderPublicLatest(req,res,event){
  const photos = await listPhotos(event);
  const latest = photos[0];
  const img = latest ? `<img id="latestImg" src="/public-media/${encodeURIComponent(event.slug)}/${encodeURIComponent(latest.name)}" alt="Neuestes Bild">` : '<div class="empty"><h2>Noch kein Bild vorhanden</h2><p>Warte auf die Synchronisation.</p></div>';
  const pinForm = event.accessMode === 'pin' ? `<form method="post" action="/${encodeURIComponent(event.slug)}/login" class="actions"><input name="pin" inputmode="numeric" autocomplete="one-time-code" placeholder="PIN für alle Bilder" required><button>Alle Bilder öffnen</button></form>` : `<a class="btn" href="/${encodeURIComponent(event.slug)}">Alle Bilder öffnen</a>`;
  const dl = latest ? `<a class="btn secondary" href="/public-download/${encodeURIComponent(event.slug)}/latest">Dieses Bild herunterladen</a>` : '';
  res.send(htmlPage(event.title, `<div class="wrap"><header class="hero"><div><span class="pill">Fotobox</span><h1>${escapeHtml(event.title)}</h1></div></header><main class="latest"><section class="latest-card">${img}<div class="latest-actions"><span class="muted">Neuestes Bild${latest ? ' · ' + new Date(latest.modified).toLocaleString('de-DE') : ''}</span><div class="actions">${dl}${pinForm}</div></div></section></main>${req.query.error?'<main class="panel"><p class="error">Der PIN stimmt leider nicht.</p></main>':''}${credit()}<script>setTimeout(()=>location.reload(),15000)</script></div>`));
}
function renderGallery(req,res,event){
  const lockBtn = event.accessMode === 'pin' ? `<form method="post" action="/${encodeURIComponent(event.slug)}/logout"><button class="ghost">Sperren</button></form>` : '';
  res.send(htmlPage(event.title, `<div class="wrap"><header class="hero"><div><span class="pill">Fotobox</span><h1>${escapeHtml(event.title)}</h1></div><div class="actions">${lockBtn}</div></header><section class="toolbar"><select id="sort"><option value="newest">Neueste zuerst</option><option value="oldest">Älteste zuerst</option></select><button class="secondary" id="refresh">Aktualisieren</button><a class="btn download-all" href="/download/${encodeURIComponent(event.slug)}.zip">Alle Fotos herunterladen</a></section><section class="status"><span id="count">Lade Fotos…</span><span>Tippe ein Bild für die Vollansicht an.</span></section><main id="gallery" class="gallery"></main><section id="empty" class="empty" hidden><h2>Noch keine Fotos</h2><p>Lege Bilder in <code>${escapeHtml(event.folder)}</code> ab oder warte auf die Synchronisation.</p></section><dialog id="lightbox" class="lightbox"><div class="lightbox-inner"><div class="lightbox-stage"><button class="icon close" id="close">×</button><button class="icon prev" id="prev">‹</button><img id="big" alt=""><button class="icon next" id="next">›</button></div><footer class="footerbar"><div class="meta"><span id="bigMeta"></span></div><a id="bigDownload" class="btn secondary">Herunterladen</a></footer></div></dialog><script>${galleryJs(event.slug)}</script>${credit()}</div>`));
}
function galleryJs(slug){ return `const slug=${JSON.stringify(slug)};let photos=[],idx=0;const $=id=>document.getElementById(id);async function load(){const r=await fetch('/api/'+encodeURIComponent(slug)+'/photos',{cache:'no-store'});const d=await r.json();photos=d.photos||[];apply()}function apply(){const s=$('sort').value;photos.sort((a,b)=>s==='oldest'?new Date(a.modified)-new Date(b.modified):new Date(b.modified)-new Date(a.modified));render()}function render(){const g=$('gallery');g.innerHTML='';$('count').textContent=photos.length+' Foto'+(photos.length===1?'':'s')+' gefunden';$('empty').hidden=photos.length!==0;photos.forEach((p,i)=>{const b=document.createElement('button');b.className='tile';b.innerHTML='<img loading="lazy" src="/media/'+encodeURIComponent(slug)+'/'+encodeURIComponent(p.name)+'" alt="Foto">';b.onclick=()=>show(i);g.appendChild(b)})}function show(i){if(!photos.length)return;idx=(i+photos.length)%photos.length;const p=photos[idx];$('big').src='/media/'+encodeURIComponent(slug)+'/'+encodeURIComponent(p.name);$('bigMeta').textContent=new Date(p.modified).toLocaleString('de-DE')+' · '+Math.round(p.size/1024)+' KB';$('bigDownload').href='/download/'+encodeURIComponent(slug)+'/'+encodeURIComponent(p.name);$('bigDownload').download=p.name;if(!$('lightbox').open)$('lightbox').showModal()}$('refresh').onclick=load;$('sort').onchange=apply;$('close').onclick=()=>$('lightbox').close();$('prev').onclick=()=>show(idx-1);$('next').onclick=()=>show(idx+1);document.addEventListener('keydown',e=>{if(!$('lightbox').open)return;if(e.key==='ArrowLeft')show(idx-1);if(e.key==='ArrowRight')show(idx+1);if(e.key==='Escape')$('lightbox').close()});setInterval(load,15000);load();`; }

ensureStorage().then(()=>app.listen(PORT, ()=>console.log(`Fotobox Server laeuft auf Port ${PORT}`))).catch(err=>{ console.error(err); process.exit(1); });
