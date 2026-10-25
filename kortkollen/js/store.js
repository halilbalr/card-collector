// App state persisted in localStorage: settings, collection, wishlist,
// binders, value history and saved grade estimates.

import { convert, itemValue, FALLBACK_RATES, defaultVariant } from './prices.js';

const KEY = 'kortkollen:v1';

const DEFAULTS = {
  settings: {
    currency: 'SEK',
    source: 'cardmarket',
    gradingCost: { amount: 300, currency: 'SEK' },
    gradingCompany: 'PSA',
    theme: 'auto',
    apiKey: '',
    provider: 'auto',
    quickAdd: false,
    libraryView: 'grid',
    librarySort: 'value',
    onboarded: false,
  },
  items: [],
  wishlist: [],
  binders: [],
  history: [],
  estimates: {},
  recent: [],
  searches: [],
  rates: null,
  lastRefresh: null,
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...parsed, settings: { ...DEFAULTS.settings, ...parsed.settings } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      listeners.forEach((fn) => fn(state, { error: err }));
    }
  }, 50);
}

/** Write pending changes now (before the page unloads). */
export function flush() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* reported by save() */
  }
}

/** Current state (treat as read-only; change it through update()). */
export const getState = () => state;
export const settings = () => state.settings;

/** Subscribe to changes. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Mutate state inside `fn`, then persist and notify. */
export function update(fn) {
  fn(state);
  save();
  listeners.forEach((l) => l(state));
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const cardKey = (card) => `${card.provider}:${card.id}`;
export const rates = () => state.rates ?? FALLBACK_RATES;

/** Value options for prices.js helpers, from the current settings. */
export function valueCtx() {
  return { source: state.settings.source, currency: state.settings.currency, rates: rates() };
}

/** Grading cost (incl. shipping) in the display currency. */
export function gradingCost() {
  const c = state.settings.gradingCost;
  return convert(c.amount, c.currency, state.settings.currency, rates()) ?? c.amount;
}

// ------------------------------------------------------------- collection

/**
 * Add a card to the collection.
 * @returns {object} the new entry
 */
export function addItem({ card, variant, condition = 'NM', grade = null, qty = 1, purchase = null, binderIds = [], notes = '' }) {
  const item = {
    uid: uid(),
    key: cardKey(card),
    card,
    variant: variant ?? defaultVariant(card),
    condition,
    grade,
    qty,
    purchase,
    binderIds,
    notes,
    addedAt: new Date().toISOString(),
  };
  update((s) => {
    s.items.unshift(item);
  });
  return item;
}

export function updateItem(uidValue, patch) {
  update((s) => {
    const item = s.items.find((i) => i.uid === uidValue);
    if (item) Object.assign(item, patch);
  });
}

/** Remove entries; returns them (with positions) so the removal can be undone. */
export function removeItems(uids) {
  const removed = [];
  update((s) => {
    s.items = s.items.filter((item, index) => {
      if (!uids.includes(item.uid)) return true;
      removed.push({ item, index });
      return false;
    });
  });
  return removed;
}

export function restoreItems(removed) {
  update((s) => {
    for (const { item, index } of [...removed].sort((a, b) => a.index - b.index)) {
      s.items.splice(Math.min(index, s.items.length), 0, item);
    }
  });
}

export const itemsFor = (key) => state.items.filter((i) => i.key === key);

/** Total collection value in the display currency, plus card counts. */
export function collectionStats(items = state.items) {
  const ctx = valueCtx();
  let value = 0;
  let cost = 0;
  let costedValue = 0;
  let count = 0;
  let priced = 0;
  for (const item of items) {
    const v = itemValue(item, ctx);
    if (v != null) {
      value += v;
      priced++;
    }
    // Profit only makes sense for cards whose purchase price we know.
    if (item.purchase?.amount != null && v != null) {
      cost += (convert(item.purchase.amount, item.purchase.currency, ctx.currency, ctx.rates) ?? 0) * (item.qty ?? 1);
      costedValue += v;
    }
    count += item.qty ?? 1;
  }
  return {
    value,
    cost,
    profit: cost > 0 ? costedValue - cost : null,
    count,
    unique: new Set(items.map((i) => i.key)).size,
    priced,
    entries: items.length,
  };
}

/** Store today's collection value (EUR) for the history chart. */
export function recordHistory() {
  const ctx = { ...valueCtx(), currency: 'EUR' };
  let eur = 0;
  for (const item of state.items) eur += itemValue(item, ctx) ?? 0;
  const day = new Date().toISOString().slice(0, 10);
  update((s) => {
    const last = s.history[s.history.length - 1];
    if (last?.d === day) last.v = eur;
    else s.history.push({ d: day, v: eur });
    if (s.history.length > 730) s.history.splice(0, s.history.length - 730);
  });
}

// --------------------------------------------------------------- wishlist

export const isWishlisted = (key) => state.wishlist.some((w) => w.key === key);

/** Toggle a card on the wishlist; returns true if it was added. */
export function toggleWishlist(card, variant) {
  const key = cardKey(card);
  let added = false;
  update((s) => {
    const idx = s.wishlist.findIndex((w) => w.key === key);
    if (idx >= 0) s.wishlist.splice(idx, 1);
    else {
      s.wishlist.unshift({ uid: uid(), key, card, variant: variant ?? defaultVariant(card), target: null, addedAt: new Date().toISOString() });
      added = true;
    }
  });
  return added;
}

export function updateWish(uidValue, patch) {
  update((s) => {
    const w = s.wishlist.find((x) => x.uid === uidValue);
    if (w) Object.assign(w, patch);
  });
}

// ---------------------------------------------------------------- binders

export function addBinder(name, emoji = '📁') {
  const binder = { id: uid(), name: name.trim(), emoji };
  update((s) => {
    s.binders.push(binder);
  });
  return binder;
}

export function renameBinder(id, name, emoji) {
  update((s) => {
    const b = s.binders.find((x) => x.id === id);
    if (b) Object.assign(b, { name: name.trim() }, emoji ? { emoji } : {});
  });
}

export function deleteBinder(id) {
  update((s) => {
    s.binders = s.binders.filter((b) => b.id !== id);
    for (const item of s.items) item.binderIds = (item.binderIds ?? []).filter((b) => b !== id);
  });
}

// ------------------------------------------------------- recent & misc

/** Remember a viewed/scanned card for the home screen. */
export function addRecent(card, { scanned = false } = {}) {
  const key = cardKey(card);
  update((s) => {
    s.recent = [{ key, card, at: new Date().toISOString(), scanned }, ...s.recent.filter((r) => r.key !== key)].slice(0, 24);
  });
}

export function addSearch(text) {
  const t = text.trim();
  if (!t) return;
  update((s) => {
    s.searches = [t, ...s.searches.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8);
  });
}

export function clearSearches() {
  update((s) => {
    s.searches = [];
  });
}

export function saveEstimate(key, estimate) {
  update((s) => {
    s.estimates[key] = { ...estimate, at: new Date().toISOString() };
  });
}

export const getEstimate = (key) => state.estimates[key] ?? null;

/** Replace cards in the collection/wishlist with fresh API data. */
export function applyFreshCards(fresh) {
  update((s) => {
    for (const list of [s.items, s.wishlist, s.recent]) {
      for (const entry of list) {
        const card = fresh.get(entry.key);
        if (card) entry.card = card;
      }
    }
    s.lastRefresh = new Date().toISOString();
  });
}

// ---------------------------------------------------------- import/export

/** Everything worth backing up, as a JSON string. */
export function exportJSON() {
  const { items, wishlist, binders, history, estimates, settings: st } = state;
  return JSON.stringify(
    { app: 'kortkollen', version: 1, exportedAt: new Date().toISOString(), items, wishlist, binders, history, estimates, settings: { ...st, apiKey: '' } },
    null,
    2,
  );
}

/**
 * Restore a backup. `merge` keeps existing entries and adds new ones.
 * @returns {{items:number, wishlist:number}}
 */
export function importJSON(text, { merge = true } = {}) {
  const data = JSON.parse(text);
  if (data?.app !== 'kortkollen' || !Array.isArray(data.items)) throw new Error('Filen är ingen Kortkollen-säkerhetskopia');
  let added = { items: 0, wishlist: 0 };
  update((s) => {
    if (!merge) {
      s.items = [];
      s.wishlist = [];
      s.binders = [];
      s.history = [];
    }
    const haveItems = new Set(s.items.map((i) => i.uid));
    for (const item of data.items) if (!haveItems.has(item.uid)) (s.items.push(item), added.items++);
    const haveWish = new Set(s.wishlist.map((w) => w.key));
    for (const w of data.wishlist ?? []) if (!haveWish.has(w.key)) (s.wishlist.push(w), added.wishlist++);
    const haveBinders = new Set(s.binders.map((b) => b.id));
    for (const b of data.binders ?? []) if (!haveBinders.has(b.id)) s.binders.push(b);
    if (!s.history.length && Array.isArray(data.history)) s.history = data.history;
    s.estimates = { ...(data.estimates ?? {}), ...s.estimates };
  });
  return added;
}

/** Collection as CSV (semicolon separated – opens straight in Swedish Excel). */
export function exportCSV() {
  const ctx = valueCtx();
  const esc = (v) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['Namn', 'Set', 'Nummer', 'Sällsynthet', 'Variant', 'Skick/Betyg', 'Antal', `Värde (${ctx.currency})`, 'Inköpspris', 'Tillagd', 'Anteckning'];
  const rows = state.items.map((i) => {
    const v = itemValue(i, ctx);
    const grade = i.grade && i.grade.company !== 'RAW' ? `${i.grade.company} ${i.grade.key}` : i.condition;
    return [
      i.card.name,
      i.card.setName,
      `${i.card.number}${i.card.printedTotal ? '/' + i.card.printedTotal : ''}`,
      i.card.rarity ?? '',
      i.variant,
      grade,
      i.qty,
      v == null ? '' : v.toFixed(2).replace('.', ','),
      i.purchase?.amount != null ? `${i.purchase.amount} ${i.purchase.currency}` : '',
      i.addedAt.slice(0, 10),
      i.notes ?? '',
    ].map(esc);
  });
  return '﻿' + [head.map(esc), ...rows].map((r) => r.join(';')).join('\n');
}

/** Wipe everything (settings included). */
export function resetAll() {
  state = structuredClone(DEFAULTS);
  state.settings.onboarded = true;
  save();
  listeners.forEach((l) => l(state));
}
