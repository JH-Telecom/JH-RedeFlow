import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSlaAnalysis } from '../src/sla-analysis.js';
import type { Call } from '../src/types.js';

// Horarios em Sao Paulo (UTC-3): "2026-11-02 19:00" vira 22:00Z.
const sp = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`).toISOString();
let sequence = 0;
function call(opened: string, closed: string, extra: Partial<Call> = {}): Call {
  sequence += 1;
  const [openDate, openTime] = opened.split(' ');
  const [closeDate, closeTime] = closed.split(' ');
  return {
    id: `c${sequence}`, orderNumber: `OS-${sequence}`, bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: 'Cabo rompido',
    region: 'ITAIM PAULISTA', city: '', olt: '', slotPon: '', status: 'Finalizado', notes: '',
    openedAt: sp(openDate, openTime), executedAt: sp(closeDate, closeTime), technicianName: 'Ana', ...extra,
  } as Call;
}

test('ranks technicians and neighborhoods by lost deadlines, with execution average', () => {
  const calls = [
    call('2026-11-02 08:00', '2026-11-02 10:00', { technicianName: 'Ana', bairro: 'Jardim A', assignedAt: sp('2026-11-02', '09:00') }),
    call('2026-11-02 08:00', '2026-11-02 16:00', { technicianName: 'Bruno', bairro: 'Jardim B', assignedAt: sp('2026-11-02', '12:00') }), // 8h: perdeu
    call('2026-11-02 09:00', '2026-11-02 20:00', { technicianName: 'Bruno', bairro: 'Jardim B' }), // 11h: outlier
    call('2026-11-02 09:00', '2026-11-02 11:00', { technicianName: 'Ana', bairro: 'Jardim A' }),
  ];
  const analysis = calculateSlaAnalysis(calls, '2026-11-01', '2026-11-30', 'ALL', '2026-11-30');
  assert.equal(analysis.total.orders, 4);
  assert.equal(analysis.total.lost, 2);
  assert.equal(analysis.total.outliers, 1);
  assert.equal(analysis.technicians[0].name, 'Bruno');
  assert.equal(analysis.technicians[0].lost, 2);
  assert.equal(analysis.technicians[0].avgHours, 9.5);
  assert.equal(analysis.technicians[0].avgExecutionHours, 4, 'so o chamado com data de acionamento');
  assert.equal(analysis.technicians[1].avgExecutionHours, 1);
  assert.equal(analysis.neighborhoods[0].name, 'Jardim B');
  assert.equal(analysis.byOpeningHour[8].orders, 2);
  assert.equal(analysis.byOpeningHour[8].lost, 1);
  // 02/11/2026 e segunda-feira (1); 08h e 09h caem na faixa 06-12 (1)
  const monday = analysis.heatmap.find((cell) => cell.weekday === 1 && cell.band === 1);
  assert.equal(monday?.orders, 4);
  assert.equal(monday?.lost, 2);
  assert.equal(analysis.heatmap.length, 28);
});

test('studies calls opened between 18h and 06h against the day shift', () => {
  const calls = [
    call('2026-11-02 19:00', '2026-11-03 08:30', { technicianName: 'Carlos', reason: 'Rompimento', assignedAt: sp('2026-11-03', '06:30') }), // noite, perdeu, fechou de manha
    call('2026-11-02 23:00', '2026-11-03 07:00', { technicianName: 'Carlos', reason: 'Rompimento' }), // noite, perdeu
    call('2026-11-03 02:00', '2026-11-03 04:00', { technicianName: 'Davi' }), // noite, no prazo
    call('2026-11-03 10:00', '2026-11-03 12:00', { technicianName: 'Davi', assignedAt: sp('2026-11-03', '10:30') }), // dia, no prazo
  ];
  const { night } = calculateSlaAnalysis(calls, '2026-11-01', '2026-11-30', 'ALL', '2026-11-30');
  assert.equal(night.night.orders, 3);
  assert.equal(night.night.lost, 2);
  assert.equal(night.day.orders, 1);
  assert.equal(night.day.lost, 0);
  assert.equal(night.crossedMorning, 2);
  assert.equal(night.lostClosingHours.find((item) => item.hour === 8)?.count, 1);
  assert.equal(night.night.avgWaitHours, 11.5);
  assert.equal(night.technicians[0].name, 'Carlos');
  assert.equal(night.reasons[0].name, 'Rompimento');
  assert.deepEqual(night.byOpeningHour.map((item) => item.hour).slice(0, 3), [18, 19, 20]);
  assert.ok(night.insights.some((text) => /depois das 06h/.test(text)));
});

test('counts incoming calls per day and filters by cluster area', () => {
  const calls = [
    call('2026-11-01 08:00', '2026-11-01 09:00', { region: 'ITAIM PAULISTA' }),
    call('2026-11-02 20:00', '2026-11-02 21:00', { region: 'GUARULHOS' }),
    call('2026-11-03 10:00', '2026-11-03 11:00', { region: 'DIADEMA' }),
    { ...call('2026-11-03 12:00', '2026-11-03 12:30', { region: 'ITAIM PAULISTA' }), status: 'Em campo', executedAt: null } as Call,
  ];
  const all = calculateSlaAnalysis(calls, '2026-11-01', '2026-11-30', 'ALL', '2026-11-04');
  assert.equal(all.incoming.days, 4, 'mes corrente conta ate hoje');
  assert.equal(all.incoming.opened, 4);
  assert.equal(all.incoming.avgPerDay, 1);
  assert.equal(all.total.orders, 3, 'so finalizados entram no prazo');
  assert.equal(calculateSlaAnalysis(calls, '2026-11-01', '2026-11-30', 'SP', '2026-11-04').total.orders, 1);
  assert.equal(calculateSlaAnalysis(calls, '2026-11-01', '2026-11-30', 'GRU', '2026-11-04').total.orders, 1);
  assert.equal(calculateSlaAnalysis(calls, '2026-11-01', '2026-11-30', 'OUTRAS', '2026-11-04').total.orders, 1);
});
