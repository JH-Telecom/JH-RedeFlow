import assert from 'node:assert/strict';
import test from 'node:test';
import { contractsFromActivationData, normalizeSerial, pickAutoIspSerial, serialFromActivationData } from '../src/serial-number.js';

test('SN: accepts the formats of the FIELD card and AutoISP', () => {
  assert.equal(normalizeSerial('48575443601B38B3'), '48575443601B38B3');
  assert.equal(normalizeSerial(' 48575443 601b38b3 '), '48575443601B38B3');
  assert.equal(normalizeSerial('hwtc601b38b3'), 'HWTC601B38B3');
  assert.equal(normalizeSerial('-'), '');
  assert.equal(normalizeSerial('12687665'), '');
});

test('SN: FIELD card serial, and AutoISP serial wins when present', () => {
  assert.deepEqual(serialFromActivationData({ serialNumber: '48575443601B38B3' }), { serialNumber: '48575443601B38B3', source: 'card', contract: undefined });
  assert.deepEqual(serialFromActivationData({ _analysis: { sn: '48575443601B38B3' } }), { serialNumber: '48575443601B38B3', source: 'card', contract: undefined });
  assert.equal(serialFromActivationData({ serialNumber: '48575443601B38B3', autoispSerial: '48575443A72F0001', autoispContract: '5687878' })?.source, 'autoisp');
  assert.equal(serialFromActivationData({ _analysis: { sn: null } }), undefined);
});

test('SN: contracts of the NOC card (example list and each affected address)', () => {
  const extracted = { _analysis: {
    contrato: '5687878 | 4453310 | 4502468 | 4511561 ...',
    clientes_afetados: [{ contrato: '5687878.3' }, { contrato: '4453210.4' }, { contrato: null }],
  } };
  assert.deepEqual(contractsFromActivationData(extracted), ['5687878', '4453310', '4502468', '4511561', '4453210']);
  assert.deepEqual(contractsFromActivationData({ contract: '6013354' }), ['6013354']);
  assert.deepEqual(contractsFromActivationData({}), []);
});

test('SN: AutoISP result prefers the row on the same OLT as the call', () => {
  const rows = [
    { serial: '48575443AAAA0001', olt: 'VIP-CT2-SPO-OHW-02', contract: 5687878 },
    { serial: '48575443BBBB0002', olt: 'VIP-CT1-SPO-OHW-01', contract: 5687878 },
    { serial: null, olt: 'VIP-CT1-SPO-OHW-01', contract: 5687878 },
  ];
  assert.equal(pickAutoIspSerial(rows, 'VIP-CT1-SPO-OHW-01')?.serial, '48575443BBBB0002');
  assert.equal(pickAutoIspSerial(rows, 'OUTRA')?.serial, '48575443AAAA0001');
  assert.equal(pickAutoIspSerial([{ serial: '', olt: 'X' }], 'X'), undefined);
});
