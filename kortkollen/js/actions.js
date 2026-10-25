// Cross-view actions: refreshing prices and exchange rates.

import { fetchRates, getCardsByRefs, configureApi } from './api.js';
import { getState, update, applyFreshCards, recordHistory } from './store.js';

let running = null;

/** Apply API-related settings (key, provider). */
export function applyApiSettings() {
  const { apiKey, provider } = getState().settings;
  configureApi({ key: apiKey, provider });
}

/** Refresh exchange rates if they are older than `maxAgeH` hours. */
export async function refreshRates(maxAgeH = 12) {
  const r = getState().rates;
  if (r?.fetchedAt && Date.now() - r.fetchedAt < maxAgeH * 3600e3) return r;
  try {
    const fresh = await fetchRates();
    update((s) => {
      s.rates = { ...fresh, fetchedAt: Date.now() };
    });
    return fresh;
  } catch {
    return r;
  }
}

/**
 * Fetch fresh prices for every card in the collection and wishlist.
 * Concurrent calls share one run.
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<{updated:number,total:number}>}
 */
export function refreshPrices(onProgress) {
  if (running) return running;
  running = (async () => {
    await refreshRates(0.5);
    const st = getState();
    const refs = new Map();
    for (const e of [...st.items, ...st.wishlist]) refs.set(e.key, { provider: e.card.provider, id: e.card.id });
    const fresh = refs.size ? await getCardsByRefs([...refs.values()], onProgress) : new Map();
    applyFreshCards(fresh);
    recordHistory();
    return { updated: fresh.size, total: refs.size };
  })().finally(() => {
    running = null;
  });
  return running;
}

/** True while a refresh is running. */
export const isRefreshing = () => !!running;

/** Refresh in the background when data is stale (on app start). */
export async function autoRefresh() {
  const st = getState();
  refreshRates();
  const stale = !st.lastRefresh || Date.now() - new Date(st.lastRefresh).getTime() > 12 * 3600e3;
  if (stale && navigator.onLine !== false && (st.items.length || st.wishlist.length)) {
    try {
      await refreshPrices();
    } catch {
      /* offline – keep stored prices */
    }
  } else if (st.items.length && !st.history.length) {
    recordHistory();
  }
}
