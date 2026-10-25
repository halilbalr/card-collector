// Display helpers that depend on the user's settings.

import { formatMoney, rawPrice, convert, itemValue, CONDITIONS } from './prices.js';
import { settings, rates, valueCtx } from './store.js';

/** Money in the display currency. */
export const money = (amount, opts) => formatMoney(amount, settings().currency, opts);

/** Raw NM price of a card variant, converted to the display currency. */
export function cardPrice(card, variant) {
  const p = rawPrice(card, { variant, source: settings().source });
  return p ? convert(p.amount, p.currency, settings().currency, rates()) : null;
}

/** Formatted raw price, or a dash. */
export const cardPriceLabel = (card, variant) => money(cardPrice(card, variant));

/** Value of one collection entry (all copies) in the display currency. */
export const entryValue = (item) => itemValue(item, valueCtx());

/** "PSA 10", "BGS 9.5" or the raw condition ("NM"). */
export function gradeLabel(item) {
  if (item.grade && item.grade.company && item.grade.company !== 'RAW') {
    return `${item.grade.company} ${String(item.grade.key).replace(/[A-Z]+$/, '')}${item.grade.key === '10BL' ? ' BL' : ''}`;
  }
  return CONDITIONS.find((c) => c.id === (item.condition ?? 'NM'))?.short ?? 'NM';
}

/** "151 · #199/165" */
export function setLine(card) {
  return `${card.setName ?? ''} · #${card.number ?? ''}${card.printedTotal ? `/${card.printedTotal}` : ''}`;
}
