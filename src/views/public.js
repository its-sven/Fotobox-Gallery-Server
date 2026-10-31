import { PAGE_SIZE } from '../config.js';
import { hero, html, icon, jsonData, notice, page, seg } from './layout.js';

const formatDate = (iso) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

export function homePage({ settings, events }) {
  const visible = events.filter((e) => !e.archived);
  const body = html`
    ${hero({ eyebrow: settings.siteEyebrow, title: settings.siteTitle, actions: html`<a class="btn btn--ghost" href="/Admin">${icon('settings')}<span>Admin</span></a>` })}
    <main class="container">
      <section class="card">
        <h2 class="card__title">Galerien</h2>
        ${visible.length ? html`<ul class="gallery-links">${visible.map((e) => html`
          <li><a class="gallery-link" href="/${seg(e.slug)}">
            <span class="gallery-link__icon">${icon(e.accessMode === 'pin' ? 'lock' : 'camera')}</span>
            <span class="gallery-link__title">${e.title}</span>
            ${icon('chevronRight')}
          </a></li>`)}</ul>`
        : html`<p class="muted">Aktuell sind keine Galerien geöffnet.</p>`}
      </section>
    </main>`;
  return page({ title: settings.siteTitle, body });
}

export function pinPage({ settings, event, error }) {
  const body = html`
    <main class="center">
      <section class="card card--narrow">
        <span class="eyebrow">${settings.siteEyebrow}</span>
        <h1 class="card__headline">${event.title}</h1>
        <p class="muted">Gib den PIN ein, um die Fotos anzusehen und herunterzuladen.</p>
        ${notice('error', error)}
        <form method="post" action="/${seg(event.slug)}/login" class="stack">
          <label class="sr-only" for="pin">PIN</label>
          <input id="pin" class="input--pin" name="pin" inputmode="numeric" autocomplete="one-time-code" placeholder="PIN" required autofocus>
          <button class="btn btn--primary btn--block">${icon('lock')}<span>Galerie öffnen</span></button>
        </form>
      </section>
    </main>`;
  return page({ title: event.title, body });
}

export function latestPage({ settings, event, latest, error }) {
  const image = latest
    ? html`<img class="latest__img" src="/public-media/${seg(event.slug)}/${seg(latest.name)}?v=${latest.v}" alt="Neuestes Foto">`
    : html`<div class="empty"><span class="empty__icon">${icon('camera')}</span><h2>Noch kein Bild vorhanden</h2><p>Sobald das erste Foto da ist, erscheint es hier automatisch.</p></div>`;
  const open = event.accessMode === 'pin'
    ? html`<form method="post" action="/${seg(event.slug)}/login" class="inline-form">
        <input name="pin" class="input--pin input--sm" inputmode="numeric" autocomplete="one-time-code" placeholder="PIN" aria-label="PIN" required>
        <button class="btn btn--primary">${icon('lock')}<span>Alle Bilder öffnen</span></button>
      </form>`
    : html`<a class="btn btn--primary" href="/${seg(event.slug)}">${icon('image')}<span>Alle Bilder öffnen</span></a>`;
  const body = html`
    ${hero({ eyebrow: settings.siteEyebrow, title: event.title, compact: true })}
    <main class="container container--narrow">
      ${notice('error', error)}
      <section class="card latest">
        ${image}
        <div class="latest__bar">
          <span class="muted">${latest ? html`Neuestes Bild · ${formatDate(latest.modified)}` : 'Wird automatisch aktualisiert'}</span>
          <div class="actions">
            ${latest ? html`<a class="btn" href="/public-download/${seg(event.slug)}/latest">${icon('download')}<span>Herunterladen</span></a>` : ''}
            ${open}
          </div>
        </div>
      </section>
    </main>`;
  return page({ title: event.title, body, scripts: ['latest.js'] });
}

export function galleryPage({ settings, event }) {
  const lockButton = event.accessMode === 'pin'
    ? html`<form method="post" action="/${seg(event.slug)}/logout"><button class="btn btn--ghost">${icon('lock')}<span>Sperren</span></button></form>`
    : '';
  const body = html`
    ${hero({ eyebrow: settings.siteEyebrow, title: event.title, compact: true, actions: lockButton })}
    <div class="toolbar">
      <div class="toolbar__inner">
        <span id="count" class="toolbar__count">Lade Fotos …</span>
        <select id="sort" aria-label="Sortierung">
          <option value="newest">Neueste zuerst</option>
          <option value="oldest">Älteste zuerst</option>
        </select>
        <button class="btn btn--icon" id="refresh" type="button" aria-label="Aktualisieren" title="Aktualisieren">${icon('refresh')}</button>
        ${event.allowZipDownload ? html`<a class="btn btn--primary" href="/download/${seg(event.slug)}.zip">${icon('download')}<span>Alle herunterladen</span></a>` : ''}
      </div>
    </div>
    <main id="gallery" class="gallery" aria-live="polite"></main>
    <div id="more" class="more" hidden><button class="btn" id="more-btn" type="button">Weitere Fotos laden</button></div>
    <section id="empty" class="empty empty--page" hidden>
      <span class="empty__icon">${icon('camera')}</span>
      <h2>Noch keine Fotos</h2>
      <p>Die Bilder erscheinen hier automatisch, sobald die Fotobox sie hochgeladen hat.</p>
    </section>
    <dialog id="lightbox" class="lightbox" aria-label="Foto-Ansicht">
      <div class="lightbox__top">
        <span id="lb-counter" class="lightbox__counter"></span>
        <div class="lightbox__tools">
          <button class="btn btn--icon btn--dark" id="lb-share" type="button" aria-label="Teilen" title="Teilen" hidden>${icon('share')}</button>
          <a class="btn btn--icon btn--dark" id="lb-download" aria-label="Herunterladen" title="Original herunterladen">${icon('download')}</a>
          <button class="btn btn--icon btn--dark" id="lb-close" type="button" aria-label="Schließen" title="Schließen">${icon('x')}</button>
        </div>
      </div>
      <div class="lightbox__stage" id="lb-stage">
        <button class="lightbox__nav lightbox__nav--prev" id="lb-prev" type="button" aria-label="Vorheriges Foto">${icon('chevronLeft')}</button>
        <img id="lb-img" alt="">
        <button class="lightbox__nav lightbox__nav--next" id="lb-next" type="button" aria-label="Nächstes Foto">${icon('chevronRight')}</button>
      </div>
      <div class="lightbox__bottom"><span id="lb-meta"></span></div>
    </dialog>
    ${jsonData({ slug: event.slug, pageSize: PAGE_SIZE })}`;
  return page({ title: event.title, body, scripts: ['gallery.js'], bodyClass: 'is-gallery' });
}

export function messagePage({ title, heading, text, home = true }) {
  const body = html`
    <main class="center">
      <section class="card card--narrow">
        <h1 class="card__headline">${heading}</h1>
        <p class="muted">${text}</p>
        ${home ? html`<a class="btn btn--primary" href="/">${icon('home')}<span>Zur Startseite</span></a>` : ''}
      </section>
    </main>`;
  return page({ title, body });
}
