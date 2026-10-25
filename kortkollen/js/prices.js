// Price extraction, currency conversion and the graded-price model.
// Pure functions only (no DOM, no network).

import { COMPANIES } from './grading.js';

export const CURRENCIES = {
  SEK: { label: 'Svenska kronor', locale: 'sv-SE' },
  EUR: { label: 'Euro', locale: 'sv-SE' },
  USD: { label: 'US-dollar', locale: 'sv-SE' },
  NOK: { label: 'Norska kronor', locale: 'sv-SE' },
  DKK: { label: 'Danska kronor', locale: 'sv-SE' },
  GBP: { label: 'Brittiska pund', locale: 'sv-SE' },
};

/** Used until live rates have been fetched once (and when offline). */
export const FALLBACK_RATES = {
  base: 'EUR',
  date: '2026-10-01',
  fallback: true,
  rates: { EUR: 1, USD: 1.16, SEK: 10.95, NOK: 11.65, DKK: 7.46, GBP: 0.87 },
};

/**
 * Convert between currencies using a rates table relative to `rates.base`.
 * @returns {number|null}
 */
export function convert(amount, from, to, rates = FALLBACK_RATES) {
  if (amount == null || !Number.isFinite(amount)) return null;
  if (from === to) return amount;
  const table = rates?.rates ?? FALLBACK_RATES.rates;
  const base = rates?.base ?? 'EUR';
  const fromRate = from === base ? 1 : table[from];
  const toRate = to === base ? 1 : table[to];
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}

export const VARIANT_ORDER = [
  'holofoil',
  'normal',
  'reverseHolofoil',
  '1stEditionHolofoil',
  '1stEditionNormal',
  'unlimitedHolofoil',
  'unlimited',
];

export const VARIANT_LABELS = {
  normal: 'Normal',
  holofoil: 'Holo',
  reverseHolofoil: 'Reverse holo',
  '1stEditionHolofoil': '1st Edition holo',
  '1stEditionNormal': '1st Edition',
  unlimitedHolofoil: 'Unlimited holo',
  unlimited: 'Unlimited',
};

/** Raw (ungraded) condition grades with their share of the Near Mint price. */
export const CONDITIONS = [
  { id: 'NM', short: 'NM', label: 'Near Mint', desc: 'Som nytt, högst mikroskopiska brister', factor: 1 },
  { id: 'LP', short: 'LP', label: 'Lätt spelat', desc: 'Lite vithet på kanter eller hörn', factor: 0.8 },
  { id: 'MP', short: 'MP', label: 'Måttligt spelat', desc: 'Tydligt slitage, inga veck', factor: 0.62 },
  { id: 'HP', short: 'HP', label: 'Mycket spelat', desc: 'Kraftigt slitage, kan ha veck', factor: 0.42 },
  { id: 'DMG', short: 'DMG', label: 'Skadat', desc: 'Veck, revor, fukt eller skrivet på', factor: 0.25 },
];

const firstPositive = (...vals) => vals.find((v) => typeof v === 'number' && v > 0) ?? null;

/**
 * Variants this card exists in, best first.
 * @returns {string[]}
 */
export function cardVariants(card) {
  const fromTcg = Object.keys(card?.prices?.tcgplayer?.variants ?? {});
  const found = new Set([...fromTcg, ...(card?.variants ?? [])]);
  const ordered = VARIANT_ORDER.filter((v) => found.has(v));
  if (ordered.length) return ordered;
  return [/holo/i.test(card?.rarity ?? '') ? 'holofoil' : 'normal'];
}

export function defaultVariant(card) {
  return cardVariants(card)[0];
}

/**
 * Ungraded Near Mint market price for one variant.
 * Cardmarket (EUR) is preferred for European users, TCGplayer (USD) as backup.
 * @param {object} card normalised card (see api.js)
 * @param {{variant?:string, source?:'cardmarket'|'tcgplayer'}} [opts]
 * @returns {{amount:number, currency:string, source:string}|null}
 */
export function rawPrice(card, { variant, source = 'cardmarket' } = {}) {
  const v = variant ?? defaultVariant(card);
  const cm = card?.prices?.cardmarket;
  const tp = card?.prices?.tcgplayer;

  const fromCardmarket = () => {
    if (!cm) return null;
    const src = v === 'reverseHolofoil' ? cm.reverse : cm;
    const amount = firstPositive(src?.trend, src?.avg30, src?.avg7, src?.avg, src?.low);
    return amount ? { amount, currency: 'EUR', source: 'cardmarket' } : null;
  };
  const fromTcgplayer = () => {
    const variants = tp?.variants;
    if (!variants) return null;
    const row = variants[v] ?? variants[defaultVariant(card)] ?? Object.values(variants)[0];
    const amount = firstPositive(row?.market, row?.mid, row?.low);
    return amount ? { amount, currency: 'USD', source: 'tcgplayer' } : null;
  };

  // Cardmarket lists 1st Edition as a separate product that the card APIs do
  // not link, so TCGplayer is the only reliable source for those variants.
  if (v.startsWith('1stEdition') || source === 'tcgplayer') return fromTcgplayer() ?? fromCardmarket();
  return fromCardmarket() ?? fromTcgplayer();
}

/**
 * Short-term trend from Cardmarket's rolling averages.
 * @returns {{avg1:number|null, avg7:number|null, avg30:number|null, change7:number|null}|null}
 */
export function priceTrend(card, variant) {
  const cm = card?.prices?.cardmarket;
  if (!cm) return null;
  const src = variant === 'reverseHolofoil' ? cm.reverse : cm;
  if (!src) return null;
  const avg1 = firstPositive(src.avg1);
  const avg7 = firstPositive(src.avg7);
  const avg30 = firstPositive(src.avg30);
  const change7 = avg7 && avg30 ? (avg7 - avg30) / avg30 : null;
  return { avg1, avg7, avg30, change7, trend: firstPositive(src.trend) };
}

/**
 * Era of a set, which drives how much a high grade multiplies the raw price.
 * @param {string} releaseDate ISO date
 * @returns {'vintage'|'classic'|'modern'}
 */
export function eraOf(releaseDate) {
  const d = String(releaseDate ?? '');
  const year = parseInt(d.slice(0, 4), 10);
  if (!year) return 'modern';
  if (d < '2003-07-01') return 'vintage';
  if (year < 2017) return 'classic';
  return 'modern';
}

export const ERA_LABELS = {
  vintage: 'Vintage (WOTC 1999–2003)',
  classic: 'Klassisk (2003–2016)',
  modern: 'Modern (2017–)',
};

// Typical PSA price as a multiple of the raw Near Mint price, by era. Derived
// from public sold-listing patterns: vintage gem mints are scarce, modern ones
// common. Rough on purpose – the UI always labels these as estimates.
const PSA_MULT = {
  vintage: { 10: 9, 9: 2.8, 8: 1.5, 7: 1.05, 6: 0.85, 5: 0.7, 4: 0.55, 3: 0.45, 2: 0.35, 1: 0.25 },
  classic: { 10: 4.5, 9: 1.8, 8: 1.15, 7: 0.9, 6: 0.75, 5: 0.6, 4: 0.5, 3: 0.4, 2: 0.3, 1: 0.2 },
  modern: { 10: 2.3, 9: 1.05, 8: 0.8, 7: 0.65, 6: 0.55, 5: 0.45, 4: 0.38, 3: 0.3, 2: 0.25, 1: 0.18 },
};

// Slabs rarely sell below what grading costs, so cheap cards hit a floor (USD).
const PSA_FLOOR_USD = {
  vintage: { 10: 45, 9: 18, 8: 12, 7: 10, 6: 8, 5: 7, 4: 6, 3: 5, 2: 4, 1: 3 },
  classic: { 10: 25, 9: 13, 8: 10, 7: 8, 6: 7, 5: 6, 4: 5, 3: 4, 2: 3, 1: 3 },
  modern: { 10: 16, 9: 10, 8: 8, 7: 7, 6: 6, 5: 5, 4: 4, 3: 3, 2: 3, 1: 2 },
};

/**
 * Estimated PSA price (USD) for grades 1–10 from the raw NM price.
 * @param {number} rawUsd
 * @param {'vintage'|'classic'|'modern'} era
 * @returns {Record<number, number>|null}
 */
export function psaCurve(rawUsd, era = 'modern') {
  if (!(rawUsd > 0)) return null;
  const mult = PSA_MULT[era] ?? PSA_MULT.modern;
  const floor = PSA_FLOOR_USD[era] ?? PSA_FLOOR_USD.modern;
  // Iconic vintage cards carry a steeper gem-mint premium.
  const boost = era === 'vintage' ? 1 + 0.25 * Math.log10(Math.max(1, rawUsd / 50)) : 1;
  const curve = {};
  for (let g = 1; g <= 10; g++) {
    let m = mult[g];
    if (g === 10) m *= boost;
    else if (g === 9) m *= Math.sqrt(boost);
    curve[g] = Math.max(floor[g], rawUsd * m);
  }
  for (let g = 2; g <= 10; g++) curve[g] = Math.max(curve[g], curve[g - 1] * 1.03);
  return curve;
}

// Other companies relative to PSA: [PSA grade to price from, multiplier].
const COMPANY_RELATIVE = {
  BGS: { '10BL': [10, 3.0], 10: [10, 1.3], 9.5: [10, 0.6], default: 0.88 },
  CGC: { '10P': [10, 1.15], 10: [10, 0.62], 9.5: [9, 1.15], default: 0.82 },
  SGC: { '10P': [10, 1.05], 10: [10, 0.68], 9.5: [9, 1.12], default: 0.85 },
};

/**
 * Estimated graded price (USD) for a company + grade key, e.g. ('BGS', '9.5').
 * @returns {number|null}
 */
export function gradedPriceUsd(companyId, key, curve) {
  if (!curve) return null;
  if (companyId === 'PSA') return curve[Number(key)] ?? null;
  const rel = COMPANY_RELATIVE[companyId];
  if (!rel) return null;
  if (rel[key]) {
    const [ref, m] = rel[key];
    return curve[ref] * m;
  }
  const v = Number(key);
  if (!Number.isFinite(v)) return null;
  const lo = Math.max(1, Math.floor(v));
  const hi = Math.min(10, Math.ceil(v));
  // Geometric interpolation between whole PSA grades for the half grades.
  const t = v - lo;
  const base = hi === lo ? curve[lo] : curve[lo] ** (1 - t) * curve[hi] ** t;
  return base * rel.default;
}

/**
 * Complete graded price table for a card, in the requested currency.
 * @returns {{raw:{amount:number,currency:string,source:string}|null, era:string,
 *   rawDisplay:number|null, companies:Record<string,{key:string,label:string,name:string,value:number,price:number|null}[]>}}
 */
export function gradedTable(card, { variant, source, currency = 'SEK', rates } = {}) {
  const raw = rawPrice(card, { variant, source });
  const era = eraOf(card?.releaseDate);
  const rawUsd = raw ? convert(raw.amount, raw.currency, 'USD', rates) : null;
  const curve = psaCurve(rawUsd, era);
  const companies = {};
  for (const [id, company] of Object.entries(COMPANIES)) {
    companies[id] = company.grades.map((g) => {
      const usd = gradedPriceUsd(id, g.key, curve);
      return { ...g, price: usd == null ? null : convert(usd, 'USD', currency, rates) };
    });
  }
  return {
    raw,
    era,
    rawDisplay: raw ? convert(raw.amount, raw.currency, currency, rates) : null,
    companies,
  };
}

/**
 * Current value of one collection entry, in `currency`.
 * Raw cards: NM price × condition factor. Graded cards: model price for the slab.
 * @returns {number|null} total for the whole quantity
 */
export function itemValue(item, { source, currency = 'SEK', rates } = {}) {
  const qty = item?.qty ?? 1;
  const card = item?.card;
  if (!card) return null;
  if (item.grade && item.grade.company && item.grade.company !== 'RAW') {
    if (item.grade.manualValue != null) {
      const v = convert(item.grade.manualValue, item.grade.manualCurrency ?? currency, currency, rates);
      return v == null ? null : v * qty;
    }
    const raw = rawPrice(card, { variant: item.variant, source });
    if (!raw) return null;
    const curve = psaCurve(convert(raw.amount, raw.currency, 'USD', rates), eraOf(card.releaseDate));
    const usd = gradedPriceUsd(item.grade.company, item.grade.key, curve);
    return usd == null ? null : convert(usd, 'USD', currency, rates) * qty;
  }
  const raw = rawPrice(card, { variant: item.variant, source });
  if (!raw) return null;
  const factor = CONDITIONS.find((c) => c.id === (item.condition ?? 'NM'))?.factor ?? 1;
  return convert(raw.amount, raw.currency, currency, rates) * factor * qty;
}

/**
 * Format money for display, e.g. "1 249 kr" or "12,50 €".
 * Small amounts keep decimals so 0,35 kr bulk cards do not read as 0.
 */
export function formatMoney(amount, currency = 'SEK', { compact = false } = {}) {
  if (amount == null || !Number.isFinite(amount)) return '–';
  const abs = Math.abs(amount);
  const digits = abs >= 100 ? 0 : abs >= 10 ? (currency === 'SEK' || currency === 'NOK' || currency === 'DKK' ? 0 : 2) : 2;
  const opts = {
    style: 'currency',
    currency,
    minimumFractionDigits: compact && abs >= 1000 ? 0 : digits,
    maximumFractionDigits: compact && abs >= 1000 ? 1 : digits,
  };
  if (compact && abs >= 10000) opts.notation = 'compact';
  return new Intl.NumberFormat(CURRENCIES[currency]?.locale ?? 'sv-SE', opts).format(amount);
}

/** "+12,4 %" style percentage. */
export function formatPct(fraction, { sign = true } = {}) {
  if (fraction == null || !Number.isFinite(fraction)) return '–';
  const s = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(Math.abs(fraction) * 100);
  const prefix = !sign ? '' : fraction > 0.0005 ? '+' : fraction < -0.0005 ? '−' : '±';
  return `${prefix}${s} %`;
}
