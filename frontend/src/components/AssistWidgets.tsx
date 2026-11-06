import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api, type CallRisk, type TechnicianSuggestion } from "../api";

// Lote B: sugestao de tecnico no detalhe do chamado e selo de risco na fila.

// Os 3 tecnicos sugeridos (livres, que ja atenderam a regiao/OLT, com bom % no prazo). Clicar so escolhe no
// seletor; a atribuicao vale ao salvar, como sempre. Sem permissao de atribuir (403), nao aparece.
export function TechnicianSuggestions({ callId, selected, onPick }: { callId: string; selected: string; onPick: (technicianId: string) => void }) {
  const [items, setItems] = useState<TechnicianSuggestion[] | null>(null);
  useEffect(() => {
    let active = true;
    api.technicianSuggestions(callId).then((data) => { if (active) setItems(data.suggestions); }).catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, [callId]);
  if (!items?.length) return null;
  return (
    <div className="ts-box" aria-label="Técnicos sugeridos">
      <span className="ts-title"><Sparkles size={13} aria-hidden="true" /> Sugeridos para este chamado</span>
      {items.map((item) => (
        <button key={item.technicianId} type="button" className={`ts-item${selected === item.technicianId ? " is-selected" : ""}`} onClick={() => onPick(item.technicianId)} aria-pressed={selected === item.technicianId}>
          <strong>{item.name}</strong>
          <small>{item.reasons.join(" · ")}</small>
        </button>
      ))}
    </div>
  );
}

export function RiskBadge({ risk }: { risk?: CallRisk }) {
  if (!risk || risk.level === "baixo") return null;
  return <span className={`call-badge risk-${risk.level}`} title={risk.reasons.length ? `Por quê: ${risk.reasons.join("; ")}` : "Estimado pelo histórico dos últimos 90 dias"}>Risco {risk.level === "alto" ? "alto" : "médio"} {risk.percent}%</span>;
}
