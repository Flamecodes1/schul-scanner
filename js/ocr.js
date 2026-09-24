// Texterkennung direkt im Browser mit Tesseract.js (nichts verlässt das Gerät).
// Die Sprachdaten werden beim ersten Mal geladen (~10 MB) und danach zwischengespeichert.

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';

let workerPromise = null;
let workerLang = '';
let progressCb = null;

async function getWorker(lang) {
  if (workerPromise && workerLang === lang) return workerPromise;
  if (workerPromise) { try { (await workerPromise).terminate(); } catch { /* egal */ } }
  workerLang = lang;
  workerPromise = (async () => {
    const { default: Tesseract } = await import(TESSERACT);
    return Tesseract.createWorker(lang.split('+'), 1, {
      logger: (m) => progressCb?.(m),
    });
  })();
  workerPromise.catch(() => { workerPromise = null; });
  return workerPromise;
}

/** Lädt Tesseract schon mal im Hintergrund vor */
export function warmUp(lang = 'deu+eng') {
  getWorker(lang).catch(() => {});
}

/**
 * Erkennt Text auf einem Canvas.
 * @returns {{ text, lines: [{text,bbox,confidence}], words: [{text,bbox}], width, height }}
 */
export async function recognize(canvas, { lang = 'deu+eng', onProgress } = {}) {
  const worker = await getWorker(lang);
  progressCb = (m) => { if (m.status === 'recognizing text') onProgress?.(m.progress); };
  try {
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const lines = [], words = [];
    for (const b of data.blocks || []) {
      for (const p of b.paragraphs || []) {
        for (const l of p.lines || []) {
          lines.push({ text: l.text.trim(), bbox: l.bbox, confidence: l.confidence });
          for (const w of l.words || []) {
            if (w.text.trim() && w.confidence > 30) words.push({ text: w.text, bbox: w.bbox });
          }
        }
      }
    }
    return { text: cleanup(data.text || ''), lines, words, width: canvas.width, height: canvas.height };
  } finally {
    progressCb = null;
  }
}

function cleanup(t) {
  return t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
