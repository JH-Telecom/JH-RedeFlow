import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import test from 'node:test';
import { attendanceCalls, attendanceImageSpec, dueSendTime, parseSendTimes, renderImagePng, wrapText } from '../src/update-image.js';
import type { Call } from '../src/types.js';

const now = Date.parse('2026-11-18T12:59:00-03:00');
const call = (id: string, minutesAgo: number, extra: Partial<Call> = {}): Call => ({ id, orderNumber: id, bdesk: `BD-${id}`, officeTrack: '', client: 'Cliente', type: 'NOC ACESSO', reason: 'Parcial', region: 'GUAIANASES 1', city: 'Sao Paulo', address: '', bairro: 'JARDIM SAO PEDRO', olt: 'VIP-GZ1-SPO-OHW-01', slotPon: '1/2', status: 'Atribuido', technicianId: 't1', technicianName: 'Edson Luan Parras De Oliveira', openedAt: new Date(now - minutesAgo * 60_000).toISOString(), notes: '', ...extra } as Call);

test('attendance image: only active calls with technician, oldest first, support technician under the name', () => {
  const calls = attendanceCalls([call('B', 30), call('A', 600, { supportTechnicianName: 'Bruno Dias Gimenes' }), call('C', 10, { technicianId: undefined }), call('D', 5, { status: 'Finalizado' })]);
  assert.deepEqual(calls.map((item) => item.id), ['A', 'B']);
  const spec = attendanceImageSpec(calls, { B: { text: 'no local > batendo rota' } }, now);
  assert.equal(spec.badge, '2 chamados');
  assert.equal(spec.rows[0][1].sub, 'Apoio: Bruno Dias Gimenes');
  assert.equal(spec.rows[0][2].tone, 'red'); // 10h: outlier
  assert.equal(spec.rows[1][6].text, 'no local > batendo rota');
  const png = renderImagePng(spec);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  if (process.env.SAVE_UPDATE_IMAGE) writeFileSync(process.env.SAVE_UPDATE_IMAGE, png);
});

test('send times: parse, and the due time within 20 minutes that was not sent yet', () => {
  assert.deepEqual(parseSendTimes('17:00, 9:00 13:00 xx 25:00'), ['09:00', '13:00', '17:00']);
  assert.equal(dueSendTime(['09:00', '13:00'], '13:05', ['09:00']), '13:00');
  assert.equal(dueSendTime(['09:00', '13:00'], '13:05', ['09:00', '13:00']), null);
  assert.equal(dueSendTime(['09:00'], '09:30', []), null); // atrasou mais de 20 min: pula
});

test('wrap text keeps lines within width and ends with an ellipsis', () => {
  const lines = wrapText('uma observação bem comprida que não cabe em uma linha só da coluna da imagem e continua', 200, 21, 600, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…'));
});
