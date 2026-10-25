// Minimal SVG charts that scale with their container.

import { h } from '../ui.js';

const SVG = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

let gradientId = 0;

/**
 * Area/line chart. Values only (evenly spaced); labels go underneath.
 * @param {number[]} values
 * @param {{height?:number, labels?:[string,string], tone?:'up'|'down'|'neutral'}} [opts]
 */
export function areaChart(values, { height = 120, labels, tone = 'neutral' } = {}) {
  const W = 300;
  const H = height;
  const pts = values.length === 1 ? [values[0], values[0]] : values;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || Math.max(1, Math.abs(max) * 0.1);
  const pad = 10;
  const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, pad + (1 - (v - min) / span) * (H - pad * 2)]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const id = `g${++gradientId}`;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: `chart chart--${tone}`, role: 'img', 'aria-label': 'Värdeutveckling' });
  const defs = el('defs', {});
  const grad = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(el('stop', { offset: '0%', class: 'chart__stop-top' }), el('stop', { offset: '100%', class: 'chart__stop-bottom' }));
  defs.append(grad);
  svg.append(
    defs,
    el('path', { d: `${line}L${W},${H}L0,${H}Z`, fill: `url(#${id})`, class: 'chart__area' }),
    el('path', { d: line, class: 'chart__line', 'vector-effect': 'non-scaling-stroke' }),
  );
  const [lx, ly] = xy[xy.length - 1];
  const dot = h('span', { class: 'chart__dot', style: { left: `${(lx / W) * 100}%`, top: `${(ly / H) * 100}%` } });
  return h(
    'div',
    { class: 'chart-wrap', style: { height: `${H}px` } },
    svg,
    dot,
    labels && h('div', { class: 'chart__labels' }, h('span', {}, labels[0]), h('span', {}, labels[1])),
  );
}

/**
 * Tiny inline sparkline.
 * @param {number[]} values
 */
export function sparkline(values, { width = 64, height = 24 } = {}) {
  const clean = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (clean.length < 2) return h('span', { class: 'spark spark--empty' });
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const d = clean
    .map((v, i) => `${i ? 'L' : 'M'}${((i / (clean.length - 1)) * width).toFixed(1)},${(2 + (1 - (v - min) / span) * (height - 4)).toFixed(1)}`)
    .join('');
  const tone = clean[clean.length - 1] >= clean[0] ? 'up' : 'down';
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: `spark spark--${tone}`, 'aria-hidden': 'true' });
  svg.append(el('path', { d, fill: 'none', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  return svg;
}

/**
 * Horizontal probability bars, e.g. grade distribution.
 * @param {{label:string, value:number, sub?:string, highlight?:boolean}[]} rows value 0–1
 */
export function probabilityBars(rows) {
  return h(
    'div',
    { class: 'pbars' },
    rows.map((r) =>
      h(
        'div',
        { class: `pbar ${r.highlight ? 'is-highlight' : ''}` },
        h('span', { class: 'pbar__label' }, r.label),
        h('span', { class: 'pbar__track' }, h('span', { class: 'pbar__fill', style: { width: `${Math.max(r.value > 0 ? 2 : 0, r.value * 100)}%` } })),
        h('span', { class: 'pbar__pct' }, `${Math.round(r.value * 100)} %`),
        r.sub && h('span', { class: 'pbar__sub' }, r.sub),
      ),
    ),
  );
}
