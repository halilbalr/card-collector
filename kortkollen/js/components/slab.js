// A graded "slab" (the sealed plastic case) drawn in CSS, with an optional
// illustration of the wear a card typically shows at that grade.

import { h, cardImage } from '../ui.js';
import { COMPANIES, wearForGrade } from '../grading.js';

const SVG = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// Deterministic pseudo-random numbers so the same grade always looks the same.
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * SVG overlay that fakes corner wear, edge whitening, scratches and creases.
 * Drawn in card units (63 × 88) and stretched over the card image.
 */
export function wearOverlay(wear, seed = 7) {
  const rand = seeded(seed);
  const root = svg('svg', { viewBox: '0 0 63 88', preserveAspectRatio: 'none', class: 'wear', 'aria-hidden': 'true' });
  if (wear.dull) root.append(svg('rect', { x: 0, y: 0, width: 63, height: 88, fill: '#f4efe6', opacity: wear.dull }));
  if (wear.scratches) {
    const n = Math.round(2 + wear.scratches * 9);
    for (let i = 0; i < n; i++) {
      const x = 6 + rand() * 50;
      const y = 10 + rand() * 60;
      const len = 4 + rand() * 16;
      const a = rand() * Math.PI;
      root.append(
        svg('line', {
          x1: x,
          y1: y,
          x2: x + Math.cos(a) * len,
          y2: y + Math.sin(a) * len,
          stroke: '#fff',
          'stroke-width': 0.18 + rand() * 0.2,
          opacity: 0.25 + wear.scratches * 0.45,
          'stroke-linecap': 'round',
        }),
      );
    }
  }
  if (wear.edges) {
    const e = wear.edges;
    const dash = `${(0.6 + e * 5).toFixed(2)} ${(7 - e * 5).toFixed(2)} ${(0.4 + e * 3).toFixed(2)} ${(4 - e * 2.5).toFixed(2)}`;
    root.append(
      svg('rect', {
        x: 0.45,
        y: 0.45,
        width: 62.1,
        height: 87.1,
        rx: 3,
        fill: 'none',
        stroke: '#fff',
        'stroke-width': 0.35 + e * 0.9,
        'stroke-dasharray': dash,
        'stroke-dashoffset': Math.round(rand() * 20),
        opacity: 0.45 + e * 0.5,
      }),
    );
  }
  if (wear.corners) {
    const c = wear.corners;
    const corners = [
      [0.5, 0.5, 1, 1],
      [62.5, 0.5, -1, 1],
      [0.5, 87.5, 1, -1],
      [62.5, 87.5, -1, -1],
    ];
    corners.forEach(([x, y, dx, dy], i) => {
      const k = c * (0.55 + 0.45 * ((i * 37 + seed) % 5) / 4);
      const r = 2.2 + k * 3;
      root.append(
        svg('path', {
          d: `M${x},${y + dy * r} Q${x},${y} ${x + dx * r},${y}`,
          fill: 'none',
          stroke: '#fff',
          'stroke-width': 0.5 + k * 1.6,
          'stroke-linecap': 'round',
          opacity: 0.55 + k * 0.45,
        }),
      );
    });
  }
  for (let i = 0; i < (wear.crease ?? 0); i++) {
    const x1 = 4 + rand() * 12;
    const y1 = 12 + rand() * 30 + i * 20;
    const x2 = 48 + rand() * 12;
    const y2 = y1 + 10 + rand() * 25;
    root.append(svg('line', { x1, y1: y1 + 0.35, x2, y2: y2 + 0.35, stroke: '#000', 'stroke-width': 0.55, opacity: 0.35 }));
    root.append(svg('line', { x1, y1, x2, y2, stroke: '#fff', 'stroke-width': 0.4, opacity: 0.75 }));
  }
  return root;
}

/** "10BL" → "10", "9.5" → "9.5" */
export const gradeNumber = (key) => String(key).replace(/[A-Z]+$/, '');

/**
 * A slab for one company + grade.
 * @param {object} card normalised card
 * @param {string} companyId PSA | BGS | CGC | SGC
 * @param {{key:string,value:number,label:string,tier?:string}} grade
 * @param {{wear?:boolean, highlight?:boolean, size?:'sm'|'md'|'lg', subgrades?:object|null}} [opts]
 */
export function slab(card, companyId, grade, { wear = true, highlight = false, size = 'md', subgrades = null } = {}) {
  const company = COMPANIES[companyId];
  const year = card.releaseDate?.slice(0, 4) ?? '';
  const seed = [...String(card.id)].reduce((a, ch) => a + ch.charCodeAt(0), 0) + Math.round(grade.value * 10);
  const cert = String(10000000 + ((seed * 7919) % 89999999)).slice(0, 8);
  return h(
    'div',
    {
      class: `slab slab--${companyId.toLowerCase()} ${grade.tier ? `slab--${grade.tier}` : ''} slab--${size} ${highlight ? 'is-highlight' : ''}`,
      'aria-label': `${company.name} ${gradeNumber(grade.key)} ${grade.label}`,
    },
    h(
      'div',
      { class: 'slab__label' },
      h('div', { class: 'slab__brand' }, company.name),
      h(
        'div',
        { class: 'slab__info' },
        h('div', { class: 'slab__line' }, `${year} POKÉMON ${String(card.setName ?? '').toUpperCase()}`),
        h('div', { class: 'slab__line slab__line--name' }, String(card.name).toUpperCase()),
        h('div', { class: 'slab__line' }, `#${card.number ?? ''} ${String(card.rarity ?? '').toUpperCase()}`),
        subgrades &&
          h(
            'div',
            { class: 'slab__subs' },
            Object.entries({ C: subgrades.centering, Co: subgrades.corners, E: subgrades.edges, S: subgrades.surface }).map(([k, v]) =>
              h('span', {}, `${k} ${v}`),
            ),
          ),
      ),
      h(
        'div',
        { class: 'slab__grade' },
        h('div', { class: 'slab__grade-label' }, grade.label),
        h('div', { class: 'slab__grade-num' }, gradeNumber(grade.key)),
        h('div', { class: 'slab__cert' }, cert),
      ),
    ),
    h(
      'div',
      { class: 'slab__window' },
      h('div', { class: 'slab__card' }, cardImage(card.images?.small ?? card.images?.large, card.name), wear && wearOverlay(wearForGrade(grade.value), seed)),
    ),
  );
}
