import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

// Extensao do Chrome para baixar pelo sistema (Configuracoes -> Extensao do Chrome). O servidor monta o .zip na hora a
// partir da pasta extensao-rede do repositorio (a mesma que esta no deploy), entao o download sempre e a versao atual.
// Zip simples (deflate), sem dependencia nova; dentro dele tudo fica numa pasta "jh-redeflow-extensao".

const ZIP_FOLDER = 'jh-redeflow-extensao';

export function extensionDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.EXTENSION_DIR,
    resolve(process.cwd(), 'extensao-rede'),
    resolve(process.cwd(), '..', 'extensao-rede'),
    resolve(here, '..', '..', 'extensao-rede'),
  ].filter(Boolean) as string[];
  return candidates.find((dir) => existsSync(join(dir, 'manifest.json'))) ?? null;
}

export function extensionInfo() {
  const dir = extensionDir();
  if (!dir) return null;
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { name?: string; version?: string };
  return { name: manifest.name || 'JH RedeFlow', version: manifest.version || '0.0.0', fileName: `jh-redeflow-extensao-${manifest.version || 'atual'}.zip` };
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
export function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date: Date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export function buildZip(files: { name: string; data: Buffer; modified?: Date }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const compressed = deflateRawSync(file.data);
    const crc = crc32(file.data);
    const { time, day } = dosTime(file.modified ?? new Date());
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(day, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(file.data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12); central.writeUInt16LE(day, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(file.data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + compressed.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

let cached: { key: string; zip: Buffer } | null = null;
export function buildExtensionZip(): Buffer | null {
  const dir = extensionDir();
  if (!dir) return null;
  const files = listFiles(dir);
  const key = files.map((file) => `${file}:${statSync(file).mtimeMs}`).join('|');
  if (cached?.key === key) return cached.zip;
  const zip = buildZip(files.map((file) => ({ name: `${ZIP_FOLDER}/${relative(dir, file).split('\\').join('/')}`, data: readFileSync(file), modified: statSync(file).mtime })));
  cached = { key, zip };
  return zip;
}
