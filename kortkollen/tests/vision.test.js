import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCardImage } from './helpers.js';
import {
  findCardBounds,
  measureCentering,
  fingerprint,
  compareFingerprints,
  resize,
  crop,
  photoQuality,
} from '../js/vision.js';

const W = 420;
const H = 560;
const card = { left: 40, top: 50, width: 315, height: 440 };

test('finds the outer card edges', () => {
  const img = makeCardImage({ w: W, h: H, card, border: { left: 14, right: 14, top: 13, bottom: 13 } });
  const b = findCardBounds(img);
  assert.ok(b, 'bounds found');
  assert.ok(Math.abs(b.left - 40) <= 1.5, `left ${b.left}`);
  assert.ok(Math.abs(b.right - 355) <= 1.5, `right ${b.right}`);
  assert.ok(Math.abs(b.top - 50) <= 1.5, `top ${b.top}`);
  assert.ok(Math.abs(b.bottom - 490) <= 1.5, `bottom ${b.bottom}`);
  assert.ok(b.confidence > 0.8);
});

test('uses the guide hint to find edges', () => {
  const img = makeCardImage({ w: W, h: H, card, border: { left: 14, right: 14, top: 13, bottom: 13 } });
  const hint = { left: 40 / W, right: 355 / W, top: 50 / H, bottom: 490 / H };
  const b = findCardBounds(img, hint);
  assert.ok(Math.abs(b.left - 40) <= 1.5 && Math.abs(b.bottom - 490) <= 1.5);
});

test('measures a centred card as ~50/50', () => {
  const img = makeCardImage({ w: W, h: H, card, border: { left: 14, right: 14, top: 13, bottom: 13 } });
  const m = measureCentering(img);
  assert.ok(m.lr < 53, `lr ${m.lr}`);
  assert.ok(m.tb < 53, `tb ${m.tb}`);
  assert.ok(m.confidence > 0.5);
});

test('measures an off-centre card', () => {
  // 10px vs 18px left/right = 64/36, 16 vs 10 top/bottom = 61.5/38.5
  const img = makeCardImage({ w: W, h: H, card, border: { left: 10, right: 18, top: 16, bottom: 10 } });
  const m = measureCentering(img);
  assert.ok(Math.abs(m.lr - 64.3) < 3, `lr ${m.lr}`);
  assert.ok(Math.abs(m.tb - 61.5) < 3, `tb ${m.tb}`);
  assert.ok(Math.abs(m.worst - Math.max(m.lr, m.tb)) < 1e-9);
});

test('measures with known bounds and a silver border', () => {
  const img = makeCardImage({
    w: W,
    h: H,
    card,
    border: { left: 12, right: 16, top: 12, bottom: 12 },
    borderColor: [200, 200, 205],
  });
  const m = measureCentering(img, { bounds: { left: 40, right: 355, top: 50, bottom: 490 } });
  assert.ok(Math.abs(m.lr - 57.1) < 3, `lr ${m.lr}`);
});

test('fingerprints tell the same card from a different one', () => {
  const a = makeCardImage({ w: W, h: H, card, border: { left: 14, right: 14, top: 13, bottom: 13 }, artSeed: 3 });
  const aShifted = makeCardImage({ w: W, h: H, card: { ...card, left: 44 }, border: { left: 14, right: 14, top: 13, bottom: 13 }, artSeed: 3, seed: 99 });
  const b = makeCardImage({ w: W, h: H, card, border: { left: 14, right: 14, top: 13, bottom: 13 }, artSeed: 11 });
  const bounds = { left: 40, right: 355, top: 50, bottom: 490 };
  const fa = fingerprint(a, bounds);
  const fa2 = fingerprint(aShifted, { ...bounds, left: 44, right: 359 });
  const fb = fingerprint(b, bounds);
  const same = compareFingerprints(fa, fa2);
  const diff = compareFingerprints(fa, fb);
  assert.ok(same > 0.85, `same ${same}`);
  assert.ok(diff < same - 0.3, `diff ${diff}`);
});

test('resize, crop and photoQuality behave', () => {
  const img = makeCardImage({ w: 100, h: 100, card: { left: 10, top: 10, width: 60, height: 80 }, border: { left: 4, right: 4, top: 4, bottom: 4 } });
  const small = resize(img, 10, 10);
  assert.equal(small.data.length, 400);
  const c = crop(img, { left: 10, top: 10, right: 70, bottom: 90 });
  assert.equal(c.width, 60);
  assert.equal(c.height, 80);
  const q = photoQuality(img);
  assert.ok(q.brightness > 0 && q.sharpness > 0 && q.glare >= 0);
});

test('prepareForOcr upscales and makes text dark on light', async () => {
  const { prepareForOcr, otsu } = await import('../js/vision.js');
  // White text on a dark strip.
  const w = 40, h = 10;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const isText = i % w > 10 && i % w < 14;
    data.set(isText ? [240, 240, 240, 255] : [20, 30, 40, 255], i * 4);
  }
  const out = prepareForOcr({ width: w, height: h, data }, { scale: 2, binary: true });
  assert.equal(out.width, 80);
  assert.equal(out.height, 20);
  const px = (x, y) => out.data[(y * out.width + x) * 4];
  assert.equal(px(2, 10), 255, 'background is now white');
  assert.equal(px(24, 10), 0, 'text is now black');
  assert.ok(otsu(new Float32Array([0, 0, 0, 255, 255, 255])) < 255);
});
