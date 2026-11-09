import { useEffect, useMemo, useState } from "react";

// Paginacao padrao das listas: no maximo 100 linhas por pagina (listas grandes travavam o navegador).
// Mesmo visual da paginacao das filas de chamados. `resetKey` volta para a pagina 1 quando filtros mudam.
export const LIST_PAGE_SIZE = 100;

export function usePaged<T>(items: T[], resetKey: unknown = null, pageSize = LIST_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => { setPage(1); }, [resetKey]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);
  return { page, setPage, totalPages, total: items.length, pageItems, from: items.length ? (page - 1) * pageSize + 1 : 0, to: Math.min(items.length, page * pageSize) };
}

export function Pager({ page, totalPages, total, from, to, setPage, noun = ["item", "itens"] }: { page: number; totalPages: number; total: number; from: number; to: number; setPage: (page: number) => void; noun?: [string, string] }) {
  if (totalPages <= 1) return null;
  return (
    <div className="calls-pagination list-pager">
      <span>{from.toLocaleString("pt-BR")}–{to.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")} {total === 1 ? noun[0] : noun[1]}</span>
      <div className="calls-pagination-controls">
        <button className="secondary-button compact" type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="Página anterior">Anterior</button>
        <span aria-live="polite">Página {page.toLocaleString("pt-BR")} de {totalPages.toLocaleString("pt-BR")}</span>
        <button className="secondary-button compact" type="button" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} aria-label="Próxima página">Próxima</button>
      </div>
    </div>
  );
}
