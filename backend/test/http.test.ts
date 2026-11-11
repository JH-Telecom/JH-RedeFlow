import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';
import { parseIncomingMessage } from '../src/integrations/wuzapi/client.js';

let port = 3433;
let baseUrl = `http://127.0.0.1:${port}`;
let server: ChildProcess | undefined;

async function waitForServer() {
  // Ate 30 s: com todos os arquivos de teste rodando em paralelo (ou a maquina carregada), o boot ja passou de 10 s.
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Backend nao iniciou a tempo.');
}

async function stopServer() {
  if (!server) return;

  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server!.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]);
  server = undefined;
}

async function startServer() {
  await stopServer();

  port = 3433 + (Math.floor(Math.random() * 1000) % 1000);
  baseUrl = `http://127.0.0.1:${port}`;

  server = spawn(process.execPath, ['--import', 'tsx/esm', 'src/server.ts'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      REDEFLOW_RUNTIME: 'local',
      REDEFLOW_DEMO_DATA: 'true',
      DATABASE_URL: '',
      PORT: String(port),
      JWT_SECRET: 'test-jwt-secret',
      WUZAPI_WEBHOOK_TOKEN: 'test-webhook-token',
      WUZAPI_ACTIVATION_GROUP_ID: '120363422003961917@g.us, 120363183251501300@g.us',
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173,https://jh-rede.vercel.app',
      OFS_INGEST_TOKEN: 'test-ofs-token',
    },
    stdio: 'ignore',
  });

  await waitForServer();
}

test.beforeEach(async () => {
  await startServer();
});

test.after(async () => {
  await stopServer();
});

test('healthcheck exposes security headers', async () => {
  const response = await fetch(`${baseUrl}/health`, { headers: { origin: 'http://127.0.0.1:5173' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');

  const preflight = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'OPTIONS',
    headers: {
      origin: 'https://jh-rede.vercel.app',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://jh-rede.vercel.app');
  assert.match(preflight.headers.get('access-control-allow-methods') || '', /POST/);
});

test('users can save, read and remove their own profile photo', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const avatarDataUrl = 'data:image/jpeg;base64,/9j/2Q==';

  const initialResponse = await fetch(`${baseUrl}/api/auth/avatar`, { headers });
  assert.equal(initialResponse.status, 200);
  assert.equal((await initialResponse.json() as { avatarDataUrl: string | null }).avatarDataUrl, null);

  const saveResponse = await fetch(`${baseUrl}/api/auth/avatar`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ avatarDataUrl }),
  });
  assert.equal(saveResponse.status, 200);

  const savedResponse = await fetch(`${baseUrl}/api/auth/avatar`, { headers });
  assert.equal((await savedResponse.json() as { avatarDataUrl: string | null }).avatarDataUrl, avatarDataUrl);

  const invalidResponse = await fetch(`${baseUrl}/api/auth/avatar`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ avatarDataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }),
  });
  assert.equal(invalidResponse.status, 400);

  // GIF animado: aceito sem reducao ate 2 MB; acima disso, recusado.
  const gifAvatar = `data:image/gif;base64,${'A'.repeat(1_000_000)}`;
  assert.equal((await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT', headers, body: JSON.stringify({ avatarDataUrl: gifAvatar }) })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT', headers, body: JSON.stringify({ avatarDataUrl: `data:image/jpeg;base64,${'A'.repeat(1_000_000)}` }) })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/auth/avatar`, { method: 'PUT', headers, body: JSON.stringify({ avatarDataUrl: `data:image/gif;base64,${'A'.repeat(2_900_000)}` }) })).status, 400);

  const deleteResponse = await fetch(`${baseUrl}/api/auth/avatar`, { method: 'DELETE', headers });
  assert.equal(deleteResponse.status, 200);
  const deletedResponse = await fetch(`${baseUrl}/api/auth/avatar`, { headers });
  assert.equal((await deletedResponse.json() as { avatarDataUrl: string | null }).avatarDataUrl, null);
});

test('profile banner accepts an animated GIF up to 3 MB and rejects larger ones', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const gif = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

  const saved = await fetch(`${baseUrl}/api/auth/banner`, { method: 'PUT', headers, body: JSON.stringify({ bannerDataUrl: gif }) });
  assert.equal(saved.status, 200);
  const read = await fetch(`${baseUrl}/api/auth/banner`, { headers });
  assert.equal((await read.json() as { bannerDataUrl: string | null }).bannerDataUrl, gif);

  // Um GIF grande (~1,5 MB) passa; JPEG desse tamanho nao (so GIF vai sem reducao).
  const bigBody = 'A'.repeat(2_000_000);
  assert.equal((await fetch(`${baseUrl}/api/auth/banner`, { method: 'PUT', headers, body: JSON.stringify({ bannerDataUrl: `data:image/gif;base64,${bigBody}` }) })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/auth/banner`, { method: 'PUT', headers, body: JSON.stringify({ bannerDataUrl: `data:image/jpeg;base64,${bigBody}` }) })).status, 400);
  // Acima de 3 MB de GIF e recusado.
  assert.equal((await fetch(`${baseUrl}/api/auth/banner`, { method: 'PUT', headers, body: JSON.stringify({ bannerDataUrl: `data:image/gif;base64,${'A'.repeat(4_300_000)}` }) })).status, 400);

  await fetch(`${baseUrl}/api/auth/banner`, { method: 'DELETE', headers });
});

test('any signed-in user can read the people directory, which has no write routes', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string; user: { id: string } };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };

  assert.equal((await fetch(`${baseUrl}/api/people`)).status, 401);
  const list = await fetch(`${baseUrl}/api/people`, { headers });
  assert.equal(list.status, 200);
  const { people } = await list.json() as { people: { id: string; name: string; email: string; roleName: string; online: boolean }[] };
  const me = people.find((person) => person.id === session.user.id);
  assert.ok(me);
  assert.equal(me.online, true);
  assert.equal(me.email, 'admin@jhtelecom.com');
  assert.equal('passwordHash' in me, false);

  const detail = await fetch(`${baseUrl}/api/people/${session.user.id}`, { headers });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json() as { person: { name: string } }).person.name, me.name);
  assert.equal((await fetch(`${baseUrl}/api/people/nao-existe`, { headers })).status, 404);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const write = await fetch(`${baseUrl}/api/people/${session.user.id}`, { method, headers, body: method === 'DELETE' ? undefined : '{}' });
    assert.equal(write.status, 404, `${method} nao deve existir`);
  }
});

test('users can save their own nickname and color theme', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  type Prefs = { nickname: string | null; palette: string | null };

  const initial = await fetch(`${baseUrl}/api/auth/preferences`, { headers });
  assert.deepEqual(await initial.json() as Prefs, { nickname: null, palette: null });

  const save = await fetch(`${baseUrl}/api/auth/preferences`, { method: 'PUT', headers, body: JSON.stringify({ nickname: '  Teteu  ', palette: 'aurora' }) });
  assert.equal(save.status, 200);
  const saved = await fetch(`${baseUrl}/api/auth/preferences`, { headers });
  assert.deepEqual(await saved.json() as Prefs, { nickname: 'Teteu', palette: 'aurora' });

  const invalid = await fetch(`${baseUrl}/api/auth/preferences`, { method: 'PUT', headers, body: JSON.stringify({ nickname: 'x', palette: 'arco-iris' }) });
  assert.equal(invalid.status, 400);

  // Padrao e apelido vazio voltam a "nada salvo".
  await fetch(`${baseUrl}/api/auth/preferences`, { method: 'PUT', headers, body: JSON.stringify({ nickname: '', palette: 'padrao' }) });
  const cleared = await fetch(`${baseUrl}/api/auth/preferences`, { headers });
  assert.deepEqual(await cleared.json() as Prefs, { nickname: null, palette: null });
});

test('new users must change their password once before using the API', async () => {
  const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const adminSession = await adminLogin.json() as { token: string };
  const createResponse = await fetch(`${baseUrl}/api/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminSession.token}` },
    body: JSON.stringify({ name: 'Conta de primeiro acesso', email: 'primeiro.acesso@example.com', roleId: 'role-operator', password: 'teste123' }),
  });
  assert.equal(createResponse.status, 201);

  const firstLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'primeiro.acesso@example.com', password: 'teste123' }),
  });
  const firstSession = await firstLogin.json() as { token: string; user: { mustChangePassword: boolean } };
  const userHeaders = { 'content-type': 'application/json', authorization: `Bearer ${firstSession.token}` };
  assert.equal(firstSession.user.mustChangePassword, true);

  const blockedResponse = await fetch(`${baseUrl}/api/chamados`, { headers: userHeaders });
  assert.equal(blockedResponse.status, 403);

  const wrongPassword = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: 'POST',
    headers: userHeaders,
    body: JSON.stringify({ currentPassword: 'incorreta', newPassword: 'MinhaSenhaSegura2026' }),
  });
  assert.equal(wrongPassword.status, 400);

  const samePassword = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: 'POST',
    headers: userHeaders,
    body: JSON.stringify({ currentPassword: 'teste123', newPassword: 'teste123' }),
  });
  assert.equal(samePassword.status, 400);

  const changeResponse = await fetch(`${baseUrl}/api/auth/change-password`, {
    method: 'POST',
    headers: userHeaders,
    body: JSON.stringify({ currentPassword: 'teste123', newPassword: 'MinhaSenhaSegura2026' }),
  });
  const changed = await changeResponse.json() as { user: { mustChangePassword: boolean } };
  assert.equal(changeResponse.status, 200);
  assert.equal(changed.user.mustChangePassword, false);

  const allowedResponse = await fetch(`${baseUrl}/api/chamados`, { headers: userHeaders });
  assert.equal(allowedResponse.status, 200);

  const nextLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'primeiro.acesso@example.com', password: 'MinhaSenhaSegura2026' }),
  });
  const nextSession = await nextLogin.json() as { user: { mustChangePassword: boolean } };
  assert.equal(nextLogin.status, 200);
  assert.equal(nextSession.user.mustChangePassword, false);
});

test('call list searches by OLT and filters without collapsing OLT options', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { authorization: `Bearer ${session.token}` };

  const searchedResponse = await fetch(`${baseUrl}/api/chamados?search=vip-gz1-spo-ohw-02`, { headers });
  const searched = await searchedResponse.json() as { calls: Array<{ olt: string }> };
  assert.equal(searchedResponse.status, 200);
  assert.ok(searched.calls.some((call) => call.olt === 'VIP-GZ1-SPO-OHW-02'));

  const filteredResponse = await fetch(`${baseUrl}/api/chamados?olt=VIP-GZ1-SPO-OHW-02`, { headers });
  const filtered = await filteredResponse.json() as { calls: Array<{ olt: string }>; olts: string[] };
  assert.equal(filteredResponse.status, 200);
  assert.ok(filtered.calls.length > 0);
  assert.ok(filtered.calls.every((call) => call.olt === 'VIP-GZ1-SPO-OHW-02'));
  assert.ok(filtered.olts.includes('VIP-CT1-SPO-OHW-01'));
});

test('admin can delete an empty supervisor but cannot delete a supervisor with technicians', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };

  const linkedDelete = await fetch(`${baseUrl}/api/supervisores/supervisor-joao`, { method: 'DELETE', headers });
  const linkedBody = await linkedDelete.json() as { technicianCount: number };
  assert.equal(linkedDelete.status, 409);
  assert.equal(linkedBody.technicianCount, 3);

  const createResponse = await fetch(`${baseUrl}/api/supervisores`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Supervisor vazio', region: 'Teste' }),
  });
  const created = await createResponse.json() as { supervisor: { id: string } };
  assert.equal(createResponse.status, 201);

  const deleteResponse = await fetch(`${baseUrl}/api/supervisores/${created.supervisor.id}`, { method: 'DELETE', headers });
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), { deleted: true });
  const listResponse = await fetch(`${baseUrl}/api/supervisores`, { headers });
  const list = await listResponse.json() as { supervisors: Array<{ id: string }> };
  assert.ok(!list.supervisors.some((supervisor) => supervisor.id === created.supervisor.id));
});

test('call list filters a status set before paginating', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { authorization: `Bearer ${session.token}` };
  const allResponse = await fetch(`${baseUrl}/api/chamados?pageSize=100`, { headers });
  const all = await allResponse.json() as { calls: Array<{ id: string; status: string }> };
  const closedResponse = await fetch(`${baseUrl}/api/chamados?status=Finalizado,Cancelado,Baixar&pageSize=100`, { headers });
  const closed = await closedResponse.json() as { calls: Array<{ id: string; status: string }> };

  assert.equal(closedResponse.status, 200);
  assert.ok(closed.calls.every((call) => ['Finalizado', 'Cancelado', 'Baixar'].includes(call.status)));
  assert.deepEqual(closed.calls.map((call) => call.id), all.calls.filter((call) => ['Finalizado', 'Cancelado', 'Baixar'].includes(call.status)).map((call) => call.id));
});

test('changing a call to a terminal status also sets the end date automatically', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };

  const listResponse = await fetch(`${baseUrl}/api/chamados?status=Aberto&pageSize=10`, { headers });
  const list = await listResponse.json() as { calls: Array<{ id: string; status: string }> };
  const target = list.calls[0];
  assert.ok(target, 'deveria haver um chamado aberto para testar');

  const patchResponse = await fetch(`${baseUrl}/api/chamados/${target.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status: 'Finalizado' }),
  });
  const patched = await patchResponse.json() as { call: { status: string; executedAt?: string | null } };

  assert.equal(patchResponse.status, 200);
  assert.equal(patched.call.status, 'Finalizado');
  assert.ok(patched.call.executedAt, 'deveria preencher a data de finalizacao ao encerrar o chamado');
});

test('open calls split by technician assignment and assigned open calls appear in service queue', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const unassignedBefore = await fetch(`${baseUrl}/api/chamados?status=Aberto&hasTechnician=false&pageSize=100`, { headers });
  const unassignedBeforeBody = await unassignedBefore.json() as { calls: Array<{ id: string; status: string; technicianId?: string }> };
  assert.equal(unassignedBefore.status, 200);
  assert.ok(unassignedBeforeBody.calls.every((call) => call.status === 'Aberto' && !call.technicianId));

  // Turno do tech-carlos e 07:00-16:00: marca ativo manualmente para o teste nao depender do horario em que roda.
  assert.equal((await fetch(`${baseUrl}/api/tecnicos/tech-carlos`, { method: 'PATCH', headers, body: JSON.stringify({ active: true }) })).status, 200);
  const assignResponse = await fetch(`${baseUrl}/api/chamados/call-240918-01`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ technicianId: 'tech-carlos' }),
  });
  assert.equal(assignResponse.status, 200);

  const unassignedAfter = await fetch(`${baseUrl}/api/chamados?status=Aberto&hasTechnician=false&pageSize=100`, { headers });
  const unassignedAfterBody = await unassignedAfter.json() as { calls: Array<{ id: string; status: string; technicianId?: string }> };
  assert.ok(!unassignedAfterBody.calls.some((call) => call.id === 'call-240918-01'));

  const assignedInProgress = await fetch(`${baseUrl}/api/chamados?status=Aberto,Atribuido,Deslocamento,Em%20campo&hasTechnician=true&pageSize=100`, { headers });
  const assignedInProgressBody = await assignedInProgress.json() as { calls: Array<{ id: string; status: string; technicianId?: string }> };
  assert.equal(assignedInProgress.status, 200);
  assert.ok(assignedInProgressBody.calls.every((call) => ['Aberto', 'Atribuido', 'Deslocamento', 'Em campo'].includes(call.status) && Boolean(call.technicianId)));
  assert.ok(assignedInProgressBody.calls.some((call) => call.id === 'call-240918-01' && call.status === 'Aberto'));
});

test('current-call workbook preview maps statuses and blocks demo confirmation', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['STATUS', 'ORDEM', 'TÉCNICO', 'DATA EVENTO', 'ACIONAMENTO', 'EQUIPAMENTO', 'AREA', 'DATA FIM', 'PLACA', 'PON'],
    ['Finalizado', 'OS-CURRENT-1', 'carlos mendes', '01/10/2026 08:30', '', 'VIP-GRU-3-SPO-ONK-01', 'GUARULHOS', '01/10/2026 10:00', 'PLACA-1', '3'],
    ['Pendente', 'OS-CURRENT-2', '', '01/10/2026 09:00', '', '', 'SÃO PAULO', '01/10/2026 11:00', '', ''],
    ['Baixar', 'OS-CURRENT-3', '', '01/10/2026 10:00', '', '', 'SÃO PAULO', '', '', ''],
  ]), 'Planilha1');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const previewResponse = await fetch(`${baseUrl}/api/importacoes/chamados-atuais/preview`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fileName: 'chamados-atuais.xlsx', contentBase64: buffer.toString('base64') }),
  });
  const preview = await previewResponse.json() as { previewId: string; canWrite: boolean; importableRows: number; byStatus: Record<string, number>; unmatchedTechnicians: string[]; sample: Array<{ technicianName?: string }> };
  assert.equal(previewResponse.status, 200);
  assert.equal(preview.canWrite, false);
  assert.equal(preview.importableRows, 3);
  assert.deepEqual(preview.byStatus, { Finalizado: 1, Aberto: 1, Baixar: 1 });
  assert.deepEqual(preview.unmatchedTechnicians, []);
  assert.equal(preview.sample[0]?.technicianName, 'Carlos Mendes');

  const confirmResponse = await fetch(`${baseUrl}/api/importacoes/chamados-atuais/${preview.previewId}/confirmar`, { method: 'POST', headers });
  assert.equal(confirmResponse.status, 409);
});

test('historical import preview links the spreadsheet technician to a registered technician', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Técnico', 'Data de Abertura', 'Data do Acionamento', 'Data de Fim', 'Mensagem de Acionamento'],
    ['carlos mendes', new Date('2026-06-18T17:03:26.000Z'), new Date('2026-06-18T17:15:00.000Z'), new Date('2026-06-24T16:42:28.000Z'), [
      'ACIONAMENTO FIELD',
      '- TÉCNICO: Outro nome no texto',
      '- MOTIVO: CAIXA SEM SINAL',
      '- OS OT: 19996885',
      '- OLT: VIP-GRU-3-SPO-ONK-01',
      '- PLACA/PON: SLOT: 3 | PON: 12',
    ].join('\n')],
  ]), 'Planilha1');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const response = await fetch(`${baseUrl}/api/importacoes/acionamentos-historicos/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ fileName: 'historico-tecnicos.xlsx', contentBase64: buffer.toString('base64') }),
  });
  const body = await response.json() as { unmatchedTechnicians: string[]; sample: Array<{ technicianName?: string }> };

  assert.equal(response.status, 200);
  assert.deepEqual(body.unmatchedTechnicians, []);
  assert.equal(body.sample[0]?.technicianName, 'Carlos Mendes');
});

test('IGP endpoint groups finalized orders by execution month', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const finishResponse = await fetch(`${baseUrl}/api/chamados/call-240918-02`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ olt: 'VIP-GRU-3-SPO-ONK-01', status: 'Finalizado', executedAt: '2026-10-02T08:00:00.000Z' }),
  });
  assert.equal(finishResponse.status, 200);
  const finishedCall = await finishResponse.json() as { call: { region: string } };
  assert.match(finishedCall.call.region, /GUARULHOS/);

  const response = await fetch(`${baseUrl}/api/dashboards/igp?month=2026-10&area=GRU`, { headers });
  const body = await response.json() as { igp: { month: string; access: { orders: number; outlierPercent: number }; backbone: { orders: number }; total: { orders: number; outlierPercent: number } } };

  assert.equal(response.status, 200);
  assert.equal(body.igp.month, '2026-10');
  assert.equal(body.igp.access.orders, 1);
  assert.equal(body.igp.access.outlierPercent, 100);
  assert.equal(body.igp.backbone.orders, 0);
  assert.equal(body.igp.total.orders, 1);
  assert.equal(body.igp.total.outlierPercent, 100);

  const spResponse = await fetch(`${baseUrl}/api/dashboards/igp?month=2026-10&area=SP`, { headers });
  const spBody = await spResponse.json() as { igp: { total: { orders: number } } };
  assert.equal(spResponse.status, 200);
  assert.equal(spBody.igp.total.orders, 0);
});

test('prefers Supabase whenever credentials are configured, even if runtime is local', async () => {
  const previousRuntime = process.env.REDEFLOW_RUNTIME;
  const previousUrl = process.env.SUPABASE_URL;
  const previousAnon = process.env.SUPABASE_ANON_KEY;
  const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    process.env.REDEFLOW_RUNTIME = 'local';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    const { isSupabaseConfigured } = await import('../src/integrations/supabase/client.js');
    assert.equal(isSupabaseConfigured(), true);
  } finally {
    if (previousRuntime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previousRuntime;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousAnon;
    if (previousServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
  }
});

test('falls back to built-in roles when Supabase is configured but unreachable', async () => {
  const previousRuntime = process.env.REDEFLOW_RUNTIME;
  const previousUrl = process.env.SUPABASE_URL;
  const previousAnon = process.env.SUPABASE_ANON_KEY;
  const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    process.env.REDEFLOW_RUNTIME = 'local';
    process.env.SUPABASE_URL = 'http://127.0.0.1:1';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    const { getRoleById } = await import('../src/store.js');
    const role = await getRoleById('role-operator');
    assert.ok(role);
    assert.equal(role?.id, 'role-operator');
    assert.equal(role?.name, 'Operador');
  } finally {
    if (previousRuntime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previousRuntime;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousAnon;
    if (previousServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
  }
});

test('surfaces a clear error when a role update is attempted against a configured but unreachable Supabase instance', async () => {
  const previousRuntime = process.env.REDEFLOW_RUNTIME;
  const previousUrl = process.env.SUPABASE_URL;
  const previousAnon = process.env.SUPABASE_ANON_KEY;
  const previousServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    process.env.REDEFLOW_RUNTIME = 'local';
    process.env.SUPABASE_URL = 'http://127.0.0.1:1';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

    const { updateRole } = await import('../src/store.js');
    await assert.rejects(
      () => updateRole('11111111-1111-1111-1111-111111111111', { permissions: ['dashboard.view'] }),
      /Supabase|configur|nao foi possivel/i,
    );
  } finally {
    if (previousRuntime === undefined) delete process.env.REDEFLOW_RUNTIME; else process.env.REDEFLOW_RUNTIME = previousRuntime;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousAnon === undefined) delete process.env.SUPABASE_ANON_KEY; else process.env.SUPABASE_ANON_KEY = previousAnon;
    if (previousServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceRole;
  }
});

test('login rejects repeated attempts and protects the endpoint under light concurrency', async () => {
  const payload = JSON.stringify({ email: 'unknown@example.com', password: 'wrong-password' });
  const attempts = await Promise.all(
    Array.from({ length: 6 }, () => fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    })),
  );
  assert.deepEqual(attempts.map((response) => response.status).sort((left, right) => left - right), [401, 401, 401, 401, 401, 429]);

  const startedAt = performance.now();
  const healthChecks = await Promise.all(Array.from({ length: 40 }, () => fetch(`${baseUrl}/health`)));
  const elapsedMs = performance.now() - startedAt;
  assert.ok(healthChecks.every((response) => response.status === 200));
  assert.ok(elapsedMs < 3000, `healthcheck concorrente demorou ${Math.round(elapsedMs)}ms`);
});

test('only active technicians can receive calls and their status can change', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const statusResponse = await fetch(`${baseUrl}/api/tecnicos/tech-bruno`, { method: 'PATCH', headers, body: JSON.stringify({ currentStatus: 'Indisponivel' }) });
  const assignmentResponse = await fetch(`${baseUrl}/api/chamados/call-240918-01`, { method: 'PATCH', headers, body: JSON.stringify({ technicianId: 'tech-bruno' }) });
  assert.equal(statusResponse.status, 200);
  assert.equal(assignmentResponse.status, 422);

  const longSlotPon = Array.from({ length: 80 }, (_, index) => `01/${String(index + 1).padStart(2, '0')}`).join(', ');
  const saveResponse = await fetch(`${baseUrl}/api/chamados/call-240918-01`, { method: 'PATCH', headers, body: JSON.stringify({ slotPon: longSlotPon }) });
  assert.equal(saveResponse.status, 200);
});

test('admin can edit a call opening date and invalid dates are rejected', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const openedAt = '2026-09-20T12:45:00.000Z';
  const updateResponse = await fetch(`${baseUrl}/api/chamados/call-240918-01`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ openedAt }),
  });
  const updated = await updateResponse.json() as { call: { openedAt: string } };
  assert.equal(updateResponse.status, 200);
  assert.equal(updated.call.openedAt, openedAt);

  const invalidResponse = await fetch(`${baseUrl}/api/chamados/call-240918-01`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ openedAt: 'not-a-date' }),
  });
  assert.equal(invalidResponse.status, 400);
});

test('admin can create technician with blank region and temporary shift', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const response = await fetch(`${baseUrl}/api/tecnicos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ name: 'Tecnico sem regiao', registration: 'TEC-EMPTY-REGION', region: '', shift: 'A definir' }),
  });
  const body = await response.json() as { technician: { region: string; shift: string; employmentStatus: string } };

  assert.equal(response.status, 201);
  assert.equal(body.technician.region, '');
  assert.equal(body.technician.shift, 'A definir');
  assert.equal(body.technician.employmentStatus, 'Trabalhando');
});

test('employment status is independent from availability and dismissed technicians cannot be assigned', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const createResponse = await fetch(`${baseUrl}/api/tecnicos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Tecnico desligado', registration: 'TEC-DISMISSED-01', region: 'Leste', shift: 'A definir', currentStatus: 'Disponivel', active: true, employmentStatus: 'Demitido' }),
  });
  const created = await createResponse.json() as { technician: { id: string; active: boolean; employmentStatus: string } };
  assert.equal(createResponse.status, 201);
  assert.equal(created.technician.active, true);
  assert.equal(created.technician.employmentStatus, 'Demitido');

  const assignmentResponse = await fetch(`${baseUrl}/api/chamados/call-240918-01`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ technicianId: created.technician.id }),
  });
  assert.equal(assignmentResponse.status, 422);

  const updateResponse = await fetch(`${baseUrl}/api/tecnicos/${created.technician.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ employmentStatus: 'Trabalhando' }),
  });
  const updated = await updateResponse.json() as { technician: { active: boolean; employmentStatus: string } };
  assert.equal(updateResponse.status, 200);
  assert.equal(updated.technician.active, true);
  assert.equal(updated.technician.employmentStatus, 'Trabalhando');
});

test('admin can edit technician profile fields', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const response = await fetch(`${baseUrl}/api/tecnicos/tech-bruno`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ name: 'Bruno Lima Atualizado', registration: 'TEC-1171-EDIT', region: 'Oeste', shift: '08:00 - 17:00' }),
  });
  const body = await response.json() as { technician: { name: string; registration: string; region: string; shift: string } };

  assert.equal(response.status, 200);
  assert.equal(body.technician.name, 'Bruno Lima Atualizado');
  assert.equal(body.technician.registration, 'TEC-1171-EDIT');
  assert.equal(body.technician.region, 'Oeste');
  assert.equal(body.technician.shift, '08:00 - 17:00');

  const duplicateResponse = await fetch(`${baseUrl}/api/tecnicos/tech-bruno`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ registration: 'TEC-1042' }),
  });
  assert.equal(duplicateResponse.status, 422);
  assert.match((await duplicateResponse.json() as { message: string }).message, /matricula ja esta cadastrada/i);
});

test('shares, replaces and clears the daily dashboard base', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const data = { activities: [], technicians: [], orders: [], updatedAt: new Date().toLocaleString('pt-BR') };

  const firstSave = await fetch(`${baseUrl}/api/dashboards/painel-diario/base`, { method: 'PUT', headers, body: JSON.stringify({ fileName: 'base-a.csv', data }) });
  assert.equal(firstSave.status, 200);
  const firstBase = await firstSave.json() as { base: { fileName: string } };
  assert.equal(firstBase.base.fileName, 'base-a.csv');

  const replacement = await fetch(`${baseUrl}/api/dashboards/painel-diario/base`, { method: 'PUT', headers, body: JSON.stringify({ fileName: 'base-b.csv', data }) });
  assert.equal(replacement.status, 200);
  const shared = await fetch(`${baseUrl}/api/dashboards/painel-diario/base`, { headers });
  const sharedBody = await shared.json() as { base: { fileName: string } };
  assert.equal(shared.status, 200);
  assert.equal(sharedBody.base.fileName, 'base-b.csv');

  const cleared = await fetch(`${baseUrl}/api/dashboards/painel-diario/base`, { method: 'DELETE', headers });
  assert.equal(cleared.status, 200);
  const afterClear = await fetch(`${baseUrl}/api/dashboards/painel-diario/base`, { headers });
  const afterClearBody = await afterClear.json() as { base?: unknown };
  assert.equal(afterClearBody.base, undefined);
});

test('stores observation attachments and serves them through the authenticated call route', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const imageBase64 = Buffer.alloc(4 * 1024 * 1024, 1).toString('base64');
  const documentBase64 = Buffer.from('work report fixture').toString('base64');
  const created = await fetch(`${baseUrl}/api/chamados/call-240918-01/observacoes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      text: 'Registro de atendimento com evidencias.',
      attachments: [
        { fileName: 'fachada.jpg', mimeType: 'image/jpeg', sizeBytes: Buffer.from(imageBase64, 'base64').byteLength, contentBase64: imageBase64 },
        { fileName: 'relatorio.txt', mimeType: 'text/plain', sizeBytes: Buffer.from(documentBase64, 'base64').byteLength, contentBase64: documentBase64 },
      ],
    }),
  });
  const createdBody = await created.json() as { observation: { id: string; attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }> } };
  assert.equal(created.status, 201, JSON.stringify(createdBody));
  assert.equal(createdBody.observation.attachments.length, 2);
  assert.deepEqual(createdBody.observation.attachments.map((attachment) => attachment.fileName), ['fachada.jpg', 'relatorio.txt']);
  assert.equal(createdBody.observation.attachments[0].sizeBytes, 4 * 1024 * 1024);

  const historyResponse = await fetch(`${baseUrl}/api/chamados/call-240918-01/observacoes`, { headers });
  const historyBody = await historyResponse.json() as { observations: Array<{ id: string; attachments: Array<{ id: string }> }> };
  const savedObservation = historyBody.observations.find((observation) => observation.id === createdBody.observation.id);
  assert.ok(savedObservation);
  assert.equal(savedObservation.attachments.length, 2);

  const image = createdBody.observation.attachments.find((attachment) => attachment.fileName === 'fachada.jpg');
  assert.ok(image);
  const downloadResponse = await fetch(`${baseUrl}/api/chamados/call-240918-01/observacoes/${createdBody.observation.id}/anexos/${image.id}`, { headers });
  const downloadBody = await downloadResponse.json() as { attachment: { contentBase64: string; mimeType: string; fileName: string } };
  assert.equal(downloadResponse.status, 200);
  assert.equal(downloadBody.attachment.contentBase64, imageBase64);
  assert.equal(downloadBody.attachment.mimeType, 'image/jpeg');
});

test('admins can manage OLT region mappings while operators are denied', async () => {
  const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const adminSession = await adminLogin.json() as { token: string };
  const adminHeaders = { 'content-type': 'application/json', authorization: `Bearer ${adminSession.token}` };

  const initial = await fetch(`${baseUrl}/api/configuracoes/olt-regioes`, { headers: adminHeaders });
  const initialBody = await initial.json() as { mappings: Array<{ olt: string; region: string; defaultRegion?: string }> };
  assert.equal(initial.status, 200);
  assert.ok(initialBody.mappings.some((mapping) => mapping.olt === 'VIP-ITA-SPO-OHW-01' && mapping.region === 'ITAIM PAULISTA'));

  const saved = await fetch(`${baseUrl}/api/configuracoes/olt-regioes`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ mappings: [{ olt: 'VIP-ITA-SPO-OHW-01', region: 'GUARULHOS 1' }, { olt: 'CUSTOM-OLT-HTTP', region: 'MOGI 1' }] }),
  });
  const savedBody = await saved.json() as { mappings: Array<{ olt: string; region: string }> };
  assert.equal(saved.status, 200);
  assert.ok(savedBody.mappings.some((mapping) => mapping.olt === 'VIP-ITA-SPO-OHW-01' && mapping.region === 'GUARULHOS 1'));
  assert.ok(savedBody.mappings.some((mapping) => mapping.olt === 'VIP-CT1-SPO-OHW-01'));

  const operatorLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'matheus@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const operatorSession = await operatorLogin.json() as { token: string };
  const forbidden = await fetch(`${baseUrl}/api/configuracoes/olt-regioes`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${operatorSession.token}` },
    body: JSON.stringify({ mappings: [{ olt: 'CUSTOM-OLT-HTTP', region: 'PALMEIRAS' }] }),
  });
  assert.equal(forbidden.status, 403);
});

test('parses WuzAPI group metadata without conflating sender and chat', () => {
  const payload = {
    event: {
      Info: {
        Chat: '120363422003961917@g.us',
        Sender: '551199999999@s.whatsapp.net',
        IsGroup: true,
        ID: 'msg-123',
      },
      type: 'Message',
      Message: {
        conversation: 'VALIDAR COM NOC ACESSO\nORDEM: RF-TESTE-99\nMOTIVO: perda de sinal',
      },
    },
  };

  const parsed = parseIncomingMessage(payload);
  assert.equal(parsed.chatId, '120363422003961917@g.us');
  assert.equal(parsed.sender, '551199999999@s.whatsapp.net');
  assert.equal(parsed.isGroup, true);
  assert.equal(parsed.message?.startsWith('VALIDAR COM NOC ACESSO'), true);
});

test('ignores private WuzAPI messages and rejects mismatched groups', async () => {
  const privateMessage = JSON.stringify({
    type: 'Message',
    event: {
      Info: {
        Sender: '551199999999@s.whatsapp.net',
        IsGroup: false,
      },
      Message: { conversation: 'ORDEM: RF-PRIVATE-01' },
    },
  });
  const privateResponse = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: privateMessage,
  });
  assert.equal(privateResponse.status, 202);
  const privateBody = await privateResponse.json() as { status?: string; reason?: string };
  assert.equal(privateBody.status, 'ignored');

  const mismatchResponse = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event: {
        type: 'Message',
        Info: {
          Chat: 'other-group@g.us',
          Sender: '551199999999@s.whatsapp.net',
          IsGroup: true,
        },
        Message: { conversation: 'ORDEM: RF-OTHER-01\nMOTIVO: teste' },
      },
    }),
  });
  assert.equal(mismatchResponse.status, 202);
  const mismatchBody = await mismatchResponse.json() as { status?: string; reason?: string; chatId?: string };
  assert.equal(mismatchBody.status, 'ignored');
  assert.equal(mismatchBody.reason, 'Grupo nao autorizado.');
});

test('accepts WuzAPI messages from any configured activation group', async () => {
  const response = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'Message',
      chatId: '120363183251501300@g.us',
      isGroup: true,
      message: 'ORDEM: RF-MULTI-GROUP-01\nMOTIVO: teste',
    }),
  });
  assert.equal(response.status, 202);
  assert.equal((await response.json() as { status?: string }).status, 'Pendente');
});

test('accepts an activation card typed on the phone connected to WuzAPI (IsFromMe)', async () => {
  const response = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'Message', event: { Info: { ID: 'wuz-from-me-01', Chat: '120363422003961917@g.us', Sender: '5511999999999@s.whatsapp.net', IsGroup: true, IsFromMe: true }, Message: { conversation: '⚠️ACIONAMENTO DE EVENTO MASSIVO⚠️\n\n⚠️VALIDAR COM NOC ACESSO⚠️\n\n • OLT: VIP-GZ2-SPO-OHW-03\n\n • SLOT/PON: 04/15\n\n • Tipo de Falha: Total\n\n • Data/Hora do Evento: 03/11/2026 17:02\n\n • Contrato(s) Exemplo(s): NOME: ANGELA NAIR RIBEIRO NETA EUGENIO || CONTRATO: 4533071\nNOME: ARIANE APARECIDA DOS SANTOS || CONTRATO: 4544282\n\n • Afetados: 84\n\n • BDESK: 672288\n\n • Tarefa Office Track: 610116554630102\n\n • Técnico Rede: JH TELECOM REDES\n\n • Endereços:\nCEP: 08.142-390\nRUA SANTA LUZIA DA BOA VISÃO, 91 JARDIM MIRIAM, SAO PAULO - SP' } } }),
  });
  assert.equal(response.status, 202);
  const body = await response.json() as { status?: string; activationId?: string };
  assert.equal(body.status, 'Pendente');
  assert.ok(body.activationId);
});

test('admin can delete a test call through the protected API route', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };

  const deleteResponse = await fetch(`${baseUrl}/api/chamados/call-240918-02`, {
    method: 'DELETE',
    headers,
  });

  assert.equal(deleteResponse.status, 200);
  const body = await deleteResponse.json() as { deleted: boolean };
  assert.equal(body.deleted, true);

  const fetchResponse = await fetch(`${baseUrl}/api/chamados/call-240918-02`, {
    headers,
  });
  assert.equal(fetchResponse.status, 404);
});

test('bulk call deletion requires calls.delete and clears all calls', async () => {
  const operatorLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'matheus@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const operatorSession = await operatorLogin.json() as { token: string };
  const forbidden = await fetch(`${baseUrl}/api/chamados`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${operatorSession.token}` },
  });
  assert.equal(forbidden.status, 403);

  const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const adminSession = await adminLogin.json() as { token: string };
  const deleted = await fetch(`${baseUrl}/api/chamados`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${adminSession.token}` },
  });
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { deleted: 4 });

  const callsResponse = await fetch(`${baseUrl}/api/chamados`, {
    headers: { authorization: `Bearer ${adminSession.token}` },
  });
  assert.deepEqual((await callsResponse.json() as { calls: unknown[] }).calls, []);
});

test('does not create duplicate activations when WuzAPI retries a message', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const payload = JSON.stringify({ id: 'wuz-message-dedup-test', type: 'Message', chatId: '120363422003961917@g.us', isGroup: true, message: 'ORDEM: DEDUP-001\nMOTIVO: teste' });
  const first = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, { method: 'POST', headers, body: payload });
  const second = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, { method: 'POST', headers, body: payload });
  const firstBody = await first.json() as { activationId: string };
  const secondBody = await second.json() as { activationId: string; duplicate?: boolean };
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.equal(secondBody.activationId, firstBody.activationId);
  assert.equal(secondBody.duplicate, true);
});

test('does not create duplicate activations when the same call has different message IDs', async () => {
  const payload = (id: string) => JSON.stringify({ id, type: 'Message', chatId: '120363422003961917@g.us', isGroup: true, message: 'VALIDAR COM NOC ACESSO\nBDESK: SAME-CALL-001\nTAREFA OFFICE TRACK: OT-SAME-CALL-001\nMOTIVO: teste' });
  const first = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload('different-id-1') });
  const second = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: payload('different-id-2') });
  const firstBody = await first.json() as { activationId: string };
  const secondBody = await second.json() as { activationId: string };
  assert.equal(first.status, 202);
  assert.equal(second.status, 202);
  assert.equal(secondBody.activationId, firstBody.activationId);
});

test('rejects missing chatId even when sender identifies a WhatsApp user', async () => {
  const response = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'Message', event: { Info: { Sender: '551199999999@s.whatsapp.net', IsGroup: true }, Message: { conversation: 'ORDEM: RF-NO-CHAT' } } }),
  });
  assert.equal(response.status, 202);
  assert.equal((await response.json() as { status?: string }).status, 'ignored');
});

test('accepts a valid jsonData group payload', async () => {
  const body = JSON.stringify({
    jsonData: JSON.stringify({
      type: 'Message',
      event: {
        Info: { ID: 'json-data-message', Chat: '120363422003961917@g.us', Sender: '551188888888@s.whatsapp.net', IsGroup: true },
        Message: { conversation: 'ORDEM: RF-JSON-DATA\nMOTIVO: teste' },
      },
    }),
  });
  const response = await fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  assert.equal(response.status, 202);
  assert.equal((await response.json() as { status?: string }).status, 'Pendente');
});

test('OFS collector export updates the daily panel and the OFS status of matching calls', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const ofsDate = `${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(2, 4)}`;
  const header = Array.from({ length: 26 }, (_, index) => `Coluna ${index}`);
  Object.assign(header, { 0: 'Recurso', 2: 'Status da Atividade', 3: 'Data', 5: 'Tipo de Atividade', 15: 'Início', 20: 'Tempo', 23: 'Tipo de Atividade', 24: 'Ordem de Serviço' });
  const row = (resource: string, status: string, date: string, type: string, order: string) => {
    const cells = Array.from({ length: 26 }, () => '');
    Object.assign(cells, { 0: resource, 2: status, 3: date, 5: type, 15: '08:10', 20: '01:20', 23: type, 24: order });
    return cells.map((cell) => `"${cell}"`).join(',');
  };
  const csv = [header.join(','), row('Carlos Mendes', 'Iniciado', ofsDate, 'Manutenção Corretiva de Rede', 'RF-240918'), row('Pedro Santos', 'Pendente', ofsDate, 'Manutenção Preventiva de Rede', 'OS-999'), row('Lucas Reis', 'Concluído', ofsDate, 'Instalação', 'OS-998')].join('\n');
  const send = (body: unknown, token?: string) => fetch(`${baseUrl}/api/integrations/ofs/export`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-redeflow-ofs-token': token } : {}) }, body: JSON.stringify(body) });

  assert.equal((await send({ csv })).status, 401);
  assert.equal((await send({ csv }, 'wrong-token')).status, 401);
  const oldCsv = csv.replaceAll(ofsDate, '01/01/24');
  const oldResponse = await send({ csv: oldCsv }, 'test-ofs-token');
  assert.equal(oldResponse.status, 422);

  const response = await send({ csv, nome: 'export-ofs.csv', maquina: 'maquina-teste' }, 'test-ofs-token');
  const result = await response.json() as { ok: boolean; painel: { businessDate: string; records: number }; d0?: { matchedCalls: number; updatedCalls: number } };
  assert.equal(response.status, 200);
  assert.equal(result.painel.businessDate, today);
  assert.equal(result.painel.records, 2); // a instalacao nao e manutencao de rede
  assert.equal(result.d0?.matchedCalls, 1);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }) });
  const headers = { authorization: `Bearer ${(await loginResponse.json() as { token: string }).token}` };
  const base = await (await fetch(`${baseUrl}/api/dashboards/painel-diario/base`, { headers })).json() as { base?: { uploadedBy: string; data: { orders: { order: string }[]; activities: { type: string }[] } } };
  assert.equal(base.base?.uploadedBy, 'Coletor OFS (maquina-teste)');
  assert.deepEqual(base.base?.data.orders.map((order) => order.order), ['RF-240918']);
  assert.equal(base.base?.data.activities.length, 2);
  const call = await (await fetch(`${baseUrl}/api/chamados/call-240918-01`, { headers })).json() as { call: { ofsStatus?: string } };
  assert.equal(call.call.ofsStatus, 'Iniciado');
});

test('OFS collector extension logs in with the system user and its session only works for the export', async () => {
  const login = (email: string, password: string) => fetch(`${baseUrl}/api/integrations/ofs/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal((await login('admin@jhtelecom.com', 'senha-errada')).status, 401);
  // Sem permissao de importar tambem entra (mesario usa o identificador do WhatsApp), mas nao envia o OFS.
  const supervisorLogin = await login('joao@jhtelecom.com', 'RedeFlow@2026');
  assert.equal(supervisorLogin.status, 200);
  const supervisorSession = await supervisorLogin.json() as { token: string; canCollect: boolean; user: { role: string } };
  assert.equal(supervisorSession.canCollect, false);
  assert.notEqual(supervisorSession.user.role, 'Administrador');

  const response = await login('admin@jhtelecom.com', 'RedeFlow@2026');
  assert.equal(response.status, 200);
  const session = await response.json() as { token: string; expiresAt: string; canCollect: boolean; user: { name: string; role: string } };
  assert.equal(session.user.name, 'Administrador JH');
  assert.equal(session.user.role, 'Administrador');
  assert.equal(session.canCollect, true);
  assert.ok(Date.parse(session.expiresAt) - Date.now() > 29 * 86_400_000);

  const exportWith = (authorization?: string) => fetch(`${baseUrl}/api/integrations/ofs/export`, { method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) }, body: '{}' });
  assert.equal((await exportWith(`Bearer ${session.token}`)).status, 400, 'sessao aceita: falha so por faltar o CSV');
  assert.equal((await exportWith('Bearer token-invalido')).status, 401);
  assert.equal((await exportWith(`Bearer ${supervisorSession.token}`)).status, 403, 'quem nao importa nao envia o OFS');
  assert.equal((await exportWith()).status, 401);
  // A sessao de 30 dias da extensao nao abre o resto do sistema.
  assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${session.token}` } })).status, 401);
});

test('assist: technician suggestions, risk, incidents and batch actions with the usual permissions', async () => {
  const login = async (email: string) => (await (await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'RedeFlow@2026' }) })).json() as { token: string }).token;
  const admin = { 'content-type': 'application/json', authorization: `Bearer ${await login('admin@jhtelecom.com')}` };
  const supervisor = { 'content-type': 'application/json', authorization: `Bearer ${await login('joao@jhtelecom.com')}` };
  const suggestions = await fetch(`${baseUrl}/api/chamados/call-240918-01/sugestoes`, { headers: admin });
  assert.equal(suggestions.status, 200);
  const body = await suggestions.json() as { suggestions: { technicianId: string; reasons: string[] }[] };
  assert.ok(body.suggestions.length > 0 && body.suggestions.length <= 3);
  assert.equal((await fetch(`${baseUrl}/api/chamados/call-240918-01/sugestoes`, { headers: supervisor })).status, 403, 'supervisor nao atribui');
  assert.equal((await fetch(`${baseUrl}/api/chamados/risco`, { method: 'POST', headers: admin, body: JSON.stringify({ ids: ['call-240918-01'] }) })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/operacao/incidentes`, { headers: admin })).status, 200);
  const action = (body: unknown, headers = admin) => fetch(`${baseUrl}/api/operacao/incidentes/acao`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal((await action({ callIds: ['call-240918-01'], action: 'assign', technicianId: 'nao-existe' })).status, 422);
  assert.equal((await action({ callIds: ['call-240918-01'], action: 'finish', text: 'x', executedAt: '2026-11-06T10:00' }, supervisor)).status, 403);
  const observed = await action({ callIds: ['call-240918-01', 'nao-existe'], action: 'observe', text: 'Incidente na OLT: equipe a caminho' });
  assert.equal(observed.status, 200);
  const result = await observed.json() as { ok: number; results: { callId: string; ok: boolean }[] };
  assert.equal(result.ok, 1);
  assert.equal(result.results.find((item) => item.callId === 'nao-existe')?.ok, false);
});

test('field screen: a user linked to a technician updates only their own calls, with the checklist enforced', async () => {
  const login = async (email: string) => (await (await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'RedeFlow@2026' }) })).json() as { token: string }).token;
  const admin = { 'content-type': 'application/json', authorization: `Bearer ${await login('admin@jhtelecom.com')}` };
  const field = { 'content-type': 'application/json', authorization: `Bearer ${await login('maria@jhtelecom.com')}` };

  assert.equal((await (await fetch(`${baseUrl}/api/campo/eu`, { headers: field })).json() as { technician: unknown }).technician, null);
  assert.equal((await fetch(`${baseUrl}/api/campo/chamados`, { headers: field })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/tecnicos/tech-andre/usuario`, { method: 'PUT', headers: admin, body: JSON.stringify({ userId: 'user-maria' }) })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/tecnicos/tech-andre/usuario`, { method: 'PUT', headers: field, body: JSON.stringify({ userId: 'user-maria' }) })).status, 403, 'supervisor nao edita tecnico');
  assert.equal((await (await fetch(`${baseUrl}/api/tecnicos/vinculos`, { headers: admin })).json() as { links: Record<string, string> }).links['tech-andre'], 'user-maria');

  const mine = await (await fetch(`${baseUrl}/api/campo/chamados`, { headers: field })).json() as { technician: { name: string }; calls: { id: string }[] };
  assert.equal(mine.technician.name, 'Andre Costa');
  assert.ok(mine.calls.some((call) => call.id === 'call-240916-01'));
  assert.ok(mine.calls.every((call) => call.id !== 'call-240917-01'), 'so os chamados do proprio tecnico');
  assert.equal((await fetch(`${baseUrl}/api/campo/chamados/call-240917-01/status`, { method: 'POST', headers: field, body: JSON.stringify({ status: 'Deslocamento' }) })).status, 404, 'chamado de outro tecnico');
  assert.equal((await fetch(`${baseUrl}/api/campo/chamados/call-240916-01/status`, { method: 'POST', headers: field, body: JSON.stringify({ status: 'Finalizado' }) })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/campo/chamados/call-240916-01/status`, { method: 'POST', headers: field, body: JSON.stringify({ status: 'Em campo' }) })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/campo/chamados/call-240916-01/observacao`, { method: 'POST', headers: field, body: JSON.stringify({ text: 'Cheguei na CTO' }) })).status, 201);

  // Checklist so do tipo deste chamado (para nao afetar os outros testes).
  assert.equal((await fetch(`${baseUrl}/api/checklists`, { method: 'PUT', headers: field, body: JSON.stringify({ templates: [] }) })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/checklists`, { method: 'PUT', headers: admin, body: JSON.stringify({ templates: [{ name: 'Baixa', callTypes: ['BAIXA TECNICA'], items: ['Sinal conferido'], active: true }] }) })).status, 200);
  const blocked = await fetch(`${baseUrl}/api/campo/chamados/call-240916-01/finalizar`, { method: 'POST', headers: field, body: JSON.stringify({ text: 'Reparo realizado\nEmenda na CTO' }) });
  assert.equal(blocked.status, 422);
  assert.match((await blocked.json() as { message: string }).message, /Sinal conferido/);
  const finished = await fetch(`${baseUrl}/api/campo/chamados/call-240916-01/finalizar`, { method: 'POST', headers: field, body: JSON.stringify({ text: 'Reparo realizado\nEmenda na CTO', checklist: ['sinal conferido'] }) });
  assert.equal(finished.status, 200);
  const call = (await finished.json() as { call: { status: string; result: string; notes: string } }).call;
  assert.equal(call.status, 'Finalizado');
  assert.equal(call.result, 'Reparo realizado');
  assert.match(call.notes, /Checklist "Baixa": ✔ Sinal conferido/);

  await fetch(`${baseUrl}/api/checklists`, { method: 'PUT', headers: admin, body: JSON.stringify({ templates: [] }) });
  await fetch(`${baseUrl}/api/tecnicos/tech-andre/usuario`, { method: 'PUT', headers: admin, body: JSON.stringify({ userId: null }) });
});

test('full export is admin only, limited to 366 days, and brings calls, observations and history', async () => {
  const login = async (email: string) => (await (await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'RedeFlow@2026' }) })).json() as { token: string }).token;
  const admin = { authorization: `Bearer ${await login('admin@jhtelecom.com')}` };
  const ok = await fetch(`${baseUrl}/api/exportacao?from=2026-01-01&to=2026-12-31`, { headers: admin });
  assert.equal(ok.status, 200);
  const body = await ok.json() as { calls: unknown[]; observations: unknown[]; logs: unknown[]; truncated: boolean };
  assert.ok(Array.isArray(body.calls) && Array.isArray(body.observations) && Array.isArray(body.logs));
  assert.equal((await fetch(`${baseUrl}/api/exportacao?from=2025-01-01&to=2026-12-31`, { headers: admin })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/exportacao?from=2026-01-01&to=2026-12-31`, { headers: { authorization: `Bearer ${await login('joao@jhtelecom.com')}` } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/relatorios/reincidencia-tecnico?from=2026-01-01&to=2026-12-31`, { headers: admin })).status, 200);
});

test('change history lists who changed which call in the period', async () => {
  const login = async (email: string) => (await (await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'RedeFlow@2026' }) })).json() as { token: string }).token;
  const admin = { 'content-type': 'application/json', authorization: `Bearer ${await login('admin@jhtelecom.com')}` };
  assert.equal((await fetch(`${baseUrl}/api/chamados/call-240918-01`, { method: 'PATCH', headers: admin, body: JSON.stringify({ notes: `Teste historico ${Date.now()}` }) })).status, 200);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const response = await fetch(`${baseUrl}/api/auditoria?from=${today}&to=${today}`, { headers: admin });
  assert.equal(response.status, 200);
  const body = await response.json() as { logs: { callId: string; orderNumber: string; userName: string; field: string }[]; truncated: boolean };
  const log = body.logs.find((item) => item.callId === 'call-240918-01' && item.field === 'notes');
  assert.ok(log, 'alteracao de hoje aparece');
  assert.equal(log.orderNumber, 'RF-240918');
  assert.equal(log.userName, 'Administrador JH');
  assert.equal(body.truncated, false);
  // Paginado no servidor, com filtro de campo.
  const paged = await (await fetch(`${baseUrl}/api/auditoria?from=${today}&to=${today}&page=1&pageSize=1&field=notes`, { headers: admin })).json() as { logs: { field: string }[]; total: number; totalPages: number; pageSize: number };
  assert.equal(paged.logs.length, 1);
  assert.equal(paged.pageSize, 1);
  assert.ok(paged.logs.every((item) => item.field === 'notes'));
  assert.equal(paged.totalPages, paged.total);
  assert.equal((await fetch(`${baseUrl}/api/auditoria?from=${today}&to=${today}&pageSize=5000`, { headers: admin })).status, 400, 'no maximo 2000 (Excel)');
  assert.equal((await fetch(`${baseUrl}/api/auditoria?from=${today}&to=2000-01-01`, { headers: admin })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/auditoria?from=${today}&to=${today}`, { headers: { authorization: `Bearer ${await login('joao@jhtelecom.com')}` } })).status, 403);
});

test('team: own status shows in Pessoas, mentions notify the person until read', async () => {
  const login = async (email: string) => (await (await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'RedeFlow@2026' }) })).json() as { token: string; user: { id: string; name: string } });
  const admin = await login('admin@jhtelecom.com');
  const supervisor = await login('joao@jhtelecom.com');
  const adminHeaders = { 'content-type': 'application/json', authorization: `Bearer ${admin.token}` };
  const supHeaders = { 'content-type': 'application/json', authorization: `Bearer ${supervisor.token}` };

  const until = new Date(Date.now() + 3_600_000).toISOString();
  assert.equal((await fetch(`${baseUrl}/api/auth/status`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ text: 'Em campo', emoji: '🚗', until }) })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/auth/status`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ text: 'x', until: new Date(Date.now() - 1000).toISOString() }) })).status, 400);
  const people = await (await fetch(`${baseUrl}/api/people`, { headers: supHeaders })).json() as { status: Record<string, { text: string; emoji: string }> };
  assert.deepEqual({ text: people.status[admin.user.id].text, emoji: people.status[admin.user.id].emoji }, { text: 'Em campo', emoji: '🚗' });
  assert.equal((await fetch(`${baseUrl}/api/auth/status`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ status: null }) })).status, 200);
  const cleared = await (await fetch(`${baseUrl}/api/auth/status`, { headers: adminHeaders })).json() as { status: unknown };
  assert.equal(cleared.status, null);

  const observation = await fetch(`${baseUrl}/api/chamados/call-240918-01/observacoes`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ text: `@${supervisor.user.name} pode olhar esse?` }) });
  assert.equal(observation.status, 201);
  const bell = await (await fetch(`${baseUrl}/api/notificacoes`, { headers: supHeaders })).json() as { notifications: { id: string; title: string; href: string }[] };
  const mention = bell.notifications.find((item) => item.id.startsWith('user:'));
  assert.ok(mention, 'supervisor recebeu a mencao');
  assert.match(mention.title, /mencionou você/);
  assert.equal(mention.href, '/chamados/call-240918-01');
  assert.equal((await (await fetch(`${baseUrl}/api/notificacoes`, { headers: adminHeaders })).json() as { notifications: { id: string }[] }).notifications.some((item) => item.id.startsWith('user:')), false, 'quem escreveu nao e avisado');
  assert.equal((await fetch(`${baseUrl}/api/notificacoes/lidas`, { method: 'POST', headers: supHeaders, body: JSON.stringify({ ids: [mention.id] }) })).status, 200);
  const after = await (await fetch(`${baseUrl}/api/notificacoes`, { headers: supHeaders })).json() as { notifications: { id: string }[] };
  assert.equal(after.notifications.some((item) => item.id === mention.id), false);

  const highlights = await fetch(`${baseUrl}/api/destaques?month=2026-11`, { headers: supHeaders });
  assert.equal(highlights.status, 200);
});

test('operations: queue map, technician load and repeat calls', async () => {
  const login = async (email: string) => (await (await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'RedeFlow@2026' }) })).json() as { token: string }).token;
  const admin = { 'content-type': 'application/json', authorization: `Bearer ${await login('admin@jhtelecom.com')}` };
  const map = await fetch(`${baseUrl}/api/operacao/mapa`, { headers: admin });
  assert.equal(map.status, 200);
  assert.ok(Array.isArray((await map.json() as { regions: unknown[] }).regions));
  const load = await fetch(`${baseUrl}/api/operacao/carga`, { headers: admin });
  assert.equal(load.status, 200);
  const loadBody = await load.json() as { technicians: { name: string }[] };
  assert.ok(loadBody.technicians.length > 0);
  // Supervisor ve so a propria equipe.
  const supervisor = { authorization: `Bearer ${await login('joao@jhtelecom.com')}` };
  const supervisorLoad = await (await fetch(`${baseUrl}/api/operacao/carga`, { headers: supervisor })).json() as { technicians: { name: string }[] };
  assert.ok(supervisorLoad.technicians.length <= loadBody.technicians.length);
  assert.equal((await fetch(`${baseUrl}/api/chamados/nao-existe/reincidencia`, { headers: admin })).status, 404);
  const history = await fetch(`${baseUrl}/api/chamados/call-240918-01/reincidencia`, { headers: admin });
  assert.equal(history.status, 200);
  assert.equal(typeof (await history.json() as { isRepeat: boolean }).isRepeat, 'boolean');
  const flags = await fetch(`${baseUrl}/api/chamados/reincidencia`, { method: 'POST', headers: admin, body: JSON.stringify({ ids: ['call-240918-01'] }) });
  assert.equal(flags.status, 200);
  assert.equal(typeof (await flags.json() as { flags: Record<string, number> }).flags, 'object');
});

test('batch 2 reports answer for the period and validate the range', async () => {
  const session = await (await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }) })).json() as { token: string };
  const get = (path: string) => fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${session.token}` } });
  for (const path of ['produtividade', 'motivos', 'comparar']) {
    assert.equal((await get(`/api/relatorios/${path}?from=2026-01-01&to=2026-12-31`)).status, 200, path);
    assert.equal((await get(`/api/relatorios/${path}?from=2026-12-31&to=2026-01-01`)).status, 400, `${path} periodo invertido`);
  }
  const compare = await (await get('/api/relatorios/comparar?from=2026-11-01&to=2026-11-07')).json() as { days: number; previous: { from: string } };
  assert.equal(compare.days, 7);
  assert.equal(compare.previous.from, '2026-10-25');
  const summary = await get('/api/relatorios/resumo-dia?date=2026-11-03');
  assert.equal(summary.status, 200);
  const body = await summary.json() as { summary: { date: string }; text: string; whatsapp: { configured: boolean } };
  assert.equal(body.summary.date, '2026-11-03');
  assert.match(body.text, /resumo de 03\/11\/2026/);
  assert.equal(body.whatsapp.configured, false);
});

test('extension reports land in the OFS integration health panel', async () => {
  const collector = await (await fetch(`${baseUrl}/api/integrations/ofs/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }) })).json() as { token: string };
  const relato = (body: unknown, token = collector.token) => fetch(`${baseUrl}/api/integrations/ofs/relato`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  assert.equal((await relato({ tipo: 'closing', ok: false }, 'x')).status, 401);
  assert.equal((await relato({ tipo: 'outro', ok: true })).status, 400);
  assert.equal((await relato({ tipo: 'closing', ok: false, erro: 'A aba fixada não está no Console de Alocação', versao: '1.3.4' })).status, 200);

  const session = await (await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }) })).json() as { token: string };
  const health = await fetch(`${baseUrl}/api/integracoes/saude`, { headers: { authorization: `Bearer ${session.token}` } });
  assert.equal(health.status, 200);
  const body = await health.json() as { checks: { key: string; detail: string }[]; events: { summary: string }[]; whatsapp: { configured: boolean } };
  assert.ok(body.events.some((item) => /Console de Alocação/.test(item.summary)));
  assert.match(body.checks.find((check) => check.key === 'closing')!.detail, /Console de Alocação/);
  assert.equal(body.whatsapp.configured, false);
  // Supervisor (sem imports.view) nao ve o painel.
  const supervisor = await (await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'joao@jhtelecom.com', password: 'RedeFlow@2026' }) })).json() as { token: string };
  assert.equal((await fetch(`${baseUrl}/api/integracoes/saude`, { headers: { authorization: `Bearer ${supervisor.token}` } })).status, 403);
});

test('OFS collector export of a previous day updates that day panel and calls without replacing today D-0 base', async () => {
  const fmt = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const today = fmt(new Date());
  const yesterday = fmt(new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000));
  const ofsDate = `${yesterday.slice(8, 10)}/${yesterday.slice(5, 7)}/${yesterday.slice(2, 4)}`;
  const header = Array.from({ length: 26 }, (_, index) => `Coluna ${index}`);
  Object.assign(header, { 0: 'Recurso', 2: 'Status da Atividade', 3: 'Data', 5: 'Tipo de Atividade', 15: 'Início', 20: 'Tempo', 23: 'Tipo de Atividade', 24: 'Ordem de Serviço' });
  const cells = Array.from({ length: 26 }, () => '');
  Object.assign(cells, { 0: 'Andre Costa', 2: 'Concluído', 3: ofsDate, 5: 'Manutenção Corretiva de Rede', 15: '09:00', 20: '02:00', 23: 'Manutenção Corretiva de Rede', 24: 'RF-240916' });
  const csv = [header.join(','), cells.map((cell) => `"${cell}"`).join(',')].join('\n');
  const send = (body: unknown) => fetch(`${baseUrl}/api/integrations/ofs/export`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-redeflow-ofs-token': 'test-ofs-token' }, body: JSON.stringify(body) });

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }) });
  const headers = { authorization: `Bearer ${(await loginResponse.json() as { token: string }).token}` };
  const d0Before = await (await fetch(`${baseUrl}/api/importacoes/d0`, { headers })).json() as { base: { fileName?: string; rowCount: number } };

  assert.equal((await send({ csv, data: '2999-01-01' })).status, 400);
  assert.equal((await send({ csv })).status, 422); // sem `data`, o CSV de ontem nao e de hoje

  const response = await send({ csv, data: yesterday, nome: 'ofs-ontem.csv', maquina: 'maquina-teste' });
  const result = await response.json() as { painel: { businessDate: string; records: number }; d0?: { matchedCalls: number } };
  assert.equal(response.status, 200);
  assert.equal(result.painel.businessDate, yesterday);
  assert.equal(result.d0?.matchedCalls, 1);

  const pastBase = await (await fetch(`${baseUrl}/api/dashboards/painel-diario/base?date=${yesterday}`, { headers })).json() as { base?: { fileName: string; data: { activities: { concluded: number }[] } } };
  assert.equal(pastBase.base?.fileName, 'ofs-ontem.csv');
  assert.equal(pastBase.base?.data.activities[0]?.concluded, 1);
  const d0After = await (await fetch(`${baseUrl}/api/importacoes/d0`, { headers })).json() as { base: { fileName?: string; rowCount: number } };
  assert.deepEqual(d0After.base, d0Before.base);
  const call = await (await fetch(`${baseUrl}/api/chamados/call-240916-01`, { headers })).json() as { call: { ofsStatus?: string } };
  assert.equal(call.call.ofsStatus, 'Concluído');
});

test('current calls preview turns the same order on two rows into one call with the first technician', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }) });
  const session = await loginResponse.json() as { token: string };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['ORDEM', 'TÉCNICO', 'DATA EVENTO', 'AREA', 'CARD'],
    [610150284850999, 'Carlos Mendes', 46329.735, 'PALMEIRAS', 'VALIDAR COM NOC ACESSO\n- Tarefa Office Track: 610150284850999'],
    [610150284850999, 'Pedro Santos', 46329.735, 'PALMEIRAS', 'VALIDAR COM NOC ACESSO\n- Tarefa Office Track: 610150284850999'],
  ]), 'Planilha1');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const response = await fetch(`${baseUrl}/api/importacoes/chamados-atuais/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ fileName: 'Em campo.xlsx', contentBase64: buffer.toString('base64') }),
  });
  const preview = await response.json() as { importableRows: number; duplicateRows: number; byStatus: Record<string, number>; sample: Array<{ orderNumber: string; technicianName?: string; status: string }> };
  assert.equal(response.status, 200);
  assert.equal(preview.importableRows, 1);
  assert.equal(preview.duplicateRows, 1);
  assert.deepEqual(preview.byStatus, { 'Em campo': 1 });
  assert.equal(preview.sample[0]?.technicianName, 'Carlos Mendes');
});

test('changing only the status keeps the technician, and Atrelado is accepted like Atribuido', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }) });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  // Fila: o seletor de status manda so { status }. Antes o tecnico virava null e o pedido era recusado.
  const response = await fetch(`${baseUrl}/api/chamados/call-240917-01`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'Atrelado' }) });
  const body = await response.json() as { call: { status: string; technicianId?: string } };
  assert.equal(response.status, 200);
  assert.equal(body.call.status, 'Atrelado');
  assert.equal(body.call.technicianId, 'tech-carlos');
  const list = await (await fetch(`${baseUrl}/api/chamados?status=Atrelado`, { headers })).json() as { calls: Array<{ id: string }> };
  assert.ok(list.calls.some((call) => call.id === 'call-240917-01'));
  // Sem tecnico continua bloqueado, como no Atribuido.
  const withoutTechnician = await fetch(`${baseUrl}/api/chamados/call-240917-01`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'Atrelado', technicianId: null }) });
  assert.equal(withoutTechnician.status, 422);
});

test('calls list filters by IGP area (SP, GRU, Alto Tiete)', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }) });
  const session = await loginResponse.json() as { token: string };
  const headers = { authorization: `Bearer ${session.token}` };
  const all = await (await fetch(`${baseUrl}/api/chamados?pageSize=100`, { headers })).json() as { calls: Array<{ region: string }>; total: number };
  const byArea: Record<string, number> = {};
  for (const area of ['SP', 'GRU', 'ALTO_TIETE']) {
    const response = await fetch(`${baseUrl}/api/chamados?pageSize=100&area=${area}`, { headers });
    assert.equal(response.status, 200);
    byArea[area] = ((await response.json()) as { total: number }).total;
  }
  assert.ok(byArea.SP + byArea.GRU + byArea.ALTO_TIETE <= all.total);
  assert.equal((await fetch(`${baseUrl}/api/chamados?area=XYZ`, { headers })).status, 400);
});

test('dashboards reuse the computed result until data changes and answer 304 when nothing changed', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}`, origin: 'http://127.0.0.1:5173' };
  const url = `${baseUrl}/api/dashboards/operacao`;

  const first = await fetch(url, { headers });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('x-read-cache'), 'miss');
  assert.equal(first.headers.get('cache-control'), 'private, no-cache');
  assert.match(first.headers.get('access-control-expose-headers') || '', /ETag/i);
  const etag = first.headers.get('etag');
  assert.ok(etag);
  const body = await first.json();

  const second = await fetch(url, { headers });
  assert.equal(second.headers.get('x-read-cache'), 'hit');
  assert.deepEqual(await second.json(), body);

  const notModified = await fetch(url, { headers: { ...headers, 'if-none-match': etag! } });
  assert.equal(notModified.status, 304);

  // Qualquer gravacao que deu certo invalida o cache dos paineis.
  const save = await fetch(`${baseUrl}/api/auth/preferences`, { method: 'PUT', headers, body: JSON.stringify({ nickname: 'Cache', palette: 'padrao' }) });
  assert.equal(save.status, 200);
  const afterWrite = await fetch(url, { headers });
  assert.equal(afterWrite.headers.get('x-read-cache'), 'miss');

  // Gravacao recusada (400) nao invalida.
  const again = await fetch(url, { headers });
  assert.equal(again.headers.get('x-read-cache'), 'hit');
  await fetch(`${baseUrl}/api/auth/preferences`, { method: 'PUT', headers, body: JSON.stringify({ nickname: 'x', palette: 'arco-iris' }) });
  const afterRejected = await fetch(url, { headers });
  assert.equal(afterRejected.headers.get('x-read-cache'), 'hit');
});

test('a signed-in user downloads only their own personal data (LGPD access request)', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string; user: { id: string; email: string } };
  const headers = { authorization: `Bearer ${session.token}` };

  const unauthenticated = await fetch(`${baseUrl}/api/auth/meus-dados`);
  assert.equal(unauthenticated.status, 401);

  const response = await fetch(`${baseUrl}/api/auth/meus-dados`, { headers });
  assert.equal(response.status, 200);
  const data = await response.json() as { generatedAt: string; account: Record<string, unknown>; preferences: unknown; changesLastYear: { total: number; items: unknown[] } };
  assert.equal(data.account.id, session.user.id);
  assert.equal(data.account.email, 'admin@jhtelecom.com');
  assert.ok(data.generatedAt);
  assert.ok(data.preferences);
  assert.ok(Array.isArray(data.changesLastYear.items));
  const raw = JSON.stringify(data);
  assert.doesNotMatch(raw, /password|hash/i);
});

test('the end date of a closed call can be corrected without reopening it', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const list = await (await fetch(`${baseUrl}/api/chamados?pageSize=1`, { headers })).json() as { calls: { id: string; openedAt: string }[] };
  const target = list.calls[0];
  assert.ok(target);

  const close = await fetch(`${baseUrl}/api/chamados/${target.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'Baixar' }) });
  assert.equal(close.status, 200);
  // O PATCH normal continua recusando editar chamado encerrado.
  const blocked = await fetch(`${baseUrl}/api/chamados/${target.id}`, { method: 'PATCH', headers, body: JSON.stringify({ executedAt: new Date().toISOString() }) });
  assert.equal(blocked.status, 409);

  const opened = new Date(target.openedAt);
  const local = (date: Date) => new Date(date.getTime() - 3 * 3_600_000).toISOString().slice(0, 16); // horario de Sao Paulo
  const wanted = new Date(opened.getTime() + 2 * 3_600_000);
  const fixed = await fetch(`${baseUrl}/api/chamados/${target.id}/data-fim`, { method: 'PUT', headers, body: JSON.stringify({ executedAt: local(wanted) }) });
  assert.equal(fixed.status, 200);
  const body = await fixed.json() as { call: { status: string; executedAt: string } };
  assert.equal(body.call.status, 'Baixar');
  assert.equal(Date.parse(body.call.executedAt), Math.floor(wanted.getTime() / 60_000) * 60_000);

  const beforeOpening = await fetch(`${baseUrl}/api/chamados/${target.id}/data-fim`, { method: 'PUT', headers, body: JSON.stringify({ executedAt: local(new Date(opened.getTime() - 3_600_000)) }) });
  assert.equal(beforeOpening.status, 422);
  const future = await fetch(`${baseUrl}/api/chamados/${target.id}/data-fim`, { method: 'PUT', headers, body: JSON.stringify({ executedAt: local(new Date(Date.now() + 86_400_000)) }) });
  assert.equal(future.status, 422);

  const logs = await (await fetch(`${baseUrl}/api/chamados/${target.id}/logs`, { headers })).json() as { logs?: { field: string; action: string }[] };
  if (logs.logs) assert.ok(logs.logs.some((log) => log.field === 'executedAt' && log.action === 'Data de finalizacao alterado'));
});

test('the queue reads the latest observation of many calls in one request', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }),
  });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const list = await (await fetch(`${baseUrl}/api/chamados?pageSize=2`, { headers })).json() as { calls: { id: string }[] };
  const [first, second] = list.calls;
  assert.ok(first && second);

  await fetch(`${baseUrl}/api/chamados/${first.id}/observacoes`, { method: 'POST', headers, body: JSON.stringify({ text: 'primeira anotacao', attachments: [] }) });
  await new Promise((resolve) => setTimeout(resolve, 15));
  await fetch(`${baseUrl}/api/chamados/${first.id}/observacoes`, { method: 'POST', headers, body: JSON.stringify({ text: 'matheus amassou', attachments: [] }) });

  const response = await fetch(`${baseUrl}/api/chamados/ultimas-observacoes?ids=${first.id},${second.id}`, { headers });
  assert.equal(response.status, 200);
  const body = await response.json() as { observations: Record<string, { text: string; userName: string }> };
  assert.equal(body.observations[first.id]?.text, 'matheus amassou');
  assert.ok(body.observations[first.id]?.userName);

  const tooMany = await fetch(`${baseUrl}/api/chamados/ultimas-observacoes?ids=${Array.from({ length: 101 }, (_, index) => `id-${index}`).join(',')}`, { headers });
  assert.equal(tooMany.status, 400);
});

test('read-only link from the Casa Cliente notice shows the card while pending and the call after acceptance', async () => {
  const { createPublicViewToken } = await import('../src/olt-notice.js');
  const webhook = (message: string, id: string) => fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'Message', event: { Info: { ID: id, Chat: '120363422003961917@g.us', Sender: '5511999999999@s.whatsapp.net', IsGroup: true }, Message: { conversation: message } } }),
  });
  const cardResponse = await webhook('⚠️VALIDAR COM NOC ACESSO⚠️\n\n • OLT: VIP-GZ1-SPO-OHW-02\n\n • SLOT/PON: 04/10\n\n • Tipo de Falha: Parcial\n\n • Afetados: 9\n\n • BDESK: 677984\n\n • Tarefa Office Track: 610126230530102\n\n • Endereços:\nCEP: 08.142-390\nRUA SANTA LUZIA DA BOA VISÃO, 91 JARDIM MIRIAM, SAO PAULO - SP', 'wuz-notice-card-01');
  const { activationId } = await cardResponse.json() as { activationId: string };
  assert.ok(activationId);

  // O informativo que o sistema manda no grupo nao vira card novo.
  const echo = await webhook('*ℹ️ INFORMATIVO DE ACIONAMENTO*\n\n*Tipo:* NOC ACESSO\n*BDESK:* 677984\n*OLT:* VIP-GZ1-SPO-OHW-02', 'wuz-notice-echo-01');
  assert.equal((await echo.json() as { status?: string }).status, 'ignored');

  const token = createPublicViewToken(activationId, 'test-jwt-secret');
  const pending = await fetch(`${baseUrl}/api/public/consulta/${token}`);
  assert.equal(pending.status, 200);
  assert.equal(pending.headers.get('cache-control'), 'no-store');
  const pendingBody = await pending.json() as { state: string; card: { bdesk: string; placaPon: string; enderecos: string[] }; call?: unknown };
  assert.equal(pendingBody.state, 'aguardando');
  assert.equal(pendingBody.card.bdesk, '677984');
  assert.equal(pendingBody.call, undefined);

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }) });
  const session = await loginResponse.json() as { token: string };
  const accept = await fetch(`${baseUrl}/api/acionamentos/${activationId}/aceitar`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` } });
  assert.equal(accept.status, 200);

  const accepted = await (await fetch(`${baseUrl}/api/public/consulta/${token}`)).json() as { state: string; call: { orderNumber: string; status: string }; timeline: { text: string }[] };
  assert.equal(accepted.state, 'chamado');
  assert.ok(accepted.call.orderNumber);
  assert.ok(accepted.timeline.some((item) => item.text === 'Chamado aberto'));

  assert.equal((await fetch(`${baseUrl}/api/public/consulta/token-invalido`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/public/consulta/${createPublicViewToken(activationId, 'outro-segredo')}`)).status, 404);
});

test('the Chrome extension can be downloaded as a valid zip with the current manifest', async () => {
  const { inflateRawSync } = await import('node:zlib');
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }) });
  const session = await loginResponse.json() as { token: string };
  const headers = { authorization: `Bearer ${session.token}` };

  assert.equal((await fetch(`${baseUrl}/api/extensao/download`)).status, 401);
  const info = await (await fetch(`${baseUrl}/api/extensao`, { headers })).json() as { version: string; fileName: string };
  assert.match(info.version, /^\d+\.\d+\.\d+$/);

  const response = await fetch(`${baseUrl}/api/extensao/download`, { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/zip');
  assert.match(response.headers.get('content-disposition') || '', new RegExp(info.fileName.replace(/\./g, '\.')));
  const zip = Buffer.from(await response.arrayBuffer());
  assert.equal(zip.readUInt32LE(0), 0x04034b50);

  // Le o diretorio central e confere o manifest.json de dentro do zip.
  const endAt = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(endAt + 10);
  let pointer = zip.readUInt32LE(endAt + 16);
  const names: string[] = [];
  let manifestText = '';
  for (let index = 0; index < count; index += 1) {
    const nameLength = zip.readUInt16LE(pointer + 28);
    const extraLength = zip.readUInt16LE(pointer + 30);
    const commentLength = zip.readUInt16LE(pointer + 32);
    const localOffset = zip.readUInt32LE(pointer + 42);
    const compressedSize = zip.readUInt32LE(pointer + 20);
    const name = zip.subarray(pointer + 46, pointer + 46 + nameLength).toString('utf8');
    names.push(name);
    if (name === 'jh-redeflow-extensao/manifest.json') {
      const localName = zip.readUInt16LE(localOffset + 26);
      const localExtra = zip.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localName + localExtra;
      manifestText = inflateRawSync(zip.subarray(start, start + compressedSize)).toString('utf8');
    }
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  assert.ok(names.includes('jh-redeflow-extensao/background.js'));
  assert.ok(names.includes('jh-redeflow-extensao/whatsapp/wa.js'));
  assert.equal((JSON.parse(manifestText) as { version: string }).version, info.version);
});

test('GIGA+ status: call handled by the other office leaves the active queue and the overview, stays open for observations, and can be reopened', async () => {
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }) });
  const session = await loginResponse.json() as { token: string };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${session.token}` };
  const metrics = async () => (await (await fetch(`${baseUrl}/api/dashboards/operacao`, { headers })).json() as { metrics: { activeTotal: number } }).metrics.activeTotal;
  const list = await (await fetch(`${baseUrl}/api/chamados?pageSize=100`, { headers })).json() as { calls: { id: string; status: string }[] };
  const target = list.calls.find((call) => call.status === 'Aberto');
  assert.ok(target, 'precisa de um chamado Aberto na demonstracao');
  const activeBefore = await metrics();

  const marked = await fetch(`${baseUrl}/api/chamados/${target.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'GIGA+' }) });
  assert.equal(marked.status, 200, 'GIGA+ nao exige tecnico');
  assert.equal((await marked.json() as { call: { status: string } }).call.status, 'GIGA+');
  assert.equal(await metrics(), activeBefore - 1, 'sai da fila ativa da Visao geral');

  const gigaList = async (gigaClosed: boolean) => (await (await fetch(`${baseUrl}/api/chamados?status=GIGA%2B&gigaClosed=${gigaClosed}&pageSize=100`, { headers })).json() as { calls: { id: string }[] }).calls;
  assert.ok((await gigaList(false)).some((call) => call.id === target.id), 'GIGA+ em aberto: aba GIGA+ de Em atendimento');
  assert.ok(!(await gigaList(true)).some((call) => call.id === target.id), 'ainda nao concluido no OFS: fora de Finalizados');
  // GIGA+ nao e encerramento: continua editavel e aceita observacao para os gestores.
  assert.equal((await fetch(`${baseUrl}/api/chamados/${target.id}`, { method: 'PATCH', headers, body: JSON.stringify({ reason: 'x' }) })).status, 200);
  const observation = await fetch(`${baseUrl}/api/chamados/${target.id}/observacoes`, { method: 'POST', headers, body: JSON.stringify({ text: 'GIGA+ seguindo com a equipe deles' }) });
  assert.ok(observation.status === 200 || observation.status === 201, `observacao em GIGA+ aberto (${observation.status})`);
  assert.equal(await metrics(), activeBefore - 1, 'continua fora da Visao geral');
  const reopened = await fetch(`${baseUrl}/api/chamados/${target.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'Aberto' }) });
  assert.equal(reopened.status, 200);
  assert.equal(await metrics(), activeBefore);
});

test('a card with the OS or BDESK of an existing call is not activated again', async () => {
  const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@jhtelecom.com', password: 'RedeFlow@2026' }) });
  const { token } = await login.json() as { token: string };
  const card = (id: string, ot: string, bdesk: string, olt: string) => JSON.stringify({ id, type: 'Message', chatId: '120363422003961917@g.us', isGroup: true, message: `VALIDAR COM NOC ACESSO\nOLT: ${olt}\nBDESK: ${bdesk}\nTAREFA OFFICE TRACK: ${ot}\nMOTIVO: teste` });
  const post = (body: string) => fetch(`${baseUrl}/api/integrations/wuzapi/webhook?token=test-webhook-token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  const first = await (await post(card('dup-os-1', '619990000010102', '699001', 'VIP-AAA-01'))).json() as { activationId: string };
  const accepted = await fetch(`${baseUrl}/api/acionamentos/${first.activationId}/aceitar`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  assert.equal(accepted.status, 200);
  const sameOs = await (await post(card('dup-os-2', '619990000010102', '699777', 'VIP-BBB-02'))).json() as { status: string; callId?: string };
  assert.equal(sameOs.status, 'ignored');
  assert.ok(sameOs.callId);
  const sameBdesk = await (await post(card('dup-os-3', '619990000020102', '699001', 'VIP-CCC-03'))).json() as { status: string };
  assert.equal(sameBdesk.status, 'ignored');
});
