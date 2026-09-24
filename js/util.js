// Kleine Helfer, die überall gebraucht werden.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const pad = (n) => String(n).padStart(2, '0');

/** Lokales Datum als YYYY-MM-DD */
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Lokale Uhrzeit als HH:MM */
export const hhmm = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const minutesOf = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/** Schuljahr zu einem Datum, z. B. "2026-27" (Wechsel im August) */
export function schoolYear(iso) {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 8 ? y : y - 1;
  return `${start}-${pad((start + 1) % 100)}`;
}

/** Macht aus einem Titel einen gültigen Datei-/Ordnernamen */
export function safeName(s, fallback = 'Blatt') {
  const out = String(s || '')
    .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, ' ')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
    .trim();
  return out || fallback;
}

const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const longFmt = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const parseIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

export function fmtDay(iso) {
  const today = isoDate();
  if (iso === today) return 'Heute';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (iso === isoDate(y)) return 'Gestern';
  const t = new Date(); t.setDate(t.getDate() + 1);
  if (iso === isoDate(t)) return 'Morgen';
  return dayFmt.format(parseIso(iso));
}
export const fmtLong = (iso) => longFmt.format(parseIso(iso));
export const fmtMonth = (iso) => monthFmt.format(parseIso(iso));
export function daysUntil(iso) {
  const a = parseIso(isoDate()), b = parseIso(iso);
  return Math.round((b - a) / 86400000);
}
export function fmtAgo(ts) {
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  return `vor ${Math.round(s / 86400)} Tagen`;
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Unicode-sicheres Base64 für Text */
export function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.8) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht erzeugt werden'))), type, quality));
}

const scripts = new Map();
export function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = () => { scripts.delete(src); reject(new Error(`Konnte ${src} nicht laden`)); };
      document.head.append(s);
    }));
  }
  return scripts.get(src);
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/** Helle oder dunkle Schrift auf einer Farbe? */
export function textOn(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#1c1c1e' : '#ffffff';
}

export const icons = {
  back: '<svg viewBox="0 0 24 24"><path d="M15.4 4.6a1 1 0 0 1 0 1.4L9.4 12l6 6a1 1 0 1 1-1.4 1.4l-6.7-6.7a1 1 0 0 1 0-1.4L14 4.6a1 1 0 0 1 1.4 0"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M8.6 4.6a1 1 0 0 1 1.4 0l6.7 6.7a1 1 0 0 1 0 1.4L10 19.4A1 1 0 0 1 8.6 18l6-6-6-6a1 1 0 0 1 0-1.4"/></svg>',
  search: '<svg viewBox="0 0 24 24"><path d="M10.5 3a7.5 7.5 0 0 1 6 12l4.2 4.2a1 1 0 0 1-1.4 1.4L15 16.4A7.5 7.5 0 1 1 10.5 3m0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M9.2 4h5.6a2 2 0 0 1 1.7 1l.9 1.5H19a3 3 0 0 1 3 3V17a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V9.5a3 3 0 0 1 3-3h1.6l.9-1.5a2 2 0 0 1 1.7-1M12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8m0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4"/></svg>',
  photos: '<svg viewBox="0 0 24 24"><path d="M5 4h14a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3m0 2a1 1 0 0 0-1 1v8.6l3.8-3.8a1.5 1.5 0 0 1 2.1 0l2.6 2.6 1.6-1.6a1.5 1.5 0 0 1 2.1 0L20 15.6V7a1 1 0 0 0-1-1zm10.5 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m7 1.5V9h5.5M8 13h8v2H8zm0 4h8v2H8z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 4a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5a1 1 0 0 1 1-1"/></svg>',
  rotate: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 0 1 7.7 5.8 1 1 0 1 1-1.9.5A6 6 0 1 0 12 18a1 1 0 1 1 0 2 8 8 0 0 1 0-16m7-2a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 1 1 0-2h4V3a1 1 0 0 1 1-1"/></svg>',
  expand: '<svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 2l2.2 6.3L20.5 10l-6.3 2.2L12 18.5l-2.2-6.3L3.5 10l6.3-1.7z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 2.6l4.7 4.7a1 1 0 1 1-1.4 1.4L13 6.4V15a1 1 0 1 1-2 0V6.4L8.7 8.7a1 1 0 1 1-1.4-1.4zM5 11a1 1 0 0 1 1 1v7h12v-7a1 1 0 1 1 2 0v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a1 1 0 0 1 1-1"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M9 3h6a1 1 0 0 1 1 1v1h4a1 1 0 1 1 0 2h-1l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4a1 1 0 1 1 0-2h4V4a1 1 0 0 1 1-1m-2 4 1 13h8l1-13zm3 3h1.5v7H10zm2.5 0H14v7h-1.5z"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M4 4h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 19a5 5 0 0 1-.9-9.9A6 6 0 0 1 17.7 8 4.5 4.5 0 0 1 17.5 19z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20m0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16m0 2a1 1 0 0 1 1 1v4.6l3 1.8a1 1 0 1 1-1 1.7l-3.5-2.1A1 1 0 0 1 11 12V7a1 1 0 0 1 1-1"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 0 1 6.9 4H16a1 1 0 1 0 0 2h5a1 1 0 0 0 1-1V4a1 1 0 1 0-2 0v2.3A10 10 0 0 0 2 12a1 1 0 1 0 2 0 8 8 0 0 1 8-8m9 7a1 1 0 0 0-1 1 8 8 0 0 1-14.9 4H8a1 1 0 1 0 0-2H3a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0v-2.3A10 10 0 0 0 22 12a1 1 0 0 0-1-1"/></svg>',
};
