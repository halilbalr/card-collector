// Small DOM toolkit: element builder, toasts, bottom sheets and dialogs.

import { icon } from './icons.js';

/**
 * Build an element. Props: class, style (object|string), dataset, html,
 * on<Event> handlers, and any other attribute. Children may be nested arrays;
 * null/false are skipped and strings become text.
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Replace all children of `el`. */
export function mount(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

/** Light haptic tap where supported (Android). */
export function haptic(pattern = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

/**
 * Card image with lazy loading and a graceful placeholder on error.
 */
export function cardImage(src, alt = '', cls = '') {
  const img = h('img', { class: `card-img ${cls}`, alt, loading: 'lazy', decoding: 'async', draggable: false });
  img.addEventListener('error', () => img.classList.add('is-broken'), { once: true });
  img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
  if (src) img.src = src;
  else img.classList.add('is-broken');
  return img;
}

// ------------------------------------------------------------------ toasts

/**
 * Show a short message above the tab bar.
 * @param {string} message
 * @param {{action?:string, onAction?:Function, duration?:number, type?:'ok'|'error'|'info'}} [opts]
 */
export function toast(message, { action, onAction, duration = 3800, type = 'info' } = {}) {
  const root = document.getElementById('toast-root');
  const el = h(
    'div',
    { class: `toast toast--${type}`, role: 'status' },
    type === 'ok' ? icon('check', { size: 18 }) : type === 'error' ? icon('alert', { size: 18 }) : null,
    h('span', { class: 'toast__msg' }, message),
    action &&
      h(
        'button',
        {
          class: 'toast__action',
          onClick: () => {
            onAction?.();
            close();
          },
        },
        action,
      ),
  );
  const close = () => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 250);
  };
  // One message at a time: older toasts make way for the new one.
  for (const old of root.querySelectorAll('.toast:not(.is-leaving)')) {
    old.classList.add('is-leaving');
    setTimeout(() => old.remove(), 250);
  }
  root.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(close, duration);
  return close;
}

// ------------------------------------------------------------------ sheets

const openSheets = [];

/**
 * Bottom sheet (full width on phones, centred dialog on wide screens).
 * @param {{title?:string, content:HTMLElement|((close:Function)=>HTMLElement), onClose?:Function, tall?:boolean, cls?:string}} opts
 * @returns {{close:Function, el:HTMLElement}}
 */
export function openSheet({ title, content, onClose, tall = false, cls = '' }) {
  const root = document.getElementById('sheet-root');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('is-open');
    openSheets.splice(openSheets.indexOf(close), 1);
    document.removeEventListener('keydown', onKey);
    setTimeout(() => wrap.remove(), 280);
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && openSheets[openSheets.length - 1] === close) close();
  };
  const handle = h('div', { class: 'sheet__handle', 'aria-hidden': 'true' });
  const body = h('div', { class: 'sheet__body' }, typeof content === 'function' ? content(close) : content);
  const panel = h(
    'div',
    { class: `sheet ${tall ? 'sheet--tall' : ''} ${cls}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title ?? '' },
    handle,
    title &&
      h(
        'div',
        { class: 'sheet__head' },
        h('h2', { class: 'sheet__title' }, title),
        h('button', { class: 'icon-btn', 'aria-label': 'Stäng', onClick: close }, icon('x')),
      ),
    body,
  );
  const wrap = h('div', { class: 'sheet-wrap' }, h('div', { class: 'sheet-backdrop', onClick: close }), panel);
  root.append(wrap);
  openSheets.push(close);
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('is-open')));
  enableSwipeDown(panel, handle, body, close);
  return { close, el: panel, body };
}

/** Close every open sheet (used on navigation). */
export function closeAllSheets() {
  [...openSheets].reverse().forEach((close) => close());
}

// Drag the handle (or the body when scrolled to top) down to dismiss.
function enableSwipeDown(panel, handle, body, close) {
  let startY = null;
  let dy = 0;
  const start = (e) => {
    if (e.target !== handle && body.scrollTop > 0) return;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    dy = 0;
    panel.style.transition = 'none';
  };
  const move = (e) => {
    if (startY == null) return;
    dy = Math.max(0, (e.touches ? e.touches[0].clientY : e.clientY) - startY);
    if (dy > 0) panel.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (startY == null) return;
    panel.style.transition = '';
    panel.style.transform = '';
    if (dy > 110) close();
    startY = null;
  };
  for (const target of [handle, panel.querySelector('.sheet__head')].filter(Boolean)) {
    target.addEventListener('touchstart', start, { passive: true });
  }
  panel.addEventListener('touchmove', move, { passive: true });
  panel.addEventListener('touchend', end);
}

/**
 * Yes/no dialog.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Avbryt', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const { close } = openSheet({
      title,
      cls: 'sheet--dialog',
      onClose: () => !answered && resolve(false),
      content: (close) =>
        h(
          'div',
          { class: 'dialog' },
          message && h('p', { class: 'dialog__msg' }, message),
          h(
            'div',
            { class: 'dialog__actions' },
            h('button', { class: 'btn btn--ghost', onClick: () => close() }, cancelLabel),
            h(
              'button',
              {
                class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
                onClick: () => {
                  answered = true;
                  resolve(true);
                  close();
                },
              },
              confirmLabel,
            ),
          ),
        ),
    });
    return close;
  });
}

// --------------------------------------------------------------- snippets

/** Friendly empty state block. */
export function emptyState({ iconName = 'cards', title, text, action }) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty__icon' }, icon(iconName, { size: 30 })),
    h('h3', { class: 'empty__title' }, title),
    text && h('p', { class: 'empty__text' }, text),
    action,
  );
}

/** Grid of shimmering placeholders while loading. */
export function skeletonGrid(n = 6) {
  return h(
    'div',
    { class: 'grid' },
    Array.from({ length: n }, () => h('div', { class: 'tile tile--skeleton' }, h('div', { class: 'skeleton skeleton--card' }), h('div', { class: 'skeleton skeleton--line' }), h('div', { class: 'skeleton skeleton--line short' }))),
  );
}

/** Segmented control. Calls onChange(value). */
export function segmented(options, value, onChange, { cls = '' } = {}) {
  const el = h('div', { class: `seg ${cls}`, role: 'tablist' });
  const render = (current) => {
    mount(
      el,
      options.map((o) =>
        h(
          'button',
          {
            class: `seg__btn ${o.value === current ? 'is-active' : ''}`,
            role: 'tab',
            'aria-selected': String(o.value === current),
            onClick: () => {
              if (o.value === current) return;
              render(o.value);
              onChange(o.value);
            },
          },
          o.label,
        ),
      ),
    );
  };
  render(value);
  el.set = render;
  return el;
}

/** Chips with single (or multi) selection. */
export function chips(options, value, onChange, { multi = false, cls = '' } = {}) {
  const el = h('div', { class: `chips ${cls}` });
  let current = multi ? new Set(value ?? []) : value;
  const render = () =>
    mount(
      el,
      options.map((o) => {
        const active = multi ? current.has(o.value) : o.value === current;
        return h(
          'button',
          {
            class: `chip ${active ? 'is-active' : ''}`,
            'aria-pressed': String(active),
            onClick: () => {
              if (multi) {
                current.has(o.value) ? current.delete(o.value) : current.add(o.value);
                onChange([...current]);
              } else {
                current = o.value;
                onChange(current);
              }
              render();
            },
          },
          o.icon && icon(o.icon, { size: 16 }),
          o.label,
        );
      }),
    );
  render();
  return el;
}

/** Quantity stepper. */
export function stepper(value, onChange, { min = 1, max = 999 } = {}) {
  let v = value;
  const out = h('output', { class: 'stepper__val' }, String(v));
  const set = (n) => {
    v = Math.max(min, Math.min(max, n));
    out.textContent = String(v);
    onChange(v);
  };
  return h(
    'div',
    { class: 'stepper' },
    h('button', { class: 'stepper__btn', 'aria-label': 'Minska', onClick: () => set(v - 1) }, icon('minus', { size: 18 })),
    out,
    h('button', { class: 'stepper__btn', 'aria-label': 'Öka', onClick: () => set(v + 1) }, icon('plus', { size: 18 })),
  );
}

/** Section heading with an optional link on the right. */
export function sectionHead(title, link) {
  return h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, title), link);
}

/** Relative date like "i dag", "i går", "3 dagar sedan". */
export function relativeDate(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  const days = Math.round((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return 'i dag';
  if (days === 1) return 'i går';
  if (days < 7) return `${days} dagar sedan`;
  return then.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: then.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

/** Debounce helper. */
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
