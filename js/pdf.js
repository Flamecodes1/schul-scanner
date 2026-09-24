// PDF erzeugen (jsPDF) und anzeigen/auslesen (pdf.js).
// Die erzeugten PDFs haben eine unsichtbare Textebene → am PC mit Strg+F durchsuchbar.

import { loadScript, canvasToBlob } from './util.js';
import { makeCanvas } from './scanner.js';

const JSPDF = 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js';
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/pdf.worker.min.mjs';

// Zeichen, die die Standard-PDF-Schrift (WinAnsi) kann
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const pdfSafe = (s) => [...s].map((ch) => {
  const c = ch.charCodeAt(0);
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.includes(ch) ? ch : '?';
}).join('');

/**
 * @param pages [{ canvas, ocr?: { words, width, height } }]
 */
export async function buildPdf(pages, { title = '' } = {}) {
  await loadScript(JSPDF);
  const { jsPDF } = window.jspdf;
  let doc = null;
  for (const p of pages) {
    const { canvas, ocr } = p;
    const landscape = canvas.width > canvas.height;
    const pw = landscape ? 297 : 210;
    const ph = pw * (canvas.height / canvas.width);
    const orientation = landscape ? 'landscape' : 'portrait';
    if (!doc) doc = new jsPDF({ unit: 'mm', format: [pw, ph], orientation, compress: true });
    else doc.addPage([pw, ph], orientation);
    const jpeg = canvas.toDataURL('image/jpeg', 0.72);
    doc.addImage(jpeg, 'JPEG', 0, 0, pw, ph, undefined, 'FAST');

    if (ocr?.words?.length) {
      const k = pw / ocr.width; // mm pro OCR-Pixel
      doc.setFont('helvetica', 'normal');
      for (const w of ocr.words) {
        const text = pdfSafe(w.text);
        const hMm = (w.bbox.y1 - w.bbox.y0) * k;
        const wMm = (w.bbox.x1 - w.bbox.x0) * k;
        if (hMm <= 0 || wMm <= 0) continue;
        const size = Math.max(2, Math.min(72, hMm / 0.3528));
        doc.setFontSize(size);
        const natural = doc.getTextWidth(text) || 1;
        doc.text(text, w.bbox.x0 * k, w.bbox.y1 * k, {
          baseline: 'bottom',
          renderingMode: 'invisible',
          horizontalScale: Math.max(0.2, Math.min(5, wMm / natural)),
        });
      }
    }
  }
  if (title) doc.setProperties({ title, creator: 'Schul-Scanner' });
  return doc.output('blob');
}

let pdfjsPromise;
function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      return lib;
    });
    pdfjsPromise.catch(() => { pdfjsPromise = null; });
  }
  return pdfjsPromise;
}

async function openPdf(blob) {
  const lib = await pdfjs();
  const data = new Uint8Array(await blob.arrayBuffer());
  return lib.getDocument({ data, isEvalSupported: false }).promise;
}

/** Rendert alle Seiten eines PDFs in einen Container */
export async function renderPdf(blob, container, { maxPages = 40 } = {}) {
  const pdf = await openPdf(blob);
  const width = Math.max(300, container.clientWidth || 360);
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  container.replaceChildren();
  for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
    const page = await pdf.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / base.width) * dpr });
    const canvas = makeCanvas(viewport.width, viewport.height);
    container.append(canvas);
    await page.render({ canvas, viewport }).promise;
  }
  return pdf.numPages;
}

/** Text + erste Seite als Bild (für importierte PDFs) */
export async function inspectPdf(blob) {
  const pdf = await openPdf(blob);
  let text = '';
  const layout = { lines: [], height: 1 };
  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageH = page.getViewport({ scale: 1 }).height;
    let line = null;
    const flush = () => {
      if (!line) return;
      text += line.text.trim() + '\n';
      // Zeilen der ersten Seite mit Schriftgröße merken → daraus wird der Titel geraten
      if (i === 1 && line.text.trim()) layout.lines.push({ text: line.text.trim(), bbox: { y0: pageH - line.y - line.h, y1: pageH - line.y }, confidence: 95 });
      line = null;
    };
    for (const item of content.items) {
      const [, , c, d, , y] = item.transform || [0, 0, 0, 0, 0, 0];
      const h = item.height || Math.hypot(c, d);
      if (line && Math.abs(y - line.y) > 2) flush();
      if (!line) line = { text: '', y, h: 0 };
      line.text += item.str + (item.hasEOL ? '' : ' ');
      line.h = Math.max(line.h, h);
      if (item.hasEOL) flush();
    }
    flush();
    text += '\n';
    if (i === 1) layout.height = pageH;
  }
  const first = await pdf.getPage(1);
  const base = first.getViewport({ scale: 1 });
  const viewport = first.getViewport({ scale: 720 / base.width });
  const canvas = makeCanvas(viewport.width, viewport.height);
  await first.render({ canvas, viewport }).promise;
  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), pages: pdf.numPages, firstPage: canvas, layout };
}

export const toJpegBlob = (canvas, q = 0.72) => canvasToBlob(canvas, 'image/jpeg', q);
