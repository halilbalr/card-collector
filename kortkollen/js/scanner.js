// Camera handling and the photo → card pipeline:
// find the card, measure centering, read text, look it up, compare images.

import { findCardBounds, measureCentering, fingerprint, compareFingerprints, photoQuality, resize, CARD_ASPECT } from './vision.js';
import { readCardText } from './ocr.js';
import { identifyCard } from './api.js';
import { rankCandidates } from './ocr-parse.js';

/** Thin wrapper around getUserMedia for the rear camera. */
export class Camera {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.track = null;
  }

  static get supported() {
    return !!navigator.mediaDevices?.getUserMedia;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
    });
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    this.video.srcObject = this.stream;
    await this.video.play();
    this.track = this.stream.getVideoTracks()[0];
    try {
      await this.track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    } catch {
      /* not supported */
    }
  }

  get torchSupported() {
    try {
      return !!this.track?.getCapabilities?.().torch;
    } catch {
      return false;
    }
  }

  async setTorch(on) {
    await this.track?.applyConstraints({ advanced: [{ torch: on }] });
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.track = null;
    this.video.srcObject = null;
  }

  /**
   * Grab the area under the on-screen guide (plus a margin) at full camera
   * resolution. The video is shown with object-fit: cover.
   * @param {DOMRect} guide guide rectangle in CSS pixels
   * @returns {{canvas:HTMLCanvasElement, hint:{left:number,right:number,top:number,bottom:number}}}
   */
  capture(guide, margin = 0.12) {
    const v = this.video;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const r = v.getBoundingClientRect();
    const scale = Math.max(r.width / vw, r.height / vh);
    const offX = (r.width - vw * scale) / 2;
    const offY = (r.height - vh * scale) / 2;
    const toVideo = (x, y) => [(x - r.left - offX) / scale, (y - r.top - offY) / scale];
    const mx = guide.width * margin;
    const my = guide.height * margin;
    let [x0, y0] = toVideo(guide.left - mx, guide.top - my);
    let [x1, y1] = toVideo(guide.right + mx, guide.bottom + my);
    x0 = Math.max(0, Math.floor(x0));
    y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(vw, Math.ceil(x1));
    y1 = Math.min(vh, Math.ceil(y1));
    const w = x1 - x0;
    const h = y1 - y0;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d', { willReadFrequently: true }).drawImage(v, x0, y0, w, h, 0, 0, w, h);
    const [gx0, gy0] = toVideo(guide.left, guide.top);
    const [gx1, gy1] = toVideo(guide.right, guide.bottom);
    return { canvas, hint: { left: (gx0 - x0) / w, right: (gx1 - x0) / w, top: (gy0 - y0) / h, bottom: (gy1 - y0) / h } };
  }
}

/** Draw a photo file into a canvas (max 2400 px on the long side). */
export async function fileToCanvas(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const s = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * s);
  canvas.height = Math.round(bitmap.height * s);
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

function imageData(canvas) {
  return canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
}

// A card-shaped box in the middle of the frame, used when detection fails.
function centredBounds(w, h) {
  let bh = h * 0.86;
  let bw = bh * CARD_ASPECT;
  if (bw > w * 0.9) {
    bw = w * 0.9;
    bh = bw / CARD_ASPECT;
  }
  return { left: (w - bw) / 2, right: (w + bw) / 2, top: (h - bh) / 2, bottom: (h + bh) / 2, confidence: 0 };
}

const scaleBounds = (b, s) => ({ ...b, left: b.left * s, right: b.right * s, top: b.top * s, bottom: b.bottom * s });

/**
 * Locate the card in a photo and measure it. Fast (no network, no OCR).
 * @param {HTMLCanvasElement} canvas
 * @param {object} [hint] guide position (fractions)
 * @returns {{full:ImageData, bounds:object, mid:object, midBounds:object, centering:object|null, quality:object, scale:number}}
 */
export function locateCard(canvas, hint) {
  const full = imageData(canvas);
  const s = Math.min(1, 1100 / Math.max(full.width, full.height));
  const mid = s < 1 ? resize(full, Math.round(full.width * s), Math.round(full.height * s)) : full;
  let midBounds = findCardBounds(mid, hint);
  if (!midBounds || midBounds.confidence < 0.3) {
    midBounds = hint
      ? { left: hint.left * mid.width, right: hint.right * mid.width, top: hint.top * mid.height, bottom: hint.bottom * mid.height, confidence: 0.2 }
      : centredBounds(mid.width, mid.height);
  }
  const centering = measureCentering(mid, { bounds: midBounds });
  return {
    full,
    mid,
    midBounds,
    bounds: scaleBounds(midBounds, 1 / s),
    centering,
    quality: photoQuality(resize(mid, Math.round(mid.width / 2), Math.round(mid.height / 2))),
    scale: s,
  };
}

/**
 * JPEG of just the card (small margin), with bounds/borders relative to it.
 * Used by the grading assistant's centering editor.
 */
export function cardSnapshot(canvas, located, maxH = 1000) {
  const b = located.bounds;
  const mx = (b.right - b.left) * 0.04;
  const my = (b.bottom - b.top) * 0.04;
  const sx = Math.max(0, b.left - mx);
  const sy = Math.max(0, b.top - my);
  const sw = Math.min(canvas.width, b.right + mx) - sx;
  const sh = Math.min(canvas.height, b.bottom + my) - sy;
  const k = Math.min(1, maxH / sh);
  const out = document.createElement('canvas');
  out.width = Math.round(sw * k);
  out.height = Math.round(sh * k);
  out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  const toSnap = (x, y) => [(x - sx) * k, (y - sy) * k];
  const [l, t] = toSnap(b.left, b.top);
  const [r, btm] = toSnap(b.right, b.bottom);
  const borders = located.centering?.borders;
  const f = k / located.scale; // mid px → snapshot px
  return {
    dataUrl: out.toDataURL('image/jpeg', 0.86),
    width: out.width,
    height: out.height,
    outer: { left: l, top: t, right: r, bottom: btm },
    inner:
      borders && borders.left != null && borders.right != null && borders.top != null && borders.bottom != null
        ? { left: l + borders.left * f, right: r - borders.right * f, top: t + borders.top * f, bottom: btm - borders.bottom * f }
        : null,
    centering: located.centering,
  };
}

function loadReference(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 6000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const c = document.createElement('canvas');
        c.width = 120;
        c.height = 168;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 120, 168);
        resolve(ctx.getImageData(0, 0, 120, 168));
      } catch {
        resolve(null); // tainted canvas – no CORS on this image host
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url + (url.includes('?') ? '&' : '?') + 'cors=1';
  });
}

/**
 * Full pipeline for one photo.
 * @param {HTMLCanvasElement} canvas
 * @param {{hint?:object, onStep?:(step:string)=>void}} [opts]
 * @returns {Promise<{candidates:object[], hints:object, located:object, snapshot:object}>}
 */
export async function analyzePhoto(canvas, { hint, onStep } = {}) {
  onStep?.('locate');
  const located = locateCard(canvas, hint);
  const snapshot = cardSnapshot(canvas, located);

  onStep?.('read');
  const hints = await readCardText(located.full, located.bounds);

  onStep?.('lookup');
  let candidates = hints.name || hints.number ? await identifyCard(hints) : [];

  if (candidates.length > 1) {
    onStep?.('compare');
    const photoPrint = fingerprint(located.mid, located.midBounds);
    const top = candidates.slice(0, 6);
    const refs = await Promise.all(top.map((c) => loadReference(c.images?.small)));
    let compared = 0;
    top.forEach((c, i) => {
      if (!refs[i]) return;
      c.imageSimilarity = compareFingerprints(photoPrint, fingerprint(refs[i], { left: 0, top: 0, right: 120, bottom: 168 }));
      compared++;
    });
    if (compared) candidates = rankCandidates(candidates, hints);
  }
  return { candidates, hints, located, snapshot };
}
