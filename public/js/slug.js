// Wird im Browser (Admin-Formular) und auf dem Server (Validierung) verwendet – nur Standard-JS.

const UMLAUTS = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

/** Live-Bereinigung beim Tippen: Leerzeichen/Punkte → "-", Umlaute → ae/oe/ue/ss, Rest entfernen. */
export function slugify(value) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[äöüÄÖÜß]/g, (c) => UMLAUTS[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s.]+/g, '-')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

/** Endgültiger URL-Name: wie slugify, zusätzlich ohne Bindestriche am Anfang/Ende. */
export function finalSlug(value) {
  return slugify(String(value ?? '').trim()).replace(/^-+|-+$/g, '');
}

/** Liefert eine Fehlermeldung oder '' wenn der URL-Name verwendet werden kann. */
export function slugProblem(slug, taken, reserved) {
  const lower = slug.toLowerCase();
  if (slug.length < 2) return 'Der URL-Name braucht mindestens 2 erlaubte Zeichen (A–Z, 0–9, - oder _).';
  if (reserved.has(lower)) return `„${slug}“ ist reserviert – bitte einen anderen URL-Namen wählen.`;
  if (taken.has(lower)) return `Der URL-Name „${slug}“ ist bereits vergeben.`;
  return '';
}
