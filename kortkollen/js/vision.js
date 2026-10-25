// Image analysis on raw RGBA pixels: card edge detection, centering
// measurement and a small fingerprint for comparing a photo against
// reference card images. No DOM – works on any {width, height, data}.

/** Card width / height (63 × 88 mm). */
export const CARD_ASPECT = 63 / 88;

/**
 * Where text sits on a card, as fractions of the card's outer bounds.
 * The number strip spans the full width because older cards print the
 * number bottom-right and newer ones bottom-left.
 */
export const OCR_REGIONS = {
  name: { left: 0.03, right: 0.8, top: 0.02, bottom: 0.12 },
  number: { left: 0, right: 1, top: 0.875, bottom: 0.985 },
};

/**
 * Pixel rectangle for an OCR region inside the card bounds.
 * @returns {{left:number,right:number,top:number,bottom:number}}
 */
export function regionRect(bounds, region) {
  const W = bounds.right - bounds.left;
  const H = bounds.bottom - bounds.top;
  return {
    left: bounds.left + region.left * W,
    right: bounds.left + region.right * W,
    top: bounds.top + region.top * H,
    bottom: bounds.top + region.bottom * H,
  };
}

/**
 * Luma of an RGBA image.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 * @returns {Float32Array}
 */
export function toGray(img) {
  const { width: w, height: h, data } = img;
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return g;
}

/**
 * Box-filter resize (good for downscaling, fine for small upscales).
 * @returns {{width:number,height:number,data:Uint8ClampedArray}}
 */
export function resize(img, nw, nh) {
  const { width: sw, height: sh, data } = img;
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let ty = 0; ty < nh; ty++) {
    const y0 = Math.floor((ty * sh) / nh);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * sh) / nh));
    for (let tx = 0; tx < nw; tx++) {
      const x0 = Math.floor((tx * sw) / nw);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * sw) / nw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        let p = (y * sw + x0) * 4;
        for (let x = x0; x < x1; x++, p += 4) {
          r += data[p]; g += data[p + 1]; b += data[p + 2]; a += data[p + 3]; n++;
        }
      }
      const q = (ty * nw + tx) * 4;
      out[q] = r / n; out[q + 1] = g / n; out[q + 2] = b / n; out[q + 3] = a / n;
    }
  }
  return { width: nw, height: nh, data: out };
}

/**
 * Copy a rectangle out of an image (rect in pixels, clamped to the image).
 */
export function crop(img, rect) {
  const x0 = Math.max(0, Math.round(rect.left));
  const y0 = Math.max(0, Math.round(rect.top));
  const x1 = Math.min(img.width, Math.round(rect.right));
  const y1 = Math.min(img.height, Math.round(rect.bottom));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * img.width + x0) * 4;
    out.set(img.data.subarray(src, src + w * 4), y * w * 4);
  }
  return { width: w, height: h, data: out };
}

// Score per column (axis 'x') or row (axis 'y') for "a long straight edge
// runs here": mean gradient × share of scan lines that see a clear edge.
function edgeScores(gray, w, h, axis, from, to) {
  const len = axis === 'x' ? w : h;
  const sum = new Float32Array(len);
  const cover = new Float32Array(len);
  const lines = [];
  const span = axis === 'x' ? h : w;
  const a = Math.floor(span * from);
  const b = Math.ceil(span * to);
  const step = Math.max(1, Math.floor((b - a) / 60));
  for (let i = a; i < b; i += step) lines.push(i);
  const grad = new Float32Array(len);
  const r = 2; // tolerate a couple of degrees of tilt
  for (const line of lines) {
    for (let k = 1; k < len - 1; k++) {
      const p = axis === 'x' ? line * w + k : k * w + line;
      const d = axis === 'x' ? 1 : w;
      grad[k] = Math.abs(gray[p + d] - gray[p - d]);
    }
    for (let k = 1; k < len - 1; k++) {
      let m = 0;
      for (let j = Math.max(1, k - r); j <= Math.min(len - 2, k + r); j++) if (grad[j] > m) m = grad[j];
      sum[k] += m;
      if (m > 18) cover[k] += 1;
    }
  }
  const n = lines.length || 1;
  const score = new Float32Array(len);
  for (let k = 0; k < len; k++) score[k] = (sum[k] / n) * (cover[k] / n);
  return score;
}

// Sub-pixel peak position by fitting a parabola through three samples.
function refinePeak(s, k) {
  if (k <= 0 || k >= s.length - 1) return k;
  const denom = s[k - 1] - 2 * s[k] + s[k + 1];
  if (denom === 0) return k;
  const off = (0.5 * (s[k - 1] - s[k + 1])) / denom;
  return k + Math.max(-0.5, Math.min(0.5, off));
}

// Pick the outer card edge inside [lo, hi). Among strong local maxima the
// one closest to the image border wins – the card's inner frame line is
// often just as strong but always lies further in.
function pickEdge(score, lo, hi, outerFirst, prior) {
  lo = Math.max(1, Math.floor(lo));
  hi = Math.min(score.length - 1, Math.ceil(hi));
  let max = 0;
  const weight = (k) => (prior == null ? 1 : Math.exp(-0.5 * ((k - prior.at) / prior.sigma) ** 2));
  for (let k = lo; k < hi; k++) max = Math.max(max, score[k] * weight(k));
  if (!(max > 0)) return null;
  const peaks = [];
  for (let k = lo; k < hi; k++) {
    const v = score[k] * weight(k);
    if (v >= 0.45 * max && score[k] >= score[k - 1] && score[k] >= score[k + 1]) peaks.push(k);
  }
  if (!peaks.length) return null;
  const k = outerFirst ? peaks[0] : peaks[peaks.length - 1];
  return { at: refinePeak(score, k), strength: score[k] };
}

/**
 * Locate the card's outer edges in a photo.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 * @param {{left:number,right:number,top:number,bottom:number}} [hint] expected
 *   edges as fractions of the image size (e.g. from the on-screen guide)
 * @returns {{left:number,right:number,top:number,bottom:number,confidence:number}|null}
 */
export function findCardBounds(img, hint) {
  const { width: w, height: h } = img;
  const gray = toGray(img);
  const sx = edgeScores(gray, w, h, 'x', 0.3, 0.7);
  const sy = edgeScores(gray, w, h, 'y', 0.3, 0.7);
  const win = 0.12;
  const pr = (frac, size) => (hint ? { at: frac * size, sigma: 0.08 * size } : null);
  const L = pickEdge(sx, hint ? (hint.left - win) * w : 0, hint ? (hint.left + win) * w : 0.42 * w, true, pr(hint?.left, w));
  const R = pickEdge(sx, hint ? (hint.right - win) * w : 0.58 * w, hint ? (hint.right + win) * w : w, false, pr(hint?.right, w));
  const T = pickEdge(sy, hint ? (hint.top - win) * h : 0, hint ? (hint.top + win) * h : 0.42 * h, true, pr(hint?.top, h));
  const B = pickEdge(sy, hint ? (hint.bottom - win) * h : 0.58 * h, hint ? (hint.bottom + win) * h : h, false, pr(hint?.bottom, h));
  if (!L || !R || !T || !B) return null;
  const bw = R.at - L.at;
  const bh = B.at - T.at;
  if (bw < w * 0.2 || bh < h * 0.2) return null;
  const aspectErr = Math.abs(bw / bh - CARD_ASPECT) / CARD_ASPECT;
  const confidence = Math.max(0, 1 - aspectErr * 5);
  return { left: L.at, right: R.at, top: T.at, bottom: B.at, confidence };
}

function median(arr) {
  if (!arr.length) return 0;
  const s = Float32Array.from(arr).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pixel(img, x, y) {
  const xi = Math.max(0, Math.min(img.width - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(img.height - 1, Math.round(y)));
  const p = (yi * img.width + xi) * 4;
  return [img.data[p], img.data[p + 1], img.data[p + 2]];
}

const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Point `d` px inward from `side`, on scan line `t` (0–1 along that side).
function inward(bounds, side, d, t) {
  const { left, right, top, bottom } = bounds;
  switch (side) {
    case 'left': return [left + d, top + t * (bottom - top)];
    case 'right': return [right - d, top + t * (bottom - top)];
    case 'top': return [left + t * (right - left), top + d];
    default: return [left + t * (right - left), bottom - d];
  }
}

const SIDES = ['left', 'right', 'top', 'bottom'];
const LINES = Array.from({ length: 31 }, (_, i) => 0.3 + (0.4 * i) / 30);

/**
 * Measure the printed border on each side of a card, i.e. how far in from
 * the outer edge the border colour ends. That is what graders call centering.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 * @param {{left:number,right:number,top:number,bottom:number}} bounds outer edges in px
 * @returns {{left:number|null,right:number|null,top:number|null,bottom:number|null,contrast:number}}
 */
export function measureBorders(img, bounds) {
  const W = bounds.right - bounds.left;
  const H = bounds.bottom - bounds.top;
  const depthOf = (side) => (side === 'left' || side === 'right' ? W : H);

  // The border is one colour all round, so sample it close to every edge.
  const samples = [];
  for (const side of SIDES) {
    const depth = depthOf(side);
    for (const t of LINES) {
      for (const f of [0.008, 0.011, 0.014]) samples.push(pixel(img, ...inward(bounds, side, f * depth, t)));
    }
  }
  const border = [0, 1, 2].map((c) => median(samples.map((s) => s[c])));
  const noise = median(samples.map((s) => dist3(s, border)));
  const threshold = Math.max(30, noise * 4);

  const result = { contrast: 0 };
  for (const side of SIDES) {
    const depth = depthOf(side);
    const maxD = Math.ceil(depth * 0.16);
    const startD = Math.max(1, Math.floor(depth * 0.006));
    const profile = new Float32Array(maxD + 1);
    for (let d = startD; d <= maxD; d++) {
      profile[d] = median(LINES.map((t) => dist3(pixel(img, ...inward(bounds, side, d, t)), border)));
    }
    let found = null;
    for (let d = startD; d <= maxD - 2; d++) {
      if (profile[d] > threshold && profile[d + 1] > threshold && profile[d + 2] > threshold) {
        found = d;
        break;
      }
    }
    if (found == null) {
      result[side] = null;
      continue;
    }
    // Sub-pixel: where the profile crosses half the threshold.
    const half = threshold / 2;
    let d = found;
    while (d > startD && profile[d - 1] > half) d--;
    const a = profile[d - 1] ?? 0;
    const b = profile[d];
    const frac = b > a ? (half - a) / (b - a) : 0;
    result[side] = Math.max(0, d - 1 + Math.max(0, Math.min(1, frac)));
    result.contrast = Math.max(result.contrast, profile[Math.min(maxD, found + 2)] / threshold);
  }
  return result;
}

/**
 * Full centering measurement: outer edges + printed borders + ratios.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 * @param {object} [hint] expected outer edges as fractions (see findCardBounds)
 * @param {object} [bounds] known outer edges in px (skips detection)
 * @returns {{bounds:object, borders:object, lr:number|null, tb:number|null, worst:number|null, confidence:number}|null}
 */
export function measureCentering(img, { hint, bounds } = {}) {
  const outer = bounds ?? findCardBounds(img, hint);
  if (!outer) return null;
  const borders = measureBorders(img, outer);
  const W = outer.right - outer.left;
  const H = outer.bottom - outer.top;
  const ratio = (a, b) => (a == null || b == null || a + b <= 0 ? null : (Math.max(a, b) / (a + b)) * 100);
  const lr = ratio(borders.left, borders.right);
  const tb = ratio(borders.top, borders.bottom);

  // Plausibility: Pokémon borders are a few percent of the card each.
  let confidence = outer.confidence ?? 1;
  const okSum = (a, b, size, lo, hi) => a != null && b != null && (a + b) / size >= lo && (a + b) / size <= hi;
  if (!okSum(borders.left, borders.right, W, 0.02, 0.16)) confidence *= 0.35;
  if (!okSum(borders.top, borders.bottom, H, 0.015, 0.13)) confidence *= 0.35;
  if (borders.contrast < 1.3) confidence *= 0.6;

  const worst = lr == null && tb == null ? null : Math.max(lr ?? 0, tb ?? 0);
  return { bounds: outer, borders, lr, tb, worst, confidence: Math.max(0, Math.min(1, confidence)) };
}

/**
 * Compact colour layout descriptor (12×16 grid, per-channel normalised) used
 * to tell which candidate card a photo shows.
 * @returns {Float32Array}
 */
export function fingerprint(img, bounds) {
  let src = img;
  if (bounds) {
    const insetX = (bounds.right - bounds.left) * 0.04;
    const insetY = (bounds.bottom - bounds.top) * 0.04;
    src = crop(img, {
      left: bounds.left + insetX,
      right: bounds.right - insetX,
      top: bounds.top + insetY,
      bottom: bounds.bottom - insetY,
    });
  }
  const small = resize(src, 12, 16);
  const n = 12 * 16;
  const out = new Float32Array(n * 3);
  for (let c = 0; c < 3; c++) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += small.data[i * 4 + c];
    mean /= n;
    let v = 0;
    for (let i = 0; i < n; i++) v += (small.data[i * 4 + c] - mean) ** 2;
    const sd = Math.sqrt(v / n) || 1;
    for (let i = 0; i < n; i++) out[c * n + i] = (small.data[i * 4 + c] - mean) / sd;
  }
  return out;
}

/**
 * Similarity of two fingerprints, 0 (unrelated) … 1 (identical).
 */
export function compareFingerprints(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const cos = dot / (Math.sqrt(na * nb) || 1);
  return Math.max(0, cos);
}

/**
 * Average brightness and sharpness of a photo, to warn about blur or glare.
 * @returns {{brightness:number, sharpness:number, glare:number}}
 */
export function photoQuality(img) {
  const gray = toGray(img);
  const { width: w, height: h } = img;
  let sum = 0, lap = 0, bright = 0, n = 0;
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      const i = y * w + x;
      const v = gray[i];
      sum += v;
      if (v > 245) bright++;
      const l = 4 * v - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      lap += l * l;
      n++;
    }
  }
  return { brightness: sum / n, sharpness: Math.sqrt(lap / n), glare: bright / n };
}

/**
 * Bilinear resize, used to upscale small text before OCR.
 * @returns {{width:number,height:number,data:Uint8ClampedArray}}
 */
export function resizeBilinear(img, nw, nh) {
  const { width: sw, height: sh, data } = img;
  const out = new Uint8ClampedArray(nw * nh * 4);
  const xr = sw / nw;
  const yr = sh / nh;
  for (let y = 0; y < nh; y++) {
    const fy = Math.max(0, (y + 0.5) * yr - 0.5);
    const y0 = Math.min(sh - 1, Math.floor(fy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < nw; x++) {
      const fx = Math.max(0, (x + 0.5) * xr - 0.5);
      const x0 = Math.min(sw - 1, Math.floor(fx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const q = (y * nw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = data[(y0 * sw + x0) * 4 + c];
        const b = data[(y0 * sw + x1) * 4 + c];
        const d = data[(y1 * sw + x0) * 4 + c];
        const e = data[(y1 * sw + x1) * 4 + c];
        out[q + c] = (a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty;
      }
    }
  }
  return { width: nw, height: nh, data: out };
}

/** Otsu's threshold for a grayscale buffer. */
export function otsu(gray) {
  const hist = new Float64Array(256);
  for (const v of gray) hist[Math.max(0, Math.min(255, v | 0))]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}

/** Mean over a (2r+1)² window, via an integral image. */
function boxBlur(gray, w, h, r) {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum =
        integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      out[y * w + x] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/**
 * Prepare a text strip for OCR: upscale, subtract the local background and
 * return dark text on white. Subtracting the background (instead of one
 * global threshold) copes with the coloured border, holo foil and uneven
 * light, and works for both dark and light print.
 * @param {{width:number,height:number,data:Uint8ClampedArray}} img
 * @param {{scale?:number, binary?:boolean, radius?:number}} [opts]
 * @returns {{width:number,height:number,data:Uint8ClampedArray}}
 */
export function prepareForOcr(img, { scale = 2, binary = false, radius } = {}) {
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const big = scale === 1 ? img : resizeBilinear(img, w, h);
  const gray = toGray(big);
  const r = radius ?? Math.max(6, Math.round(h * 0.3));
  const bg = boxBlur(gray, w, h, r);
  const diff = Float32Array.from(gray, (v, i) => v - bg[i]);
  // Polarity: text strokes give the strongest one-sided deviations. Weak
  // deviations are halos around the text and soft region edges – ignore them.
  const mags = Float32Array.from(diff, Math.abs).sort();
  const strong = Math.max(20, 0.45 * mags[Math.floor(mags.length * 0.995)]);
  let dark = 0;
  let light = 0;
  for (const d of diff) {
    if (d < -strong) dark++;
    else if (d > strong) light++;
  }
  const sign = dark >= light ? -1 : 1;
  const strength = Float32Array.from(diff, (d) => Math.max(0, d * sign));
  const sorted = Float32Array.from(strength).sort();
  const peak = Math.max(25, sorted[Math.floor(sorted.length * 0.995)]);
  const out = new Uint8ClampedArray(w * h * 4);
  const values = new Float32Array(w * h);
  for (let i = 0; i < values.length; i++) values[i] = 255 - Math.min(255, (strength[i] / peak) * 255);
  const t = binary ? Math.min(200, Math.max(80, otsu(values))) : 0;
  for (let i = 0; i < values.length; i++) {
    const v = binary ? (values[i] > t ? 255 : 0) : values[i];
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data: out };
}
