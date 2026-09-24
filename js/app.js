// Oberfläche: Bibliothek, Fach, Blatt, Einstellungen – und der Scan-Ablauf.

import { $, $$, esc, uid, isoDate, fmtDay, fmtLong, fmtMonth, fmtAgo, daysUntil, toast, textOn, icons } from './util.js';
import {
  state, init, onChange, connected, updateSettings, refresh, syncOutbox, subjects, subjectById,
  allDocs, docById, addDoc, updateDoc, deleteDoc, thumbUrl, pdfBlob, search, saveSubjects,
} from './library.js';
import { GitHub } from './github.js';
import { lessonAt, classify, suggestTitle, cleanTitle } from './classify.js';
import { loadPhoto, detectQuad, defaultQuad, warp, rotate, rotateQuad, enhance, forOcr, thumbnail, makeCanvas } from './scanner.js';
import { recognize, warmUp } from './ocr.js';
import { buildPdf, renderPdf, inspectPdf, toJpegBlob } from './pdf.js';
import { persist } from './store.js';

const view = $('#view');
let liveUpdate = null;

// ============================================================
// Router
// ============================================================

function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').map(decodeURIComponent);
  liveUpdate = null;
  window.scrollTo(0, 0);
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === (parts[0] === 'einstellungen' ? 'settings' : 'library')));
  if (parts[0] === 'fach' && parts[1]) return renderSubject(parts[1]);
  if (parts[0] === 'blatt' && parts[1]) return renderDoc(parts[1]);
  if (parts[0] === 'einstellungen' && parts[1] === 'fach') return renderSubjectEdit(parts[2]);
  if (parts[0] === 'einstellungen') return renderSettings();
  return renderLibrary();
}

const go = (hash) => { location.hash = hash; };

// ============================================================
// Bausteine
// ============================================================

function badge(s, size = 34) {
  const color = s?.color || '#8d8d86';
  const label = (s?.name || '?').replace(/[^A-Za-zÄÖÜäöü]/g, '').slice(0, 2) || '?';
  return `<span class="badge" style="background:${esc(color)};color:${textOn(color)};width:${size}px;height:${size}px">${esc(label)}</span>`;
}

function docRow(d, { showSubject = true } = {}) {
  const s = subjectById(d.subject);
  const sub = [showSubject && s?.name, fmtDay(d.date), d.pages > 1 ? `${d.pages} Seiten` : null].filter(Boolean).join(' · ');
  return `<a class="row" href="#/blatt/${encodeURIComponent(d.id)}">
    <div class="thumb" data-thumb="${esc(d.id)}">${d.pending ? '<span class="pending" title="Wartet auf Upload"></span>' : ''}</div>
    <div class="grow">
      <div class="title">${esc(d.title)}</div>
      <div class="sub">${esc(sub)}</div>
      ${d.snippet ? `<div class="snippet">${highlight(d.snippet, $('#q')?.value || '')}</div>` : ''}
    </div>
    <span class="chev">${icons.chev}</span>
  </a>`;
}

function highlight(text, query) {
  let out = esc(text);
  for (const t of query.split(/\s+/).filter((x) => x.length > 1)) {
    const re = new RegExp(`(${esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    out = out.replace(re, '<mark>$1</mark>');
  }
  return out;
}

async function hydrateThumbs(root = view) {
  for (const el of $$('[data-thumb]', root)) {
    const d = docById(el.dataset.thumb);
    if (!d) continue;
    thumbUrl(d).then((url) => { if (url) el.style.backgroundImage = `url("${url}")`; }).catch(() => {});
  }
}

function syncPill() {
  let color = 'var(--ok)', label = 'Synchron';
  if (!connected()) { color = 'var(--text-3)'; label = 'Nur auf diesem Gerät'; }
  else if (state.syncing) { color = 'var(--accent)'; label = 'Lädt hoch…'; }
  else if (state.lastError) { color = 'var(--danger)'; label = state.pending.length ? `${state.pending.length} warten` : 'Fehler'; }
  else if (state.pending.length) { color = 'var(--warn)'; label = `${state.pending.length} warten`; }
  return `<button class="status-pill" id="sync-pill" type="button"><span class="dot" style="background:${color}"></span>${esc(label)}</button>`;
}

function bindSyncPill() {
  $('#sync-pill')?.addEventListener('click', async () => {
    if (!connected()) return go('#/einstellungen');
    if (state.lastError) toast(state.lastError, 4000);
    await refresh();
    await syncOutbox();
    if (!state.lastError) toast('Alles aktuell');
  });
}

const lessonName = (l) => subjectById(l.subject)?.name || l.subjectName || l.subject;

// ============================================================
// Bibliothek
// ============================================================

function renderLibrary() {
  view.innerHTML = `
    <div class="page-head"><h1>Bibliothek</h1><span id="pill-slot">${syncPill()}</span></div>
    <label class="search">${icons.search}<input id="q" type="search" placeholder="In allen Blättern suchen" autocomplete="off" enterkeyhint="search"></label>
    <div id="lib-content"></div>`;
  const q = $('#q');
  q.value = sessionStorage.getItem('q') || '';
  q.addEventListener('input', () => { sessionStorage.setItem('q', q.value); renderLibraryContent(); });
  bindSyncPill();
  renderLibraryContent();
  liveUpdate = () => {
    $('#pill-slot').innerHTML = syncPill();
    bindSyncPill();
    renderLibraryContent();
  };
}

function renderLibraryContent() {
  const el = $('#lib-content');
  if (!el) return;
  const query = $('#q').value.trim();
  if (query) {
    const results = search(query);
    el.innerHTML = results.length
      ? `<div class="section-title">${results.length} ${results.length === 1 ? 'Treffer' : 'Treffer'}</div><div class="list">${results.map((d) => docRow(d)).join('')}</div>`
      : `<div class="empty">${icons.search}Nichts gefunden für „${esc(query)}“.</div>`;
    hydrateThumbs(el);
    return;
  }

  const docs = allDocs();
  const subs = subjects().filter((s) => !s.hidden);
  const counts = new Map();
  docs.forEach((d) => { const s = subjectById(d.subject); if (s) counts.set(s.id, (counts.get(s.id) || 0) + 1); });

  const setup = !connected() ? `
    <div class="note" style="margin-top:14px">
      <b>Noch nicht verbunden</b>
      Deine Blätter bleiben erstmal nur auf diesem Gerät. Verbinde dein GitHub-Repo, damit alles gesichert ist und du es am PC siehst.
      <div style="margin-top:10px"><a class="btn small primary" href="#/einstellungen">Jetzt einrichten</a></div>
    </div>` : '';

  const recent = [...docs].sort((a, b) => (b.created || '').localeCompare(a.created || '')).slice(0, 8);

  el.innerHTML = `
    ${setup}
    ${todayCard()}
    <div class="section-title">Fächer</div>
    <div class="grid">
      ${subs.map((s) => `
        <a class="tile" href="#/fach/${encodeURIComponent(s.id)}" style="--c:${esc(s.color)}">
          ${badge(s)}
          <div class="name">${esc(s.name)}</div>
          <div class="count">${counts.get(s.id) || 0} ${(counts.get(s.id) || 0) === 1 ? 'Blatt' : 'Blätter'}</div>
        </a>`).join('')}
    </div>
    <div class="section-title">Zuletzt hinzugefügt</div>
    ${recent.length
      ? `<div class="list">${recent.map((d) => docRow(d)).join('')}</div>`
      : `<div class="card empty">${icons.file}Noch keine Blätter. Tipp unten auf den blauen Knopf, um dein erstes Blatt zu scannen.</div>`}
  `;
  hydrateThumbs(el);
}

function todayCard() {
  const tt = state.timetable;
  if (!tt) return '';
  const now = new Date();
  const { now: cur, next, past, all } = lessonAt(tt, now);
  const detail = (l) => [`${l.start}–${l.end}`, l.teachers?.join(', '), l.rooms?.join(', ')].filter(Boolean).join(' · ');
  let main = '';
  const lesson = cur || next;
  if (lesson) {
    const s = subjectById(lesson.subject);
    const label = cur ? 'Jetzt' : past.length ? 'Als Nächstes' : 'Heute zuerst';
    const flag = lesson.status === 'changed' ? ' <span class="small" style="color:var(--warn)">Vertretung/Änderung</span>' : '';
    main = `<div class="now">${badge(s || { name: lesson.subject })}<div><div class="label">${label}</div><div class="what">${esc(lessonName(lesson))}${flag}</div><div class="small muted">${esc(detail(lesson))}</div></div></div>`;
  } else if (all.length) {
    main = `<div class="now"><div><div class="label">Heute</div><div class="what">Schule ist aus 🎉</div></div></div>`;
  }

  // Heutige Stunden als kleine Chips (Doppelstunden zusammengefasst)
  const sorted = [...all].sort((a, b) => a.start.localeCompare(b.start));
  const merged = [];
  sorted.forEach((l) => {
    const last = merged[merged.length - 1];
    if (last && last.subject === l.subject && last.status === l.status) last.end = l.end;
    else merged.push({ ...l });
  });
  const chips = merged.length ? `<div class="chips">${merged.map((l) => {
    const s = subjectById(l.subject);
    const cancelled = l.status === 'cancelled';
    return `<span class="chip" style="${cancelled ? 'text-decoration:line-through;opacity:.5' : ''}" title="${esc(detail(l))}"><span class="dot" style="background:${esc(s?.color || '#8d8d86')}"></span>${esc(l.start)} ${esc(lessonName(l))}</span>`;
  }).join('')}</div>` : '';

  const today = isoDate();
  const exams = (tt.exams || []).filter((e) => e.date >= today && daysUntil(e.date) <= 21);
  const homework = (tt.homework || []).filter((h) => !h.done && h.due >= today && daysUntil(h.due) <= 7);
  const upcoming = [
    ...exams.map((e) => ({ date: e.date, text: `📝 ${e.name || 'Arbeit'} ${subjectById(e.subject)?.name || e.subject}` })),
    ...homework.map((h) => ({ date: h.due, text: `📚 ${subjectById(h.subject)?.name || h.subject}: ${h.text}` })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const up = upcoming.length ? `<div class="upcoming">${upcoming.map((u) => `<div><b>${esc(fmtDay(u.date))}</b><span>${esc(u.text)}</span></div>`).join('')}</div>` : '';

  if (!main && !chips && !up) return '';
  return `<div class="section-title">Heute <span class="small muted" style="text-transform:none;letter-spacing:0;font-weight:400">Stundenplan ${esc(fmtAgo(tt.updated))}</span></div>
    <div class="card today">${main}${chips}${up}</div>`;
}

// ============================================================
// Fach
// ============================================================

function renderSubject(id) {
  const draw = () => {
    const s = subjectById(id);
    if (!s) { view.innerHTML = `<div class="empty">Fach nicht gefunden.</div>`; return; }
    const docs = allDocs().filter((d) => subjectById(d.subject)?.id === s.id).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || ''));
    const groups = new Map();
    docs.forEach((d) => { const k = d.date.slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); });
    view.innerHTML = `
      <button class="back" type="button" onclick="history.length > 1 ? history.back() : location.hash = '#/'">${icons.back}Bibliothek</button>
      <div class="page-head">${badge(s, 40)}<h1>${esc(s.name)}</h1></div>
      <p class="muted small" style="margin:-6px 4px 0">${docs.length} ${docs.length === 1 ? 'Blatt' : 'Blätter'}${s.teachers?.length ? ` · ${esc(s.teachers.join(', '))}` : ''}</p>
      ${docs.length ? [...groups].map(([k, list]) => `
        <div class="section-title">${esc(fmtMonth(k + '-01'))}</div>
        <div class="list">${list.map((d) => docRow(d, { showSubject: false })).join('')}</div>`).join('')
      : `<div class="card empty" style="margin-top:18px">${icons.folder}Noch keine Blätter in ${esc(s.name)}.</div>`}
    `;
    hydrateThumbs();
  };
  draw();
  liveUpdate = draw;
}

// ============================================================
// Blatt
// ============================================================

function renderDoc(id) {
  const d = docById(id);
  if (!d) { view.innerHTML = `<button class="back" onclick="location.hash='#/'">${icons.back}Bibliothek</button><div class="empty">Blatt nicht gefunden.</div>`; return; }
  const s = subjectById(d.subject);
  const subs = subjects().filter((x) => !x.hidden || x.id === s?.id);
  view.innerHTML = `
    <button class="back" type="button" id="doc-back">${icons.back}${esc(s?.name || 'Zurück')}</button>
    <div class="page-head small"><h1>${esc(d.title)}</h1></div>
    <p class="muted small" style="margin:-8px 4px 14px">${esc([s?.name, fmtLong(d.date), `${d.pages} ${d.pages === 1 ? 'Seite' : 'Seiten'}`, d.lesson?.teachers?.join(', ')].filter(Boolean).join(' · '))}${d.pending ? ' · <span style="color:var(--warn)">wartet auf Upload</span>' : ''}</p>
    <div class="btn-row">
      <button class="btn" id="doc-share" type="button">${icons.share}Teilen</button>
      <button class="btn" id="doc-edit" type="button">Bearbeiten</button>
    </div>
    <form id="doc-form" class="card" style="padding:16px;margin-top:12px" hidden>
      <label class="field"><span>Titel</span><input class="input" name="title" value="${esc(d.title)}" required></label>
      <div class="meta-grid">
        <label class="field"><span>Fach</span><select class="input" name="subject">${subs.map((x) => `<option value="${esc(x.id)}" ${x.id === s?.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Datum</span><input class="input" type="date" name="date" value="${esc(d.date)}" required></label>
      </div>
      <div class="btn-row">
        <button class="btn danger" type="button" id="doc-delete">${icons.trash}Löschen</button>
        <button class="btn primary" type="submit">Speichern</button>
      </div>
    </form>
    <div class="section-title">Vorschau</div>
    <div class="pages" id="doc-pages"><div class="progress"><div class="spinner"></div></div></div>
    ${d.text ? `<details class="ocr"><summary>Erkannter Text</summary><pre>${esc(d.text)}</pre></details>` : ''}
  `;
  $('#doc-back').onclick = () => (history.length > 1 ? history.back() : go(`#/fach/${encodeURIComponent(s?.id || '')}`));
  $('#doc-edit').onclick = () => { const f = $('#doc-form'); f.hidden = !f.hidden; };
  $('#doc-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const changes = { title: cleanTitle(String(f.get('title'))) || d.title, subject: String(f.get('subject')), date: String(f.get('date')) };
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Speichert…';
    try {
      await updateDoc(d.id, changes);
      toast('Gespeichert');
      renderDoc(d.id);
    } catch (err) {
      toast(err.message, 4000);
      btn.disabled = false; btn.textContent = 'Speichern';
    }
  };
  $('#doc-delete').onclick = async () => {
    if (!confirm(`„${d.title}“ wirklich löschen?`)) return;
    try {
      await deleteDoc(d.id);
      toast('Gelöscht');
      go(`#/fach/${encodeURIComponent(s?.id || '')}`);
    } catch (err) { toast(err.message, 4000); }
  };
  $('#doc-share').onclick = async () => {
    try {
      const blob = await pdfBlob(d);
      const name = `${d.date} ${d.title}.pdf`.replace(/[\\/:*?"<>|]/g, ' ');
      const file = new File([blob], name, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: d.title });
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      }
    } catch (err) { if (err.name !== 'AbortError') toast(err.message, 4000); }
  };

  const pagesEl = $('#doc-pages');
  pdfBlob(d)
    .then((blob) => renderPdf(blob, pagesEl))
    .catch((err) => { pagesEl.innerHTML = `<div class="note warn"><b>Vorschau nicht verfügbar</b>${esc(err.message)}</div>`; });
}

// ============================================================
// Einstellungen
// ============================================================

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new?name=Schul-Scanner&description=Zugriff+der+Schul-Scanner-App+auf+die+Ablage&expires_in=365&contents=write';

function renderSettings() {
  const st = state.settings;
  const subs = subjects();
  view.innerHTML = `
    <div class="page-head"><h1>Einstellungen</h1></div>

    <div class="section-title">Ablage auf GitHub</div>
    <div id="gh-section"></div>

    <div class="section-title">Stundenplan (Untis)</div>
    <div id="untis-section"></div>

    <div class="section-title">Fächer <a href="#/einstellungen/fach/neu">+ Neues Fach</a></div>
    <div class="list">${subs.filter((s) => !s.hidden).map(subjectRow).join('')}</div>
    ${subs.some((s) => s.hidden) ? `<details class="ocr"><summary>Ausgeblendete Fächer (${subs.filter((s) => s.hidden).length})</summary>
      <div class="list">${subs.filter((s) => s.hidden).map(subjectRow).join('')}</div></details>` : ''}

    <div class="section-title">Scannen</div>
    <div class="card" style="padding:14px">
      <label class="field"><span>Standard-Look für Scans</span>
        <div class="segmented" id="filter-seg">
          ${[['color', 'Farbe'], ['gray', 'Schwarz-Weiß'], ['original', 'Original']].map(([k, l]) => `<button type="button" data-v="${k}" class="${st.filter === k ? 'on' : ''}">${l}</button>`).join('')}
        </div>
      </label>
      <label class="field" style="margin:0"><span>Sprachen für die Texterkennung</span>
        <select class="input" id="ocr-lang">
          ${[['deu+eng', 'Deutsch + Englisch'], ['deu', 'Nur Deutsch (schneller)'], ['deu+eng+fra', 'Deutsch + Englisch + Französisch'], ['deu+eng+lat', 'Deutsch + Englisch + Latein'], ['deu+eng+spa', 'Deutsch + Englisch + Spanisch']]
            .map(([k, l]) => `<option value="${k}" ${st.ocrLang === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>
    </div>

    <p class="muted small" style="text-align:center;margin-top:28px">Schul-Scanner · Version 1.0<br>Texterkennung läuft direkt auf deinem Gerät.</p>
  `;
  $$('#filter-seg button').forEach((b) => b.onclick = () => {
    updateSettings({ filter: b.dataset.v });
    $$('#filter-seg button').forEach((x) => x.classList.toggle('on', x === b));
  });
  $('#ocr-lang').onchange = (e) => updateSettings({ ocrLang: e.target.value });
  renderGhSection();
  renderUntisSection();
  liveUpdate = () => { renderGhSection(); renderUntisSection(); };
}

function subjectRow(s) {
  const sub = [s.untis?.length || s.fromUntis ? `Untis: ${(s.untis || [s.id]).join(', ')}` : null, s.teachers?.join(', ')].filter(Boolean).join(' · ');
  return `<a class="row" href="#/einstellungen/fach/${encodeURIComponent(s.id)}">
    <span class="dot" style="background:${esc(s.color)}"></span>
    <div class="grow"><div class="title" style="${s.hidden ? 'color:var(--text-2)' : ''}">${esc(s.name)}</div>
    <div class="sub">${esc(sub || 'eigenes Fach')}</div></div>
    <span class="chev">${icons.chev}</span>
  </a>`;
}

function renderGhSection() {
  const el = $('#gh-section');
  if (!el) return;
  const st = state.settings;
  if (connected()) {
    if (el.dataset.mode === 'connected' && el.contains(document.activeElement)) return;
    el.dataset.mode = 'connected';
    el.innerHTML = `
      <div class="list">
        <a class="row" href="https://github.com/${esc(st.repo)}" target="_blank" rel="noopener">
          <span class="dot" style="background:${state.lastError ? 'var(--danger)' : 'var(--ok)'}"></span>
          <div class="grow"><div class="title">${esc(st.repo)}</div><div class="sub">${esc(state.lastError || `${state.index.docs.length} ${state.index.docs.length === 1 ? 'Blatt' : 'Blätter'} gesichert${state.pending.length ? ` · ${state.pending.length} warten` : ''}`)}</div></div>
          <span class="chev">${icons.chev}</span>
        </a>
        <button class="row" type="button" id="gh-sync"><span class="grow" style="color:var(--accent)">Jetzt synchronisieren</span></button>
        <button class="row" type="button" id="gh-disconnect"><span class="grow" style="color:var(--danger)">Von diesem Gerät trennen</span></button>
      </div>`;
    $('#gh-sync').onclick = async () => { await refresh(); await syncOutbox(); toast(state.lastError || 'Alles aktuell'); };
    $('#gh-disconnect').onclick = () => {
      if (!confirm('Token von diesem Gerät entfernen? Deine Blätter auf GitHub bleiben erhalten.')) return;
      updateSettings({ token: '' });
    };
    return;
  }
  if (el.dataset.mode === 'setup') return; // Formular nicht beim Tippen neu zeichnen
  el.dataset.mode = 'setup';
  el.innerHTML = `
    <div class="note">
      <b>So verbindest du deine Ablage</b>
      <ol>
        <li><a href="${TOKEN_URL}" target="_blank" rel="noopener">Token auf GitHub erstellen</a>.<br>
          <span class="small muted">Repository access: <i>Only select repositories</i> → dein Ablage-Repo. Permissions: <i>Contents</i> auf „Read and write“.</span></li>
        <li>Repo-Name und Token unten eintragen. Der Token bleibt nur auf diesem Gerät.</li>
      </ol>
    </div>
    <form id="gh-form" class="card" style="padding:16px;margin-top:10px">
      <label class="field"><span>Ablage-Repo</span><input class="input" name="repo" placeholder="benutzername/schul-ablage" value="${esc(st.repo)}" autocapitalize="off" autocorrect="off" spellcheck="false" required></label>
      <label class="field"><span>Token</span><input class="input" name="token" type="password" placeholder="github_pat_…" autocomplete="off" required></label>
      <button class="btn primary block" type="submit">Verbinden</button>
    </form>`;
  $('#gh-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const repo = String(f.get('repo')).trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    const token = String(f.get('token')).trim();
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'Prüfe…';
    try {
      const g = new GitHub({ token, repo });
      const info = await g.repoInfo();
      if (info.permissions && !info.permissions.push) throw new Error('Der Token darf in dieses Repo nicht schreiben');
      if (!info.private) toast('Achtung: Dieses Repo ist öffentlich!', 5000);
      updateSettings({ token, repo: info.full_name, branch: info.default_branch || 'main' });
      el.dataset.mode = '';
      await refresh();
      await syncOutbox();
      toast('Verbunden ✓');
    } catch (err) {
      toast(err.status === 404 ? 'Repo nicht gefunden – stimmt der Name und hat der Token Zugriff?' : err.message, 5000);
      btn.disabled = false; btn.textContent = 'Verbinden';
    }
  };
}

// Den Stundenplan holt dein PC (pc-sync/) – die App liest ihn nur aus der Ablage.
function renderUntisSection() {
  const el = $('#untis-section');
  if (!el) return;
  const tt = state.timetable;
  const days = tt?.updated ? (Date.now() - new Date(tt.updated).getTime()) / 86400000 : 0;
  const stale = days > 3;
  const info = tt
    ? `<div class="list">
        <div class="row"><span class="dot" style="background:${stale ? 'var(--warn)' : 'var(--ok)'}"></span><div class="grow"><div class="title">${esc(tt.school || 'Stundenplan geladen')}</div>
        <div class="sub">Stand ${esc(fmtAgo(tt.updated))} · ${tt.subjects?.length || 0} ${tt.subjects?.length === 1 ? 'Fach' : 'Fächer'}</div></div></div>
        <button class="row" type="button" id="untis-reload"><span class="grow" style="color:var(--accent)">Neu laden</span></button>
      </div>
      <p class="small muted" style="margin:8px 4px 0">${stale
        ? 'Dein PC war länger aus – schalt ihn mal an, dann holt er den neuesten Stundenplan.'
        : 'Dein PC aktualisiert den Stundenplan automatisch, wenn er an ist.'}</p>`
    : `<div class="note">
        <b>Stundenplan automatisch aus WebUntis</b>
        Dein PC holt den Stundenplan (inkl. Vertretungen, Hausaufgaben und Arbeiten), sobald er an ist, und legt ihn in deine Ablage. Einmal einrichten:
        <ol>
          <li>Am PC den Ordner <code>schul-scanner\\pc-sync</code> öffnen</li>
          <li>Doppelklick auf <b>Untis einrichten.cmd</b></li>
          <li>WebUntis-Adresse, Benutzername und Passwort eingeben – sie bleiben verschlüsselt auf deinem PC</li>
        </ol>
        <button class="btn small" type="button" id="untis-reload" style="margin-top:10px" ${connected() ? '' : 'disabled'}>Neu laden</button>
      </div>`;
  if (el.dataset.html === info) return;
  el.dataset.html = info;
  el.innerHTML = info;
  $('#untis-reload').onclick = async () => {
    await refresh();
    toast(state.lastError || (state.timetable ? `Stundenplan: Stand ${fmtAgo(state.timetable.updated)}` : 'Noch kein Stundenplan in der Ablage'));
  };
}

function renderSubjectEdit(id) {
  const all = subjects();
  const isNew = id === 'neu';
  const s = isNew ? { id: '', name: '', color: '#0a7cff', keywords: [] } : all.find((x) => x.id === id);
  if (!s) { go('#/einstellungen'); return; }
  const used = allDocs().filter((d) => subjectById(d.subject)?.id === s.id).length;
  view.innerHTML = `
    <button class="back" type="button" onclick="location.hash='#/einstellungen'">${icons.back}Einstellungen</button>
    <div class="page-head small"><h1>${isNew ? 'Neues Fach' : esc(s.name)}</h1></div>
    <form id="subj-form" class="card" style="padding:16px">
      <label class="field"><span>Name</span><input class="input" name="name" value="${esc(s.name)}" required></label>
      <label class="field"><span>Farbe</span><input class="input" name="color" type="color" value="${esc(s.color)}" style="height:48px;padding:4px"></label>
      <label class="field"><span>Eigene Stichwörter (mit Komma getrennt) – helfen beim automatischen Einsortieren</span>
        <textarea class="input" name="keywords" placeholder="z. B. Faust, Goethe, Kurzgeschichte">${esc((s.keywords || []).join(', '))}</textarea></label>
      <label class="row" style="padding:4px 0 14px"><input type="checkbox" name="hidden" ${s.hidden ? 'checked' : ''} style="width:22px;height:22px"><span class="grow">Ausblenden (Fach habe ich nicht)</span></label>
      ${!isNew && (s.untis?.length || s.teachers?.length) ? `<p class="small muted" style="margin:0 4px 14px">Aus Untis: ${esc([(s.untis || []).join(', '), (s.teachers || []).join(', ')].filter(Boolean).join(' · '))}</p>` : ''}
      <div class="btn-row">
        ${!isNew && !used && !s.fromUntis && !s.untis?.length ? `<button class="btn danger" type="button" id="subj-del">${icons.trash}Löschen</button>` : ''}
        <button class="btn primary" type="submit">Speichern</button>
      </div>
    </form>
    ${used ? `<p class="small muted" style="margin:12px 4px">${used} ${used === 1 ? 'Blatt ist' : 'Blätter sind'} in diesem Fach.</p>` : ''}
  `;
  $('#subj-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const patch = {
      name: String(f.get('name')).trim(),
      color: String(f.get('color')),
      keywords: String(f.get('keywords')).split(',').map((k) => k.trim().toLowerCase()).filter(Boolean),
      hidden: f.get('hidden') === 'on',
    };
    const list = isNew
      ? [...all, { id: `f-${uid()}`, ...patch }]
      : all.map((x) => (x.id === s.id ? { ...x, ...patch } : x));
    try {
      await saveSubjects(list);
      toast('Gespeichert');
      go('#/einstellungen');
    } catch (err) { toast(err.message, 4000); }
  };
  $('#subj-del')?.addEventListener('click', async () => {
    if (!confirm(`Fach „${s.name}“ löschen?`)) return;
    await saveSubjects(all.filter((x) => x.id !== s.id)).catch((err) => toast(err.message, 4000));
    go('#/einstellungen');
  });
}

// ============================================================
// Scan-Ablauf
// ============================================================

const sheet = $('#scan');
const isTouch = matchMedia('(pointer: coarse)').matches;
let scan = null;

function openScan() {
  scan = { pages: [], pdf: null, source: null, step: 'start' };
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  warmUp(state.settings.ocrLang);
  drawScan();
}

function closeScan() {
  scan = null;
  sheet.hidden = true;
  sheet.innerHTML = '';
  document.body.style.overflow = '';
}

function pick(input) {
  const el = $(input);
  el.value = '';
  el.click();
}

$('#scan-button').addEventListener('click', () => {
  openScan();
  if (isTouch) pick('#pick-camera'); // Auf dem Handy direkt die Kamera öffnen
});
$('#pick-camera').addEventListener('change', (e) => handleFiles([...e.target.files], 'kamera'));
$('#pick-photos').addEventListener('change', (e) => handleFiles([...e.target.files], 'fotos'));
$('#pick-files').addEventListener('change', (e) => handleFiles([...e.target.files], 'datei'));

async function handleFiles(files, source) {
  if (!files.length || !scan) return;
  const pdf = files.find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (pdf) {
    if (scan.pages.length) toast('PDFs werden einzeln importiert');
    scan.pdf = pdf; scan.source = 'pdf';
    return processPdf();
  }
  scan.source = scan.source || source;
  scan.step = 'loading';
  drawScan();
  const added = [];
  for (const f of files.filter((x) => x.type.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(x.name))) {
    try {
      const { canvas, taken } = await loadPhoto(f);
      const page = { src: canvas, quad: detectQuad(canvas), taken, warped: null };
      page.warped = warp(page.src, page.quad);
      scan.pages.push(page);
      added.push(page);
    } catch (err) { toast(err.message, 4000); }
  }
  // Ein einzelnes Kamerafoto: direkt zum Zuschneiden; mehrere Fotos: Übersicht
  if (added.length === 1 && source === 'kamera') { scan.step = 'crop'; scan.cropIndex = scan.pages.length - 1; }
  else scan.step = scan.pages.length ? 'pages' : 'start';
  drawScan();
}

function drawScan() {
  if (!scan) return;
  const steps = { start: drawStart, loading: drawLoading, crop: drawCrop, pages: drawPages, process: drawLoading, review: drawReview };
  steps[scan.step]();
}

function head(title, left = 'Abbrechen', right = '', rightDisabled = false) {
  return `<div class="sheet-head">
    <button class="link" type="button" data-act="left">${esc(left)}</button>
    <h2>${esc(title)}</h2>
    <button class="link right" type="button" data-act="right" ${right ? '' : 'style="visibility:hidden"'} ${rightDisabled ? 'disabled' : ''}>${esc(right || '–')}</button>
  </div>`;
}

function onHead(left, right) {
  sheet.querySelector('[data-act=left]').onclick = left;
  const r = sheet.querySelector('[data-act=right]');
  if (right) r.onclick = right;
}

function confirmCancel() {
  if (scan?.pages.length && !confirm('Scan verwerfen?')) return;
  closeScan();
}

function drawStart() {
  sheet.innerHTML = `${head('Neues Blatt')}
    <div class="sheet-body">
      <div class="capture-start">
        <button class="big-option" type="button" id="opt-camera">${icons.camera}<div><b>Blatt fotografieren</b><span>Mit der Kamera – wird automatisch zugeschnitten</span></div></button>
        <button class="big-option" type="button" id="opt-photos">${icons.photos}<div><b>Aus deinen Fotos</b><span>z. B. Fotos von der Meta-Brille – mehrere = mehrere Seiten</span></div></button>
        <button class="big-option" type="button" id="opt-files">${icons.file}<div><b>Datei oder PDF</b><span>Aus Dateien, Mail oder der Schul-Cloud</span></div></button>
      </div>
      <p class="muted small" style="text-align:center;margin-top:22px">Tipp: Leg das Blatt auf einen dunklen Tisch – dann findet die App die Kanten am besten.</p>
    </div>`;
  onHead(closeScan);
  $('#opt-camera').onclick = () => pick('#pick-camera');
  $('#opt-photos').onclick = () => pick('#pick-photos');
  $('#opt-files').onclick = () => pick('#pick-files');
}

function drawLoading(text = '') {
  sheet.innerHTML = `${head(scan.step === 'process' ? 'Erkenne Text…' : 'Lade Bild…')}
    <div class="sheet-body"><div class="progress"><div class="spinner"></div><div id="proc-text" class="muted">${esc(typeof text === 'string' ? text : '')}</div><div class="bar" id="proc-bar-wrap" ${scan.step === 'process' ? '' : 'hidden'}><div id="proc-bar"></div></div></div></div>`;
  onHead(confirmCancel);
}

// ---------- Zuschneiden ----------

function drawCrop() {
  const i = scan.cropIndex;
  const page = scan.pages[i];
  const isNewest = i === scan.pages.length - 1 && !page.confirmed;
  sheet.innerHTML = `${head(`Seite ${i + 1} zuschneiden`, isNewest ? 'Nochmal' : 'Zurück', 'Fertig')}
    <div class="sheet-body" id="crop-body">
      <div class="crop-wrap" id="crop-wrap"><canvas id="crop-canvas"></canvas><svg class="quad" id="crop-svg" preserveAspectRatio="none"><polygon id="crop-poly"/></svg></div>
      <div class="crop-tools">
        <button class="btn small" type="button" id="crop-rotate">${icons.rotate}Drehen</button>
        <button class="btn small" type="button" id="crop-full">${icons.expand}Ganzes Bild</button>
        <button class="btn small" type="button" id="crop-auto">${icons.spark}Automatisch</button>
      </div>
      <p class="muted small" style="text-align:center">Zieh die Ecken auf die Ecken des Blatts.</p>
    </div>`;
  onHead(
    () => {
      if (isNewest) { scan.pages.pop(); scan.step = scan.pages.length ? 'pages' : 'start'; drawScan(); pick('#pick-camera'); }
      else { scan.step = 'pages'; drawScan(); }
    },
    () => {
      page.warped = warp(page.src, page.quad);
      page.confirmed = true;
      page.ocr = page.preview = page.reviewImg = null;
      scan.step = 'pages';
      drawScan();
    },
  );
  setupCropEditor(page);
  $('#crop-rotate').onclick = () => {
    page.quad = rotateQuad(page.quad, page.src.width, page.src.height, 1);
    page.src = rotate(page.src, 1);
    setupCropEditor(page);
  };
  $('#crop-full').onclick = () => { page.quad = defaultQuad(page.src.width, page.src.height, 0); setupCropEditor(page); };
  $('#crop-auto').onclick = () => { page.quad = detectQuad(page.src); setupCropEditor(page); };
}

function setupCropEditor(page) {
  const wrap = $('#crop-wrap');
  const body = $('#crop-body');
  const W = page.src.width, H = page.src.height;
  const maxW = body.clientWidth - 32 - 20;
  const maxH = Math.max(240, window.innerHeight - 250);
  const scale = Math.min(maxW / W, maxH / H);
  const dw = Math.round(W * scale), dh = Math.round(H * scale);
  wrap.style.width = dw + 'px';
  wrap.style.height = dh + 'px';
  const canvas = $('#crop-canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = dw * dpr; canvas.height = dh * dpr;
  canvas.getContext('2d').drawImage(page.src, 0, 0, canvas.width, canvas.height);
  const svg = $('#crop-svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const poly = $('#crop-poly');
  $$('.handle, .loupe', wrap).forEach((h) => h.remove());

  const loupe = document.createElement('div');
  loupe.className = 'loupe'; loupe.hidden = true;
  const lc = makeCanvas(220, 220);
  loupe.append(lc);
  wrap.append(loupe);

  const handles = page.quad.map((pt, idx) => {
    const h = document.createElement('div');
    h.className = 'handle';
    h.setAttribute('role', 'slider');
    h.setAttribute('aria-label', ['Ecke oben links', 'Ecke oben rechts', 'Ecke unten rechts', 'Ecke unten links'][idx]);
    wrap.append(h);
    return h;
  });

  const update = () => {
    poly.setAttribute('points', page.quad.map((p) => p.join(',')).join(' '));
    handles.forEach((h, idx) => { h.style.left = page.quad[idx][0] * scale + 'px'; h.style.top = page.quad[idx][1] * scale + 'px'; });
  };
  const drawLoupe = (x, y) => {
    const ctx = lc.getContext('2d');
    const r = 45;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 220, 220);
    ctx.drawImage(page.src, x - r, y - r, r * 2, r * 2, 0, 0, 220, 220);
    ctx.strokeStyle = '#0a7cff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(110, 90); ctx.lineTo(110, 130); ctx.moveTo(90, 110); ctx.lineTo(130, 110); ctx.stroke();
    const lx = x * scale, ly = y * scale;
    loupe.style.left = Math.min(dw - 110, Math.max(0, lx - 55)) + 'px';
    loupe.style.top = (ly > 150 ? ly - 150 : ly + 40) + 'px';
  };

  handles.forEach((h, idx) => {
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      const rect = wrap.getBoundingClientRect();
      const move = (ev) => {
        const x = Math.max(0, Math.min(W, (ev.clientX - rect.left) / scale));
        const y = Math.max(0, Math.min(H, (ev.clientY - rect.top) / scale));
        page.quad[idx] = [x, y];
        update();
        loupe.hidden = false;
        drawLoupe(x, y);
      };
      const up = () => {
        loupe.hidden = true;
        h.removeEventListener('pointermove', move);
        h.removeEventListener('pointerup', up);
        h.removeEventListener('pointercancel', up);
      };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up);
      h.addEventListener('pointercancel', up);
    });
  });
  update();
}

// ---------- Seitenübersicht ----------

function pagePreview(page) {
  if (!page.preview) {
    const small = thumbnail(page.warped, 300);
    page.preview = enhance(small, state.settings.filter).toDataURL('image/jpeg', 0.7);
  }
  return page.preview;
}

function drawPages() {
  const n = scan.pages.length;
  sheet.innerHTML = `${head(`${n} ${n === 1 ? 'Seite' : 'Seiten'}`, 'Abbrechen', 'Weiter', !n)}
    <div class="sheet-body">
      <div class="page-strip">
        ${scan.pages.map((p, i) => `
          <div class="page-card">
            <img src="${pagePreview(p)}" alt="Seite ${i + 1}">
            <span class="num">${i + 1}</span>
            <button class="edit" type="button" data-edit="${i}" aria-label="Seite ${i + 1} zuschneiden"></button>
            <button class="rm" type="button" data-rm="${i}" aria-label="Seite ${i + 1} entfernen">×</button>
          </div>`).join('')}
        <button class="add-page" type="button" id="add-camera">${icons.camera}Seite fotografieren</button>
        <button class="add-page" type="button" id="add-photos">${icons.photos}Aus Fotos</button>
      </div>
      <p class="muted small" style="text-align:center;margin-top:18px">Tipp auf eine Seite, um sie neu zuzuschneiden.</p>
    </div>
    <div class="sheet-foot"><button class="btn primary block" type="button" id="pages-next" ${n ? '' : 'disabled'}>Weiter</button></div>`;
  onHead(confirmCancel, () => processPages());
  $('#pages-next').onclick = () => processPages();
  $('#add-camera').onclick = () => pick('#pick-camera');
  $('#add-photos').onclick = () => pick('#pick-photos');
  $$('[data-edit]', sheet).forEach((b) => b.onclick = () => { scan.cropIndex = +b.dataset.edit; scan.pages[scan.cropIndex].confirmed = true; scan.step = 'crop'; drawScan(); });
  $$('[data-rm]', sheet).forEach((b) => b.onclick = () => { scan.pages.splice(+b.dataset.rm, 1); drawScan(); });
}

// ---------- Texterkennung & Vorschlag ----------

function setProgress(text, frac) {
  const t = $('#proc-text'); if (t) t.textContent = text;
  const b = $('#proc-bar'); if (b) b.style.width = `${Math.round(frac * 100)}%`;
}

async function processPages() {
  if (!scan.pages.length) return;
  scan.step = 'process';
  drawScan();
  const filter = state.settings.filter;
  const n = scan.pages.length;
  try {
    for (let i = 0; i < n; i++) {
      const p = scan.pages[i];
      p.enhanced = enhance(p.warped, filter);
      p.filter = filter;
      if (!p.ocr) {
        setProgress(n > 1 ? `Seite ${i + 1} von ${n}` : 'Einen Moment…', i / n);
        const { canvas } = forOcr(p.enhanced);
        p.ocr = await recognize(canvas, {
          lang: state.settings.ocrLang,
          onProgress: (f) => setProgress(n > 1 ? `Seite ${i + 1} von ${n}` : 'Lese Text…', (i + f) / n),
        });
      }
    }
  } catch (err) {
    // Ohne Texterkennung geht es trotzdem weiter – dann nur mit Stundenplan
    console.error(err);
    toast('Texterkennung nicht verfügbar – sortiere nach Stundenplan', 4000);
  }
  if (!scan) return;
  const text = scan.pages.map((p) => p.ocr?.text || '').join('\n\n').trim();
  const taken = scan.pages.map((p) => p.taken).find(Boolean);
  prepareReview(text, taken, suggestTitle(scan.pages[0].ocr));
}

async function processPdf() {
  scan.step = 'process';
  drawScan();
  setProgress('Lese PDF…', 0.3);
  try {
    const info = await inspectPdf(scan.pdf);
    scan.pdfInfo = info;
    const fileName = scan.pdf.name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').trim();
    const title = suggestTitle(info.layout) || fileName;
    prepareReview(info.text, null, title);
  } catch (err) {
    toast(`PDF konnte nicht gelesen werden: ${err.message}`, 5000);
    closeScan();
  }
}

function prepareReview(text, taken, title) {
  const when = taken || new Date();
  const subs = subjects();
  const docs = state.index.docs;
  const result = classify({ text, when, subjects: subs, timetable: state.timetable, docs });
  scan.text = text;
  scan.when = when;
  scan.ranked = result.ranked;
  scan.subject = result.ranked[0]?.id || '';
  scan.confident = result.confident;
  scan.title = title || 'Arbeitsblatt';
  scan.date = isoDate(when);
  scan.step = 'review';
  scan.showAll = false;
  drawScan();
}

// ---------- Prüfen & Speichern ----------

function drawReview() {
  const subs = subjects().filter((s) => !s.hidden);
  const ranked = scan.ranked.map((r) => subs.find((s) => s.id === r.id)).filter(Boolean);
  const top = ranked.slice(0, 4);
  const shown = scan.showAll ? subs : top.length ? top : subs;
  if (scan.subject && !shown.some((s) => s.id === scan.subject)) shown.push(subs.find((s) => s.id === scan.subject));
  const sel = subjectById(scan.subject);
  const reasons = scan.ranked.find((r) => r.id === scan.subject)?.reasons || [];
  const previews = scan.pdf
    ? `<img src="${scan.pdfInfo.firstPage.toDataURL('image/jpeg', 0.8)}" alt="Seite 1">`
    : scan.pages.map((p, i) => `<img src="${reviewImage(p)}" alt="Seite ${i + 1}">`).join('');

  sheet.innerHTML = `${head('Einsortieren', 'Abbrechen', 'Sichern', !scan.subject)}
    <div class="sheet-body">
      <div class="review-pages">${previews}</div>
      ${scan.pdf ? '' : `<div class="segmented" id="review-filter" style="margin-bottom:6px">
        ${[['color', 'Farbe'], ['gray', 'S/W'], ['original', 'Original']].map(([k, l]) => `<button type="button" data-v="${k}" class="${scan.pages[0].filter === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>`}

      <div class="section-title">Fach ${scan.ranked.length && !scan.confident ? '<span class="small" style="text-transform:none;letter-spacing:0;color:var(--warn)">bitte prüfen</span>' : ''}</div>
      <div class="chips" id="subject-chips">
        ${shown.filter(Boolean).map((s) => `<button type="button" class="chip ${s.id === scan.subject ? 'selected' : ''}" data-id="${esc(s.id)}" style="--c:${esc(s.color)}"><span class="dot" style="background:${esc(s.color)}"></span>${esc(s.name)}</button>`).join('')}
        ${!scan.showAll && shown.length < subs.length ? '<button type="button" class="chip" id="show-all">Andere…</button>' : ''}
      </div>
      ${reasons.length ? `<div class="reason">${icons.spark}<span>${esc(reasons.slice(0, 3).join(' · '))}</span></div>` : !scan.subject ? `<div class="reason">${icons.spark}<span>Kein eindeutiger Hinweis gefunden – wähl das Fach bitte aus.</span></div>` : ''}

      <div class="section-title">Details</div>
      <div class="card" style="padding:14px">
        <label class="field"><span>Titel</span><input class="input" id="review-title" value="${esc(scan.title)}" enterkeyhint="done"></label>
        <label class="field" style="margin:0"><span>Datum</span><input class="input" type="date" id="review-date" value="${esc(scan.date)}"></label>
      </div>
      ${scan.text ? `<details class="ocr"><summary>Erkannter Text</summary><pre>${esc(scan.text.slice(0, 3000))}</pre></details>` : ''}
    </div>
    <div class="sheet-foot"><button class="btn primary block" type="button" id="review-save" ${scan.subject ? '' : 'disabled'}>${sel ? `In ${esc(sel.name)} sichern` : 'Fach auswählen'}</button></div>`;

  onHead(confirmCancel, saveScan);
  $('#review-save').onclick = saveScan;
  $('#review-title').oninput = (e) => { scan.title = e.target.value; };
  $('#review-title').onfocus = (e) => e.target.select();
  $('#review-date').onchange = (e) => { scan.date = e.target.value || scan.date; };
  $$('#subject-chips [data-id]').forEach((b) => b.onclick = () => { scan.subject = b.dataset.id; drawScan(); });
  $('#show-all')?.addEventListener('click', () => { scan.showAll = true; drawScan(); });
  $$('#review-filter button').forEach((b) => b.onclick = () => {
    const f = b.dataset.v;
    scan.pages.forEach((p) => { p.enhanced = enhance(p.warped, f); p.filter = f; p.reviewImg = null; });
    updateSettings({ filter: f });
    drawScan();
  });
}

function reviewImage(p) {
  if (!p.reviewImg) p.reviewImg = thumbnail(p.enhanced, 520).toDataURL('image/jpeg', 0.75);
  return p.reviewImg;
}

let saving = false;
async function saveScan() {
  if (!scan?.subject || saving) return;
  saving = true;
  const btn = $('#review-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Speichere…'; }
  try {
    const title = cleanTitle(scan.title) || 'Arbeitsblatt';
    let pdf, thumb, pages;
    if (scan.pdf) {
      pdf = scan.pdf;
      thumb = await toJpegBlob(thumbnail(scan.pdfInfo.firstPage, 360), 0.7);
      pages = scan.pdfInfo.pages;
    } else {
      pdf = await buildPdf(scan.pages.map((p) => ({ canvas: p.enhanced, ocr: p.ocr })), { title });
      thumb = await toJpegBlob(thumbnail(scan.pages[0].enhanced, 360), 0.7);
      pages = scan.pages.length;
    }
    // Passende Unterrichtsstunde merken (für Lehrer/Uhrzeit in der Ablage)
    const { now, past } = lessonAt(state.timetable, scan.when);
    const sameSubject = (l) => l && subjectById(l.subject)?.id === scan.subject;
    const lesson = sameSubject(now) ? now : past.find(sameSubject);
    const meta = {
      id: uid(),
      subject: scan.subject,
      title,
      date: scan.date,
      created: new Date().toISOString(),
      pages,
      source: scan.source || 'kamera',
      text: scan.text.slice(0, 4000),
      fullText: scan.text,
      ...(lesson ? { lesson: { start: lesson.start, end: lesson.end, teachers: lesson.teachers || [] } } : {}),
    };
    await addDoc({ meta, pdf, thumb });
    const name = subjectById(scan.subject)?.name || '';
    closeScan();
    toast(`Gesichert in ${name} ✓`);
    if (!location.hash || location.hash === '#/' || location.hash === '#') route(); else go('#/');
  } catch (err) {
    console.error(err);
    toast(`Speichern fehlgeschlagen: ${err.message}`, 5000);
    if (btn) { btn.disabled = false; btn.textContent = 'Nochmal versuchen'; }
  } finally {
    saving = false;
  }
}

// ============================================================
// Start
// ============================================================

onChange(() => liveUpdate?.());
window.addEventListener('hashchange', route);

(async () => {
  await init();
  route();
  persist();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();

// Zum Testen: Dateien direkt in den Scan-Ablauf geben
window.__scanFiles = (files, source = 'fotos') => { if (!scan) openScan(); return handleFiles(files, source); };
