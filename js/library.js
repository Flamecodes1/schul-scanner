// Zustand der App + Abgleich mit dem privaten GitHub-Repo ("Ablage").
//
// Aufbau der Ablage:
//   index.json                     – Liste aller Blätter (inkl. erkanntem Text für die Suche)
//   config.json                    – deine Fächer (Namen, Farben, Stichwörter)
//   untis/timetable.json           – Stundenplan, wird automatisch von GitHub Actions geholt
//   2026-27/Deutsch/2026-09-24 Gedichtanalyse.pdf
//   2026-27/Deutsch/2026-09-24 Gedichtanalyse.md   – Text + Infos (z. B. für Obsidian)
//   .thumbs/<id>.jpg               – kleine Vorschaubilder

import { GitHub } from './github.js';
import { loadSettings, saveSettings, kv, outbox, cache } from './store.js';
import { KNOWN, knownFor, colorFor, defaultSubjects } from './subjects.js';
import { safeName, schoolYear } from './util.js';

export const state = {
  settings: loadSettings(),
  index: { version: 1, docs: [] },
  config: { version: 1, subjects: [] },
  timetable: null,
  pending: [],        // Blätter, die noch hochgeladen werden müssen
  syncing: false,
  lastError: '',
  loaded: false,
};

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

export function gh() {
  const { token, repo, branch } = state.settings;
  return token && repo ? new GitHub({ token, repo, branch }) : null;
}
export const connected = () => !!gh();

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  saveSettings(state.settings);
  emit();
}

// ---------- Laden ----------

export async function init() {
  const [index, config, timetable, pending] = await Promise.all([
    kv.get('index'), kv.get('config'), kv.get('timetable'), outbox.all(),
  ]);
  if (index) state.index = index;
  if (config) state.config = config;
  if (timetable) state.timetable = timetable;
  state.pending = pending.sort((a, b) => a.created.localeCompare(b.created));
  state.loaded = true;
  emit();
  refresh().then(syncOutbox);
  window.addEventListener('online', () => syncOutbox());
}

export async function refresh() {
  const g = gh();
  if (!g) return;
  try {
    const [index, config, timetable] = await Promise.all([
      g.readJSON('index.json', { version: 1, docs: [] }),
      g.readJSON('config.json', null),
      g.readJSON('untis/timetable.json', null),
    ]);
    state.index = index;
    if (config) state.config = config;
    state.timetable = timetable;
    state.lastError = '';
    await Promise.all([kv.set('index', index), kv.set('config', state.config), kv.set('timetable', timetable)]);
  } catch (e) {
    state.lastError = e.message;
  }
  emit();
}

// ---------- Fächer ----------

/**
 * Alle Fächer: gespeicherte Fächer + neue aus Untis, ergänzt um Lehrer und Stichwörter.
 * Ist nichts gespeichert und kein Untis da, gibt es Standard-Fächer.
 */
export function subjects() {
  const saved = state.config.subjects || [];
  const untis = state.timetable?.subjects || [];
  // Ohne eigene Einstellungen: Standardfächer. Mit Untis werden davon nur die sichtbar, die du wirklich hast.
  const fromDefaults = !saved.length;
  const list = fromDefaults
    ? defaultSubjects().map((s) => ({ ...s, hidden: untis.length ? true : s.hidden }))
    : saved.map((s) => ({ ...s }));
  const byId = new Map();
  list.forEach((s) => { byId.set(s.id, s); (s.untis || []).forEach((u) => byId.set(u, s)); });

  untis.forEach((u) => {
    let s = byId.get(u.short);
    if (!s) {
      const known = knownFor(u.short, u.long);
      // Gibt es das Fach schon als Standardfach (z. B. "deutsch")? Dann zusammenführen.
      const dup = known && list.find((x) => x.id === known.key);
      if (dup) {
        // Erstes Mal mit Untis verknüpft → du hast das Fach also wirklich: einblenden
        if (fromDefaults || !dup.untis?.length) dup.hidden = false;
        dup.untis = [...new Set([...(dup.untis || []), u.short])];
        s = dup;
      } else {
        s = {
          id: u.short,
          name: known?.name || u.long || u.short,
          color: u.color || known?.color || colorFor(list.length),
          keywords: [],
          fromUntis: true,
          untis: [u.short],
        };
        list.push(s);
      }
      byId.set(u.short, s);
    }
    s.teachers = [...new Set([...(s.teachers || []), ...(u.teachers || [])])];
    s.teacherNames = [...new Set([...(s.teacherNames || []), ...(u.teacherNames || [])])];
    if (u.long && u.long !== s.name) s.aliases = [...new Set([...(s.aliases || []), u.long])];
  });

  return list.map((s) => {
    const known = knownFor(s.untis?.[0] || s.id, s.name) || KNOWN.find((k) => k.key === s.id);
    return {
      ...s,
      lang: known?.lang,
      aliases: [...new Set([...(s.aliases || []), ...(known && known.name !== s.name ? [known.name] : []), ...(known?.key === 'mathe' ? ['Mathematik'] : [])])],
      allKeywords: [...new Set([...(s.keywords || []), ...(known?.words || [])])],
      teacherNames: s.teacherNames || [],
    };
  });
}

export function subjectById(id) {
  return subjects().find((s) => s.id === id || s.untis?.includes(id));
}

/** Speichert Fächer-Einstellungen (nur die eigenen Felder, nicht die abgeleiteten) */
export async function saveSubjects(list) {
  state.config = {
    version: 1,
    subjects: list.map(({ id, name, color, keywords, hidden, fromUntis, untis }) => ({
      id, name, color, keywords: keywords || [], hidden: !!hidden, ...(fromUntis ? { fromUntis } : {}), ...(untis ? { untis } : {}),
    })),
  };
  await kv.set('config', state.config);
  emit();
  const g = gh();
  if (g) {
    await g.commit('Fächer aktualisiert', async () => [{ path: 'config.json', content: JSON.stringify(state.config, null, 2) + '\n' }]);
  }
}

// ---------- Blätter ----------

export const allDocs = () => [
  ...state.pending.map((p) => ({ ...p.meta, pending: true })),
  ...state.index.docs,
];

export const docById = (id) => allDocs().find((d) => d.id === id);

/** Neues Blatt: erst lokal speichern (klappt auch offline), dann hochladen */
export async function addDoc({ meta, pdf, thumb }) {
  const item = { id: meta.id, created: meta.created, meta, pdf, thumb };
  await outbox.put(item);
  state.pending.push(item);
  emit();
  syncOutbox();
}

function uniquePath(dir, base, ext, taken) {
  let name = `${dir}/${base}.${ext}`;
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${dir}/${base} (${i}).${ext}`;
  return name;
}

function docPaths(meta, docs, ignoreId) {
  const s = subjectById(meta.subject);
  const dir = `${schoolYear(meta.date)}/${safeName(s?.name || meta.subject, 'Sonstiges')}`;
  const taken = new Set(docs.filter((d) => d.id !== ignoreId).map((d) => d.path.toLowerCase()));
  const pdfPath = uniquePath(dir, safeName(`${meta.date} ${meta.title}`), 'pdf', taken);
  return { pdfPath, mdPath: pdfPath.replace(/\.pdf$/, '.md') };
}

function markdown(doc) {
  const s = subjectById(doc.subject);
  const file = doc.path.split('/').pop();
  const fm = [
    '---',
    `titel: "${doc.title.replace(/"/g, "'")}"`,
    `fach: ${s?.name || doc.subject}`,
    `datum: ${doc.date}`,
    `seiten: ${doc.pages}`,
    doc.lesson?.teachers?.length ? `lehrer: ${doc.lesson.teachers.join(', ')}` : null,
    doc.lesson ? `stunde: "${doc.lesson.start}–${doc.lesson.end}"` : null,
    `id: ${doc.id}`,
    '---',
  ].filter(Boolean).join('\n');
  return `${fm}\n\n# ${doc.title}\n\n[PDF öffnen](${encodeURI(file)})\n\n## Erkannter Text\n\n${doc.fullText || doc.text || '_(kein Text erkannt)_'}\n`;
}

let syncPromise = null;
export function syncOutbox() {
  if (!syncPromise) syncPromise = doSync().finally(() => { syncPromise = null; });
  return syncPromise;
}

async function doSync() {
  const g = gh();
  if (!g || !state.pending.length || !navigator.onLine) return;
  state.syncing = true; emit();
  try {
    while (state.pending.length) {
      const item = state.pending[0];
      const [pdfSha, thumbSha] = await Promise.all([g.createBlob(item.pdf), g.createBlob(item.thumb)]);
      let newIndex = null;
      await g.commit(`Neues Blatt: ${item.meta.title}`, async () => {
        const index = await g.readJSON('index.json', { version: 1, docs: [] });
        newIndex = index;
        if (index.docs.some((d) => d.id === item.id)) return []; // schon drin (z. B. nach Abbruch)
        const { pdfPath, mdPath } = docPaths(item.meta, index.docs);
        const { fullText, ...meta } = item.meta;
        const saved = { ...meta, path: pdfPath, md: mdPath, thumb: `.thumbs/${item.id}.jpg`, pdfSha, thumbSha };
        index.docs.unshift(saved);
        return [
          { path: pdfPath, sha: pdfSha },
          { path: saved.thumb, sha: thumbSha },
          { path: mdPath, content: markdown({ ...saved, fullText }) },
          { path: 'index.json', content: JSON.stringify(index, null, 1) + '\n' },
        ];
      });
      await cache.set(`sha:${thumbSha}`, item.thumb);
      await cache.set(`sha:${pdfSha}`, item.pdf);
      await outbox.del(item.id);
      if (newIndex) state.index = newIndex;
      state.pending.shift();
      await kv.set('index', state.index);
      state.lastError = '';
      emit();
    }
  } catch (e) {
    state.lastError = e.message;
  } finally {
    state.syncing = false;
    emit();
  }
}

/** Titel, Fach oder Datum ändern – verschiebt die Dateien im Repo */
export async function updateDoc(id, changes) {
  const pendingItem = state.pending.find((p) => p.id === id);
  if (pendingItem) {
    pendingItem.meta = { ...pendingItem.meta, ...changes };
    await outbox.put(pendingItem);
    emit();
    return;
  }
  const g = gh();
  if (!g) throw new Error('Nicht mit GitHub verbunden');
  let newIndex = null;
  await g.commit(`Blatt geändert: ${changes.title || id}`, async () => {
    const index = await g.readJSON('index.json', { version: 1, docs: [] });
    newIndex = index;
    const i = index.docs.findIndex((d) => d.id === id);
    if (i < 0) throw new Error('Blatt nicht gefunden');
    const old = index.docs[i];
    const updated = { ...old, ...changes };
    const moved = updated.subject !== old.subject || updated.title !== old.title || updated.date !== old.date;
    const ops = [];
    if (moved) {
      const { pdfPath, mdPath } = docPaths(updated, index.docs, id);
      updated.path = pdfPath; updated.md = mdPath;
      ops.push({ path: old.path, remove: true }, { path: pdfPath, sha: old.pdfSha });
      if (old.md && old.md !== mdPath) ops.push({ path: old.md, remove: true });
    }
    const fullText = (await g.readText(old.md).catch(() => null))?.split('## Erkannter Text')[1]?.trim() || old.text;
    ops.push({ path: updated.md, content: markdown({ ...updated, fullText }) });
    index.docs[i] = updated;
    ops.push({ path: 'index.json', content: JSON.stringify(index, null, 1) + '\n' });
    return ops;
  });
  state.index = newIndex;
  await kv.set('index', state.index);
  emit();
}

export async function deleteDoc(id) {
  const pendingItem = state.pending.find((p) => p.id === id);
  if (pendingItem) {
    await outbox.del(id);
    state.pending = state.pending.filter((p) => p.id !== id);
    emit();
    return;
  }
  const g = gh();
  if (!g) throw new Error('Nicht mit GitHub verbunden');
  let newIndex = null;
  await g.commit('Blatt gelöscht', async () => {
    const index = await g.readJSON('index.json', { version: 1, docs: [] });
    newIndex = index;
    const doc = index.docs.find((d) => d.id === id);
    if (!doc) return [];
    index.docs = index.docs.filter((d) => d.id !== id);
    return [
      { path: doc.path, remove: true },
      doc.md && { path: doc.md, remove: true },
      doc.thumb && { path: doc.thumb, remove: true },
      { path: 'index.json', content: JSON.stringify(index, null, 1) + '\n' },
    ].filter(Boolean);
  });
  state.index = newIndex;
  await kv.set('index', state.index);
  emit();
}

// ---------- Dateien laden (mit Cache) ----------

async function cachedBlob(sha, path) {
  if (sha) {
    const hit = await cache.get(`sha:${sha}`);
    if (hit) return hit;
  }
  const g = gh();
  if (!g) throw new Error('Nicht mit GitHub verbunden');
  const blob = sha ? await g.blobBySha(sha) : await g.readBlob(path);
  if (sha) await cache.set(`sha:${sha}`, blob);
  return blob;
}

const thumbUrls = new Map();
export async function thumbUrl(doc) {
  const key = doc.id;
  if (thumbUrls.has(key)) return thumbUrls.get(key);
  let blob;
  if (doc.pending) blob = state.pending.find((p) => p.id === doc.id)?.thumb;
  else blob = await cachedBlob(doc.thumbSha, doc.thumb).catch(() => null);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  thumbUrls.set(key, url);
  return url;
}

export async function pdfBlob(doc) {
  if (doc.pending) return state.pending.find((p) => p.id === doc.id)?.pdf;
  return cachedBlob(doc.pdfSha, doc.path);
}

// ---------- Suche ----------

const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function search(query) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const subs = subjects();
  const results = [];
  for (const d of allDocs()) {
    const sName = subs.find((s) => s.id === d.subject)?.name || '';
    const hay = fold(`${d.title} ${sName} ${d.date} ${d.text || ''}`);
    if (!terms.every((t) => hay.includes(t))) continue;
    const titleHit = terms.every((t) => fold(d.title).includes(t));
    let snippet = '';
    if (d.text) {
      const pos = fold(d.text).indexOf(terms[0]);
      if (pos >= 0) snippet = (pos > 40 ? '…' : '') + d.text.slice(Math.max(0, pos - 40), pos + 100).replace(/\s+/g, ' ') + '…';
    }
    results.push({ doc: d, titleHit, snippet });
  }
  return results
    .sort((a, b) => (b.titleHit - a.titleHit) || (b.doc.date || '').localeCompare(a.doc.date || ''))
    .map((r) => ({ ...r.doc, snippet: r.snippet }))
    .slice(0, 60);
}

// ---------- Untis ----------

export const UNTIS_WORKFLOW = 'untis-sync.yml';

/**
 * Der Untis-Abruf läuft im (öffentlichen) App-Repo, weil GitHub Actions dort kostenlos sind.
 * Auf GitHub Pages ergibt sich das Repo aus der Adresse: benutzer.github.io/schul-scanner
 */
export function untisRepo() {
  const host = location.hostname.match(/^([^.]+)\.github\.io$/i);
  const first = location.pathname.split('/').filter(Boolean)[0];
  if (host && first) return `${host[1]}/${first}`;
  return state.settings.untisRepo || (state.settings.repo ? `${state.settings.repo.split('/')[0]}/schul-scanner` : '');
}

function untisGh() {
  const { token } = state.settings;
  const repo = untisRepo();
  return token && repo ? new GitHub({ token, repo }) : null;
}

export async function triggerUntisSync() {
  const g = untisGh();
  if (!g) throw new Error('Nicht mit GitHub verbunden');
  try {
    await g.dispatch(UNTIS_WORKFLOW);
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      const err = new Error('Dein Token darf den Abruf nicht selbst starten. Kein Problem: Er läuft automatisch mehrmals am Tag – oder starte ihn auf GitHub unter „Actions“.');
      err.noPermission = true;
      throw err;
    }
    throw e;
  }
}

export async function untisRunStatus() {
  const g = untisGh();
  if (!g) return null;
  try { return await g.latestRun(UNTIS_WORKFLOW); } catch { return null; }
}
