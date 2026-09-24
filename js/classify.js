// Errät das Fach eines Blatts. Vier Hinweise werden zu Punkten zusammengezählt:
//  1. Stundenplan (Untis): Welches Fach war gerade / zuletzt?
//  2. Fachname, Lehrername und Stichwörter im erkannten Text
//  3. Sprache des Texts (Englisch, Französisch, Latein, Spanisch)
//  4. Ähnlichkeit zu Blättern, die du schon einsortiert hast (lernt mit jedem Blatt)

import { isoDate, minutesOf } from './util.js';
import { STOPWORDS } from './subjects.js';

const DE_STOP = new Set([...STOPWORDS.de, 'aufgabe', 'aufgaben', 'name', 'datum', 'klasse', 'seite', 'bitte', 'folgenden', 'folgende', 'welche', 'welcher', 'diese', 'dieser', 'einen', 'einer', 'eines', 'sind', 'hast', 'kann', 'können', 'dann', 'wenn', 'noch', 'haben', 'mehr', 'über', 'unter', 'zwischen', 'durch', 'gegen', 'ohne', 'dass', 'ihre', 'ihren', 'seine', 'sein', 'ihr', 'euch', 'wir', 'uns', 'man', 'hier', 'dort', 'jetzt', 'immer', 'schon', 'sehr', 'viele', 'alle', 'jede', 'jeder', 'jedes', 'arbeitsblatt']);

export function tokenize(text) {
  return (text.toLowerCase().match(/[a-zäöüßéèêàâçñáíóú]+/g) || []);
}

const norm = (s) => s.toLowerCase().normalize('NFC');

function wordRegex(word) {
  const w = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-zäöüß])${w}($|[^a-zäöüß])`, 'i');
}

// ---------- 1. Stundenplan ----------

/** Unterrichtsstunden an einem Tag (echte Daten oder regulärer Wochenplan als Ersatz) */
export function lessonsOn(timetable, date) {
  if (!timetable) return { lessons: [], exact: false };
  const iso = isoDate(date);
  const real = (timetable.lessons || []).filter((l) => l.date === iso);
  if (real.length) return { lessons: real, exact: true };
  const inRange = timetable.range && iso >= timetable.range.from && iso <= timetable.range.to;
  if (inRange) return { lessons: [], exact: true }; // Tag liegt im geladenen Bereich, aber frei (Ferien, Wochenende)
  const wd = String(date.getDay());
  const pattern = timetable.weekPattern?.[wd] || [];
  return { lessons: pattern.map((p) => ({ ...p, date: iso, status: 'normal' })), exact: false };
}

/** Welche Stunde läuft gerade (oder lief zuletzt)? */
export function lessonAt(timetable, when = new Date()) {
  const { lessons } = lessonsOn(timetable, when);
  const t = when.getHours() * 60 + when.getMinutes();
  const active = lessons.filter((l) => l.status !== 'cancelled');
  const now = active.find((l) => t >= minutesOf(l.start) - 5 && t <= minutesOf(l.end) + 5);
  const next = active.filter((l) => minutesOf(l.start) > t).sort((a, b) => a.start.localeCompare(b.start))[0];
  const past = active.filter((l) => minutesOf(l.end) + 5 < t).sort((a, b) => b.end.localeCompare(a.end));
  return { now, next, past, all: lessons };
}

function timetableScores(add, timetable, when, subjectById) {
  if (!timetable) return;
  const { lessons, exact } = lessonsOn(timetable, when);
  if (!lessons.length) return;
  const factor = exact ? 1 : 0.7;
  const { now, next, past } = lessonAt(timetable, when);
  const label = (l) => subjectById.get(l.subject)?.name || l.subjectName || l.subject;
  if (now) {
    add(now.subject, 4 * factor, `Stundenplan: gerade ${label(now)} (${now.start}–${now.end}${now.teachers?.length ? `, ${now.teachers.join(', ')}` : ''})`);
    return;
  }
  // In der Pause oder nach der Schule: die letzten Stunden des Tages zählen
  const weights = [2.6, 1.6, 1.0, 0.7, 0.5, 0.4, 0.3, 0.3];
  const seen = new Set();
  past.forEach((l) => {
    if (seen.has(l.subject)) return;
    const w = weights[seen.size] ?? 0.2;
    seen.add(l.subject);
    add(l.subject, w * factor, seen.size === 1 ? `Stundenplan: zuletzt ${label(l)} (${l.start}–${l.end})` : `heute ${label(l)} gehabt`);
  });
  if (next && past.length) add(next.subject, 1.2 * factor, `gleich ${label(next)} (${next.start})`);
}

// ---------- 2. Text-Stichwörter ----------

function keywordScores(add, text, subjects) {
  if (!text) return;
  const lower = norm(text);
  const head = lower.slice(0, 500);
  for (const s of subjects) {
    // Fachname direkt auf dem Blatt (oft im Kopf: "Deutsch – Klasse 9b")
    const names = [s.name, ...(s.aliases || [])].filter((n) => n && n.length >= 4);
    const nameHit = names.find((n) => wordRegex(norm(n)).test(head));
    if (nameHit) add(s.id, 3.2, `„${nameHit}“ steht oben auf dem Blatt`);
    else if (names.some((n) => wordRegex(norm(n)).test(lower))) add(s.id, 1.4, `„${s.name}“ im Text`);

    // Lehrername (nur ausgeschriebene Namen, Kürzel sind zu kurz)
    const teacher = (s.teacherNames || []).find((n) => n.length >= 4 && wordRegex(norm(n)).test(lower));
    if (teacher) add(s.id, 2.5, `Lehrkraft „${teacher}“ erkannt`);

    // Stichwörter (eigene + Standard)
    const hits = [];
    const nameSet = new Set(names.map(norm));
    for (const k of s.allKeywords || []) {
      if (nameSet.has(norm(k))) continue;
      if (k.length >= 3 && wordRegex(norm(k)).test(lower)) hits.push(k);
      if (hits.length >= 6) break;
    }
    if (hits.length) add(s.id, Math.min(3, 0.6 * hits.length + 0.3), `Stichwörter: ${hits.slice(0, 3).join(', ')}`);
  }
}

// ---------- 3. Sprache ----------

const LANG_SETS = Object.fromEntries(Object.entries(STOPWORDS).map(([k, v]) => [k, new Set(v)]));
const LANG_NAMES = { en: 'Englisch', fr: 'Französisch', la: 'Latein', es: 'Spanisch' };

export function detectLanguage(text) {
  const tokens = tokenize(text);
  if (tokens.length < 15) return null;
  const counts = {};
  for (const [lang, set] of Object.entries(LANG_SETS)) counts[lang] = tokens.filter((t) => set.has(t)).length / tokens.length;
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (best[0] === 'de' || best[1] < 0.06) return null;
  if (best[1] < counts.de * 1.1) return null;
  return best[0];
}

function languageScores(add, text, subjects) {
  const lang = detectLanguage(text);
  if (!lang) return;
  const s = subjects.find((x) => x.lang === lang);
  if (s) add(s.id, 3.4, `Text ist auf ${LANG_NAMES[lang]}`);
}

// ---------- 4. Lernen aus der Bibliothek (TF-IDF-Ähnlichkeit) ----------

function termFreq(text) {
  const tf = new Map();
  for (const t of tokenize(text)) {
    if (t.length < 4 || DE_STOP.has(t)) continue;
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  return tf;
}

let modelCache = { key: '', model: null };

function buildModel(docs) {
  const key = docs.length + ':' + (docs[0]?.id || '') + ':' + (docs[docs.length - 1]?.id || '');
  if (modelCache.key === key) return modelCache.model;
  const df = new Map();
  const perSubject = new Map();
  for (const d of docs) {
    if (!d.text || !d.subject) continue;
    const tf = termFreq(d.text);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    if (!perSubject.has(d.subject)) perSubject.set(d.subject, { tf: new Map(), n: 0 });
    const agg = perSubject.get(d.subject);
    agg.n++;
    for (const [t, c] of tf) agg.tf.set(t, (agg.tf.get(t) || 0) + Math.min(c, 5));
  }
  const N = docs.length;
  const idf = (t) => Math.log(1 + N / (1 + (df.get(t) || 0)));
  const centroids = new Map();
  for (const [sid, agg] of perSubject) {
    const vec = new Map();
    let norm2 = 0;
    for (const [t, c] of agg.tf) { const w = (c / agg.n) * idf(t); vec.set(t, w); norm2 += w * w; }
    centroids.set(sid, { vec, norm: Math.sqrt(norm2) || 1, n: agg.n });
  }
  const model = { idf, centroids };
  modelCache = { key, model };
  return model;
}

function similarityScores(add, text, docs, subjectById) {
  if (!text || docs.length < 3) return;
  const model = buildModel(docs);
  if (model.centroids.size < 2) return;
  const tf = termFreq(text);
  const vec = new Map();
  let norm2 = 0;
  for (const [t, c] of tf) { const w = c * model.idf(t); vec.set(t, w); norm2 += w * w; }
  const n = Math.sqrt(norm2) || 1;
  for (const [sid, cen] of model.centroids) {
    let dot = 0;
    for (const [t, w] of vec) { const cw = cen.vec.get(t); if (cw) dot += w * cw; }
    const sim = dot / (n * cen.norm);
    if (sim > 0.05) {
      const name = subjectById.get(sid)?.name || sid;
      add(sid, Math.min(3.5, sim * 9), sim > 0.12 ? `ähnlich wie ${cen.n} ${cen.n === 1 ? 'früheres' : 'frühere'} ${name}-${cen.n === 1 ? 'Blatt' : 'Blätter'}` : null);
    }
  }
}

// ---------- Alles zusammen ----------

/**
 * @returns Liste [{ id, score, reasons }] – bestes Fach zuerst
 */
export function classify({ text = '', when = new Date(), subjects, timetable, docs = [] }) {
  const visible = subjects.filter((s) => !s.hidden);
  // Untis-Kürzel ("D") zeigen auf das jeweilige Fach
  const subjectById = new Map();
  subjects.forEach((s) => { subjectById.set(s.id, s); (s.untis || []).forEach((u) => subjectById.set(u, s)); });
  const scores = new Map();
  const add = (id, pts, reason) => {
    const s = subjectById.get(id);
    if (!s || s.hidden) return;
    const e = scores.get(s.id) || { id: s.id, score: 0, reasons: [] };
    e.score += pts;
    if (reason) e.reasons.push({ pts, text: reason });
    scores.set(s.id, e);
  };
  timetableScores(add, timetable, when, subjectById);
  keywordScores(add, text, visible);
  languageScores(add, text, visible);
  similarityScores(add, text, docs, subjectById);

  const ranked = [...scores.values()]
    .map((e) => ({ ...e, reasons: e.reasons.sort((a, b) => b.pts - a.pts).map((r) => r.text) }))
    .sort((a, b) => b.score - a.score);
  const [top, second] = ranked;
  const confident = !!top && top.score >= 2.5 && (!second || top.score - second.score >= 1.5);
  return { ranked, confident };
}

// ---------- Titel-Vorschlag ----------

const JUNK = /^(name|datum|klasse|kl\.|fach|seite|nr\.?|date|class)\b/i;

/** Sucht die Überschrift: große Schrift im oberen Teil der ersten Seite */
export function suggestTitle(page) {
  if (!page) return '';
  const lines = page.lines || [];
  const height = page.height || 1;
  const candidates = lines
    .map((l) => {
      const text = l.text.replace(/\s+/g, ' ').replace(/[|_~]+/g, ' ').trim();
      const letters = (text.match(/[A-Za-zÄÖÜäöüß]/g) || []).length;
      return { text, letters, h: l.bbox.y1 - l.bbox.y0, y: l.bbox.y0 / height, conf: l.confidence ?? 80 };
    })
    .filter((c) => c.text.length >= 4 && c.text.length <= 70 && c.letters / c.text.length > 0.6 && c.y < 0.45 && !JUNK.test(c.text) && c.conf > 50 && !/_{3,}|\.{4,}/.test(c.text));
  if (!candidates.length) return '';
  const medianH = [...lines].map((l) => l.bbox.y1 - l.bbox.y0).sort((a, b) => a - b)[Math.floor(lines.length / 2)] || 1;
  const scored = candidates.map((c) => ({
    ...c,
    score: (c.h / medianH) * 2 - c.y * 2 + (/arbeitsblatt|thema|übung|aufgabe|test|worksheet|lektion|unit|kapitel/i.test(c.text) ? 0.6 : 0),
  })).sort((a, b) => b.score - a.score);
  return cleanTitle(scored[0].text);
}

export function cleanTitle(t) {
  return t
    .replace(/^(arbeitsblatt|übungsblatt|infoblatt|ab|worksheet|fiche)\s*\d*\s*[:\-–]\s*/i, '')
    .replace(/[\s:;,.\-–]+$/, '')
    .replace(/^[\s:;,.\-–•*]+/, '')
    .slice(0, 60)
    .trim();
}
