import { useEffect, useState } from "react";

// Dados por chamado que a fila busca em lote (ultima observacao, reincidencia, risco). Guarda por id por 1 min: trocar
// de filtro, pesquisar ou mudar de pagina so busca os ids que ainda nao tem (18/11/2026: antes, tudo de novo a cada
// troca). Quando um chamado muda neste navegador, tudo fica velho e e buscado de novo.
type Entry = { value: unknown; at: number };
const caches = new Map<string, Map<string, Entry>>();
let generation = 0;
if (typeof window !== "undefined") window.addEventListener("jh-redeflow:calls-changed", () => { caches.clear(); generation += 1; });

export function useIdBatch<T>(kind: string, ids: string[], fetchMany: (ids: string[]) => Promise<Record<string, T>>, ttlMs = 60_000): Record<string, T> {
  const [, setVersion] = useState(0);
  const idsKey = ids.join(",");
  useEffect(() => {
    const cache = caches.get(kind) ?? new Map<string, Entry>();
    caches.set(kind, cache);
    const now = Date.now();
    const missing = ids.filter((id) => { const entry = cache.get(id); return !entry || now - entry.at > ttlMs; });
    if (!missing.length) return;
    let active = true;
    const startedAt = generation;
    fetchMany(missing).then((found) => {
      if (startedAt !== generation) return;
      const at = Date.now();
      for (const id of missing) cache.set(id, { value: found[id] ?? null, at });
      if (active) setVersion((value) => value + 1);
    }).catch(() => undefined);
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, idsKey, ttlMs, generation]);
  const cache = caches.get(kind);
  const result: Record<string, T> = {};
  for (const id of ids) { const value = cache?.get(id)?.value; if (value !== null && value !== undefined) result[id] = value as T; }
  return result;
}
