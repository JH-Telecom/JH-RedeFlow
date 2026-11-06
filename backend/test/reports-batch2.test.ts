import assert from 'node:assert/strict';
import test from 'node:test';
import { closingReasonsReport, comparePeriods, dailySummary, dailySummaryText, productivityReport } from '../src/reports.js';
import type { Call } from '../src/types.js';

const base: Call = { id: 'x', orderNumber: '1', bdesk: '', officeTrack: '', client: 'NAO DEVE APARECER', type: 'NOC ACESSO', reason: '', region: 'GUARULHOS 1', city: '', olt: '', slotPon: '', status: 'Finalizado', openedAt: '2026-11-03T10:00:00-03:00', executedAt: '2026-11-03T15:00:00-03:00', notes: '' };
const at = (opened: string, hours: number, extra: Partial<Call> = {}): Call => ({ ...base, id: `${opened}-${hours}-${Math.random()}`, openedAt: opened, executedAt: new Date(Date.parse(opened) + hours * 3_600_000).toISOString(), ...extra });

const calls: Call[] = [
  at('2026-11-03T08:00:00-03:00', 2, { technicianName: 'Ana', supervisorName: 'Sup A', closingReason: 'Fibra rompida', closingSubreason: 'Vandalismo' }),
  at('2026-11-03T08:00:00-03:00', 7, { technicianName: 'Ana', supervisorName: 'Sup A', closingReason: 'Fibra rompida', closingSubreason: 'Árvore' }),
  at('2026-11-03T08:00:00-03:00', 10, { technicianName: 'Bia', supervisorName: 'Sup B', closingReason: 'CTO sem sinal' }),
  at('2026-11-03T08:00:00-03:00', 3, {}),
  at('2026-10-20T08:00:00-03:00', 4, { technicianName: 'Ana', supervisorName: 'Sup A', closingReason: 'CTO sem sinal' }),
  { ...base, id: 'open', status: 'Em campo', openedAt: '2026-11-03T09:00:00-03:00', executedAt: undefined },
  { ...base, id: 'cancel', status: 'Cancelado', openedAt: '2026-11-03T09:00:00-03:00', executedAt: undefined },
];

test('productivity by technician and supervisor in the period', () => {
  const report = productivityReport(calls, '2026-11-01', '2026-11-05');
  assert.equal(report.total, 4);
  const ana = report.technicians.find((row) => row.name === 'Ana')!;
  assert.deepEqual({ finished: ana.finished, onTime: ana.onTime, late: ana.late, outliers: ana.outliers, onTimePercent: ana.onTimePercent, avgHours: ana.avgHours, detail: ana.detail }, { finished: 2, onTime: 1, late: 1, outliers: 0, onTimePercent: 50, avgHours: 4.5, detail: 'Sup A' });
  assert.equal(report.technicians.find((row) => row.name === 'Bia')!.outliers, 1);
  assert.ok(report.technicians.some((row) => row.name === 'Sem técnico'));
  assert.deepEqual(report.supervisors.map((row) => row.name), ['Sup A', 'Sem supervisor', 'Sup B']);
});

test('closing reasons ranking with subreasons, areas and months', () => {
  const report = closingReasonsReport(calls, '2026-10-01', '2026-11-30');
  assert.equal(report.total, 5);
  assert.equal(report.withoutReason, 1);
  assert.deepEqual(report.reasons.map((item) => [item.reason, item.count]), [['CTO sem sinal', 2], ['Fibra rompida', 2]]);
  assert.deepEqual(report.reasons.find((item) => item.reason === 'Fibra rompida')!.subreasons.map((sub) => sub.name).sort(), ['Vandalismo', 'Árvore'].sort());
  assert.deepEqual(report.byMonth.map((month) => [month.month, month.total]), [['2026-10', 1], ['2026-11', 3]]);
  assert.equal(report.reasons[0].byArea.GRU, 2);
});

test('compare a period with the previous one of the same length', () => {
  const result = comparePeriods(calls, '2026-11-01', '2026-11-07');
  assert.equal(result.days, 7);
  assert.deepEqual([result.previous.from, result.previous.to], ['2026-10-25', '2026-10-31']);
  assert.equal(result.current.finished, 4);
  assert.equal(result.current.onTimePercent, 50);
  assert.equal(result.current.opened, 5, 'cancelado nao conta como aberto');
  assert.equal(result.current.cancelled, 1);
  assert.equal(result.previous.finished, 0);
});

test('daily summary and its WhatsApp text without client data', () => {
  const summary = dailySummary(calls, '2026-11-03', Date.parse('2026-11-04T07:00:00-03:00'));
  assert.equal(summary.finished, 4);
  assert.equal(summary.activeNow, 1);
  assert.equal(summary.activeLate, 1);
  assert.equal(summary.topTechnicians[0].name, 'Ana');
  const text = dailySummaryText(summary);
  assert.match(text, /resumo de 03\/11\/2026/);
  assert.match(text, /Finalizados: 4/);
  assert.doesNotMatch(text, /NAO DEVE APARECER/);
});
