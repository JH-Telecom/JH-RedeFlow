// Servidor local para acompanhar as mudancas ao vivo antes de irem para a main.
//   npm run preview      (ou duplo clique em "Abrir preview.bat")
//   -> http://localhost:8000   login demo: admin@jhtelecom.com / RedeFlow@2026
// Usa SEMPRE dados de demonstracao em memoria: nao le nem grava no Supabase de producao,
// mesmo que backend/.env tenha as credenciais. O frontend (Vite) recarrega sozinho a cada arquivo salvo.
import { spawn } from 'node:child_process';

const FRONT_PORT = process.env.PREVIEW_PORT || '8000';
const API_PORT = process.env.PREVIEW_API_PORT || '3333';
const npm = 'npm';

const children = [];
function run(name, color, args, env) {
  // Comando como texto unico (os argumentos sao fixos, sem espacos): evita o aviso DEP0190 do Node com shell.
  const child = spawn([npm, ...args].join(' '), { env: { ...process.env, ...env }, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const forward = (stream, target) => stream.on('data', (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) target.write(prefix + line + '\n');
  });
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  child.on('exit', (code) => { console.log(`${prefix}encerrado (codigo ${code}).`); shutdown(); });
  children.push(child);
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill();
  setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run('api', '36', ['run', 'dev', '--workspace', 'backend'], {
  PORT: API_PORT,
  REDEFLOW_RUNTIME: 'local',
  REDEFLOW_DEMO_DATA: 'true',
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  SUPABASE_SERVICE_ROLE_KEY: '',
  DATABASE_URL: '',
  WUZAPI_URL: '',
  CORS_ORIGINS: `http://localhost:${FRONT_PORT},http://127.0.0.1:${FRONT_PORT}`,
});
run('web', '35', ['run', 'dev', '--workspace', 'frontend', '--', '--port', FRONT_PORT, '--strictPort', '--host', '127.0.0.1'], {
  VITE_API_URL: `http://localhost:${API_PORT}`,
});

console.log(`\n\x1b[1mPreview local\x1b[0m: http://localhost:${FRONT_PORT}`);
console.log('Dados de demonstracao (nada vai para producao). Login: admin@jhtelecom.com / RedeFlow@2026');
console.log('As telas atualizam sozinhas a cada mudanca salva. Ctrl+C para parar.\n');
