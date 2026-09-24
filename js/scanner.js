// Bildverarbeitung für Scans – ohne externe Bibliothek:
//  - Foto laden (inkl. Aufnahmezeit aus den EXIF-Daten, wichtig für Fotos der Brille)
//  - Blattkanten finden (helles Papier vor dunklerem Hintergrund)
//  - perspektivisch gerade ziehen
//  - "Scan-Look": Schatten entfernen, Papier weiß machen

const MAX_SIDE = 3000; // iOS erlaubt nur ~16 Mio. Pixel pro Canvas

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Lädt ein Foto in ein Canvas (verkleinert, richtig gedreht) */
export async function loadPhoto(file) {
  const [taken, img] = await Promise.all([readExifDate(file).catch(() => null), decodeImage(file)]);
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = makeCanvas(w * scale, h * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (img.close) img.close();
  return { canvas, taken };
}

function decodeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht geöffnet werden')); };
    img.src = url;
  });
}

/** Liest DateTimeOriginal aus JPEG-EXIF (null, wenn nicht vorhanden) */
export async function readExifDate(file) {
  const buf = await file.slice(0, 256 * 1024).arrayBuffer();
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off);
    const size = v.getUint16(off + 2);
    if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) return parseTiffDate(v, off + 10);
    if ((marker & 0xff00) !== 0xff00) break;
    off += 2 + size;
  }
  return null;
}

function parseTiffDate(v, tiff) {
  const le = v.getUint16(tiff) === 0x4949;
  const u16 = (o) => v.getUint16(o, le);
  const u32 = (o) => v.getUint32(o, le);
  const readIfd = (ifd) => {
    const out = new Map();
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > v.byteLength) break;
      out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), valueOff: e + 8 });
    }
    return out;
  };
  const readAscii = (entry) => {
    const off = entry.count > 4 ? tiff + u32(entry.valueOff) : entry.valueOff;
    let s = '';
    for (let i = 0; i < entry.count - 1 && off + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(off + i));
    return s;
  };
  const ifd0 = readIfd(tiff + u32(tiff + 4));
  let dateStr = null;
  const exifPtr = ifd0.get(0x8769);
  if (exifPtr) {
    const exif = readIfd(tiff + u32(exifPtr.valueOff));
    const dto = exif.get(0x9003) || exif.get(0x9004);
    if (dto) dateStr = readAscii(dto);
  }
  if (!dateStr && ifd0.get(0x0132)) dateStr = readAscii(ifd0.get(0x0132));
  const m = dateStr && dateStr.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return isNaN(d) ? null : d;
}

// ---------- Blatt finden ----------

/**
 * Findet die vier Ecken des Blatts. Gibt Punkte in Canvas-Koordinaten zurück:
 * [oben-links, oben-rechts, unten-rechts, unten-links]
 */
export function detectQuad(canvas) {
  const W = canvas.width, H = canvas.height;
  const s = 320 / Math.max(W, H);
  const w = Math.round(W * s), h = Math.round(H * s);
  const small = makeCanvas(w, h);
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(canvas, 0, 0, w, h);
  const { data } = sctx.getImageData(0, 0, w, h);

  // "Papier-Wert": hell und wenig farbig
  const val = new Float32Array(w * h);
  for (let i = 0, p = 0; i < val.length; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    val[i] = (r * 0.3 + g * 0.59 + b * 0.11) - (max - min) * 0.6;
  }
  const threshold = otsu(val);
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) mask[i] = val[i] > threshold ? 1 : 0;

  // größte zusammenhängende helle Fläche, die nicht nur am Rand klebt
  const comp = largestComponent(mask, w, h);
  const fallback = defaultQuad(W, H);
  if (!comp || comp.size < w * h * 0.12) return fallback;

  // Ecken: Extrempunkte von x+y und x−y
  let tl, tr, br, bl;
  let minS = Infinity, maxS = -Infinity, minD = Infinity, maxD = -Infinity;
  for (const idx of comp.pixels) {
    const x = idx % w, y = (idx / w) | 0;
    const sum = x + y, diff = x - y;
    if (sum < minS) { minS = sum; tl = [x, y]; }
    if (sum > maxS) { maxS = sum; br = [x, y]; }
    if (diff > maxD) { maxD = diff; tr = [x, y]; }
    if (diff < minD) { minD = diff; bl = [x, y]; }
  }
  const quad = [tl, tr, br, bl].map(([x, y]) => [(x + 0.5) / s, (y + 0.5) / s]);
  if (quadArea(quad) < W * H * 0.12) return fallback;
  return quad;
}

export function defaultQuad(W, H, inset = 0.04) {
  const dx = W * inset, dy = H * inset;
  return [[dx, dy], [W - dx, dy], [W - dx, H - dy], [dx, H - dy]];
}

function otsu(values) {
  const hist = new Array(256).fill(0);
  for (const v of values) hist[Math.max(0, Math.min(255, v | 0))]++;
  const total = values.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = t; }
  }
  return thr;
}

function largestComponent(mask, w, h) {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let best = null;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0, size = 0;
    const pixels = [];
    stack[top++] = start; seen[start] = 1;
    while (top) {
      const i = stack[--top];
      pixels.push(i); size++;
      const x = i % w, y = (i / w) | 0;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1; }
      if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[top++] = i - w; }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[top++] = i + w; }
    }
    if (!best || size > best.size) best = { size, pixels };
  }
  return best;
}

function quadArea(q) {
  let a = 0;
  for (let i = 0; i < 4; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}

// ---------- Gerade ziehen ----------

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Perspektivische Entzerrung des Vierecks auf ein Rechteck */
export function warp(src, quad, longSide = 2000) {
  const [tl, tr, br, bl] = quad;
  let ow = Math.max(dist(tl, tr), dist(bl, br));
  let oh = Math.max(dist(tl, bl), dist(tr, br));
  // Nahe an DIN A4? Dann exakt A4-Seitenverhältnis verwenden
  const ratio = oh / ow, a4 = Math.SQRT2;
  if (Math.abs(ratio - a4) / a4 < 0.12) oh = ow * a4;
  else if (Math.abs(1 / ratio - a4) / a4 < 0.12) ow = oh * a4;
  const scale = Math.min(longSide / Math.max(ow, oh), 1.6);
  const W = Math.round(ow * scale), H = Math.round(oh * scale);

  // Homographie Ziel → Quelle
  const Hm = homography([[0, 0], [W, 0], [W, H], [0, H]], quad);
  const sctx = src.getContext('2d', { willReadFrequently: true });
  const sw = src.width, sh = src.height;
  const sd = sctx.getImageData(0, 0, sw, sh).data;
  const out = makeCanvas(W, H);
  const octx = out.getContext('2d');
  const img = octx.createImageData(W, H);
  const od = img.data;
  const [a, b, c, d, e, f, g, h] = Hm;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const den = g * x + h * y + 1;
      let sx = (a * x + b * y + c) / den;
      let sy = (d * x + e * y + f) / den;
      sx = Math.max(0, Math.min(sw - 1.001, sx));
      sy = Math.max(0, Math.min(sh - 1.001, sy));
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const o = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) {
        const top = sd[i00 + k] + (sd[i10 + k] - sd[i00 + k]) * fx;
        const bot = sd[i01 + k] + (sd[i11 + k] - sd[i01 + k]) * fx;
        od[o + k] = top + (bot - top) * fy;
      }
      od[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** Löst die 8 Parameter der Homographie, die `from` auf `to` abbildet */
function homography(from, to) {
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  return solve(A, B);
}

function solve(A, B) {
  const n = B.length;
  const M = A.map((row, i) => [...row, B[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const p = M[col][col] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / p;
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

// ---------- Drehen & Scan-Look ----------

export function rotate(canvas, quarterTurns = 1) {
  const t = ((quarterTurns % 4) + 4) % 4;
  if (!t) return canvas;
  const out = makeCanvas(t % 2 ? canvas.height : canvas.width, t % 2 ? canvas.width : canvas.height);
  const ctx = out.getContext('2d');
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((t * Math.PI) / 2);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}

export function rotateQuad(quad, W, H, quarterTurns = 1) {
  let q = quad, w = W, h = H;
  for (let i = 0; i < (((quarterTurns % 4) + 4) % 4); i++) {
    q = q.map(([x, y]) => [h - y, x]);
    [w, h] = [h, w];
    q = [q[3], q[0], q[1], q[2]];
  }
  return q;
}

/**
 * Macht aus einem Foto einen sauberen Scan.
 * mode: 'color' (Farbe, Papier weiß) | 'gray' (Graustufen, kontrastreich) | 'original'
 */
export function enhance(canvas, mode = 'color') {
  const W = canvas.width, H = canvas.height;
  const out = makeCanvas(W, H);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);
  if (mode === 'original') return out;

  // Hintergrund (Papier + Schatten) schätzen: stark verkleinern, Maximum nehmen, weichzeichnen
  const bw = Math.max(8, Math.round(W / 28)), bh = Math.max(8, Math.round(H / 28));
  const bg = makeCanvas(bw, bh);
  const bctx = bg.getContext('2d', { willReadFrequently: true });
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(canvas, 0, 0, bw, bh);
  const bgData = bctx.getImageData(0, 0, bw, bh);
  dilateMax(bgData, bw, bh, 2);
  boxBlur(bgData, bw, bh, 2);
  bctx.putImageData(bgData, 0, 0);
  const bgFull = makeCanvas(W, H);
  const fctx = bgFull.getContext('2d', { willReadFrequently: true });
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(bg, 0, 0, W, H);
  const B = fctx.getImageData(0, 0, W, H).data;

  const img = ctx.getImageData(0, 0, W, H);
  const D = img.data;
  const lo = mode === 'gray' ? 0.35 : 0.25, hi = 0.93;
  for (let i = 0; i < D.length; i += 4) {
    if (mode === 'gray') {
      const l = (D[i] * 0.3 + D[i + 1] * 0.59 + D[i + 2] * 0.11) / Math.max(40, B[i] * 0.3 + B[i + 1] * 0.59 + B[i + 2] * 0.11);
      const v = levels(l, lo, hi);
      D[i] = D[i + 1] = D[i + 2] = v;
    } else {
      for (let k = 0; k < 3; k++) D[i + k] = levels(D[i + k] / Math.max(40, B[i + k]), lo, hi);
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function levels(x, lo, hi) {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return Math.round(255 * Math.pow(t, 1.35));
}

function dilateMax(imgData, w, h, r) {
  const d = imgData.data;
  const src = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m0 = 0, m1 = 0, m2 = 0;
      for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) {
        for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
          const j = (yy * w + xx) * 4;
          if (src[j] > m0) m0 = src[j];
          if (src[j + 1] > m1) m1 = src[j + 1];
          if (src[j + 2] > m2) m2 = src[j + 2];
        }
      }
      const i = (y * w + x) * 4;
      d[i] = m0; d[i + 1] = m1; d[i + 2] = m2;
    }
  }
}

function boxBlur(imgData, w, h, r) {
  const d = imgData.data;
  const src = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s0 = 0, s1 = 0, s2 = 0, n = 0;
      for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) {
        for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
          const j = (yy * w + xx) * 4;
          s0 += src[j]; s1 += src[j + 1]; s2 += src[j + 2]; n++;
        }
      }
      const i = (y * w + x) * 4;
      d[i] = s0 / n; d[i + 1] = s1 / n; d[i + 2] = s2 / n;
    }
  }
}

/** Graustufen-Kopie in passender Größe für die Texterkennung */
export function forOcr(canvas, maxSide = 2200) {
  const s = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const c = makeCanvas(canvas.width * s, canvas.height * s);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
  ctx.putImageData(img, 0, 0);
  return { canvas: c, scale: s };
}

export function thumbnail(canvas, width = 360) {
  const s = width / canvas.width;
  const c = makeCanvas(width, canvas.height * s);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}
