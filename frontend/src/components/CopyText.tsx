import { useState, type ReactNode } from "react";

// Texto que copia ao clicar (ex.: numero do chamado na fila). Nao abre o chamado: so copia e mostra "Copiado".
export function CopyText({ value, className = "", label, children }: { value: string; className?: string; label?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  async function copy(event: React.MouseEvent | React.KeyboardEvent) {
    event.stopPropagation();
    event.preventDefault();
    try { await navigator.clipboard.writeText(value); }
    catch {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button type="button" className={`copy-text ${className}${copied ? " is-copied" : ""}`.trim()} title={`Clique para copiar ${label || value}`} aria-label={`Copiar ${label || value}`}
      onClick={(event) => void copy(event)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") void copy(event); else event.stopPropagation(); }}>
      {children ?? value}
      <span className="copy-text-tip" aria-live="polite">{copied ? "Copiado" : ""}</span>
    </button>
  );
}
