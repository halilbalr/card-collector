import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumber,
  parseSetCode,
  parseName,
  normalizeNumber,
  nameSimilarity,
  rankCandidates,
  parseSearchQuery,
  levenshtein,
} from '../js/ocr-parse.js';

test('reads plain and modern collector numbers', () => {
  assert.deepEqual(parseNumber('Illus. Mitsuhiro Arita 4/102 ●'), { number: '4', total: 102, setCode: null, promo: false });
  assert.deepEqual(parseNumber('SVI EN 198/198 ★'), { number: '198', total: 198, setCode: 'SVI', promo: false });
  assert.deepEqual(parseNumber('PAL EN 054/193'), { number: '54', total: 193, setCode: 'PAL', promo: false });
});

test('fixes typical OCR confusions', () => {
  assert.equal(parseNumber('O25/l65').number, '25');
  assert.equal(parseNumber('O25/l65').total, 165);
  assert.equal(parseNumber('l99 / 165').number, '199');
  assert.equal(parseNumber('SVIEN198/198').number, '198');
  assert.equal(parseNumber('025|165')?.number, undefined, 'pipe instead of slash is too ambiguous');
});

test('keeps letter prefixes for trainer/galarian gallery numbers', () => {
  assert.deepEqual(parseNumber('TG05/TG30'), { number: 'TG05', total: null, setCode: null, promo: false });
  assert.equal(parseNumber('GG35/GG70').number, 'GG35');
});

test('reads black star promo numbers', () => {
  assert.equal(parseNumber('SWSH050').number, 'SWSH050');
  assert.deepEqual(parseNumber('SVP EN 085'), { number: '85', total: null, setCode: 'SVP', promo: true });
});

test('rejects text without a number', () => {
  assert.equal(parseNumber('Weakness Resistance Retreat'), null);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('1/2'), null);
});

test('set codes', () => {
  assert.equal(parseSetCode('OBF EN 125/197'), 'OBF');
  assert.equal(parseSetCode('nothing here'), null);
});

test('parseName skips stage labels, HP and noise', () => {
  assert.equal(parseName('BASIC\nPikachu HP 60'), 'Pikachu');
  assert.equal(parseName('STAGE 2 Charizard ex 330 HP'), 'Charizard');
  assert.equal(parseName('Mr. Mime'), 'Mime');
  assert.equal(parseName('||| 12 ~~'), null);
});

test('normalizeNumber strips leading zeros only', () => {
  assert.equal(normalizeNumber('025'), '25');
  assert.equal(normalizeNumber('TG05'), 'TG5');
  assert.equal(normalizeNumber('100'), '100');
  assert.equal(normalizeNumber('0'), '0');
});

test('nameSimilarity tolerates OCR noise and suffixes', () => {
  assert.equal(nameSimilarity('Charizard', 'Charizard ex'), 1);
  assert.ok(nameSimilarity('Charlzard', 'Charizard') > 0.85);
  assert.ok(nameSimilarity('xx Pikachu yy 60', 'Pikachu') === 1);
  assert.ok(nameSimilarity('Bulbasaur', 'Charizard') < 0.4);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
});

test('rankCandidates puts the number + name match first', () => {
  const cards = [
    { id: 'a', name: 'Pikachu', number: '25', printedTotal: 102 },
    { id: 'b', name: 'Charizard ex', number: '199', printedTotal: 165, setCode: 'MEW' },
    { id: 'c', name: 'Charizard', number: '4', printedTotal: 102 },
  ];
  const ranked = rankCandidates(cards, { name: 'Charizard', number: '199', total: 165 });
  assert.equal(ranked[0].id, 'b');
  assert.ok(ranked[0].confidence > 0.9);
  const byImage = rankCandidates(
    [
      { id: 'x', name: 'Pikachu', number: '25', imageSimilarity: 0.2 },
      { id: 'y', name: 'Pikachu', number: '25', imageSimilarity: 0.9 },
    ],
    { name: 'Pikachu', number: '25' },
  );
  assert.equal(byImage[0].id, 'y');
});

test('parseSearchQuery splits name and number', () => {
  assert.deepEqual(parseSearchQuery('charizard 4/102'), { name: 'charizard', number: '4', total: 102 });
  assert.deepEqual(parseSearchQuery('pikachu 025'), { name: 'pikachu', number: '25', total: null });
  assert.deepEqual(parseSearchQuery('  umbreon vmax '), { name: 'umbreon vmax', number: null, total: null });
  assert.deepEqual(parseSearchQuery('TG05/TG30'), { name: '', number: 'TG05', total: 30 });
});
