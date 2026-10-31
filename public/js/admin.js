// Admin-Oberfläche: URL-Name live prüfen, PIN-Feld umschalten, Links kopieren, Bestätigungen, Bilder löschen.
import { finalSlug, slugProblem, slugify } from './slug.js';

const dataEl = document.getElementById('page-data');
const data = dataEl ? JSON.parse(dataEl.textContent) : {};

// ---------- URL-Name ----------

function setupSlugField() {
  const title = document.getElementById('new-title');
  const slug = document.getElementById('new-slug');
  if (!title || !slug) return;
  const msg = document.getElementById('slug-msg');
  const preview = document.getElementById('slug-preview');
  const taken = new Set(data.taken || []);
  const reserved = new Set(data.reserved || []);
  let auto = !slug.value; // URL-Name folgt dem Anzeigenamen, bis er selbst bearbeitet wird

  const check = (note = '') => {
    const value = finalSlug(slug.value);
    const error = slug.value ? slugProblem(value, taken, reserved) : '';
    slug.setCustomValidity(error);
    msg.textContent = error || note;
    msg.className = `hint ${error ? 'hint--error' : 'hint--warn'}`;
    msg.hidden = !msg.textContent;
    preview.textContent = `${data.base}/${value || '…'}`;
  };

  title.addEventListener('input', () => {
    if (!auto) return;
    slug.value = finalSlug(title.value);
    check();
  });
  slug.addEventListener('input', () => {
    auto = !slug.value;
    const raw = slug.value;
    const clean = slugify(raw);
    let note = '';
    if (raw !== clean) {
      const bad = [...new Set(raw.match(/[^A-Za-z0-9_-]/g) || [])].map((c) => (/\s/.test(c) ? 'Leerzeichen' : `„${c}“`));
      if (bad.length) note = `${bad.join(', ')} nicht erlaubt – automatisch angepasst.`;
      const caret = slugify(raw.slice(0, slug.selectionStart ?? raw.length)).length;
      slug.value = clean;
      slug.setSelectionRange(caret, caret);
    }
    check(note);
  });
  slug.addEventListener('change', () => {
    slug.value = finalSlug(slug.value);
    check();
  });
  check();
}

// ---------- PIN-Feld nur bei "Mit PIN" ----------

function setupPinToggles() {
  for (const select of document.querySelectorAll('[data-pin-toggle]')) {
    const box = document.getElementById(select.dataset.pinToggle);
    const input = box?.querySelector('input');
    const update = () => {
      const pin = select.value === 'pin';
      box.hidden = !pin;
      if (input) input.required = pin && select.dataset.pinRequired === 'true';
    };
    select.addEventListener('change', update);
    update();
  }
}

// ---------- Kopieren ----------

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

document.addEventListener('click', async (e) => {
  const button = e.target.closest('[data-copy]');
  if (!button) return;
  await copyText(button.dataset.copy);
  button.classList.add('is-done');
  const label = button.querySelector('span');
  const before = label?.textContent;
  if (label) label.textContent = 'Kopiert';
  setTimeout(() => { button.classList.remove('is-done'); if (label) label.textContent = before; }, 1600);
});

// ---------- Bestätigen + Bilder ohne Reload löschen ----------

document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (form.dataset.confirm && !confirm(form.dataset.confirm)) {
    e.preventDefault();
    return;
  }
  if (!form.dataset.ajaxRemove) return;
  e.preventDefault();
  try {
    const res = await fetch(form.action, { method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams(new FormData(form)) });
    if (!res.ok) throw new Error(String(res.status));
    form.closest(form.dataset.ajaxRemove)?.remove();
    const counter = document.getElementById('photo-count');
    if (counter) {
      const n = document.querySelectorAll(form.dataset.ajaxRemove).length;
      counter.textContent = `${n} ${n === 1 ? counter.dataset.one : counter.dataset.many}`;
    }
  } catch {
    HTMLFormElement.prototype.submit.call(form);
  }
});

setupSlugField();
setupPinToggles();
