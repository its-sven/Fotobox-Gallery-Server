import { LIMITS } from '../security.js';
import { hero, html, icon, jsonData, notice, page, seg } from './layout.js';

const formatDate = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function adminHero(title, subtitle, actions) {
  return hero({ eyebrow: 'Admin', title, subtitle, actions });
}

const backButton = html`<a class="btn btn--ghost" href="/Admin">${icon('chevronLeft')}<span>Übersicht</span></a>`;

export function loginPage({ error, disabled }) {
  const body = html`
    <main class="center">
      <section class="card card--narrow">
        <span class="eyebrow">Admin</span>
        <h1 class="card__headline">Fotobox Verwaltung</h1>
        ${disabled
          ? notice('error', 'Der Admin-Login ist deaktiviert, weil ADMIN_PASSWORD nicht gesetzt ist (oder noch der Beispielwert). Bitte in der .env ein eigenes Passwort eintragen und den Container neu starten.')
          : html`${notice('error', error)}
            <form method="post" action="/Admin/login" class="stack">
              <label for="password">Passwort</label>
              <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
              <button class="btn btn--primary btn--block">Einloggen</button>
            </form>`}
      </section>
    </main>`;
  return page({ title: 'Admin', body });
}

function accessFields({ prefix, accessMode, pinRequired, pinLabel, pinPlaceholder, pinValue = '' }) {
  return html`
    <div class="grid2">
      <div class="field">
        <label for="${prefix}-access">Zugriff</label>
        <select id="${prefix}-access" name="accessMode" data-pin-toggle="${prefix}-pin-box" data-pin-required="${pinRequired}">
          <option value="pin" ${accessMode === 'pin' ? 'selected' : ''}>Mit PIN</option>
          <option value="none" ${accessMode === 'none' ? 'selected' : ''}>Ohne PIN (Link genügt)</option>
        </select>
      </div>
      <div class="field" id="${prefix}-pin-box">
        <label for="${prefix}-pin">${pinLabel}</label>
        <input id="${prefix}-pin" name="pin" inputmode="numeric" autocomplete="off" placeholder="${pinPlaceholder}" value="${pinValue}">
        <p class="hint">Gäste geben den PIN einmal ein; nach ${LIMITS.pin} Fehlversuchen wird für 15 Minuten gesperrt.</p>
      </div>
    </div>`;
}

function optionFields({ publicLatest, allowZipDownload, archived }) {
  return html`
    <div class="checks">
      <label class="check"><input type="checkbox" name="publicLatest" value="1" ${publicLatest ? 'checked' : ''}>
        <span><strong>Neuestes Bild öffentlich</strong><small>Ohne PIN sieht man das jeweils neueste Foto (z. B. für einen Bildschirm vor Ort).</small></span></label>
      <label class="check"><input type="checkbox" name="allowZipDownload" value="1" ${allowZipDownload ? 'checked' : ''}>
        <span><strong>„Alle herunterladen“ erlauben</strong><small>Gäste können alle Originale als ZIP laden.</small></span></label>
      ${archived === undefined ? '' : html`<label class="check"><input type="checkbox" name="archived" value="1" ${archived ? 'checked' : ''}>
        <span><strong>Archiviert</strong><small>Galerie ist geschlossen und erscheint nicht mehr auf der Startseite.</small></span></label>`}
    </div>`;
}

function createSection({ form, error, created, base }) {
  const createdBox = created ? html`
    <div class="notice notice--ok created">
      <strong>Galerie angelegt – Link für die Gäste:</strong>
      <div class="copy-row"><code>${base}/${created}</code>
        <button class="btn btn--sm" type="button" data-copy="${base}/${created}">${icon('copy')}<span>Kopieren</span></button>
        <a class="btn btn--sm" href="/Admin/events/${seg(created)}/qr">${icon('qr')}<span>QR-Code</span></a>
      </div>
    </div>` : '';
  return html`
    <section class="card" id="create">
      <h2 class="card__title">${icon('plus')} Neue Galerie</h2>
      ${createdBox}
      ${notice('error', error)}
      <form method="post" action="/Admin/events#create" id="create-form" class="stack">
        <div class="grid2">
          <div class="field">
            <label for="new-title">Anzeigename</label>
            <input id="new-title" name="title" required maxlength="120" placeholder="Sommerfest 2026" value="${form.title}">
            <p class="hint">Überschrift der Galerie – hier ist alles erlaubt.</p>
          </div>
          <div class="field">
            <label for="new-slug">URL-Name</label>
            <input id="new-slug" name="slug" required minlength="2" maxlength="80" pattern="[A-Za-z0-9_\\-]{2,80}"
              title="Nur A–Z, a–z, 0–9, - und _ (2–80 Zeichen)" autocomplete="off" autocapitalize="off" spellcheck="false"
              placeholder="Sommerfest-2026" value="${form.slug}">
            <p class="hint">Nur <strong>A–Z, a–z, 0–9, <code>-</code> und <code>_</code></strong> (2–80 Zeichen).
              Leerzeichen und Punkte werden automatisch zu <code>-</code>, Umlaute zu ae/oe/ue/ss, andere Zeichen entfernt.</p>
            <p class="hint hint--warn" id="slug-msg" hidden></p>
            <p class="hint">Link: <code id="slug-preview">${base}/${form.slug || '…'}</code></p>
          </div>
        </div>
        ${accessFields({ prefix: 'new', accessMode: form.accessMode, pinRequired: true, pinLabel: 'PIN', pinPlaceholder: 'z. B. 2580', pinValue: form.pin })}
        ${optionFields(form)}
        <div><button class="btn btn--primary">${icon('plus')}<span>Galerie anlegen</span></button></div>
      </form>
    </section>`;
}

function eventCard(e, base) {
  const url = `${base}/${e.slug}`;
  const badges = [
    e.archived ? html`<span class="badge badge--muted">${icon('archive')}Archiviert</span>` : html`<span class="badge badge--ok">Aktiv</span>`,
    e.accessMode === 'pin' ? html`<span class="badge">${icon('lock')}PIN</span>` : html`<span class="badge">Ohne PIN</span>`,
    e.publicLatest ? html`<span class="badge">Neuestes Bild öffentlich</span>` : '',
    e.allowZipDownload ? '' : html`<span class="badge badge--muted">ZIP aus</span>`,
  ];
  return html`
    <article class="event${e.archived ? ' event--archived' : ''}">
      <div class="event__main">
        <h3 class="event__title">${e.title}</h3>
        <div class="badges">${badges}</div>
        <div class="copy-row"><code>${url}</code>
          <button class="btn btn--sm btn--icon" type="button" data-copy="${url}" aria-label="Link kopieren" title="Link kopieren">${icon('copy')}</button></div>
        <p class="event__stats">${icon('image')} ${plural(e.photoCount, 'Foto', 'Fotos')}${e.lastPhoto ? ` · zuletzt ${formatDate(e.lastPhoto)}` : ''}</p>
      </div>
      <div class="event__actions">
        <a class="btn btn--sm" href="/${seg(e.slug)}" target="_blank" rel="noopener">${icon('external')}<span>Öffnen</span></a>
        <a class="btn btn--sm" href="/Admin/events/${seg(e.slug)}/photos">${icon('image')}<span>Bilder</span></a>
        <a class="btn btn--sm" href="/Admin/events/${seg(e.slug)}/qr">${icon('qr')}<span>QR-Code</span></a>
        <a class="btn btn--sm" href="/Admin/events/${seg(e.slug)}/edit">${icon('pencil')}<span>Bearbeiten</span></a>
        <form method="post" action="/Admin/events/${seg(e.slug)}/toggle-archive"
          ${e.archived ? '' : html`data-confirm="„${e.title}“ archivieren? Gäste können die Galerie dann nicht mehr öffnen."`}>
          <button class="btn btn--sm">${icon('archive')}<span>${e.archived ? 'Wieder öffnen' : 'Archivieren'}</span></button>
        </form>
      </div>
    </article>`;
}

function settingsSection({ settings, hasFavicon, flash }) {
  return html`
    <section class="card" id="settings">
      <h2 class="card__title">${icon('settings')} Einstellungen</h2>
      ${notice('ok', flash.settings)}
      <form method="post" action="/Admin/settings#settings" class="stack">
        <div class="grid2">
          <div class="field"><label for="eyebrow">Kleine Überschrift</label><input id="eyebrow" name="siteEyebrow" maxlength="60" value="${settings.siteEyebrow}"></div>
          <div class="field"><label for="site-title">Seitentitel</label><input id="site-title" name="siteTitle" maxlength="120" value="${settings.siteTitle}"></div>
        </div>
        <div><button class="btn btn--primary">Speichern</button></div>
      </form>
      <hr>
      <h3>Favicon</h3>
      ${notice('ok', flash.favicon)}${notice('error', flash.faviconError)}
      <div class="favicon">
        ${hasFavicon ? html`<img src="/favicon.ico?ts=${Date.now()}" alt="Aktuelles Favicon" width="48" height="48">` : html`<span class="muted">Noch kein Favicon hinterlegt.</span>`}
        <form method="post" action="/Admin/favicon#settings" enctype="multipart/form-data" class="inline-form">
          <input type="file" name="favicon" accept=".ico,image/x-icon,image/vnd.microsoft.icon" required aria-label="Favicon (.ico)">
          <button class="btn">Hochladen</button>
        </form>
        ${hasFavicon ? html`<form method="post" action="/Admin/favicon/delete#settings" data-confirm="Favicon entfernen?"><button class="btn btn--danger">${icon('trash')}<span>Entfernen</span></button></form>` : ''}
      </div>
    </section>`;
}

export function dashboardPage({ settings, events, base, form, createError, created, flash, hasFavicon, reserved }) {
  const active = events.filter((e) => !e.archived);
  const archived = events.filter((e) => e.archived);
  const body = html`
    ${adminHero('Fotobox Verwaltung', null, html`
      <a class="btn btn--ghost" href="/">${icon('home')}<span>Startseite</span></a>
      <form method="post" action="/Admin/logout"><button class="btn btn--ghost">${icon('logout')}<span>Logout</span></button></form>`)}
    <main class="container stack-lg">
      ${createSection({ form, error: createError, created, base })}
      <section class="card">
        <h2 class="card__title">${icon('camera')} Galerien <span class="muted">(${active.length})</span></h2>
        ${active.length ? html`<div class="events">${active.map((e) => eventCard(e, base))}</div>` : html`<p class="muted">Noch keine aktiven Galerien.</p>`}
        ${archived.length ? html`<details class="archived"><summary>Archiviert (${archived.length})</summary><div class="events">${archived.map((e) => eventCard(e, base))}</div></details>` : ''}
      </section>
      ${settingsSection({ settings, hasFavicon, flash })}
    </main>
    ${jsonData({ taken: events.map((e) => e.slug.toLowerCase()), reserved, base })}`;
  return page({ title: 'Admin', body, scripts: ['admin.js'] });
}

export function editPage({ event, saved, error }) {
  const body = html`
    ${adminHero('Galerie bearbeiten', event.title, backButton)}
    <main class="container container--narrow">
      <section class="card">
        ${notice('ok', saved && 'Gespeichert.')}${notice('error', error)}
        <form method="post" action="/Admin/events/${seg(event.slug)}/edit" class="stack">
          <div class="grid2">
            <div class="field"><label for="edit-title">Anzeigename</label><input id="edit-title" name="title" value="${event.title}" maxlength="120" required></div>
            <div class="field"><label>URL-Name</label><input value="${event.slug}" disabled><p class="hint">Der URL-Name lässt sich nachträglich nicht ändern.</p></div>
          </div>
          ${accessFields({
            prefix: 'edit', accessMode: event.accessMode, pinRequired: !event.pinHash,
            pinLabel: event.pinHash ? 'Neuen PIN setzen' : 'PIN', pinPlaceholder: event.pinHash ? 'leer lassen = PIN behalten' : 'z. B. 2580',
          })}
          ${optionFields(event)}
          <div class="actions"><button class="btn btn--primary">Speichern</button><a class="btn" href="/Admin">Abbrechen</a></div>
        </form>
      </section>
    </main>`;
  return page({ title: 'Galerie bearbeiten', body, scripts: ['admin.js'] });
}

export function photosPage({ event, photos }) {
  const tiles = photos.map((p) => html`
    <figure class="admin-photo">
      <a href="/admin-media/${seg(event.slug)}/${seg(p.name)}" target="_blank" rel="noopener" title="Original öffnen">
        <img loading="lazy" decoding="async" alt="${p.name}" src="/thumb/${seg(event.slug)}/${seg(p.name)}?v=${p.v}">
      </a>
      <figcaption>
        <span class="admin-photo__name" title="${p.name}">${p.name}</span>
        <form method="post" action="/Admin/events/${seg(event.slug)}/photos/delete" data-confirm="Bild „${p.name}“ wirklich löschen?" data-ajax-remove=".admin-photo">
          <input type="hidden" name="file" value="${p.name}">
          <button class="btn btn--icon btn--sm btn--danger" aria-label="Bild löschen" title="Bild löschen">${icon('trash')}</button>
        </form>
      </figcaption>
    </figure>`);
  const body = html`
    ${adminHero('Bilder verwalten', event.title, backButton)}
    <main class="container">
      <section class="card">
        <h2 class="card__title"><span id="photo-count" data-one="Bild" data-many="Bilder">${plural(photos.length, 'Bild', 'Bilder')}</span></h2>
        <p class="muted">Klick auf ein Bild öffnet das Original. Gelöschte Bilder sind endgültig weg.</p>
        ${photos.length ? html`<div class="admin-photos">${tiles}</div>` : html`<p class="muted">Noch keine Bilder im Ordner <code>${event.folder}</code>.</p>`}
      </section>
    </main>`;
  return page({ title: 'Bilder verwalten', body, scripts: ['admin.js'] });
}

export function qrPage({ event, url }) {
  const base = `/Admin/events/${seg(event.slug)}/qr`;
  const body = html`
    ${adminHero('QR-Code', event.title, backButton)}
    <main class="container container--narrow">
      <section class="card qr">
        <img class="qr__img" src="${base}.svg" alt="QR-Code für ${url}" width="320" height="320">
        <div class="copy-row qr__link"><code>${url}</code>
          <button class="btn btn--sm btn--icon" type="button" data-copy="${url}" aria-label="Link kopieren">${icon('copy')}</button></div>
        ${event.accessMode === 'pin' ? html`<p class="muted">Denk daran, den Gästen auch den PIN mitzuteilen.</p>` : ''}
        <div class="actions">
          <a class="btn btn--primary" href="${base}.png" download="QR-${event.slug}.png">${icon('download')}<span>PNG (Druck)</span></a>
          <a class="btn" href="${base}.svg" download="QR-${event.slug}.svg">${icon('download')}<span>SVG (Vektor)</span></a>
        </div>
      </section>
    </main>`;
  return page({ title: `QR-Code ${event.title}`, body, scripts: ['admin.js'] });
}
