// Holt deinen Stundenplan aus WebUntis und speichert ihn als untis/timetable.json
// im aktuellen Ordner (= deine Ablage). Wird von untis-sync.ps1 gestartet.
//
// Umgebungsvariablen (setzt untis-sync.ps1 aus deiner gespeicherten Einrichtung):
//   UNTIS_URL       Adresse von WebUntis, z. B. https://xyz.webuntis.com/WebUntis/?school=abc
//   UNTIS_USER      dein Benutzername
//   UNTIS_PASSWORD  dein Passwort
// Optional:
//   UNTIS_SCHOOL    Schul-Login-Name oder Schulname (falls er nicht in UNTIS_URL steht)
//   UNTIS_QR        statt Benutzer/Passwort: Inhalt des QR-Codes aus WebUntis (Profil → Freigaben)

import fs from 'node:fs/promises';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const OUT = 'untis/timetable.json';
const DAYS_BACK = 21;
const DAYS_AHEAD = 35;
const KEEP_HISTORY_DAYS = 400;

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const untisDate = (n) => { const s = String(n); return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`; };
export const untisTime = (n) => { const s = String(n).padStart(4, '0'); return `${s.slice(0, 2)}:${s.slice(2)}`; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const uniq = (arr) => [...new Set(arr.filter(Boolean))];

// ---------- Umwandeln ----------

export function convertLessons(raw) {
  const seen = new Set();
  const out = [];
  for (const l of raw) {
    const su = l.su?.[0];
    if (!su?.name) continue;
    const lesson = {
      date: untisDate(l.date),
      start: untisTime(l.startTime),
      end: untisTime(l.endTime),
      subject: su.name,
      subjectName: su.longname || '',
      teachers: uniq((l.te || []).map((t) => t.name)),
      teacherNames: uniq((l.te || []).map((t) => t.longname)),
      rooms: uniq((l.ro || []).map((r) => r.name)),
      status: l.code === 'cancelled' ? 'cancelled' : l.code === 'irregular' ? 'changed' : 'normal',
    };
    const info = uniq([l.substText, l.info, l.lstext]).join(' · ');
    if (info) lesson.info = info;
    const key = `${lesson.date} ${lesson.start} ${lesson.subject}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lesson);
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

export function collectSubjects(lessons, untisSubjects = []) {
  const colors = new Map(untisSubjects.map((s) => [s.name, s.backColor ? `#${s.backColor.replace('#', '')}` : null]));
  const map = new Map();
  for (const l of lessons) {
    if (!map.has(l.subject)) map.set(l.subject, { short: l.subject, long: l.subjectName, teachers: new Set(), teacherNames: new Set() });
    const s = map.get(l.subject);
    if (!s.long && l.subjectName) s.long = l.subjectName;
    if (l.status !== 'changed') {
      l.teachers.forEach((t) => s.teachers.add(t));
      l.teacherNames.forEach((t) => s.teacherNames.add(t));
    }
  }
  return [...map.values()].map((s) => ({
    short: s.short,
    long: s.long,
    teachers: [...s.teachers],
    teacherNames: [...s.teacherNames],
    ...(colors.get(s.short) ? { color: colors.get(s.short) } : {}),
  })).sort((a, b) => (a.long || a.short).localeCompare(b.long || b.short, 'de'));
}

/** Regulärer Wochenplan (häufigstes Fach pro Wochentag und Uhrzeit) – Ersatz für Tage ohne Daten */
export function weekPattern(lessons) {
  const slots = new Map();
  for (const l of lessons) {
    if (l.status !== 'normal') continue;
    const [y, m, d] = l.date.split('-').map(Number);
    const wd = new Date(y, m - 1, d).getDay();
    const key = `${wd}|${l.start}`;
    if (!slots.has(key)) slots.set(key, { wd, start: l.start, end: l.end, counts: new Map() });
    const slot = slots.get(key);
    slot.counts.set(l.subject, (slot.counts.get(l.subject) || 0) + 1);
  }
  const pattern = {};
  for (const slot of slots.values()) {
    const [subject, n] = [...slot.counts].sort((a, b) => b[1] - a[1])[0];
    if (n < 2) continue; // nur Stunden, die mindestens zweimal vorkamen
    (pattern[slot.wd] ||= []).push({ start: slot.start, end: slot.end, subject });
  }
  Object.values(pattern).forEach((list) => list.sort((a, b) => a.start.localeCompare(b.start)));
  return pattern;
}

function subjectKey(subjects, name) {
  if (!name) return '';
  const lower = String(name).toLowerCase();
  const hit = subjects.find((s) => s.short.toLowerCase() === lower || (s.long && s.long.toLowerCase() === lower));
  return hit ? hit.short : name;
}

// ---------- Anmelden ----------

const SCHOOL_HINT = 'Kopier die Adresse am besten von der WebUntis-Anmeldeseite (vor dem Einloggen) – sie enthält „?school=…“.';

async function searchSchools(query) {
  const res = await fetch('https://mobile.webuntis.com/ms/schoolquery2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '1', jsonrpc: '2.0', method: 'searchSchool', params: [{ search: query }] }),
  });
  const data = await res.json();
  return data?.result?.schools || [];
}

async function findSchool(query, server = '') {
  let schools = await searchSchools(query);
  if (server) schools = schools.filter((s) => String(s.server).toLowerCase() === server.toLowerCase());
  if (schools.length === 1) return { server: schools[0].server, school: schools[0].loginName };
  if (!schools.length) throw new Error(`Schule nicht gefunden. ${SCHOOL_HINT}`);
  throw new Error(`${schools.length} Schulen passen. ${SCHOOL_HINT}`);
}

async function connect(env) {
  const { WebUntis, WebUntisQR } = await import('webuntis');
  if (env.UNTIS_QR) {
    const { authenticator } = await import('otplib');
    return { client: new WebUntisQR(env.UNTIS_QR.trim(), 'schul-scanner', authenticator, URL), school: new URL(env.UNTIS_QR.trim()).searchParams.get('school') };
  }
  if (!env.UNTIS_USER || !env.UNTIS_PASSWORD) throw new Error('Benutzername oder Passwort fehlen. Bitte "Untis einrichten.cmd" nochmal starten.');
  let server = '', school = '';
  if (env.UNTIS_URL) {
    const raw = env.UNTIS_URL.trim();
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    server = u.host;
    school = u.searchParams.get('school') || new URLSearchParams(u.hash.split('?')[1] || '').get('school') || '';
  }
  if (!school && env.UNTIS_SCHOOL) {
    if (server && /^[\w.+-]+$/.test(env.UNTIS_SCHOOL.trim())) school = env.UNTIS_SCHOOL.trim();
    else ({ server, school } = await findSchool(env.UNTIS_SCHOOL.trim()));
  }
  // Neue Adressen sehen oft so aus: https://meine-schule.webuntis.com/today → Schule über den Servernamen suchen
  if (!school && server) ({ server, school } = await findSchool(server.split('.')[0].replace(/-/g, ' '), server));
  if (!server || !school) throw new Error(`Schule unbekannt. ${SCHOOL_HINT}`);
  return { client: new WebUntis(school, env.UNTIS_USER.trim(), env.UNTIS_PASSWORD, server, 'schul-scanner'), school };
}

// ---------- Hauptprogramm ----------

async function main() {
  const env = process.env;
  const { client, school } = await connect(env);
  console.log('Melde mich bei WebUntis an …');
  try {
    await client.login();
  } catch (e) {
    throw new Error(`Anmeldung bei WebUntis fehlgeschlagen (${e.message}). Stimmen Adresse, Benutzername und Passwort? `
      + 'Hinweis: Meldest du dich bei Untis über IServ/Microsoft an, klappt die Anmeldung mit Passwort evtl. nicht.');
  }
  console.log('Angemeldet ✓');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = addDays(today, -DAYS_BACK);
  const to = addDays(today, DAYS_AHEAD);

  // Woche für Woche holen (manche Server mögen keine langen Zeiträume)
  const raw = [];
  for (let start = new Date(from); start <= to; start = addDays(start, 7)) {
    const end = addDays(start, 6) > to ? to : addDays(start, 6);
    try {
      raw.push(...await client.getOwnTimetableForRange(start, end));
    } catch (e) {
      if (!/no result|-7004|nicht gefunden/i.test(e.message)) console.warn(`Eine Woche konnte nicht geladen werden (${e.message})`);
    }
  }
  const lessons = convertLessons(raw);
  console.log(`${lessons.length} Stunden geladen`);

  let untisSubjects = [];
  try { untisSubjects = await client.getSubjects(); } catch { /* für Schüler oft nicht erlaubt */ }

  // Alte Datei lesen und Verlauf behalten (für Fotos, die man später einsortiert)
  let old = null;
  try { old = JSON.parse(await fs.readFile(OUT, 'utf8')); } catch { /* erste Ausführung */ }
  const fromIso = isoDate(from), toIso = isoDate(to);
  const keepFrom = isoDate(addDays(today, -KEEP_HISTORY_DAYS));
  const history = (old?.lessons || []).filter((l) => l.date >= keepFrom && (l.date < fromIso || l.date > toIso));
  const allLessons = [...history, ...lessons].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const subjects = collectSubjects(allLessons, untisSubjects);

  let homework = [];
  try {
    const hw = await client.getHomeWorksFor(addDays(today, -7), addDays(today, 28));
    const lessonSubject = new Map((hw.lessons || []).map((l) => [l.id, l.subject]));
    homework = (hw.homeworks || []).map((h) => ({
      due: untisDate(h.dueDate),
      date: untisDate(h.date),
      subject: subjectKey(subjects, lessonSubject.get(h.lessonId)),
      text: [h.text, h.remark].filter(Boolean).join(' – ').trim(),
      done: !!h.completed,
    })).filter((h) => h.text);
    console.log(`${homework.length} Hausaufgaben`);
  } catch (e) { console.log(`Hausaufgaben nicht verfügbar (${e.message})`); }

  let exams = [];
  try {
    const list = await client.getExamsForRange(today, addDays(today, 90));
    exams = list.map((e) => ({
      date: untisDate(e.examDate),
      start: e.startTime ? untisTime(e.startTime) : '',
      subject: subjectKey(subjects, e.subject),
      name: e.name || e.examType || 'Prüfung',
      text: e.text || '',
    }));
    console.log(`${exams.length} Prüfungen/Arbeiten`);
  } catch (e) { console.log(`Prüfungen nicht verfügbar (${e.message})`); }

  try { await client.logout(); } catch { /* egal */ }

  const data = {
    version: 1,
    source: 'pc',
    school,
    range: { from: fromIso, to: toIso },
    subjects,
    lessons: allLessons,
    weekPattern: weekPattern(allLessons),
    homework,
    exams,
  };

  // Nur speichern, wenn sich wirklich etwas geändert hat (sonst unnötige Commits)
  const strip = (d) => JSON.stringify({ ...d, updated: undefined });
  if (old && strip(old) === strip(data)) {
    console.log('Keine Änderungen.');
    return;
  }
  data.updated = new Date().toISOString();
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(data, null, 1) + '\n');
  console.log('Stundenplan gespeichert ✓');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  });
}
