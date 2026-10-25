// Card hero with a 3D tilt and a holographic sheen that follows the finger
// (or the phone's motion sensor where allowed).

import { h, cardImage } from '../ui.js';

const PLAIN = /^(common|uncommon|rare)$/i;

/** Should the card get the rainbow foil effect? */
export function isShiny(card, variant) {
  if (variant && /holo/i.test(variant)) return true;
  return !!card.rarity && !PLAIN.test(card.rarity.trim());
}

/**
 * @param {object} card normalised card
 * @param {{variant?:string}} [opts]
 * @returns {HTMLElement} element with a `.destroy()` method
 */
export function holoCard(card, { variant } = {}) {
  const inner = h(
    'div',
    { class: 'holo__card' },
    cardImage(card.images?.large ?? card.images?.small, card.name, 'holo__img'),
    isShiny(card, variant) && h('div', { class: 'holo__foil' }),
    h('div', { class: 'holo__shine' }),
  );
  const el = h('div', { class: 'holo', role: 'img', 'aria-label': card.name }, inner);

  const set = (px, py) => {
    inner.style.setProperty('--rx', `${(0.5 - py) * 18}deg`);
    inner.style.setProperty('--ry', `${(px - 0.5) * 22}deg`);
    inner.style.setProperty('--mx', `${px * 100}%`);
    inner.style.setProperty('--my', `${py * 100}%`);
    inner.style.setProperty('--bgx', `${30 + px * 40}%`);
    inner.style.setProperty('--bgy', `${30 + py * 40}%`);
  };
  const reset = () => {
    el.classList.remove('is-active');
    set(0.5, 0.5);
  };
  const onMove = (e) => {
    const r = el.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    el.classList.add('is-active');
    set(px, py);
  };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerdown', onMove);
  el.addEventListener('pointerleave', reset);
  el.addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && setTimeout(reset, 600));

  // Motion sensor (Android without prompt; iOS only after permission was granted elsewhere).
  let last = 0;
  const onOrient = (e) => {
    if (el.classList.contains('is-active') || e.gamma == null) return;
    const now = performance.now();
    if (now - last < 32) return;
    last = now;
    const px = 0.5 + Math.max(-0.5, Math.min(0.5, e.gamma / 50));
    const py = 0.5 + Math.max(-0.5, Math.min(0.5, (e.beta - 45) / 60));
    set(px, py);
  };
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) window.addEventListener('deviceorientation', onOrient);
  el.destroy = () => window.removeEventListener('deviceorientation', onOrient);
  reset();
  return el;
}
