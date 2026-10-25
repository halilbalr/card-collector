// Card data and prices. Primary source: the Pokémon TCG API (pokemontcg.io).
// Backup: TCGdex (tcgdex.net). Both are free and CORS-enabled, so the app
// needs no server of its own. Everything is normalised to one card shape.

import { normalizeNumber, parseSearchQuery, rankCandidates } from './ocr-parse.js';

const PTCG = 'https://api.pokemontcg.io/v2';
const DEX = 'https://api.tcgdex.net/v2/en';
const PTCG_SELECT = 'id,name,number,rarity,artist,supertype,subtypes,hp,types,images,set,tcgplayer,cardmarket';

const config = { key: '', provider: 'auto' };
const health = { ptcgDownUntil: 0 };
const memory = new Map();

/**
 * @param {{key?:string, provider?:'auto'|'ptcg'|'tcgdex'}} opts
 */
export function configureApi(opts = {}) {
  Object.assign(config, opts);
  // New settings deserve a fresh attempt at the primary source.
  health.ptcgDownUntil = 0;
}

// ---------------------------------------------------------------- helpers

async function fetchJSON(url, { headers = {}, timeout = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function cacheGet(key) {
  const hit = memory.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  try {
    const raw = localStorage.getItem(`kk-cache:${key}`);
    if (!raw) return undefined;
    const { until, value } = JSON.parse(raw);
    if (until > Date.now()) {
      memory.set(key, { until, value });
      return value;
    }
    localStorage.removeItem(`kk-cache:${key}`);
  } catch {
    /* storage unavailable */
  }
  return undefined;
}

function cacheSet(key, value, ttlMs, persist = false) {
  const until = Date.now() + ttlMs;
  memory.set(key, { until, value });
  if (!persist) return;
  try {
    localStorage.setItem(`kk-cache:${key}`, JSON.stringify({ until, value }));
  } catch {
    // Quota full: drop old cache entries and carry on without persisting.
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('kk-cache:')) localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

/** Drop expired cache entries from localStorage (run once at start-up). */
export function pruneCache() {
  try {
    const now = Date.now();
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith('kk-cache:')) continue;
      try {
        if (JSON.parse(localStorage.getItem(k)).until < now) localStorage.removeItem(k);
      } catch {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* storage unavailable */
  }
}

async function cached(key, ttlMs, fn, persist = false) {
  const hit = cacheGet(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  cacheSet(key, value, ttlMs, persist);
  return value;
}

function ptcgGet(path, params = {}) {
  const url = new URL(PTCG + path);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, v);
  return fetchJSON(url.toString(), { headers: config.key ? { 'X-Api-Key': config.key } : {} });
}

function dexGet(path, params = {}) {
  const url = new URL(DEX + path);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, v);
  return fetchJSON(url.toString(), { timeout: 15000 });
}

/** Try the preferred provider first, then the other one. */
async function withFallback(fns) {
  let order;
  if (config.provider === 'tcgdex') order = ['tcgdex', 'ptcg'];
  else if (config.provider === 'ptcg') order = ['ptcg', 'tcgdex'];
  else order = Date.now() < health.ptcgDownUntil ? ['tcgdex', 'ptcg'] : ['ptcg', 'tcgdex'];
  let lastErr;
  for (const provider of order) {
    try {
      const result = await fns[provider]();
      if (provider === 'ptcg') health.ptcgDownUntil = 0;
      return result;
    } catch (err) {
      lastErr = err;
      if (provider === 'ptcg' && (!err.status || err.status >= 500 || err.status === 429)) {
        health.ptcgDownUntil = Date.now() + 5 * 60 * 1000;
      }
    }
  }
  throw lastErr ?? new Error('Ingen datakälla svarade');
}

const quote = (s) => String(s).replace(/["\\]/g, '');
const isoDate = (d) => (d ? String(d).replace(/\//g, '-').slice(0, 10) : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ---------------------------------------------------------- normalisation

/**
 * Pokémon TCG API card → app card.
 * @returns {object}
 */
export function normalizePtcgCard(c) {
  const set = c.set ?? {};
  const cmp = c.cardmarket?.prices;
  const tp = c.tcgplayer?.prices;
  const tcgVariants = {};
  for (const [variant, row] of Object.entries(tp ?? {})) {
    tcgVariants[variant] = { low: num(row?.low), mid: num(row?.mid), high: num(row?.high), market: num(row?.market) };
  }
  return {
    provider: 'ptcg',
    id: c.id,
    name: c.name,
    number: c.number,
    printedTotal: set.printedTotal ?? null,
    setTotal: set.total ?? null,
    setId: set.id ?? null,
    setName: set.name ?? '',
    series: set.series ?? '',
    setCode: set.ptcgoCode ?? null,
    releaseDate: isoDate(set.releaseDate),
    setLogo: set.images?.logo ?? null,
    setSymbol: set.images?.symbol ?? null,
    rarity: c.rarity ?? null,
    artist: c.artist ?? null,
    supertype: c.supertype ?? null,
    subtypes: c.subtypes ?? [],
    hp: c.hp ?? null,
    types: c.types ?? [],
    images: { small: c.images?.small ?? null, large: c.images?.large ?? c.images?.small ?? null },
    variants: Object.keys(tcgVariants),
    prices: {
      cardmarket: cmp
        ? {
            url: c.cardmarket?.url ?? null,
            updatedAt: isoDate(c.cardmarket?.updatedAt),
            trend: num(cmp.trendPrice),
            avg: num(cmp.averageSellPrice),
            low: num(cmp.lowPrice),
            avg1: num(cmp.avg1),
            avg7: num(cmp.avg7),
            avg30: num(cmp.avg30),
            reverse:
              cmp.reverseHoloTrend || cmp.reverseHoloAvg30 || cmp.reverseHoloSell
                ? {
                    trend: num(cmp.reverseHoloTrend),
                    avg: num(cmp.reverseHoloSell),
                    low: num(cmp.reverseHoloLow),
                    avg1: num(cmp.reverseHoloAvg1),
                    avg7: num(cmp.reverseHoloAvg7),
                    avg30: num(cmp.reverseHoloAvg30),
                  }
                : null,
          }
        : null,
      tcgplayer: tp
        ? { url: c.tcgplayer?.url ?? null, updatedAt: isoDate(c.tcgplayer?.updatedAt), variants: tcgVariants }
        : null,
    },
  };
}

const DEX_VARIANTS = {
  normal: 'normal',
  holofoil: 'holofoil',
  holo: 'holofoil',
  'reverse-holofoil': 'reverseHolofoil',
  reverse: 'reverseHolofoil',
  reverseHolofoil: 'reverseHolofoil',
  '1st-edition-holofoil': '1stEditionHolofoil',
  '1st-edition': '1stEditionNormal',
  '1st-edition-normal': '1stEditionNormal',
  'unlimited-holofoil': 'unlimitedHolofoil',
  unlimited: 'unlimited',
};

/**
 * TCGdex card (brief or full) → app card. `set` may be passed separately
 * because TCGdex keeps the release date on the set, not the card.
 * @returns {object}
 */
export function normalizeDexCard(c, set = null) {
  const s = set ?? c.set ?? {};
  const img = c.image ? { small: `${c.image}/low.webp`, large: `${c.image}/high.webp` } : { small: null, large: null };
  const pick = (o, ...keys) => {
    for (const k of keys) if (num(o?.[k]) != null) return o[k];
    return null;
  };
  const cm = c.pricing?.cardmarket;
  const tp = c.pricing?.tcgplayer;
  const tcgVariants = {};
  for (const [key, row] of Object.entries(tp ?? {})) {
    if (!row || typeof row !== 'object' || !DEX_VARIANTS[key]) continue;
    tcgVariants[DEX_VARIANTS[key]] = {
      low: pick(row, 'lowPrice', 'low'),
      mid: pick(row, 'midPrice', 'mid'),
      high: pick(row, 'highPrice', 'high'),
      market: pick(row, 'marketPrice', 'market'),
    };
  }
  const dexVariants = c.variants ?? {};
  const flagVariants = [
    dexVariants.normal && 'normal',
    dexVariants.holo && 'holofoil',
    dexVariants.reverse && 'reverseHolofoil',
    dexVariants.firstEdition && (dexVariants.holo ? '1stEditionHolofoil' : '1stEditionNormal'),
  ].filter(Boolean);
  const hasReverse = cm && ['avg-holo', 'trend-holo', 'avg30-holo'].some((k) => num(cm[k]) != null);
  const ext = (u) => (u && !/\.(png|webp|jpg)$/i.test(u) ? `${u}.webp` : u ?? null);
  return {
    provider: 'tcgdex',
    id: c.id,
    name: c.name,
    number: c.localId != null ? String(c.localId) : null,
    printedTotal: s.cardCount?.official ?? null,
    setTotal: s.cardCount?.total ?? null,
    setId: s.id ?? null,
    setName: s.name ?? '',
    series: s.serie?.name ?? '',
    setCode: s.tcgOnline ?? s.abbreviation?.official ?? null,
    releaseDate: isoDate(s.releaseDate),
    setLogo: ext(s.logo),
    setSymbol: ext(s.symbol),
    rarity: c.rarity ?? null,
    artist: c.illustrator ?? null,
    supertype: c.category ?? null,
    subtypes: c.stage ? [c.stage] : [],
    hp: c.hp != null ? String(c.hp) : null,
    types: c.types ?? [],
    images: img,
    variants: [...new Set([...Object.keys(tcgVariants), ...flagVariants])],
    partial: !c.set && !set,
    prices: {
      cardmarket: cm
        ? {
            url: null,
            updatedAt: isoDate(cm.updated),
            trend: pick(cm, 'trend'),
            avg: pick(cm, 'avg'),
            low: pick(cm, 'low'),
            avg1: pick(cm, 'avg1'),
            avg7: pick(cm, 'avg7'),
            avg30: pick(cm, 'avg30'),
            reverse: hasReverse
              ? {
                  trend: pick(cm, 'trend-holo'),
                  avg: pick(cm, 'avg-holo'),
                  low: pick(cm, 'low-holo'),
                  avg1: pick(cm, 'avg1-holo'),
                  avg7: pick(cm, 'avg7-holo'),
                  avg30: pick(cm, 'avg30-holo'),
                }
              : null,
          }
        : null,
      tcgplayer: Object.keys(tcgVariants).length
        ? { url: null, updatedAt: isoDate(tp?.updated), variants: tcgVariants }
        : null,
    },
  };
}

/** Pokémon TCG API set → app set. */
export function normalizePtcgSet(s) {
  return {
    provider: 'ptcg',
    id: s.id,
    name: s.name,
    series: s.series ?? '',
    printedTotal: s.printedTotal ?? null,
    total: s.total ?? null,
    releaseDate: isoDate(s.releaseDate),
    code: s.ptcgoCode ?? null,
    logo: s.images?.logo ?? null,
    symbol: s.images?.symbol ?? null,
  };
}

function normalizeDexSet(s) {
  const ext = (u) => (u ? `${u}.webp` : null);
  return {
    provider: 'tcgdex',
    id: s.id,
    name: s.name,
    series: s.serie?.name ?? '',
    printedTotal: s.cardCount?.official ?? null,
    total: s.cardCount?.total ?? null,
    releaseDate: isoDate(s.releaseDate),
    code: s.tcgOnline ?? null,
    logo: ext(s.logo),
    symbol: ext(s.symbol),
  };
}

const byNumber = (a, b) => {
  const na = parseInt(String(a.number).replace(/\D/g, ''), 10) || 0;
  const nb = parseInt(String(b.number).replace(/\D/g, ''), 10) || 0;
  const pa = String(a.number).replace(/\d/g, '');
  const pb = String(b.number).replace(/\d/g, '');
  return pa === pb ? na - nb : pa.localeCompare(pb);
};

// --------------------------------------------------------------- queries

async function dexSet(setId) {
  return cached(`dexset:${setId}`, 24 * 3600e3, () => dexGet(`/sets/${encodeURIComponent(setId)}`), true);
}

async function dexFullCard(id) {
  const c = await dexGet(`/cards/${encodeURIComponent(id)}`);
  let set = null;
  if (c.set?.id) {
    try {
      set = await dexSet(c.set.id);
    } catch {
      set = c.set;
    }
  }
  return normalizeDexCard(c, set ? { ...c.set, ...set } : null);
}

/**
 * Free-text card search, e.g. "charizard", "pikachu 25", "umbreon 215/203".
 * @param {{text?:string, setId?:string, page?:number, pageSize?:number}} opts
 * @returns {Promise<{cards:object[], total:number, page:number, pageSize:number, provider:string}>}
 */
export async function searchCards({ text = '', setId = '', page = 1, pageSize = 24 } = {}) {
  const { name, number, total } = parseSearchQuery(text);
  if (!name && !number && !setId) return { cards: [], total: 0, page, pageSize, provider: 'none' };
  const key = `search:${name}|${number}|${total}|${setId}|${page}|${pageSize}|${config.provider}`;
  return cached(key, 30 * 60e3, () =>
    withFallback({
      ptcg: async () => {
        const q = [];
        if (name) q.push(`name:"*${quote(name)}*"`);
        if (number) q.push(`number:"${quote(number)}"`);
        if (total) q.push(`(set.printedTotal:${total} OR set.total:${total})`);
        if (setId && !setId.includes('.')) q.push(`set.id:${quote(setId)}`);
        const res = await ptcgGet('/cards', {
          q: q.join(' '),
          orderBy: setId ? 'number' : '-set.releaseDate',
          page,
          pageSize,
          select: PTCG_SELECT,
        });
        const cards = (res.data ?? []).map(normalizePtcgCard);
        if (setId) cards.sort(byNumber);
        return { cards, total: res.totalCount ?? cards.length, page, pageSize, provider: 'ptcg' };
      },
      tcgdex: async () => {
        let list;
        if (setId) {
          const set = await dexSet(setId);
          list = (set.cards ?? []).filter((c) => !name || c.name.toLowerCase().includes(name.toLowerCase()));
        } else if (name) {
          list = await dexGet('/cards', { name });
        } else {
          list = await dexGet('/cards', { localId: number });
        }
        if (number) list = list.filter((c) => normalizeNumber(c.localId) === normalizeNumber(number));
        const start = (page - 1) * pageSize;
        // Newest first: TCGdex ids are not dated, but later sets come later in the list.
        const ordered = setId ? list : [...list].reverse();
        const cards = ordered.slice(start, start + pageSize).map((c) => normalizeDexCard(c));
        return { cards, total: list.length, page, pageSize, provider: 'tcgdex' };
      },
    }),
  );
}

/**
 * One card with full price data.
 * @returns {Promise<object>}
 */
export async function getCard(provider, id) {
  return cached(
    `card:${provider}:${id}`,
    6 * 3600e3,
    async () => {
      if (provider === 'tcgdex') return dexFullCard(id);
      const res = await ptcgGet(`/cards/${encodeURIComponent(id)}`);
      return normalizePtcgCard(res.data);
    },
    true,
  );
}

/**
 * Fresh data for many cards at once (used by "update prices").
 * @param {{provider:string,id:string}[]} refs
 * @param {(done:number,total:number)=>void} [onProgress]
 * @returns {Promise<Map<string, object>>} keyed by `${provider}:${id}`
 */
export async function getCardsByRefs(refs, onProgress) {
  const out = new Map();
  const ptcgIds = [...new Set(refs.filter((r) => r.provider !== 'tcgdex').map((r) => r.id))];
  const dexIds = [...new Set(refs.filter((r) => r.provider === 'tcgdex').map((r) => r.id))];
  const totalCount = ptcgIds.length + dexIds.length;
  let done = 0;
  for (let i = 0; i < ptcgIds.length; i += 40) {
    const chunk = ptcgIds.slice(i, i + 40);
    try {
      const res = await ptcgGet('/cards', {
        q: chunk.map((id) => `id:"${quote(id)}"`).join(' OR '),
        pageSize: 250,
        select: PTCG_SELECT,
      });
      for (const c of res.data ?? []) {
        const card = normalizePtcgCard(c);
        out.set(`ptcg:${card.id}`, card);
        cacheSet(`card:ptcg:${card.id}`, card, 6 * 3600e3, true);
      }
    } catch {
      /* keep the stored data for this chunk */
    }
    done += chunk.length;
    onProgress?.(done, totalCount);
  }
  let next = 0;
  const worker = async () => {
    while (next < dexIds.length) {
      const id = dexIds[next++];
      try {
        const card = await dexFullCard(id);
        out.set(`tcgdex:${id}`, card);
        cacheSet(`card:tcgdex:${id}`, card, 6 * 3600e3, true);
      } catch {
        /* keep stored data */
      }
      onProgress?.(++done, totalCount);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return out;
}

/**
 * All sets, newest first.
 * @returns {Promise<object[]>}
 */
export async function getSets() {
  return cached(
    `sets:${config.provider}`,
    24 * 3600e3,
    () =>
      withFallback({
        ptcg: async () => {
          const res = await ptcgGet('/sets', { orderBy: '-releaseDate', pageSize: 250 });
          return (res.data ?? []).map(normalizePtcgSet);
        },
        tcgdex: async () => {
          const res = await dexGet('/sets');
          return [...res].reverse().map(normalizeDexSet);
        },
      }),
    true,
  );
}

/**
 * Every card in a set, in collector-number order.
 * @returns {Promise<{set:object|null, cards:object[]}>}
 */
export async function getSetCards(provider, setId) {
  return cached(`setcards:${provider}:${setId}`, 6 * 3600e3, async () => {
    if (provider === 'tcgdex') {
      const set = await dexSet(setId);
      const ns = normalizeDexSet(set);
      return { set: ns, cards: (set.cards ?? []).map((c) => normalizeDexCard(c, set)).sort(byNumber) };
    }
    const cards = [];
    for (let page = 1; page <= 4; page++) {
      const res = await ptcgGet('/cards', { q: `set.id:${quote(setId)}`, pageSize: 250, page, select: PTCG_SELECT });
      cards.push(...(res.data ?? []).map(normalizePtcgCard));
      if ((res.data ?? []).length < 250) break;
    }
    cards.sort(byNumber);
    const first = cards[0];
    const set = first
      ? {
          provider: 'ptcg',
          id: setId,
          name: first.setName,
          series: first.series,
          printedTotal: first.printedTotal,
          total: first.setTotal,
          releaseDate: first.releaseDate,
          logo: first.setLogo,
          symbol: first.setSymbol,
        }
      : null;
    return { set, cards };
  });
}

/**
 * Turn OCR hints into ranked candidate cards.
 * @param {{name?:string|null, text?:string, number?:string|null, total?:number|null, setCode?:string|null}} hints
 * @returns {Promise<object[]>} ranked best first, with `confidence`
 */
export async function identifyCard(hints) {
  const name = hints.name?.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? null;
  const number = hints.number;
  const found = new Map();
  const add = (cards) => cards.forEach((c) => found.set(`${c.provider}:${c.id}`, c));
  const best = () => rankCandidates([...found.values()], hints)[0];

  const ptcgQueries = [];
  if (hints.setCode && number) ptcgQueries.push(`set.ptcgoCode:${quote(hints.setCode)} number:"${quote(number)}"`);
  if (number && hints.total) ptcgQueries.push(`number:"${quote(number)}" (set.printedTotal:${hints.total} OR set.total:${hints.total})`);
  if (name && number) ptcgQueries.push(`name:"${quote(name.slice(0, 5))}*" number:"${quote(number)}"`);
  if (name) ptcgQueries.push(`name:"${quote(name)}*"`);
  if (number && !name && !hints.total && !hints.setCode) ptcgQueries.push(`number:"${quote(number)}"`);

  try {
    await withFallback({
      ptcg: async () => {
        for (const q of ptcgQueries) {
          const res = await ptcgGet('/cards', { q, pageSize: 40, orderBy: '-set.releaseDate', select: PTCG_SELECT });
          add((res.data ?? []).map(normalizePtcgCard));
          if ((best()?.confidence ?? 0) >= 0.75) break;
        }
        if (!found.size && ptcgQueries.length) throw Object.assign(new Error('no match'), { status: 404 });
      },
      tcgdex: async () => {
        if (!name) return;
        let list = await dexGet('/cards', { name });
        if (number) {
          const exact = list.filter((c) => normalizeNumber(c.localId) === normalizeNumber(number));
          if (exact.length) list = exact;
        }
        const top = rankCandidates(list.map((c) => normalizeDexCard(c)), hints).slice(0, 6);
        const full = await Promise.all(top.map((c) => dexFullCard(c.id).catch(() => c)));
        add(full);
      },
    });
  } catch {
    /* fall through with whatever we found */
  }
  return rankCandidates([...found.values()], hints).slice(0, 12);
}

/**
 * Exchange rates relative to EUR. Tries two free sources.
 * @returns {Promise<{base:string,date:string,rates:Record<string,number>}>}
 */
export async function fetchRates() {
  const want = 'USD,SEK,NOK,DKK,GBP';
  const sources = [
    async () => {
      const r = await fetchJSON(`https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${want}`, { timeout: 8000 });
      return { base: 'EUR', date: r.date, rates: { EUR: 1, ...r.rates } };
    },
    async () => {
      const r = await fetchJSON(`https://api.frankfurter.app/latest?from=EUR&to=${want}`, { timeout: 8000 });
      return { base: 'EUR', date: r.date, rates: { EUR: 1, ...r.rates } };
    },
    async () => {
      const r = await fetchJSON('https://open.er-api.com/v6/latest/EUR', { timeout: 8000 });
      return { base: 'EUR', date: isoDate(new Date(r.time_last_update_unix * 1000).toISOString()), rates: { EUR: 1, ...r.rates } };
    },
  ];
  for (const src of sources) {
    try {
      const rates = await src();
      if (rates.rates.USD && rates.rates.SEK) return rates;
    } catch {
      /* next source */
    }
  }
  throw new Error('Kunde inte hämta valutakurser');
}

/**
 * Deep links to real sold listings and price guides for a card.
 * @returns {{label:string, sub:string, url:string}[]}
 */
export function marketLinks(card, { company = 'PSA', grade = '10' } = {}) {
  const base = `${card.name} ${card.number ?? ''}${card.printedTotal ? '/' + card.printedTotal : ''}`.trim();
  const setPart = card.setName ? ` ${card.setName}` : '';
  const enc = encodeURIComponent;
  return [
    {
      label: `eBay – sålda ${company} ${grade}`,
      sub: 'Faktiska slutpriser för graderade exemplar',
      url: `https://www.ebay.com/sch/i.html?_nkw=${enc(`${base} ${company} ${grade}`)}&LH_Sold=1&LH_Complete=1&_sacat=183454`,
    },
    {
      label: 'eBay – sålda ograderade',
      sub: 'Slutpriser för råa kort',
      url: `https://www.ebay.com/sch/i.html?_nkw=${enc(`${base}${setPart}`)}&LH_Sold=1&LH_Complete=1&_sacat=183454`,
    },
    {
      label: 'PriceCharting',
      sub: 'Prishistorik per betyg (PSA, BGS, CGC)',
      url: `https://www.pricecharting.com/search-products?type=prices&q=${enc(`pokemon ${card.name} ${card.number ?? ''}${setPart}`)}`,
    },
    {
      label: 'Cardmarket',
      sub: 'Europas största marknadsplats',
      url: card.prices?.cardmarket?.url ?? `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${enc(card.name)}`,
    },
    {
      label: 'TCGplayer',
      sub: 'Amerikanska marknadspriser',
      url: card.prices?.tcgplayer?.url ?? `https://www.tcgplayer.com/search/pokemon/product?q=${enc(card.name)}`,
    },
  ];
}
