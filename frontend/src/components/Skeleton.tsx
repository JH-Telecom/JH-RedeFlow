// Esqueleto de carregamento (18/11/2026): no lugar de "Carregando...", o formato da tela ja aparece com linhas
// cinzas pulsando e os dados entram por cima, sem a pagina pular. O texto fica so para leitor de tela.

type SkeletonProps = { rows?: number; label?: string; columns?: number };

export function SkeletonRows({ rows = 6, label = "Carregando...", columns = 4 }: SkeletonProps) {
  return (
    <div className="sk-list" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, row) => (
        <div className="sk-row" key={row} aria-hidden="true" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, column) => <span key={column} className="sk-bar" style={{ width: `${[92, 70, 84, 58, 76][(row + column) % 5]}%` }} />)}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4, label = "Carregando..." }: { count?: number; label?: string }) {
  return (
    <div className="sk-cards" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <div className="sk-card" key={index} aria-hidden="true"><span className="sk-bar" style={{ width: "40%" }} /><span className="sk-bar sk-big" style={{ width: "55%" }} /><span className="sk-bar" style={{ width: "75%" }} /></div>
      ))}
    </div>
  );
}

// Tela inteira (troca de aba enquanto o codigo da pagina baixa): titulo, cartoes e uma tabela.
export function PageSkeleton() {
  return (
    <div className="sk-page">
      <div className="sk-heading" aria-hidden="true"><span className="sk-bar" style={{ width: 90 }} /><span className="sk-bar sk-title" style={{ width: 260 }} /></div>
      <SkeletonCards count={4} label="Abrindo a tela..." />
      <div className="sk-panel" aria-hidden="true"><SkeletonRows rows={7} columns={5} label="" /></div>
    </div>
  );
}
