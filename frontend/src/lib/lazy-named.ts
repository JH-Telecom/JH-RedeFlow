import { lazy, type ComponentType } from "react";

// React.lazy para exports com nome (as telas do sistema exportam `export function XPage`).
// Se o arquivo da tela sumiu depois de uma publicacao nova (aba aberta ha muito tempo), recarrega a pagina uma vez.
export function lazyNamed<M extends Record<string, unknown>, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(async () => {
    try {
      const module = await load();
      try { sessionStorage.removeItem("lazy-reload"); } catch { /* sem armazenamento */ }
      return { default: module[name] as ComponentType<any> };
    } catch (error) {
      let reloaded = false;
      try { reloaded = sessionStorage.getItem("lazy-reload") === "1"; sessionStorage.setItem("lazy-reload", "1"); } catch { /* sem armazenamento */ }
      if (!reloaded) { window.location.reload(); return new Promise<never>(() => undefined); }
      throw error;
    }
  });
}
