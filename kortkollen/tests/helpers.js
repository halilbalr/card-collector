// Synthetic test images – deterministic, no files.

/** Small deterministic PRNG so "noise" is identical on every run. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Draw a fake card on a noisy background.
 * @param {object} o
 * @param {number} o.w image width
 * @param {number} o.h image height
 * @param {{left:number,top:number,width:number,height:number}} o.card outer card rect (px)
 * @param {{left:number,right:number,top:number,bottom:number}} o.border border widths (px)
 * @param {number[]} [o.borderColor]
 * @param {number} [o.seed]
 */
export function makeCardImage({ w, h, card, border, borderColor = [250, 205, 30], seed = 7, artSeed = 3 }) {
  const data = new Uint8ClampedArray(w * h * 4);
  const rand = rng(seed);
  const art = rng(artSeed);
  // Art: coloured blocks so the inside is busy like a real card.
  const blocks = Array.from({ length: 64 }, () => [art() * 255, art() * 255, art() * 255]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      let c;
      const inCard = x >= card.left && x < card.left + card.width && y >= card.top && y < card.top + card.height;
      if (!inCard) {
        const n = 40 + rand() * 25;
        c = [n, n, n + 8];
      } else {
        const ix = x - card.left;
        const iy = y - card.top;
        const inArt =
          ix >= border.left && ix < card.width - border.right && iy >= border.top && iy < card.height - border.bottom;
        if (!inArt) {
          c = borderColor.map((v) => v + (rand() - 0.5) * 10);
        } else {
          const bx = Math.floor(((ix - border.left) / (card.width - border.left - border.right)) * 8);
          const by = Math.floor(((iy - border.top) / (card.height - border.top - border.bottom)) * 8);
          const base = blocks[(by * 8 + bx) % 64];
          // Keep the art clearly different from the border colour.
          c = [base[0] * 0.6, base[1] * 0.6, 90 + base[2] * 0.6];
        }
      }
      data[p] = c[0];
      data[p + 1] = c[1];
      data[p + 2] = c[2];
      data[p + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}
