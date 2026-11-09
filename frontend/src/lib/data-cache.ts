import { useCallback, useEffect, useRef, useState } from "react";

// Ultimo resultado de cada painel/relatorio (por chave: tela + periodo + area...). Ao voltar para uma tela, os
// numeros aparecem na hora com o que ja foi carregado e sao conferidos com o servidor em segundo plano. Se nada
// mudou, o servidor responde 304 e a tela nem redesenha. So em memoria (some ao sair ou fechar a aba).
const MAX_ENTRIES = 60;
const store = new Map<string, unknown>();

export function readDataCache<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function writeDataCache<T>(key: string, value: T) {
  store.delete(key);
  store.set(key, value);
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value as string);
}

export function clearDataCache() {
  store.clear();
}

type Options = {
  // Reconfere sozinho a cada X ms (so com a aba visivel).
  refreshMs?: number;
  // Reconfere quando um chamado e alterado neste navegador.
  refreshOnCallsChanged?: boolean;
};

export function useCachedData<T>(key: string, load: () => Promise<T>, options: Options = {}) {
  const [data, setData] = useState<T | undefined>(() => readDataCache<T>(key));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
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

  // Trocou o periodo/area: mostra o que ja tinha para essa chave (ou nada) e busca.
  useEffect(() => {
    setData(readDataCache<T>(key));
    setError("");
    void reload();
  }, [key, reload]);

  useEffect(() => {
    if (!options.refreshMs) return;
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void reload(); }, options.refreshMs);
    const onVisible = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [options.refreshMs, reload]);

  useEffect(() => {
    if (!options.refreshOnCallsChanged) return;
    const onChanged = () => void reload();
    window.addEventListener("jh-redeflow:calls-changed", onChanged);
    return () => window.removeEventListener("jh-redeflow:calls-changed", onChanged);
  }, [options.refreshOnCallsChanged, reload]);

  return { data, error, loading, reload, updatedAt };
}
