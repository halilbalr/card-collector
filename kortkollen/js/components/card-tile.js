// Card tile used in search results, the collection and set views.

import { h, cardImage } from '../ui.js';
import { icon } from '../icons.js';

/**
 * @param {object} card normalised card
 * @param {{price?:string, badge?:string, qty?:number, owned?:boolean, sub?:string,
 *   onClick?:Function, selected?:boolean, selectable?:boolean, dim?:boolean, alert?:string}} [opts]
 */
export function cardTile(card, { price, badge, qty, owned, sub, onClick, selected, selectable, dim, alert } = {}) {
  return h(
    'button',
    {
      class: `tile ${selected ? 'is-selected' : ''} ${dim ? 'is-dim' : ''}`,
      onClick,
      'aria-label': `${card.name}, ${card.setName ?? ''} ${card.number ?? ''}`,
      'aria-pressed': selectable ? String(!!selected) : null,
    },
    h(
      'div',
      { class: 'tile__media' },
      cardImage(card.images?.small, card.name),
      badge && h('span', { class: 'tile__badge' }, badge),
      qty > 1 && h('span', { class: 'tile__qty' }, `×${qty}`),
      owned && h('span', { class: 'tile__owned', title: 'Finns i samlingen' }, icon('check', { size: 14, stroke: 3 })),
      alert && h('span', { class: 'tile__alert' }, alert),
      selectable && h('span', { class: 'tile__check' }, selected ? icon('check', { size: 14, stroke: 3 }) : null),
    ),
    h('div', { class: 'tile__name' }, card.name),
    h('div', { class: 'tile__sub' }, sub ?? `${card.setName ?? ''} · #${card.number ?? ''}`),
    price && h('div', { class: 'tile__price' }, price),
  );
}
