import { useEffect, useRef } from "react";
import { readDataCacheEntry, DEFAULT_REFRESH_MS } from "./data-cache";

// Telas com carregamento proprio (18/11/2026): mostram o que ja foi guardado (readDataCache no useState inicial; o
// load grava com writeDataCache) e este hook so busca ao abrir se o guardado estiver velho, e depois a cada
// refreshMs com a aba visivel (ao voltar para a aba, se ficou velho).
export function usePeriodicLoad(key: string, load: () => unknown, refreshMs = DEFAULT_REFRESH_MS) {
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    const stale = () => { const entry = readDataCacheEntry(key); return !entry || Date.now() - entry.at >= refreshMs - 1000; };
    if (stale()) void loadRef.current();
    const tick = () => { if (document.visibilityState === "visible" && stale()) void loadRef.current(); };
    const interval = window.setInterval(tick, refreshMs);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", tick); };
  }, [key, refreshMs]);
}
