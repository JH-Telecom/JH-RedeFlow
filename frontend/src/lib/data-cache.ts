import { useCallback, useEffect, useRef, useState } from "react";

// Ultimo resultado de cada tela (por chave: tela + periodo + area...). Ao abrir uma tela, os dados aparecem na hora
// com o que ja foi carregado e so vao ao servidor quando ficaram velhos (staleMs) e depois a cada refreshMs, com a
// aba visivel (18/11/2026: antes cada abertura de tela buscava tudo de novo).
// Fica tambem no localStorage, por usuario: depois de um F5 ou no dia seguinte a tela ja abre com o ultimo resultado
// e atualiza em seguida. Sair do sistema (logout) apaga tudo.
const MAX_ENTRIES = 60;
const MAX_STORED_CHARS = 3_000_000; // ~6 MB em UTF-16; acima disso guarda so as mais recentes
const STORAGE_PREFIX = "jh-cache:v1:";
type Entry = { value: unknown; at: number };
const store = new Map<string, Entry>();
let loadedScope: string | null = null;
let persistTimer: number | undefined;

function scope() {
  try { const token = localStorage.getItem("jh-redeflow-token"); return token ? token.slice(-16) : null; } catch { return null; }
}

// Carrega do localStorage uma vez por usuario (troca de login = outro escopo).
function ensureLoaded() {
  const current = scope();
  if (current === loadedScope) return;
  store.clear();
  loadedScope = current;
  if (!current) return;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + current);
    if (!raw) return;
    const saved = JSON.parse(raw) as Array<[string, Entry]>;
    if (Array.isArray(saved)) for (const [key, entry] of saved) if (entry && typeof entry.at === "number") store.set(key, entry);
  } catch { /* armazenamento bloqueado ou corrompido: comeca vazio */ }
}

function persistSoon() {
  if (typeof window === "undefined") return;
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    const current = scope();
    if (!current) return;
    const entries = [...store.entries()];
    try {
      // Do mais recente para o mais antigo, ate caber no limite.
      let json = JSON.stringify(entries);
      while (json.length > MAX_STORED_CHARS && entries.length) { entries.shift(); json = JSON.stringify(entries); }
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(STORAGE_PREFIX) && key !== STORAGE_PREFIX + current) localStorage.removeItem(key);
      }
      localStorage.setItem(STORAGE_PREFIX + current, json);
    } catch { /* cheio ou bloqueado: fica so em memoria */ }
  }, 800);
}

export function readDataCacheEntry<T>(key: string): { value: T; at: number } | undefined {
  ensureLoaded();
  return store.get(key) as { value: T; at: number } | undefined;
}

export function readDataCache<T>(key: string): T | undefined {
  return readDataCacheEntry<T>(key)?.value;
}

export function writeDataCache<T>(key: string, value: T) {
  ensureLoaded();
  store.delete(key);
  store.set(key, { value, at: Date.now() });
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
  persistSoon();
}

export function clearDataCache() {
  store.clear();
  loadedScope = null;
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
    }
  } catch { /* sem armazenamento */ }
}

type Options = {
  // Reconfere sozinho a cada X ms (so com a aba visivel). Padrao: 60 s.
  refreshMs?: number;
  // Ao abrir a tela, so busca de novo se o que esta guardado tem mais que isto. Padrao: igual ao refreshMs.
  staleMs?: number;
  // Reconfere quando um chamado e alterado neste navegador.
  refreshOnCallsChanged?: boolean;
  // false: nao busca nada (ex.: a tela usa outro modo de carregar).
  enabled?: boolean;
};

export const DEFAULT_REFRESH_MS = 60_000;

export function useCachedData<T>(key: string, load: () => Promise<T>, options: Options = {}) {
  const enabled = options.enabled ?? true;
  const refreshMs = options.refreshMs ?? DEFAULT_REFRESH_MS;
  const staleMs = options.staleMs ?? refreshMs;
  const [data, setData] = useState<T | undefined>(() => readDataCache<T>(key));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(() => readDataCacheEntry<T>(key)?.at ?? null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const keyRef = useRef(key);
  keyRef.current = key;

  const reload = useCallback(() => {
    const requestedKey = key;
    setLoading(true);
    return loadRef.current()
      .then((result) => {
        if (keyRef.current !== requestedKey) return;
        writeDataCache(requestedKey, result);
        // Mesmo objeto (304) = setState sem efeito, nada redesenha.
        setData(result);
        setError("");
        setUpdatedAt(Date.now());
      })
      .catch((err) => { if (keyRef.current === requestedKey) setError(err instanceof Error ? err.message : "Não foi possível carregar os dados."); })
      .finally(() => { if (keyRef.current === requestedKey) setLoading(false); });
  }, [key]);

  // Abriu a tela ou trocou o periodo/area: mostra o que ja tinha para essa chave e so busca se estiver velho.
  useEffect(() => {
    const entry = readDataCacheEntry<T>(key);
    setData(entry?.value);
    setUpdatedAt(entry?.at ?? null);
    setError("");
    if (!enabled) return;
    if (!entry || Date.now() - entry.at >= staleMs) void reload();
  }, [key, reload, enabled, staleMs]);

  // Periodico: so com a aba visivel; ao voltar para a aba, busca se ficou velho.
  useEffect(() => {
    if (!enabled || !refreshMs) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const entry = readDataCacheEntry<T>(keyRef.current);
      if (!entry || Date.now() - entry.at >= refreshMs - 1000) void reload();
    };
    const interval = window.setInterval(tick, refreshMs);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [enabled, refreshMs, reload]);

  useEffect(() => {
    if (!enabled || !options.refreshOnCallsChanged) return;
    const onChanged = () => void reload();
    window.addEventListener("jh-redeflow:calls-changed", onChanged);
    return () => window.removeEventListener("jh-redeflow:calls-changed", onChanged);
  }, [enabled, options.refreshOnCallsChanged, reload]);

  return { data, error, loading, reload, updatedAt };
}
