// Minimaler GitHub-Client: liest Dateien aus dem privaten Ablage-Repo und
// schreibt Änderungen als EINEN Commit (PDF + Vorschaubild + Textdatei + index.json).

import { blobToBase64 } from './util.js';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export class GitHub {
  constructor({ token, repo, branch = 'main' }) {
    this.token = token;
    this.repo = repo;
    this.branch = branch;
  }

  async req(path, { method = 'GET', body, accept } = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: accept || 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new GitHubError('Keine Verbindung zu GitHub', 0);
    }
    if (!res.ok) {
      let msg = `GitHub-Fehler ${res.status}`;
      try { const j = await res.json(); if (j.message) msg += `: ${j.message}`; } catch { /* kein JSON */ }
      if (res.status === 401) msg = 'GitHub-Token ist ungültig oder abgelaufen';
      throw new GitHubError(msg, res.status);
    }
    return res;
  }

  json(path, opts) { return this.req(path, opts).then((r) => (r.status === 204 ? null : r.json())); }

  contentsUrl(path) {
    const p = path.split('/').map(encodeURIComponent).join('/');
    return `/repos/${this.repo}/contents/${p}?ref=${encodeURIComponent(this.branch)}`;
  }

  user() { return this.json('/user'); }
  repoInfo() { return this.json(`/repos/${this.repo}`); }

  /** Textdatei lesen (null, wenn es sie nicht gibt) */
  async readText(path) {
    try {
      const r = await this.req(this.contentsUrl(path), { accept: 'application/vnd.github.raw+json' });
      return await r.text();
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async readJSON(path, fallback) {
    const t = await this.readText(path);
    if (t == null) return fallback;
    try { return JSON.parse(t); } catch { return fallback; }
  }

  /** Binärdatei über ihren Git-Hash laden (unveränderlich → gut cachebar) */
  async blobBySha(sha) {
    const r = await this.req(`/repos/${this.repo}/git/blobs/${sha}`, { accept: 'application/vnd.github.raw+json' });
    return r.blob();
  }

  async readBlob(path) {
    const r = await this.req(this.contentsUrl(path), { accept: 'application/vnd.github.raw+json' });
    return r.blob();
  }

  /** Lädt einen Blob hoch und gibt seinen Git-Hash zurück */
  async createBlob(content) {
    const body = typeof content === 'string'
      ? { content, encoding: 'utf-8' }
      : { content: await blobToBase64(content), encoding: 'base64' };
    const res = await this.json(`/repos/${this.repo}/git/blobs`, { method: 'POST', body });
    return res.sha;
  }

  /**
   * Erstellt einen Commit. `mutate()` wird bei jedem Versuch neu aufgerufen und liefert
   * eine Liste von Änderungen: { path, content } | { path, sha } | { path, remove: true }.
   * Wenn zwischendurch jemand anders committet hat (z. B. der Stundenplan-Sync), wird es wiederholt.
   */
  async commit(message, mutate, tries = 4) {
    for (let attempt = 0; ; attempt++) {
      const ref = await this.json(`/repos/${this.repo}/git/ref/heads/${this.branch}`);
      const parent = ref.object.sha;
      const parentCommit = await this.json(`/repos/${this.repo}/git/commits/${parent}`);
      const changes = await mutate();
      if (!changes.length) return null;

      const tree = [];
      for (const c of changes) {
        const entry = { path: c.path, mode: '100644', type: 'blob' };
        if (c.remove) entry.sha = null;
        else if (c.sha) entry.sha = c.sha;
        else entry.content = c.content; // Text direkt im Tree
        tree.push(entry);
      }
      const newTree = await this.json(`/repos/${this.repo}/git/trees`, {
        method: 'POST',
        body: { base_tree: parentCommit.tree.sha, tree },
      });
      const newCommit = await this.json(`/repos/${this.repo}/git/commits`, {
        method: 'POST',
        body: { message, tree: newTree.sha, parents: [parent] },
      });
      try {
        await this.json(`/repos/${this.repo}/git/refs/heads/${this.branch}`, {
          method: 'PATCH',
          body: { sha: newCommit.sha, force: false },
        });
        return newCommit.sha;
      } catch (e) {
        if (e.status === 422 && attempt < tries - 1) continue;
        throw e;
      }
    }
  }
}
