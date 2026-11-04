import { AlertTriangle, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type DueSoonResult } from "../api";

const REFRESH_MS = 60_000;
const MAX_SHOWN = 6;

function formatLeft(minutes: number) {
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

// Faixa vermelha no topo: OS que estouram as 6h nos proximos 30 min. Recalcula o "falta" a cada 30 s
// e busca a lista de novo a cada minuto. Some sozinha quando nao ha nada vencendo.
export function DueSoonBanner() {
  const navigate = useNavigate();
  const [data, setData] = useState<DueSoonResult | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;
    const load = () => api.dueSoon().then((result) => { if (active) { setData(result); setNow(Date.now()); } }).catch(() => undefined);
    void load();
    const refresh = window.setInterval(load, REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    const onChange = () => void load();
    window.addEventListener("jh-redeflow:calls-changed", onChange);
    return () => {
      active = false;
      window.clearInterval(refresh);
      window.clearInterval(tick);
      window.removeEventListener("jh-redeflow:calls-changed", onChange);
    };
  }, []);

  const windowMinutes = data?.windowMinutes ?? 30;
  const items = (data?.dueSoon ?? [])
    .map((item) => ({ ...item, left: Math.floor(6 * 60 - (now - Date.parse(item.openedAt)) / 60_000) }))
    .filter((item) => item.left > 0 && item.left <= windowMinutes);
  const visible = items.length > 0;

  useEffect(() => {
    // Avisa os cartoes de tabela (useFitToViewport) que a altura disponivel mudou.
    window.dispatchEvent(new Event("jh-redeflow:layout-change"));
  }, [visible]);

  if (!visible) return null;
  // "Ver fila" vai para a aba onde o chamado mais urgente esta: sem tecnico -> Chamados abertos;
  // com tecnico (Atribuido/Deslocamento/Em campo) -> Em atendimento.
  const queueFor = (item: { technicianName?: string }) => (item.technicianName ? "/chamados/atendimento" : "/chamados/abertos");
  const queuePath = queueFor(items[0]);
  const queueLabel = queuePath === "/chamados/abertos" ? "Ver em Chamados abertos" : "Ver em Em atendimento";
  return (
    <div className="due-soon-banner" role="alert">
      <AlertTriangle size={16} aria-hidden="true" />
      <strong>{items.length === 1 ? "1 OS vence" : `${items.length} OS vencem`} em menos de 30 min</strong>
      <div className="due-soon-list">
        {items.slice(0, MAX_SHOWN).map((item) => (
          <button key={item.id} type="button" onClick={() => navigate(`/chamados/${item.id}`)} title={`${item.type} · ${item.region} · ${item.technicianName || "sem técnico"}`}>
            {item.orderNumber} <b>({formatLeft(item.left)})</b>
          </button>
        ))}
        {items.length > MAX_SHOWN && <span>+{items.length - MAX_SHOWN}</span>}
      </div>
      <button type="button" className="due-soon-open" onClick={() => navigate(queuePath)} title={queueLabel}>{queueLabel} <ChevronRight size={14} /></button>
    </div>
  );
}
