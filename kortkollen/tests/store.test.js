import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The store reads localStorage on import, so provide one first.
globalThis.localStorage = {
  store: new Map(),
  getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
  setItem(k, v) { this.store.set(k, String(v)); },
  removeItem(k) { this.store.delete(k); },
};
const store = await import('../js/store.js');
const { normalizePtcgCard } = await import('../js/api.js');

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ptcg-cards.json', import.meta.url)));
const [charizardEx, baseCharizard, pikachu] = fixture.data.map(normalizePtcgCard);
const rates = { base: 'EUR', rates: { EUR: 1, USD: 1.25, SEK: 10 } };

test('add, remove and undo collection entries', () => {
  store.resetAll();
  store.update((s) => {
    s.rates = rates;
  });
  const a = store.addItem({ card: charizardEx });
  const b = store.addItem({ card: pikachu, qty: 3 });
  assert.equal(store.getState().items.length, 2);
  assert.equal(store.itemsFor('ptcg:sv3pt5-25')[0].qty, 3);
  const removed = store.removeItems([a.uid]);
  assert.equal(store.getState().items.length, 1);
  store.restoreItems(removed);
  assert.deepEqual(store.getState().items.map((i) => i.uid).sort(), [a.uid, b.uid].sort());
});

test('collection stats count copies and only compare profit where cost is known', () => {
  store.resetAll();
  store.update((s) => {
    s.rates = rates;
  });
  store.addItem({ card: charizardEx }); // 192.3 EUR, no purchase price
  store.addItem({ card: baseCharizard, purchase: { amount: 3000, currency: 'SEK' } }); // 398 EUR
  store.addItem({ card: pikachu, qty: 2, condition: 'LP' });
  const stats = store.collectionStats();
  assert.equal(stats.count, 4);
  assert.equal(stats.unique, 3);
  // 1923 + 3980 + 2 × 2.7 × 0.8
  assert.ok(Math.abs(stats.value - (1923 + 3980 + 4.32)) < 1e-6);
  assert.ok(Math.abs(stats.profit - (3980 - 3000)) < 1e-6);
});

test('wishlist toggles and binders keep items tidy', () => {
  store.resetAll();
  assert.equal(store.toggleWishlist(pikachu), true);
  assert.equal(store.isWishlisted('ptcg:sv3pt5-25'), true);
  assert.equal(store.toggleWishlist(pikachu), false);
  const binder = store.addBinder('  Till salu ');
  assert.equal(binder.name, 'Till salu');
  const item = store.addItem({ card: pikachu, binderIds: [binder.id] });
  store.deleteBinder(binder.id);
  assert.deepEqual(store.getState().items.find((i) => i.uid === item.uid).binderIds, []);
});

test('history keeps one point per day', () => {
  store.resetAll();
  store.update((s) => {
    s.rates = rates;
  });
  store.addItem({ card: baseCharizard });
  store.recordHistory();
  store.recordHistory();
  assert.equal(store.getState().history.length, 1);
  assert.ok(Math.abs(store.getState().history[0].v - 398) < 1e-9);
});

test('export and import round-trip, CSV opens in Swedish Excel', () => {
  store.resetAll();
  store.addItem({ card: charizardEx, grade: { company: 'PSA', key: '10' } });
  store.toggleWishlist(pikachu);
  const json = store.exportJSON();
  store.resetAll();
  const added = store.importJSON(json);
  assert.deepEqual(added, { items: 1, wishlist: 1 });
  assert.equal(store.importJSON(json).items, 0, 'merging skips duplicates');
  assert.throws(() => store.importJSON('{"app":"other"}'));
  const csv = store.exportCSV();
  assert.ok(csv.startsWith('﻿Namn;Set;Nummer'));
  assert.match(csv, /Charizard ex;151;199\/165;Special Illustration Rare;holofoil;PSA 10;1;/);
});
