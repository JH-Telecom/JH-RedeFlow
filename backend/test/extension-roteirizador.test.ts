import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Script classico da extensao (roteirizador.js): carregado com node:vm e um chrome falso, so para as funcoes puras.
const file = path.resolve(process.cwd(), '..', 'extensao-rede', 'roteirizador.js');
const codigo = fs.readFileSync(file, 'utf8');

function carregar() {
  const chrome = { alarms: { get: async () => ({}), create: () => undefined, onAlarm: { addListener: () => undefined } } };
  const sandbox: Record<string, any> = { console, chrome, API_BASE: 'https://exemplo.invalid', Intl, Date };
  vm.runInNewContext(codigo, sandbox, { filename: file });
  return sandbox as { madrugadaSP: (agora: Date) => boolean; datasOfsAceitas: (agora: Date) => string[] };
}

const at = (iso: string) => new Date(iso);

test('extension night window is 22:00-05:59 in Sao Paulo', () => {
  const { madrugadaSP } = carregar();
  assert.equal(madrugadaSP(at('2026-11-17T00:59:00Z')), false); // seg 21:59
  assert.equal(madrugadaSP(at('2026-11-17T01:00:00Z')), true); // seg 22:00
  assert.equal(madrugadaSP(at('2026-11-17T02:59:00Z')), true); // seg 23:59
  assert.equal(madrugadaSP(at('2026-11-17T03:00:00Z')), true); // ter 00:00
  assert.equal(madrugadaSP(at('2026-11-17T08:59:00Z')), true); // ter 05:59
  assert.equal(madrugadaSP(at('2026-11-17T09:00:00Z')), false); // ter 06:00
  assert.equal(madrugadaSP(at('2026-11-17T15:00:00Z')), false); // ter 12:00
});

test('OFS dates accepted: today, plus yesterday between 00:00 and 05:59 (Sao Paulo dates, not the PC zone)', () => {
  const { datasOfsAceitas } = carregar();
  const plain = (value: string[]) => JSON.parse(JSON.stringify(value));
  // seg 22:30 SP = ter 01:30 UTC: a data ainda e segunda em Sao Paulo.
  assert.deepEqual(plain(datasOfsAceitas(at('2026-11-17T01:30:00Z'))), ['2026-11-16']);
  // ter 00:10 e 05:59 SP: terca e segunda (ordem aberta entre 22h e 24h).
  assert.deepEqual(plain(datasOfsAceitas(at('2026-11-17T03:10:00Z'))), ['2026-11-17', '2026-11-16']);
  assert.deepEqual(plain(datasOfsAceitas(at('2026-11-17T08:59:00Z'))), ['2026-11-17', '2026-11-16']);
  // 06:00 em diante: so hoje. Virada de mes tambem.
  assert.deepEqual(plain(datasOfsAceitas(at('2026-11-17T09:00:00Z'))), ['2026-11-17']);
  assert.deepEqual(plain(datasOfsAceitas(at('2026-12-01T04:00:00Z'))), ['2026-12-01', '2026-11-30']);
});
