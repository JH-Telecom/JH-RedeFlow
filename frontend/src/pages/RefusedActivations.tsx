import { useEffect, useState, type ReactNode } from "react";
import { Activity, Ban, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { api, type Activation } from "../api";
import { Pager, usePaged } from "../components/Pager";
import { ACTIVATIONS_CHANGED } from "../components/ActivationToast";

// Historico de acionamentos recusados (11/11/2026): os 100 mais recentes, com quem recusou, quando e o motivo.
// "Aceitar mesmo assim" corrige uma recusa errada: cria o chamado (ou liga ao que ja existe com a mesma OS) e o
// chamado ganha uma observacao contando a recusa.
type Refused = Activation & { decisionByName?: string | null };
const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export function RefusedActivations({ tabs, canDecide }: { tabs: ReactNode; canDecide: boolean }) {
  const [items, setItems] = useState<Refused[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; callId?: string; order?: string; message: string } | null>(null);

  async function load() {
    try { setItems((await api.activations("Recusado")).activations as Refused[]); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar os recusados."); }
  }
  useEffect(() => { void load(); }, []);

  async function accept(item: Refused) {
    setBusy(item.id); setDone(null);
    try {
      const result = await api.reacceptActivation(item.id);
      setItems((current) => current?.filter((row) => row.id !== item.id) ?? null);
      setDone({ id: item.id, callId: result.call?.id, order: result.call?.orderNumber, message: result.call ? `Acionamento aceito. Chamado ${result.call.orderNumber} criado (ou ligado ao que já existia com a mesma OS).` : "Acionamento aceito." });
      window.dispatchEvent(new Event(ACTIVATIONS_CHANGED));
    } catch (err) { setDone({ id: item.id, message: err instanceof Error ? err.message : "Não foi possível aceitar." }); }
    finally { setBusy(null); setConfirming(null); }
  }

  const visible = (items ?? []).filter((item) => !search.trim() || normalize([item.extractedData.orderNumber, item.extractedData.bdesk, item.extractedData.type, item.rejectionReason, item.decisionByName, item.originalMessage].filter(Boolean).join(" ")).includes(normalize(search.trim())));
  const paged = usePaged(visible, search);

  return (
    <>
      <div className="page-heading">
        <div><span className="section-kicker">MESARIOS</span><h1>Acionamentos recusados</h1><p>Os 100 mais recentes. Se algum foi recusado por engano, aceite por aqui: o chamado é criado normalmente.</p></div>
        <div className="page-actions">{tabs}<button className="secondary-button compact" onClick={() => void load()}><Activity size={15} /> Atualizar</button></div>
      </div>
      <section className="panel activation-panel">
        <div className="activation-summary">
          <span><b>{items?.length ?? 0}</b> recusados</span>
          <label className="ra-search"><Search size={14} aria-hidden="true" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar" aria-label="Pesquisar recusados (ordem, BDESK, motivo, quem recusou)" /></label>
        </div>
        {done && <div className={done.callId ? "save-message" : "form-error"} role="status">{done.message}{done.callId && <> <Link to={`/chamados/${done.callId}`}>Abrir chamado {done.order}</Link></>}</div>}
        {error ? <div className="empty-state">{error}</div> : !items ? <div className="empty-state">Carregando...</div> : visible.length === 0 ? <div className="empty-state">{search ? "Nada encontrado." : "Nenhum acionamento recusado."}</div> : paged.pageItems.map((item) => (
          <div className="activation-row ra-row" key={item.id}>
            <div className="activation-main">
              <div className="activation-icon ra-icon"><Ban size={17} /></div>
              <div>
                <strong>{item.extractedData.orderNumber || "Sem ordem identificada"}</strong>
                <span>{item.extractedData.type || "Sem tipo"} · {item.extractedData.bdesk || "Sem BDESK"} · recebido {when(item.receivedAt)}</span>
                <span className="ra-refusal">Recusado {when(item.decisionAt)}{item.decisionByName ? ` por ${item.decisionByName}` : ""}{item.rejectionReason ? ` · Motivo: ${item.rejectionReason}` : ""}</span>
              </div>
            </div>
            <button className="link-button" onClick={() => setExpanded(expanded === item.id ? null : item.id)}>Ver dados</button>
            {canDecide && (confirming === item.id
              ? <><button className="accept-button" onClick={() => void accept(item)} disabled={busy === item.id}>{busy === item.id ? "Aceitando..." : "Confirmar aceite"}</button><button className="secondary-button compact" onClick={() => setConfirming(null)} disabled={busy === item.id}>Cancelar</button></>
              : <button className="accept-button" onClick={() => setConfirming(item.id)}>Aceitar mesmo assim</button>)}
            {expanded === item.id && <div className="activation-detail"><div><b>Mensagem original</b><p>{item.originalMessage}</p></div><div className="extracted-grid">{Object.entries(item.extractedData).filter(([, value]) => value).map(([key, value]) => <span key={key}><small>{key}</small><strong>{value}</strong></span>)}</div></div>}
          </div>
        ))}
        <Pager {...paged} noun={["acionamento", "acionamentos"]} />
      </section>
    </>
  );
}
