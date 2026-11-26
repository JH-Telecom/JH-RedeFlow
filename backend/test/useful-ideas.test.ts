import assert from 'node:assert/strict';
import test from 'node:test';
import { ponKey, samePonRecent } from '../src/operations.js';
import { activationsToDayAccept, missingForAutoAccept, sweepDayActivations } from '../src/day-auto-accept.js';
import { blankClosingReport } from '../src/reports.js';
import type { Activation, Call } from '../src/types.js';

const now = Date.parse('2026-11-26T15:00:00-03:00');
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const base: Call = { id: 'x', orderNumber: '1', bdesk: '', officeTrack: '', client: '', type: 'NOC ACESSO', reason: '', region: 'Leste', city: '', olt: '', slotPon: '', status: 'Aberto', openedAt: ago(60), notes: '' };

test('ponKey: same PON in different formats, no key without slot/PON numbers', () => {
  assert.equal(ponKey({ olt: 'VIP-CT1-SPO-OHW-03', slotPon: '14/08' }), 'VIP-CT1-SPO-OHW-03||14/8');
  assert.equal(ponKey({ olt: 'vip-fz2-spo-ohw-02', slotPon: 'SLOT:1PON:3' }), ponKey({ olt: 'VIP-FZ2-SPO-OHW-02', slotPon: '01/03' }));
  assert.equal(ponKey({ olt: 'ATIVAÇÃO', slotPon: 'ATIVAÇÃO' }), null);
  assert.equal(ponKey({ olt: 'VIP-CT1-SPO-OHW-03', slotPon: '' }), null);
});

test('samePonRecent: other calls on the same PON in the last 7 days, any address', () => {
  const call = { ...base, id: 'me', olt: 'VIP-GZ1-SPO-OHW-01', slotPon: '07/04', address: 'Rua A, 1' };
  const calls: Call[] = [
    call,
    { ...base, id: 'a', olt: 'VIP-GZ1-SPO-OHW-01', slotPon: '7/4', address: 'Rua B, 2', openedAt: ago(60 * 24) },
    { ...base, id: 'old', olt: 'VIP-GZ1-SPO-OHW-01', slotPon: '07/04', openedAt: ago(60 * 24 * 9) },
    { ...base, id: 'cancel', olt: 'VIP-GZ1-SPO-OHW-01', slotPon: '07/04', status: 'Cancelado' },
    { ...base, id: 'other', olt: 'VIP-GZ1-SPO-OHW-01', slotPon: '07/05' },
  ];
  assert.deepEqual(samePonRecent(call, calls, now).items.map((item) => item.id), ['a']);
});

const card = (over: Partial<Activation>): Activation => ({ id: 'c', source: 'wuzapi', originalMessage: '', receivedAt: ago(20), status: 'Pendente', extractedData: { orderNumber: '612110565850102' }, analysis: { olt: 'VIP-CT1-SPO-OHW-03' } as Activation['analysis'], ...over });

test('day auto-accept: only complete cards pending for 15 min or more', () => {
  assert.deepEqual(missingForAutoAccept(card({})), []);
  assert.deepEqual(missingForAutoAccept(card({ extractedData: {} })), ['ordem']);
  assert.deepEqual(missingForAutoAccept(card({ analysis: { olt: 'ATIVAÇÃO' } as Activation['analysis'] })), ['OLT com região']);
  assert.deepEqual(missingForAutoAccept(card({ duplicate: true })), ['card repetido']);
  const list = [card({ id: 'old', receivedAt: ago(40) }), card({ id: 'new', receivedAt: ago(5) }), card({ id: 'mid', receivedAt: ago(16) }), card({ id: 'bad', extractedData: {} }), card({ id: 'done', status: 'Aceito' })];
  assert.deepEqual(activationsToDayAccept(list, now).map((item) => item.id), ['old', 'mid']);
});

test('day auto-accept sweep accepts each card once and records the result', async () => {
  const decided: string[] = [];
  const records: string[] = [];
  const result = await sweepDayActivations(now, {
    list: async () => [card({ id: 'one', receivedAt: ago(30) }), card({ id: 'two', receivedAt: ago(2) })],
    decide: async (id) => { decided.push(id); return { activation: card({ id, status: 'Aceito' }), call: { ...base, orderNumber: `OS-${id}` } }; },
    record: async (_ok, summary) => { records.push(summary); },
  });
  assert.deepEqual(decided, ['one']);
  assert.equal(result.aceitos, 1);
  assert.match(records[0], /1 card\(s\) aceito/);
});

test('blank OFS closing report: per technician, only "Não preenchido no OFS" counts', () => {
  const done = (id: string, technicianName: string, closingReason?: string) => ({ ...base, id, technicianName, status: 'Finalizado' as const, openedAt: '2026-11-20T08:00:00-03:00', executedAt: '2026-11-20T10:00:00-03:00', closingReason, closingSubreason: closingReason && closingReason !== 'Não preenchido no OFS' ? 'Sub' : undefined });
  const report = blankClosingReport([done('a', 'Ana', 'Não preenchido no OFS'), done('b', 'Ana', 'Rompimento'), done('c', 'Bia'), done('d', 'Bia', 'Não preenchido no OFS'), done('e', 'Caio', 'Atenuação')], '2026-11-01', '2026-11-30');
  assert.equal(report.finished, 5);
  assert.equal(report.blank, 2);
  assert.deepEqual(report.technicians.map((row) => [row.name, row.blank, row.percent]), [['Ana', 1, 50], ['Bia', 1, 50], ['Caio', 0, 0]]);
});
