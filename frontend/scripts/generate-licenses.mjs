// Gera src/lib/third-party-licenses.json: as bibliotecas de terceiros usadas pelo sistema, com versao, licenca,
// autor e o texto da licenca. A pagina /licencas mostra esse arquivo (aviso de copyright exigido por MIT, ISC,
// Apache-2.0 etc.).
//   - "frontend": tudo o que vai junto no site (dependencias de runtime do frontend + as dependencias delas).
//   - "backend": dependencias diretas do servidor (rodam so no servidor, listadas como credito).
// Rodar depois de instalar/atualizar pacotes: node scripts/generate-licenses.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(here, '..');
const rootDir = resolve(frontendDir, '..');
const backendDir = resolve(rootDir, 'backend');
const OUTPUT = join(frontendDir, 'src', 'lib', 'third-party-licenses.json');
// Ferramentas de build: nao vao para o navegador.
const BUILD_ONLY = new Set(['vite', '@vitejs/plugin-react']);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Procura o pacote subindo as pastas node_modules a partir de quem o usa (como o Node resolve).
function findPackageDir(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function licenseText(dir) {
  const file = readdirSync(dir).find((entry) => /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i.test(entry));
  return file ? readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim() : null;
}

function licenseName(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((item) => item.type ?? item).join(' OR ');
  return 'Não informada';
}

function authorName(pkg) {
  const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
  return author ? author.replace(/\s*[<(].*$/, '').trim() : null;
}

function repoUrl(pkg) {
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const url = repo ? repo.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://').replace(/^github:/, 'https://github.com/') : pkg.homepage;
  if (!url) return null;
  return /^[\w.-]+\/[\w.-]+$/.test(url) ? `https://github.com/${url}` : url;
}

function describe(dir) {
  const pkg = readJson(join(dir, 'package.json'));
  return { name: pkg.name, version: pkg.version, license: licenseName(pkg), author: authorName(pkg), url: repoUrl(pkg), text: licenseText(dir) };
}

function collect(startNames, fromDir, transitive) {
  const seen = new Map();
  const queue = startNames.map((name) => ({ name, from: fromDir }));
  while (queue.length) {
    const { name, from } = queue.shift();
    const dir = findPackageDir(name, from);
    if (!dir) continue;
    const info = describe(dir);
    const key = `${info.name}@${info.version}`;
    if (seen.has(key)) continue;
    seen.set(key, info);
    if (!transitive) continue;
    const pkg = readJson(join(dir, 'package.json'));
    for (const dep of Object.keys(pkg.dependencies ?? {})) queue.push({ name: dep, from: dir });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const frontendPkg = readJson(join(frontendDir, 'package.json'));
const backendPkg = readJson(join(backendDir, 'package.json'));
const frontend = collect(Object.keys(frontendPkg.dependencies ?? {}).filter((name) => !BUILD_ONLY.has(name)), frontendDir, true);
const backend = collect(Object.keys(backendPkg.dependencies ?? {}), backendDir, false);

// Fontes carregadas do Google Fonts (nao estao no node_modules).
const fonts = [
  { name: 'DM Sans', version: 'Google Fonts', license: 'OFL-1.1', author: 'Colophon Foundry, Jonny Pinhorn, Indian Type Foundry', url: 'https://fonts.google.com/specimen/DM+Sans', text: null },
  { name: 'Manrope', version: 'Google Fonts', license: 'OFL-1.1', author: 'Mikhail Sharanda', url: 'https://fonts.google.com/specimen/Manrope', text: null },
];

writeFileSync(OUTPUT, `${JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), frontend, backend, fonts }, null, 1)}\n`);
const missing = [...frontend, ...backend].filter((item) => !item.text).map((item) => item.name);
console.log(`[licencas] ${frontend.length} do site, ${backend.length} do servidor, ${fonts.length} fontes -> ${OUTPUT}`);
if (missing.length) console.log(`[licencas] sem arquivo de licenca no pacote: ${missing.join(', ')}`);
