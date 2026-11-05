import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateIgpPlan, type IgpGroup } from '../src/igp.js';

// 100 ordens ate o dia 10 de um mes de 30 dias: ritmo de 10/dia -> faltam ~200 ordens.
const group: IgpGroup = { orders: 100, onTime: 80, outliers: 8, totalRepairHours: 600, onTimePercent: 80, outlierPercent: 8, mttrHours: 6 };

test('on-time plan: streak and what the rest of the month must deliver', () => {
  const plan = calculateIgpPlan(group, '2026-11', '2026-11-10');
  assert.equal(plan.currentMonth, true);
  // (80 + k) / (100 + k) >= 0,89 -> k >= 81,8 -> 82 seguidas
  assert.equal(plan.onTime.target.streak, 82);
  assert.equal(plan.onTime.target.met, false);
  // 0,89 * 300 = 267 no prazo no total; ja tem 80 -> 187 das 200 restantes (93,5%)
  assert.equal(plan.onTime.target.projected?.remainingOrders, 200);
  assert.equal(plan.onTime.target.projected?.required, 187);
  assert.equal(plan.onTime.target.projected?.possible, true);
  assert.equal(plan.onTime.minimum.projected?.required, 175); // 0,85 * 300 = 255 - 80
});

test('outlier and MTTR plans', () => {
  const plan = calculateIgpPlan(group, '2026-11', '2026-11-10');
  // 8 / (100 + k) <= 0,049 -> k >= 63,3 -> 64 seguidas sem outlier
  assert.equal(plan.outlier.target.streak, 64);
  // 0,049 * 300 = 14,7 -> ate 14 no total; ja tem 8 -> cabem 6 nas restantes
  assert.equal(plan.outlier.target.projected?.required, 6);
  // MTTR: (5 * 300 - 600) / 200 = 4,5h de media nas restantes
  assert.equal(plan.mttr.target.projected?.required, 4.5);
  assert.equal(plan.mttr.target.met, false);
});

test('past month has no projection and a met goal shows the slack', () => {
  const past = calculateIgpPlan(group, '2026-10', '2026-11-10');
  assert.equal(past.currentMonth, false);
  assert.equal(past.onTime.target.projected, null);
  const good: IgpGroup = { ...group, onTime: 95, outliers: 2, totalRepairHours: 300 };
  const plan = calculateIgpPlan(good, '2026-11', '2026-11-10');
  assert.equal(plan.onTime.target.met, true);
  // 267 no total; tem 95 -> precisa de 172 das 200 -> folga de 28
  assert.equal(plan.onTime.target.projected?.slack, 28);
  assert.equal(plan.outlier.target.projected?.slack, 12); // 14 - 2
});

test('IGP area region keys match the area classifier', async () => {
  const { classifyIgpArea, igpAreaRegionKeys } = await import('../src/igp.js');
  for (const area of ['SP', 'GRU', 'ALTO_TIETE'] as const) {
    const keys = igpAreaRegionKeys(area);
    assert.ok(keys.length > 0);
    for (const key of keys) assert.equal(classifyIgpArea(key), area);
  }
  assert.equal(classifyIgpArea('São Rafael'), classifyIgpArea('SAO RAFAEL'));
});
