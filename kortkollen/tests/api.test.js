import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizePtcgCard,
  normalizeDexCard,
  searchCards,
  identifyCard,
  getCard,
  configureApi,
  marketLinks,
} from '../js/api.js';
import { rawPrice, cardVariants } from '../js/prices.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const ptcgCards = fixture('ptcg-cards.json');
const dexCard = fixture('tcgdex-card.json');
const dexSet = fixture('tcgdex-set.json');

// Minimal in-memory localStorage for the API cache.
globalThis.localStorage = {
  store: new Map(),
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
  setItem(k, v) { this.store.set(k, String(v)); },
  removeItem(k) { this.store.delete(k); },
};

let calls;
function mockFetch(handler) {
  calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const { status = 200, body } = handler(new URL(url));
    return { ok: status < 400, status, json: async () => body };
  };
}

beforeEach(() => {
  localStorage.store.clear();
  configureApi({ provider: 'auto', key: '' });
});

test('normalizes a Pokémon TCG API card', () => {
  const card = normalizePtcgCard(ptcgCards.data[0]);
  assert.equal(card.provider, 'ptcg');
  assert.equal(card.releaseDate, '2023-09-22');
  assert.equal(card.printedTotal, 165);
  assert.equal(card.setCode, 'MEW');
  assert.equal(card.prices.cardmarket.trend, 192.3);
  assert.equal(card.prices.cardmarket.reverse, null, 'zeros mean no reverse holo');
  assert.equal(card.prices.tcgplayer.variants.holofoil.market, 238.12);
  assert.deepEqual(cardVariants(card), ['holofoil']);
  const pika = normalizePtcgCard(ptcgCards.data[2]);
  assert.equal(pika.prices.cardmarket.reverse.trend, 0.79);
  assert.deepEqual(cardVariants(pika), ['normal', 'reverseHolofoil']);
});

test('normalizes a TCGdex card and its pricing', () => {
  const card = normalizeDexCard(dexCard, { ...dexCard.set, ...dexSet });
  assert.equal(card.provider, 'tcgdex');
  assert.equal(card.number, '199');
  assert.equal(card.printedTotal, 165);
  assert.equal(card.releaseDate, '2023-09-22');
  assert.equal(card.series, 'Scarlet & Violet');
  assert.equal(card.images.large, 'https://assets.tcgdex.net/en/sv/sv03.5/199/high.webp');
  assert.equal(card.prices.cardmarket.trend, 192.3);
  assert.equal(card.prices.tcgplayer.variants.holofoil.market, 238.12);
  assert.deepEqual(rawPrice(card), { amount: 192.3, currency: 'EUR', source: 'cardmarket' });
  // Brief list entries have no set and no prices.
  const brief = normalizeDexCard(dexSet.cards[0]);
  assert.equal(brief.partial, true);
  assert.equal(brief.prices.cardmarket, null);
});

test('searchCards builds a Lucene query and parses the response', async () => {
  mockFetch(() => ({ body: ptcgCards }));
  const res = await searchCards({ text: 'charizard 199/165' });
  assert.equal(res.provider, 'ptcg');
  assert.equal(res.cards.length, 3);
  const q = new URL(calls[0]).searchParams.get('q');
  assert.match(q, /name:"\*charizard\*"/);
  assert.match(q, /number:"199"/);
  assert.match(q, /set\.printedTotal:165/);
});

test('searchCards falls back to TCGdex when the primary API is down', async () => {
  mockFetch((url) => {
    if (url.hostname === 'api.pokemontcg.io') return { status: 503, body: {} };
    if (url.pathname.endsWith('/cards')) return { body: dexSet.cards };
    return { status: 404, body: {} };
  });
  const res = await searchCards({ text: 'pikachu' });
  assert.equal(res.provider, 'tcgdex');
  assert.equal(res.cards.length, 2);
  // Primary is now marked as down, so the next search goes straight to TCGdex.
  calls.length = 0;
  await searchCards({ text: 'mew' });
  assert.ok(calls[0].includes('tcgdex'));
});

test('identifyCard ranks the exact number + name match first', async () => {
  mockFetch(() => ({ body: ptcgCards }));
  const ranked = await identifyCard({ name: 'Charizard', number: '199', total: 165, setCode: 'MEW' });
  assert.equal(ranked[0].id, 'sv3pt5-199');
  assert.ok(ranked[0].confidence > 0.9);
  assert.equal(calls.length, 1, 'stops once a confident match is found');
  assert.match(new URL(calls[0]).searchParams.get('q'), /set\.ptcgoCode:MEW/);
});

test('getCard caches results', async () => {
  mockFetch(() => ({ body: { data: ptcgCards.data[1] } }));
  const a = await getCard('ptcg', 'base1-4');
  const b = await getCard('ptcg', 'base1-4');
  assert.equal(a.name, 'Charizard');
  assert.equal(b.releaseDate, '1999-01-09');
  assert.equal(calls.length, 1);
});

test('marketLinks point at sold listings', () => {
  const card = normalizePtcgCard(ptcgCards.data[0]);
  const links = marketLinks(card, { company: 'PSA', grade: '10' });
  assert.ok(links[0].url.includes('LH_Sold=1'));
  assert.ok(decodeURIComponent(links[0].url).includes('Charizard ex 199/165 PSA 10'));
  assert.ok(links.some((l) => l.url.includes('pricecharting.com')));
});

test('pruneCache removes only expired entries', async () => {
  const { pruneCache } = await import('../js/api.js');
  localStorage.store.clear();
  localStorage.setItem('kk-cache:old', JSON.stringify({ until: Date.now() - 1, value: 1 }));
  localStorage.setItem('kk-cache:new', JSON.stringify({ until: Date.now() + 60000, value: 2 }));
  localStorage.setItem('kortkollen:v1', '{}');
  globalThis.localStorage = new Proxy(localStorage, {
    ownKeys: (t) => [...t.store.keys()],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  });
  pruneCache();
  assert.equal(localStorage.getItem('kk-cache:old'), null);
  assert.ok(localStorage.getItem('kk-cache:new'));
  assert.equal(localStorage.getItem('kortkollen:v1'), '{}');
});
