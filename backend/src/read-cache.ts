import type { NextFunction, Request, Response } from 'express';

// Cache dos paineis e relatorios (so leitura). Cada resposta fica guardada por pessoa + endereco completo
// (periodo, area...) e vale enquanto nenhum dado mudar: qualquer gravacao bem-sucedida na API (POST/PUT/PATCH/DELETE,
// inclusive o webhook do WhatsApp e o envio da extensao) invalida tudo. As rotinas de fundo gravam direto no banco,
// por isso o cache tambem expira sozinho depois de READ_CACHE_TTL_MS.
export const READ_CACHE_TTL_MS = 20_000;
const MAX_ENTRIES = 300;

type Entry = { body: unknown; status: number; at: number; version: number };
const entries = new Map<string, Entry>();
let dataVersion = 0;

const dataChangeListeners: (() => void)[] = [];
export function onDataChange(listener: () => void) {
  dataChangeListeners.push(listener);
}
export function bumpDataVersion() {
  dataVersion += 1;
  for (const listener of dataChangeListeners) listener();
}

export function clearReadCache() {
  entries.clear();
}

export function readCacheSize() {
  return entries.size;
}

// Middleware global: depois de uma gravacao que deu certo, os paineis precisam recalcular.
export function invalidateOnWrite(request: Request, response: Response, next: NextFunction) {
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
    response.on('finish', () => {
      if (response.statusCode < 400) bumpDataVersion();
    });
  }
  next();
}

// Middleware de rota: usar depois de auth/requirePermission (a pessoa ja foi validada).
export function cacheReadModel(request: Request & { authUser?: { id: string } }, response: Response, next: NextFunction) {
  if (request.method !== 'GET' || !request.authUser) return next();
  const key = `${request.authUser.id}|${request.originalUrl}`;
  const now = Date.now();
  const hit = entries.get(key);
  if (hit && hit.version === dataVersion && now - hit.at < READ_CACHE_TTL_MS) {
    response.setHeader('X-Read-Cache', 'hit');
    return response.status(hit.status).json(hit.body);
  }
  const versionAtStart = dataVersion;
  const send = response.json.bind(response);
  response.json = (body: unknown) => {
    // Se algo foi gravado enquanto calculava, o resultado pode estar velho: entrega, mas nao guarda.
    if (response.statusCode < 400 && versionAtStart === dataVersion) {
      entries.delete(key);
      entries.set(key, { body, status: response.statusCode, at: Date.now(), version: versionAtStart });
      while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
    }
    response.setHeader('X-Read-Cache', 'miss');
    return send(body);
  };
  next();
}
