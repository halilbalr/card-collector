// Interactive centering tool: drag the outer card edges and the inner border
// lines on a photo; a magnifier helps place them precisely on a phone.

import { h } from '../ui.js';
import { icon } from '../icons.js';
import { worstSide, formatRatio, centeringCap } from '../grading.js';

const LINES = [
  { id: 'outerLeft', axis: 'x', kind: 'outer' },
  { id: 'innerLeft', axis: 'x', kind: 'inner' },
  { id: 'innerRight', axis: 'x', kind: 'inner' },
  { id: 'outerRight', axis: 'x', kind: 'outer' },
  { id: 'outerTop', axis: 'y', kind: 'outer' },
  { id: 'innerTop', axis: 'y', kind: 'inner' },
  { id: 'innerBottom', axis: 'y', kind: 'inner' },
  { id: 'outerBottom', axis: 'y', kind: 'outer' },
];

const ORDER = { x: ['outerLeft', 'innerLeft', 'innerRight', 'outerRight'], y: ['outerTop', 'innerTop', 'innerBottom', 'outerBottom'] };

/** CSS class for a worst-side % (green → red). */
export function ratioTone(pct) {
  if (pct == null) return '';
  if (pct <= 55) return 'tone-good';
  if (pct <= 60) return 'tone-ok';
  if (pct <= 65) return 'tone-warn';
  return 'tone-bad';
}

/**
 * @param {{dataUrl:string,width:number,height:number,outer:object,inner:object|null}} snap
 * @param {(m:{lr:number|null,tb:number|null,worst:number|null,L:number,R:number,T:number,B:number})=>void} onChange
 */
export function centeringEditor(snap, onChange) {
  const W = snap.outer.right - snap.outer.left;
  const H = snap.outer.bottom - snap.outer.top;
  const pos = {
    outerLeft: snap.outer.left,
    outerRight: snap.outer.right,
    outerTop: snap.outer.top,
    outerBottom: snap.outer.bottom,
    innerLeft: snap.inner?.left ?? snap.outer.left + W * 0.045,
    innerRight: snap.inner?.right ?? snap.outer.right - W * 0.045,
    innerTop: snap.inner?.top ?? snap.outer.top + H * 0.032,
    innerBottom: snap.inner?.bottom ?? snap.outer.bottom - H * 0.032,
  };
  let selected = 'innerLeft';

  const img = h('img', { class: 'cedit__img', src: snap.dataUrl, alt: 'Foto av kortet', draggable: false });
  const overlay = h('div', { class: 'cedit__overlay' });
  const loupe = h('div', { class: 'cedit__loupe', hidden: true, style: { backgroundImage: `url("${snap.dataUrl}")` } });
  const lineEls = {};
  for (const l of LINES) {
    const el = h(
      'div',
      { class: `cedit__line cedit__line--${l.axis} cedit__line--${l.kind}`, 'data-id': l.id, role: 'slider', 'aria-label': l.id, tabindex: 0 },
      h('span', { class: 'cedit__knob' }),
    );
    lineEls[l.id] = el;
    overlay.append(el);
  }
  const readout = h('div', { class: 'cedit__readout' });
  const stage = h('div', { class: 'cedit__stage' }, img, overlay, loupe);

  const nudgeBtns = h('div', { class: 'cedit__nudge' });
  const wrap = h('div', { class: 'cedit' }, stage, readout, nudgeBtns);

  const clamp = (id, v) => {
    const l = LINES.find((x) => x.id === id);
    const order = ORDER[l.axis];
    const i = order.indexOf(id);
    const min = i > 0 ? pos[order[i - 1]] + 1 : 0;
    const max = i < order.length - 1 ? pos[order[i + 1]] - 1 : l.axis === 'x' ? snap.width : snap.height;
    return Math.max(min, Math.min(max, v));
  };

  const measure = () => {
    const L = pos.innerLeft - pos.outerLeft;
    const R = pos.outerRight - pos.innerRight;
    const T = pos.innerTop - pos.outerTop;
    const B = pos.outerBottom - pos.innerBottom;
    const lr = worstSide(L, R);
    const tb = worstSide(T, B);
    return { L, R, T, B, lr, tb, worst: lr == null && tb == null ? null : Math.max(lr ?? 0, tb ?? 0) };
  };

  const pct = (a, b) => `${Math.round((a / (a + b)) * 100)}/${Math.round((b / (a + b)) * 100)}`;

  const draw = () => {
    for (const l of LINES) {
      const el = lineEls[l.id];
      const v = pos[l.id];
      if (l.axis === 'x') el.style.left = `${(v / snap.width) * 100}%`;
      else el.style.top = `${(v / snap.height) * 100}%`;
      el.classList.toggle('is-selected', l.id === selected);
    }
    const m = measure();
    readout.replaceChildren(
      h('div', { class: `ratio ${ratioTone(m.lr)}` }, h('span', {}, 'Vänster / höger'), h('b', {}, pct(m.L, m.R))),
      h('div', { class: `ratio ${ratioTone(m.tb)}` }, h('span', {}, 'Topp / botten'), h('b', {}, pct(m.T, m.B))),
      h('div', { class: `ratio ${ratioTone(m.worst)}` }, h('span', {}, 'Räcker till'), h('b', {}, `PSA ${centeringCap('PSA', m.worst, null)}`)),
    );
    const axis = LINES.find((l) => l.id === selected).axis;
    nudgeBtns.replaceChildren(
      h('span', { class: 'muted small' }, 'Finjustera vald linje'),
      h('button', { class: 'icon-btn icon-btn--soft', 'aria-label': 'Flytta', onClick: () => nudge(-0.5) }, icon(axis === 'x' ? 'back' : 'chevronDown', { size: 18, cls: axis === 'y' ? 'rot180' : '' })),
      h('button', { class: 'icon-btn icon-btn--soft', 'aria-label': 'Flytta', onClick: () => nudge(0.5) }, icon(axis === 'x' ? 'chevronRight' : 'chevronDown', { size: 18 })),
    );
    onChange(m);
  };

  const nudge = (d) => {
    pos[selected] = clamp(selected, pos[selected] + d);
    draw();
  };

  // Dragging with pointer events (works for touch, pen and mouse).
  let dragging = null;
  const toImage = (e) => {
    const r = stage.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * snap.width, y: ((e.clientY - r.top) / r.height) * snap.height, r };
  };
  const showLoupe = (e) => {
    const { x, y, r } = toImage(e);
    const zoom = 4;
    const size = 120;
    const scale = (r.width / snap.width) * zoom;
    loupe.hidden = false;
    loupe.style.backgroundSize = `${snap.width * scale}px ${snap.height * scale}px`;
    loupe.style.backgroundPosition = `${-x * scale + size / 2}px ${-y * scale + size / 2}px`;
    const lx = e.clientX - r.left - size / 2;
    const ly = e.clientY - r.top - size - 28;
    loupe.style.transform = `translate(${lx}px, ${ly < 0 ? e.clientY - r.top + 28 : ly}px)`;
  };
  overlay.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('.cedit__line');
    if (target) {
      selected = target.dataset.id;
    } else {
      // Tap near a line selects the closest one.
      const { x, y } = toImage(e);
      let best = null;
      for (const l of LINES) {
        const d = Math.abs((l.axis === 'x' ? x : y) - pos[l.id]);
        if (!best || d < best.d) best = { id: l.id, d };
      }
      selected = best.id;
    }
    dragging = selected;
    overlay.setPointerCapture(e.pointerId);
    showLoupe(e);
    draw();
    e.preventDefault();
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const { x, y } = toImage(e);
    const axis = LINES.find((l) => l.id === dragging).axis;
    pos[dragging] = clamp(dragging, axis === 'x' ? x : y);
    showLoupe(e);
    draw();
  });
  const stop = () => {
    dragging = null;
    loupe.hidden = true;
  };
  overlay.addEventListener('pointerup', stop);
  overlay.addEventListener('pointercancel', stop);
  overlay.addEventListener('keydown', (e) => {
    const map = { ArrowLeft: -0.5, ArrowUp: -0.5, ArrowRight: 0.5, ArrowDown: 0.5 };
    if (map[e.key] == null) return;
    selected = e.target.dataset.id ?? selected;
    nudge(map[e.key] * (e.shiftKey ? 4 : 1));
    e.preventDefault();
  });

  draw();
  return wrap;
}

export { formatRatio };
