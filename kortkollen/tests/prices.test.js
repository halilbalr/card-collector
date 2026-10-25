import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convert,
  FALLBACK_RATES,
  rawPrice,
  cardVariants,
  priceTrend,
  eraOf,
  psaCurve,
  gradedPriceUsd,
  gradedTable,
  itemValue,
  formatMoney,
  formatPct,
} from '../js/prices.js';

const rates = { base: 'EUR', rates: { EUR: 1, USD: 1.25, SEK: 11 } };

const card = {
  name: 'Charizard ex',
  releaseDate: '2023-09-22',
  prices: {
    cardmarket: { trend: 100, avg30: 95, avg7: 105, avg1: 110, reverse: null },
    tcgplayer: {
      variants: {
        holofoil: { low: 90, mid: 120, market: 125 },
        reverseHolofoil: { market: 20 },
      },
    },
  },
};

test('convert goes through the base currency', () => {
  assert.equal(convert(10, 'EUR', 'SEK', rates), 110);
  assert.equal(convert(12.5, 'USD', 'EUR', rates), 10);
  assert.ok(Math.abs(convert(10, 'USD', 'SEK', rates) - 88) < 1e-9);
  assert.equal(convert(null, 'EUR', 'SEK', rates), null);
  assert.equal(convert(1, 'XXX', 'SEK', rates), null);
  assert.ok(convert(1, 'EUR', 'SEK') > 5, 'falls back to built-in rates');
  assert.equal(FALLBACK_RATES.base, 'EUR');
});

test('rawPrice prefers Cardmarket trend, falls back to TCGplayer', () => {
  assert.deepEqual(rawPrice(card), { amount: 100, currency: 'EUR', source: 'cardmarket' });
  assert.deepEqual(rawPrice(card, { source: 'tcgplayer' }), { amount: 125, currency: 'USD', source: 'tcgplayer' });
  // No Cardmarket reverse data -> TCGplayer reverse price.
  assert.deepEqual(rawPrice(card, { variant: 'reverseHolofoil' }), { amount: 20, currency: 'USD', source: 'tcgplayer' });
  assert.equal(rawPrice({ prices: {} }), null);
});

test('1st Edition always uses TCGplayer', () => {
  const vintage = {
    prices: {
      cardmarket: { trend: 300 },
      tcgplayer: { variants: { '1stEditionHolofoil': { market: 5000 }, unlimitedHolofoil: { market: 400 } } },
    },
  };
  assert.equal(rawPrice(vintage, { variant: '1stEditionHolofoil' }).amount, 5000);
  assert.deepEqual(cardVariants(vintage), ['1stEditionHolofoil', 'unlimitedHolofoil']);
});

test('priceTrend compares the 7- and 30-day averages', () => {
  const t = priceTrend(card);
  assert.ok(Math.abs(t.change7 - (105 - 95) / 95) < 1e-9);
  assert.equal(priceTrend({ prices: {} }), null);
});

test('eraOf splits WOTC, classic and modern sets', () => {
  assert.equal(eraOf('1999-01-09'), 'vintage');
  assert.equal(eraOf('2003-06-18'), 'vintage');
  assert.equal(eraOf('2003-07-18'), 'classic');
  assert.equal(eraOf('2016-11-02'), 'classic');
  assert.equal(eraOf('2023-03-31'), 'modern');
  assert.equal(eraOf(undefined), 'modern');
});

test('psaCurve is monotonic, respects floors and favours vintage gems', () => {
  const modern = psaCurve(100, 'modern');
  for (let g = 2; g <= 10; g++) assert.ok(modern[g] > modern[g - 1]);
  assert.ok(Math.abs(modern[10] - 230) < 1e-9);
  const bulk = psaCurve(0.2, 'modern');
  assert.equal(bulk[10], 16, 'cheap cards hit the slab floor');
  const vintage = psaCurve(100, 'vintage');
  assert.ok(vintage[10] / 100 > modern[10] / 100 * 3);
  assert.equal(psaCurve(0), null);
});

test('other companies are priced relative to PSA', () => {
  const curve = psaCurve(100, 'modern');
  assert.equal(gradedPriceUsd('PSA', '9', curve), curve[9]);
  assert.ok(Math.abs(gradedPriceUsd('BGS', '9.5', curve) - curve[10] * 0.6) < 1e-9);
  assert.ok(gradedPriceUsd('BGS', '10BL', curve) > curve[10] * 2);
  const half = gradedPriceUsd('CGC', '8.5', curve);
  assert.ok(half > curve[8] * 0.82 && half < curve[9] * 0.82);
  assert.equal(gradedPriceUsd('XYZ', '9', curve), null);
  assert.equal(gradedPriceUsd('PSA', '9', null), null);
});

test('gradedTable converts everything to the display currency', () => {
  const table = gradedTable(card, { currency: 'SEK', rates });
  assert.equal(table.era, 'modern');
  assert.equal(table.rawDisplay, 1100);
  const psa10 = table.companies.PSA.find((g) => g.key === '10');
  // 100 EUR = 125 USD raw -> 2.3x -> 287.5 USD -> EUR 230 -> SEK 2530
  assert.ok(Math.abs(psa10.price - 2530) < 1e-6);
  assert.equal(table.companies.BGS.length, 13);
});

test('itemValue handles raw condition, graded slabs, manual values and quantity', () => {
  const raw = { card, qty: 2, condition: 'LP' };
  assert.ok(Math.abs(itemValue(raw, { currency: 'EUR', rates }) - 160) < 1e-9);
  const slab = { card, qty: 1, grade: { company: 'PSA', key: '10' } };
  assert.ok(Math.abs(itemValue(slab, { currency: 'EUR', rates }) - 230) < 1e-9);
  const manual = { card, qty: 1, grade: { company: 'PSA', key: '10', manualValue: 500, manualCurrency: 'EUR' } };
  assert.equal(itemValue(manual, { currency: 'EUR', rates }), 500);
  assert.equal(itemValue({ card: { prices: {} } }, { rates }), null);
});

test('formatting uses Swedish conventions', () => {
  const nbsp = /[   ]/g;
  assert.equal(formatMoney(1249, 'SEK').replace(nbsp, ' '), '1 249 kr');
  assert.equal(formatMoney(0.35, 'SEK').replace(nbsp, ' '), '0,35 kr');
  assert.equal(formatMoney(null), '–');
  assert.equal(formatPct(0.124), '+12,4 %');
  assert.equal(formatPct(-0.05), '−5,0 %');
});
