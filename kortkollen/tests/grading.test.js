import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPANIES,
  worstSide,
  formatRatio,
  centeringCap,
  gradeDistribution,
  estimateGrades,
  bgsOverall,
  likelyRange,
  expectedValue,
  gradingVerdict,
  breakEvenGrade,
  wearForGrade,
} from '../js/grading.js';

const sum = (dist) => dist.reduce((a, d) => a + d.p, 0);

test('worstSide reads border widths as a centering ratio', () => {
  assert.equal(worstSide(12, 8), 60);
  assert.equal(worstSide(5, 5), 50);
  assert.equal(worstSide(0, 0), null);
  assert.equal(worstSide(-1, 4), null);
  assert.equal(formatRatio(58.4), '58/42');
  assert.equal(formatRatio(null), '–');
});

test('PSA centering caps follow the published standards', () => {
  assert.equal(centeringCap('PSA', 55, null), 10);
  assert.equal(centeringCap('PSA', 55.1, null), 9);
  assert.equal(centeringCap('PSA', 60, null), 9);
  assert.equal(centeringCap('PSA', 64, null), 8);
  assert.equal(centeringCap('PSA', 52, 80), 9, 'back worse than 75/25 blocks a 10');
  assert.equal(centeringCap('PSA', 95, null), 1);
  assert.equal(centeringCap('PSA', null, null), 10);
});

test('BGS black label needs perfect centering', () => {
  assert.equal(centeringCap('BGS', 50.5, 52), 10.5);
  assert.equal(centeringCap('BGS', 54, 52), 9.5);
});

test('gradeDistribution is a normalised distribution clipped at the cap', () => {
  const dist = gradeDistribution(COMPANIES.PSA.grades, 8.6, 0.6, 9);
  assert.ok(Math.abs(sum(dist) - 1) < 1e-9);
  assert.equal(dist.find((d) => d.key === '10').p, 0);
  // Everything clipped -> all mass on the highest allowed grade.
  const clipped = gradeDistribution(COMPANIES.PSA.grades, 10, 0.01, 6);
  assert.equal(clipped.find((d) => d.key === '6').p, 1);
});

test('a flawless, well-centred card is most likely a PSA 10', () => {
  const est = estimateGrades({ front: 52, corners: 10, edges: 10, surface: 10 });
  assert.equal(est.PSA.likely.key, '10');
  assert.ok(est.PSA.likely.p > 0.6);
  assert.equal(est.confidence, 'hög');
  assert.ok(Math.abs(sum(est.BGS.dist) - 1) < 1e-9);
});

test('off-centre card cannot reach a 10 however clean it is', () => {
  const est = estimateGrades({ front: 58, corners: 10, edges: 10, surface: 10 });
  assert.equal(est.PSA.dist.find((d) => d.key === '10').p, 0);
  assert.equal(est.PSA.likely.key, '9');
});

test('the weakest area dominates, and defects cap the grade', () => {
  const worn = estimateGrades({ front: 52, corners: 7, edges: 10, surface: 10 });
  assert.ok(Number(worn.PSA.likely.key) <= 8);
  const creased = estimateGrades({ front: 50, corners: 10, edges: 10, surface: 10, flags: ['crease'] });
  assert.ok(creased.PSA.dist.filter((d) => Number(d.key) > 5).every((d) => d.p === 0));
  assert.equal(creased.PSA.likely.key, '5');
});

test('unknown inputs widen the spread and lower confidence', () => {
  const known = estimateGrades({ front: 54, corners: 9.5, edges: 9.5, surface: 9.5 });
  const unknown = estimateGrades({});
  assert.equal(unknown.confidence, 'låg');
  assert.ok(unknown.PSA.likely.p < known.PSA.likely.p);
});

test('bgsOverall follows the weakest-subgrade rule', () => {
  assert.equal(bgsOverall([10, 10, 10, 10]), 10.5);
  assert.equal(bgsOverall([10, 9.5, 10, 10]), 10);
  assert.equal(bgsOverall([9.5, 9.5, 9.5, 9]), 9.5);
  assert.equal(bgsOverall([9, 9, 9, 9.5]), 9);
  assert.equal(bgsOverall([10, 10, 10, 7]), 8);
});

test('likelyRange covers the bulk of the probability around the peak', () => {
  const dist = gradeDistribution(COMPANIES.PSA.grades, 8.5, 0.6, 10);
  const [lo, hi] = likelyRange(dist, 0.8);
  assert.ok(Number(lo) <= 8 && Number(hi) >= 9);
});

test('expected value, verdict and break-even grade', () => {
  const prices = { 10: 1000, 9: 400, 8: 250 };
  const priceOf = (k) => prices[k] ?? 100;
  const dist = [
    { key: '10', p: 0.5 },
    { key: '9', p: 0.5 },
  ];
  const ev = expectedValue(dist, priceOf, 200);
  assert.equal(ev.gross, 700);
  assert.equal(ev.net, 500);
  assert.equal(gradingVerdict({ rawValue: 300, net: 500, cost: 200 }).level, 'good');
  assert.equal(gradingVerdict({ rawValue: 480, net: 500, cost: 200 }).level, 'maybe');
  assert.equal(gradingVerdict({ rawValue: 600, net: 500, cost: 200 }).level, 'bad');
  assert.equal(breakEvenGrade(COMPANIES.PSA.grades, priceOf, 150, 200), '9');
  assert.equal(breakEvenGrade(COMPANIES.PSA.grades, priceOf, 300, 200), '10');
  assert.equal(breakEvenGrade(COMPANIES.PSA.grades, priceOf, 5000, 200), null);
});

test('wear illustration grows as the grade drops', () => {
  assert.deepEqual(wearForGrade(10), { corners: 0, edges: 0, scratches: 0, crease: 0, dull: 0 });
  const seven = wearForGrade(7);
  const three = wearForGrade(3);
  assert.ok(three.corners > seven.corners && three.edges > seven.edges);
  assert.equal(three.crease, 2);
  assert.equal(seven.crease, 0);
});
