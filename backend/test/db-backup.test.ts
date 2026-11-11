import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { APPS_SCRIPT_TEMPLATE, backupConfig, packBackup, sendBackupToDrive, shouldRunBackup, unpackBackup } from '../src/db-backup.js';

test('backup file packs every table and opens back the same', () => {
  const file = packBackup({ calls: [{ id: 'a', order_number: '610' }], roles: [] }, [{ id: 'u1', email: 'x@y.z' }], new Date('2026-11-11T06:05:00Z'));
  assert.equal(file.name, 'redeflow-backup-2026-11-11-0305.json.gz');
  assert.deepEqual(file.counts, { calls: 1, roles: 0, 'auth.users': 1 });
  const back = unpackBackup(file.gzip);
  assert.equal(back.format, 'jh-redeflow-backup');
  assert.deepEqual(back.tables.calls, [{ id: 'a', order_number: '610' }]);
  assert.equal(back.authUsers.length, 1);
});

test('config needs the Apps Script web app URL and a 16+ char secret', () => {
  const url = 'https://script.google.com/macros/s/AKfycbx-abc_123/exec';
  assert.deepEqual(backupConfig({ BACKUP_DRIVE_URL: url, BACKUP_DRIVE_SECRET: 'a'.repeat(16) }), { url, secret: 'a'.repeat(16) });
  assert.equal(backupConfig({ BACKUP_DRIVE_URL: url, BACKUP_DRIVE_SECRET: 'curto' }), null);
  assert.equal(backupConfig({ BACKUP_DRIVE_URL: 'https://example.com/exec', BACKUP_DRIVE_SECRET: 'a'.repeat(20) }), null);
  assert.equal(backupConfig({}), null);
});

test('runs after 03:00 Sao Paulo once a day, retrying failures every 30 min up to 4 times', () => {
  const fresh = { lastSuccessDay: null, failedDay: null, attempts: 0, lastAttemptAt: 0 };
  assert.equal(shouldRunBackup(fresh, new Date('2026-11-11T05:59:00Z')), false); // 02:59 em SP
  assert.equal(shouldRunBackup(fresh, new Date('2026-11-11T06:00:00Z')), true); // 03:00 em SP
  assert.equal(shouldRunBackup({ ...fresh, lastSuccessDay: '2026-11-11' }, new Date('2026-11-11T12:00:00Z')), false);
  assert.equal(shouldRunBackup({ ...fresh, lastSuccessDay: '2026-11-10' }, new Date('2026-11-11T12:00:00Z')), true);
  const failed = { lastSuccessDay: null, failedDay: '2026-11-11', attempts: 1, lastAttemptAt: Date.parse('2026-11-11T06:00:00Z') };
  assert.equal(shouldRunBackup(failed, new Date('2026-11-11T06:10:00Z')), false);
  assert.equal(shouldRunBackup(failed, new Date('2026-11-11T06:31:00Z')), true);
  assert.equal(shouldRunBackup({ ...failed, attempts: 4 }, new Date('2026-11-11T09:00:00Z')), false);
});

test('sending explains a wrong secret and a non-JSON answer from Google', async () => {
  const file = packBackup({ calls: [] }, []);
  const config = { url: 'https://script.google.com/macros/s/x/exec', secret: 's'.repeat(20) };
  let sent: Record<string, unknown> = {};
  const ok = (async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response(JSON.stringify({ ok: true, id: 'f1', tamanho: 99, apagados: 2 })); }) as unknown as typeof fetch;
  assert.deepEqual(await sendBackupToDrive(file, config, ok), { fileId: 'f1', size: 99, removed: 2 });
  assert.equal(sent.segredo, config.secret);
  assert.equal(sent.dias, 90);
  const wrong = (async () => new Response(JSON.stringify({ ok: false, erro: 'segredo' }))) as unknown as typeof fetch;
  await assert.rejects(sendBackupToDrive(file, config, wrong), /Segredo diferente/);
  const html = (async () => new Response('<html>login</html>', { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(sendBackupToDrive(file, config, html), /sem JSON/);
});

// O Apps Script roda num "Google" de mentira: confere o segredo, grava e so apaga backup velho (sempre guarda 7).
test('Apps Script saves the file and trashes only backups older than the retention, keeping the newest 7', () => {
  const day = 86_400_000;
  type Fake = { name: string; created: number; trashed: boolean };
  const files: Fake[] = Array.from({ length: 10 }, (_, index) => ({ name: `redeflow-backup-old-${index}.json.gz`, created: Date.now() - (index < 5 ? 1 + index : 100 + index) * day, trashed: false }));
  files.push({ name: 'planilha-do-usuario.xlsx', created: Date.now() - 400 * day, trashed: false });
  const wrap = (file: Fake) => ({ getName: () => file.name, getDateCreated: () => new Date(file.created), setTrashed: (value: boolean) => { file.trashed = value; }, getId: () => `id-${file.name}`, getSize: () => 123 });
  const iterator = <T>(items: T[]) => { let index = 0; return { hasNext: () => index < items.length, next: () => items[index++] }; };
  const folder = { getFiles: () => iterator(files.map(wrap)), createFile: (blob: { name: string }) => { const file = { name: blob.name, created: Date.now(), trashed: false }; files.push(file); return wrap(file); } };
  const sandbox: Record<string, unknown> = {
    DriveApp: { getFoldersByName: () => iterator([folder]), createFolder: () => folder },
    Utilities: { base64Decode: (text: string) => Buffer.from(text, 'base64'), newBlob: (_bytes: unknown, _type: string, name: string) => ({ name }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text: string) => ({ setMimeType: () => JSON.parse(text) }) },
  };
  vm.runInNewContext(`${APPS_SCRIPT_TEMPLATE.replace('__SEGREDO__', 'segredo-certo-123456')}\nthis.doPost = doPost;`, sandbox);
  const doPost = sandbox.doPost as (event: unknown) => Record<string, unknown>;
  const post = (body: object) => doPost({ postData: { contents: JSON.stringify(body) } });
  assert.deepEqual(post({ segredo: 'errado', nome: 'redeflow-backup-2026-11-11-0300.json.gz', conteudo: '' }), { ok: false, erro: 'segredo' });
  assert.deepEqual(post({ segredo: 'segredo-certo-123456', nome: '../outro.txt', conteudo: '' }), { ok: false, erro: 'nome invalido' });
  const result = post({ segredo: 'segredo-certo-123456', nome: 'redeflow-backup-2026-11-11-0300.json.gz', conteudo: Buffer.from('x').toString('base64'), dias: 90 });
  assert.equal(result.ok, true);
  // 11 backups (1 novo + 5 recentes + 5 com mais de 100 dias): guarda os 7 mais novos, apaga os 4 velhos que sobram.
  assert.equal(result.apagados, 4);
  assert.equal(files.find((file) => file.name === 'planilha-do-usuario.xlsx')?.trashed, false);
  assert.equal(files.filter((file) => file.name.startsWith('redeflow-backup-') && !file.trashed).length, 7);
});
