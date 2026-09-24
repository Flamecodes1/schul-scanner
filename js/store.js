// Lokaler Speicher auf dem Gerät:
// - Einstellungen (inkl. GitHub-Token) in localStorage
// - Zwischenspeicher, Warteschlange ("Ausgang") und Bild-Cache in IndexedDB

const SETTINGS_KEY = 'schul-scanner.settings';

const DEFAULT_SETTINGS = {
  token: '',
  repo: '',          // "benutzer/schul-ablage"
  branch: 'main',
  filter: 'color',   // color | gray | original
  ocrLang: 'deu+eng',
};

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* privater Modus */ }
}

// ---------- IndexedDB ----------

let dbPromise;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('schul-scanner', 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('kv');
        d.createObjectStore('outbox', { keyPath: 'id' });
        d.createObjectStore('cache');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const safe = async (p, fallback) => { try { return await p; } catch { return fallback; } };

export const kv = {
  get: (key) => safe(tx('kv', 'readonly', (s) => s.get(key)), undefined),
  set: (key, val) => safe(tx('kv', 'readwrite', (s) => s.put(val, key))),
  del: (key) => safe(tx('kv', 'readwrite', (s) => s.delete(key))),
};

export const outbox = {
  all: () => safe(tx('outbox', 'readonly', (s) => s.getAll()), []),
  put: (item) => tx('outbox', 'readwrite', (s) => s.put(item)),
  del: (id) => tx('outbox', 'readwrite', (s) => s.delete(id)),
};

export const cache = {
  get: (key) => safe(tx('cache', 'readonly', (s) => s.get(key)), undefined),
  set: (key, blob) => safe(tx('cache', 'readwrite', (s) => s.put(blob, key))),
  clear: () => safe(tx('cache', 'readwrite', (s) => s.clear())),
};

/** Bittet den Browser, die Daten nicht automatisch zu löschen */
export async function persist() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* egal */ }
}
