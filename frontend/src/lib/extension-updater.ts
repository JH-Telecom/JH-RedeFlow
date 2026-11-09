import { downloadExtensionZip } from "../api";

// Atualiza a pasta da extensao do Chrome direto pelo sistema (Configuracoes -> Extensao do Chrome).
// Usa o acesso a pastas do Chrome/Edge (File System Access): na primeira vez a pessoa escolhe a pasta da extensao
// (jh-redeflow-extensao) e autoriza; o sistema lembra a pasta (IndexedDB) e nas proximas so pede para confirmar.
// Baixa o .zip da versao atual, descompacta no navegador e grava os arquivos por cima dos antigos.

type DirHandle = {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ getFile(): Promise<File>; createWritable(): Promise<{ write(data: Blob | BufferSource): Promise<void>; close(): Promise<void> }> }>;
  queryPermission?(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(options: { mode: "readwrite" }): Promise<PermissionState>;
};
type PickerWindow = Window & { showDirectoryPicker?: (options?: { id?: string; mode?: "readwrite" }) => Promise<DirHandle> };

const ZIP_FOLDER = "jh-redeflow-extensao/";

export function canUpdateFolder() {
  return typeof (window as PickerWindow).showDirectoryPicker === "function" && typeof DecompressionStream !== "undefined";
}

// ---------- pasta lembrada (IndexedDB guarda o "atalho" para a pasta, nao os arquivos) ----------
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("jh-redeflow", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("pastas");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}
async function savedFolder(): Promise<DirHandle | null> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const request = db.transaction("pastas").objectStore("pastas").get("extensao");
      request.onsuccess = () => resolve((request.result as DirHandle) || null);
      request.onerror = () => resolve(null);
    });
  } catch { return null; }
}
async function saveFolder(handle: DirHandle) {
  try {
    const db = await idb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("pastas", "readwrite");
      tx.objectStore("pastas").put(handle, "extensao");
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* sem IndexedDB: pede a pasta de novo na proxima vez */ }
}
export async function forgetFolder() {
  try { const db = await idb(); db.transaction("pastas", "readwrite").objectStore("pastas").delete("extensao"); } catch { /* nada */ }
}

// ---------- zip (formato do servidor: deflate ou guardado) ----------
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function unzip(buffer: ArrayBuffer): Promise<{ name: string; data: Uint8Array }[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let end = -1;
  for (let index = bytes.length - 22; index >= 0; index -= 1) if (view.getUint32(index, true) === 0x06054b50) { end = index; break; }
  if (end < 0) throw new Error("O arquivo baixado não é um .zip válido.");
  const count = view.getUint16(end + 10, true);
  let pointer = view.getUint32(end + 16, true);
  const files: { name: string; data: Uint8Array }[] = [];
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index += 1) {
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(start, start + compressedSize);
    if (!name.endsWith("/")) files.push({ name, data: method === 8 ? await inflate(raw) : raw.slice() });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

// ---------- escolher/conferir a pasta ----------
async function readManifest(folder: DirHandle): Promise<{ name?: string; version?: string } | null> {
  try { return JSON.parse(await (await (await folder.getFileHandle("manifest.json")).getFile()).text()); }
  catch { return null; }
}
// Aceita a pasta da extensao ou a pasta de cima (que tem jh-redeflow-extensao dentro).
async function extensionFolder(chosen: DirHandle): Promise<DirHandle> {
  const own = await readManifest(chosen);
  if (own?.name?.includes("JH RedeFlow")) return chosen;
  try {
    const inner = await chosen.getDirectoryHandle("jh-redeflow-extensao");
    const manifest = await readManifest(inner);
    if (manifest?.name?.includes("JH RedeFlow")) return inner;
  } catch { /* nao tem a subpasta */ }
  throw new Error('Essa pasta não é a da extensão. Escolha a pasta "jh-redeflow-extensao" (a que tem o arquivo manifest.json).');
}
async function folderWithPermission(): Promise<DirHandle> {
  const saved = await savedFolder();
  if (saved?.queryPermission && saved.requestPermission) {
    const state = await saved.queryPermission({ mode: "readwrite" });
    if (state === "granted" || (await saved.requestPermission({ mode: "readwrite" })) === "granted") return saved;
  }
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("Este navegador não deixa atualizar a pasta. Use o Chrome ou o Edge, ou baixe o .zip.");
  return picker({ id: "jh-redeflow-extensao", mode: "readwrite" });
}

async function writeFile(root: DirHandle, path: string, data: Uint8Array) {
  const parts = path.split("/").filter(Boolean);
  let folder = root;
  for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: true });
  const writable = await (await folder.getFileHandle(parts[parts.length - 1], { create: true })).createWritable();
  await writable.write(new Blob([data as BlobPart]));
  await writable.close();
}

export async function updateExtensionFolder(): Promise<{ from: string | null; to: string; files: number; folder: string }> {
  const folder = await extensionFolder(await folderWithPermission());
  const before = (await readManifest(folder))?.version || null;
  const { blob } = await downloadExtensionZip();
  const files = (await unzip(await blob.arrayBuffer())).filter((file) => file.name.startsWith(ZIP_FOLDER));
  if (!files.some((file) => file.name === `${ZIP_FOLDER}manifest.json`)) throw new Error("O .zip baixado veio sem o manifest.json.");
  for (const file of files) await writeFile(folder, file.name.slice(ZIP_FOLDER.length), file.data);
  await saveFolder(folder);
  const after = (await readManifest(folder))?.version || "?";
  return { from: before, to: after, files: files.length, folder: folder.name };
}

// ---------- conversa com a extensao instalada (content script sistema-ponte.js) ----------
type BridgeMessage = { fonte?: string; tipo?: string; versao?: string };
export function askInstalledVersion(timeoutMs = 1500): Promise<string | null> {
  return new Promise((resolve) => {
    const done = (value: string | null) => { window.removeEventListener("message", listener); clearTimeout(timer); resolve(value); };
    const listener = (event: MessageEvent<BridgeMessage>) => { if (event.source === window && event.data?.fonte === "jh-redeflow-extensao" && event.data.tipo === "versao") done(event.data.versao || null); };
    const timer = window.setTimeout(() => done(null), timeoutMs);
    window.addEventListener("message", listener);
    window.postMessage({ fonte: "jh-redeflow-sistema", tipo: "versaoExtensao" }, window.location.origin);
  });
}
export function reloadInstalledExtension(timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (value: boolean) => { window.removeEventListener("message", listener); clearTimeout(timer); resolve(value); };
    const listener = (event: MessageEvent<BridgeMessage>) => { if (event.source === window && event.data?.fonte === "jh-redeflow-extensao" && event.data.tipo === "recarregando") done(true); };
    const timer = window.setTimeout(() => done(false), timeoutMs);
    window.addEventListener("message", listener);
    window.postMessage({ fonte: "jh-redeflow-sistema", tipo: "recarregarExtensao" }, window.location.origin);
  });
}
