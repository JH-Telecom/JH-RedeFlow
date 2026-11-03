import { useEffect, useState } from "react";
import { Activity, ClipboardList } from "lucide-react";
import { api, type Activation } from "../api";

export function ActivationsPage() {
  const [activations, setActivations] = useState<Activation[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  async function load() {
    try {
      const pending = (await api.activations("Pendente")).activations.map((activation) => {
        const atrelada = activation.analysis?.atrelada;
        return typeof atrelada === "string" && atrelada
          ? { ...activation, extractedData: { ...activation.extractedData, type: `${activation.extractedData.type || "Acionamento"} · Atrelado à OS ${atrelada}` } }
          : activation;
      });
      setActivations(pending);
      setSelectedIds((current) => current.filter((id) => pending.some((activation) => activation.id === id)));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar acionamentos.");
    }
  }
  useEffect(() => { load(); }, []);
  function toggleSelection(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]);
  }
  function toggleAll() {
    setSelectedIds((current) => current.length === activations.length ? [] : activations.map((activation) => activation.id));
  }
  async function accept(ids: string[]) {
    if (!ids.length) return;
    setProcessing(true);
    try {
      await Promise.all(ids.map((id) => api.acceptActivation(id)));
      setSelectedIds([]);
      setMessage(ids.length === 1 ? "Tudo certo: o acionamento foi aceito e o chamado já está na fila operacional." : `Tudo certo: ${ids.length} acionamentos foram aceitos e os chamados já estão na fila operacional.`);
      window.setTimeout(() => setMessage(""), 3200);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel aceitar os acionamentos."); }
    finally { setProcessing(false); }
  }
  async function reject(ids: string[], rejectionReason: string) {
    if (!ids.length || !rejectionReason.trim()) return;
    setProcessing(true);
    try {
      await Promise.all(ids.map((id) => api.rejectActivation(id, rejectionReason)));
      setSelectedIds([]); setReason(""); setRejecting(null);
      setMessage(ids.length === 1 ? "Acionamento recusado com sucesso." : `${ids.length} acionamentos recusados com sucesso.`);
      window.setTimeout(() => setMessage(""), 3200);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel recusar os acionamentos."); }
    finally { setProcessing(false); }
  }
  function requestReject(ids: string[]) {
    if (!ids.length) return;
    setSelectedIds(ids);
    setRejecting(ids.length === 1 ? ids[0] : "bulk");
  }
  const allSelected = activations.length > 0 && selectedIds.length === activations.length;
  return <><div className="page-heading"><div><span className="section-kicker">MESARIOS</span><h1>Acionamentos pendentes</h1><p>Revise os dados recebidos antes de criar um chamado operacional.</p></div><div className="page-actions"><button className="secondary-button compact" onClick={() => void load()} disabled={processing}><Activity size={15}/> Atualizar</button><button className="accept-button" onClick={() => void accept(activations.map((activation) => activation.id))} disabled={processing || !activations.length}>Aceitar todos</button></div></div><section className="panel activation-panel"><div className="activation-summary"><span><b>{activations.length}</b> pendentes</span><span>Origem isolada: WuzAPI</span></div>{activations.length > 0 && <div className="activation-bulk-actions"><label className="checkbox-label"><input type="checkbox" checked={allSelected} onChange={toggleAll} /> Selecionar todos</label><span>{selectedIds.length} selecionados</span><button className="accept-button" onClick={() => void accept(selectedIds)} disabled={processing || !selectedIds.length}>Aceitar selecionados</button><button className="reject-button" onClick={() => requestReject(selectedIds)} disabled={processing || !selectedIds.length}>Recusar selecionados</button></div>}{error ? <div className="empty-state">{error}</div> : activations.length ? activations.map((activation) => <div className="activation-row" key={activation.id}><div className="activation-main"><input type="checkbox" checked={selectedIds.includes(activation.id)} onChange={() => toggleSelection(activation.id)} aria-label={`Selecionar ${activation.extractedData.orderNumber || "acionamento"}`} /><div className="activation-icon"><ClipboardList size={17}/></div><div><strong>{activation.extractedData.orderNumber || "Sem ordem identificada"}</strong><span>{activation.extractedData.type} · {activation.extractedData.bdesk || "Sem BDESK"} · recebido {new Date(activation.receivedAt).toLocaleString("pt-BR")}</span></div></div><button className="link-button" onClick={() => setExpanded(expanded === activation.id ? null : activation.id)}>Ver dados</button><button className="accept-button" onClick={() => void accept([activation.id])} disabled={processing}>Aceitar</button><button className="reject-button" onClick={() => requestReject([activation.id])} disabled={processing}>Recusar</button>{expanded === activation.id && <div className="activation-detail"><div><b>Mensagem original</b><p>{activation.originalMessage}</p></div><div className="extracted-grid">{Object.entries(activation.extractedData).filter(([, value]) => value).map(([key, value]) => <span key={key}><small>{key}</small><strong>{value}</strong></span>)}</div></div>}{rejecting === activation.id && <div className="reject-form"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo da recusa"/><button className="reject-button" onClick={() => void reject([activation.id], reason)} disabled={processing || !reason.trim()}>Confirmar recusa</button></div>}{rejecting === "bulk" && selectedIds.length > 0 && activation.id === selectedIds[0] && <div className="reject-form"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo da recusa dos selecionados"/><button className="reject-button" onClick={() => void reject(selectedIds, reason)} disabled={processing || !reason.trim()}>Confirmar recusa dos selecionados</button></div>}</div>) : <div className="empty-state">Nenhum acionamento pendente.</div>}{message && <div className="save-message">{message}</div>}</section></>;
}
