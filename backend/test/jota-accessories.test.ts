import assert from 'node:assert/strict';
import test from 'node:test';
import { jotaGreetingText, jotaLook, parseJotaTestDate, spDateKey } from '../../frontend/src/lib/jota-accessories.ts';

// Meio-dia em Sao Paulo do dia pedido.
const sp = (day: string) => new Date(`${day}T12:00:00-03:00`);

test('Christmas hat from Dec 1 to Dec 25', () => {
  assert.deepEqual(jotaLook(sp('2026-12-01')), { accessories: ['gorro-natal'], greeting: 'natal' }); // terca
  assert.deepEqual(jotaLook(sp('2025-12-25')), { accessories: ['gorro-natal'], greeting: 'natal' }); // quinta
  assert.deepEqual(jotaLook(sp('2026-12-26')), { accessories: [], greeting: null }); // sabado
});

test('Friday brings the sunglasses, alone or with the Christmas hat', () => {
  assert.deepEqual(jotaLook(sp('2026-03-06')), { accessories: ['oculos'], greeting: 'sexta' });
  assert.deepEqual(jotaLook(sp('2026-12-04')), { accessories: ['gorro-natal', 'oculos'], greeting: 'natal-sexta' });
  assert.deepEqual(jotaLook(sp('2026-12-25')), { accessories: ['gorro-natal', 'oculos'], greeting: 'natal-sexta' }); // Natal de 2026 cai na sexta
  assert.deepEqual(jotaLook(sp('2027-12-24')), { accessories: ['gorro-natal', 'oculos'], greeting: 'natal-sexta' });
});

test('New Year party hat on Dec 31 and Jan 1', () => {
  assert.deepEqual(jotaLook(sp('2026-12-31')), { accessories: ['chapeu-festa'], greeting: 'ano-novo' }); // quinta
  assert.deepEqual(jotaLook(sp('2026-01-01')), { accessories: ['chapeu-festa'], greeting: 'ano-novo' }); // quinta
  // 01/01/2027 e sexta: chapeu de festa + oculos, saudacao de Ano Novo
  assert.deepEqual(jotaLook(sp('2027-01-01')), { accessories: ['chapeu-festa', 'oculos'], greeting: 'ano-novo' });
  assert.deepEqual(jotaLook(sp('2027-01-02')), { accessories: [], greeting: null });
});

test('an ordinary Tuesday has no accessory', () => {
  assert.deepEqual(jotaLook(sp('2026-11-17')), { accessories: [], greeting: null });
});

test('uses the Sao Paulo date, not UTC', () => {
  // 02:00 UTC de 01/12 ainda e 23:00 de 30/11 (segunda) em Sao Paulo
  assert.equal(spDateKey(new Date('2026-12-01T02:00:00Z')), '2026-11-30');
  assert.deepEqual(jotaLook(new Date('2026-12-01T02:00:00Z')), { accessories: [], greeting: null });
  assert.deepEqual(jotaLook(new Date('2026-12-01T03:30:00Z')).accessories, ['gorro-natal']);
  // sexta 23:30 em SP ja e sabado em UTC: continua sexta
  assert.deepEqual(jotaLook(new Date('2026-03-07T02:30:00Z')).accessories, ['oculos']);
});

test('QA forced date accepts only valid YYYY-MM-DD', () => {
  assert.equal(spDateKey(parseJotaTestDate('2026-12-25') as Date), '2026-12-25');
  for (const bad of ['', null, undefined, '2026-02-30', '25/12/2026', '2026-12-25T10:00', 'natal']) assert.equal(parseJotaTestDate(bad), null, String(bad));
});

test('greeting texts', () => {
  assert.deepEqual(jotaGreetingText('natal', 'Ana'), { text: 'Feliz Natal, Ana!', emoji: '🎄' });
  assert.deepEqual(jotaGreetingText('sexta', 'Ana'), { text: 'Sextou, Ana!', emoji: '😎' });
  assert.deepEqual(jotaGreetingText('ano-novo', ''), { text: 'Feliz Ano Novo!', emoji: '🎉' });
  assert.deepEqual(jotaGreetingText(null, 'Ana'), { text: 'Oi, Ana! Posso ajudar?', emoji: '👋' });
});
