// Text recognition with Tesseract.js, loaded on demand from a CDN the first
// time the scanner is opened (≈ 4 MB, then cached by the browser and the
// service worker).

import { crop, prepareForOcr, OCR_REGIONS, regionRect } from './vision.js';
import { parseNumber, parseName } from './ocr-parse.js';
import { DEMO } from './demo.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let workerPromise = null;
const listeners = new Set();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Kunde inte ladda textigenkänningen. Kontrollera internetanslutningen.'));
    document.head.append(s);
  });
}

/** Listen to Tesseract loading progress ({status, progress}). */
export function onOcrProgress(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Start (or reuse) the OCR worker. Safe to call early to warm it up. */
export function loadOcr() {
  if (!workerPromise) {
    workerPromise = (async () => {
      // Demo mode runs where only the page's own files can be fetched, so the
      // engine, its core and the language data are published alongside it,
      // behind a small worker wrapper (vendor/tesseract/kk-worker.js).
      const local = DEMO ? new URL('vendor/tesseract', location.href).href : null;
      await loadScript(local ? `${local}/tesseract.min.js` : TESSERACT_URL);
      return window.Tesseract.createWorker('eng', 1, {
        logger: (m) => listeners.forEach((fn) => fn(m)),
        ...(local ? { workerPath: `${local}/kk-worker.js`, workerBlobURL: false, corePath: local, langPath: local } : {}),
      });
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

function toCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  return c;
}

/**
 * Read the name and collector number off a card photo.
 * @param {ImageData|{width:number,height:number,data:Uint8ClampedArray}} img
 * @param {{left:number,right:number,top:number,bottom:number}} bounds card edges in px
 * @returns {Promise<{name:string|null, text:string, number:string|null, total:number|null, setCode:string|null, raw:string}>}
 */
export async function readCardText(img, bounds) {
  const worker = await loadOcr();
  const H = bounds.bottom - bounds.top;
  // Aim for ~36 px tall collector-number glyphs.
  const scale = Math.max(1, Math.min(3.5, 36 / (0.016 * H)));

  const numberStrip = crop(img, regionRect(bounds, OCR_REGIONS.number));
  await worker.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '' });
  let numberText = (await worker.recognize(toCanvas(prepareForOcr(numberStrip, { scale })))).data.text;
  let num = parseNumber(numberText);
  if (!num) {
    // Second chance with a hard threshold – helps on holo and full-art cards.
    const again = (await worker.recognize(toCanvas(prepareForOcr(numberStrip, { scale, binary: true })))).data.text;
    numberText += `\n${again}`;
    num = parseNumber(again);
  }

  await worker.setParameters({ tessedit_pageseg_mode: '6' });
  const nameStrip = crop(img, regionRect(bounds, OCR_REGIONS.name));
  const nameText = (await worker.recognize(toCanvas(prepareForOcr(nameStrip, { scale: scale * 0.6 })))).data.text;

  return {
    name: parseName(nameText),
    text: nameText,
    number: num?.number ?? null,
    total: num?.total ?? null,
    setCode: num?.setCode ?? null,
    raw: `${nameText}\n${numberText}`,
  };
}
