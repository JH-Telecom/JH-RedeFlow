import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Download, FileText, Paperclip, X } from "lucide-react";
import { api, type Call, type CallAuditLog, type CallObservation, type CallStatus, type RepeatHistory, type Technician } from "../api";
import { toLocalDateTimeInput } from "../components/call-cells";
import { DetailItem, EditableDetailItem } from "../components/ui";
import { MentionTextarea, withMentions } from "../components/MentionTextarea";
import { TechnicianSuggestions } from "../components/AssistWidgets";
import { CallTimeline } from "../components/CallTimeline";
import { ChecklistBox } from "../components/FieldAdmin";
import { checklistForType, type ChecklistTemplate } from "../api";
import { operationalRegions } from "../lib/constants";

// Tempo entre o evento informado no card e o envio do card no grupo (abertura).
function formatEventGap(eventAt: string, openedAt: string) {
  const minutes = Math.round((new Date(openedAt).getTime() - new Date(eventAt).getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 0) return "Evento depois da abertura";
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

const CLOSED_STATUSES: CallStatus[] = ["Finalizado", "Cancelado", "Baixar"];
// Chave de lista do OFS (ex.: "13", "CTO_SEM_SINAL_EVENTO_PRODUTIVO") nao serve de Resultado.
const looksLikeCode = (value?: string) => /^\d+$/.test(value?.trim() || "") || /^[A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(value?.trim() || "");
// Resultado sugerido ao finalizar: o que ja houver (se for texto) ou "Motivo — Submotivo" do fechamento do OFS.
function defaultResult(call: Call) {
  if (call.result?.trim() && !looksLikeCode(call.result)) return call.result.trim();
  return [call.closingReason, call.closingSubreason].filter((part) => part?.trim() && !looksLikeCode(part)).join(" — ");
}

// Resultado e observacao final num campo so ao finalizar: a primeira linha e o Resultado (ate 255, usado nos
// relatorios) e o texto inteiro e a observacao final.
function splitFinishText(text: string) {
  const full = text.trim();
  const firstLine = full.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || full;
  return { result: firstLine.slice(0, 255), notes: full };
}

// Ordem a que este chamado esta atrelado: copiar (para conferir no OFS) ou abrir o chamado dela, se existir aqui.
function LinkedOrderItem({ order }: { order: string }) {
  const navigate = useNavigate();
  const [feedback, setFeedback] = useState("");
  const [opening, setOpening] = useState(false);
  const show = (text: string) => { setFeedback(text); window.setTimeout(() => setFeedback(""), 2500); };
  async function copy() {
    try { await navigator.clipboard.writeText(order); show("Copiada"); } catch { show("Não consegui copiar"); }
  }
  async function open() {
    setOpening(true);
    try {
      const { calls } = await api.calls(undefined, { search: order, page: 1, pageSize: 10 });
      const linked = calls.find((item) => item.orderNumber === order || item.officeTrack === order || item.bdesk === order);
      if (linked) navigate(`/chamados/${linked.id}`);
      else show("Essa ordem não está no sistema");
    } catch { show("Não consegui buscar a ordem"); }
    finally { setOpening(false); }
  }
  return (
    <div className="detail-item linked-order-item">
      <span>Ordem atrelada</span>
      <strong>{order}</strong>
      <div className="linked-order-actions">
        <button type="button" onClick={() => void copy()}>Copiar</button>
        <button type="button" onClick={() => void open()} disabled={opening}>{opening ? "Abrindo..." : "Abrir"}</button>
        {feedback && <small role="status">{feedback}</small>}
      </div>
    </div>
  );
}

export function CallDetailBase() {
  const { pathname, search } = useLocation();
  const id = pathname.split("/").pop()!;
  const teamScoped = new URLSearchParams(search).get("teamScope") === "true";
  const [call, setCall] = useState<Call | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [status, setStatus] = useState<CallStatus>("Aberto");
  const [technicianId, setTechnicianId] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [bdesk, setBdesk] = useState("");
  const [officeTrack, setOfficeTrack] = useState("");
  const [client, setClient] = useState("");
  const [type, setType] = useState("");
  const [reason, setReason] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [bairro, setBairro] = useState("");
  const [olt, setOlt] = useState("");
  const [slotPon, setSlotPon] = useState("");
  const [openedAt, setOpenedAt] = useState("");
  const [saving, setSaving] = useState(false);
  // Encerramento no proprio card de Atendimento: os campos aparecem conforme o status escolhido.
  const [result, setResult] = useState("");
  // Checklist do tipo do chamado (Configuracoes): itens a marcar antes de finalizar.
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
  const [checkedItems, setCheckedItems] = useState<string[]>([]);
  useEffect(() => { api.checklists().then((data) => setChecklistTemplates(data.templates)).catch(() => undefined); }, []);
  const checklist = call ? checklistForType(call.type, checklistTemplates) : null;
  const [executedAt, setExecutedAt] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [canDeleteCall, setCanDeleteCall] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    try {
      const raw = localStorage.getItem("jh-redeflow-session");
      const session = raw ? JSON.parse(raw) : null;
      setCanDeleteCall(Boolean(session?.user?.role?.permissions?.includes("calls.delete")));
    } catch {
      setCanDeleteCall(false);
    }
  }, []);
  useEffect(() => {
    Promise.all([api.call(id, { teamScope: teamScoped }), api.technicians()]).then(
      ([callData, technicianData]) => {
        setCall(callData.call);
        setStatus(callData.call.status);
        setResult(defaultResult(callData.call));
        // Concluido no OFS: a data de execucao ja vem preenchida com a Data Fim do OFS.
        setExecutedAt(callData.call.executedAt ? toLocalDateTimeInput(callData.call.executedAt) : "");
        setTechnicianId(callData.call.technicianId || "");
        setNotes(callData.call.notes);
        setOpenedAt(toLocalDateTimeInput(callData.call.openedAt));
        setOrderNumber(callData.call.orderNumber); setBdesk(callData.call.bdesk); setOfficeTrack(callData.call.officeTrack); setClient(callData.call.client); setType(callData.call.type); setReason(callData.call.reason); setRegion(callData.call.region); setCity(callData.call.city); setAddress(callData.call.address || ""); setBairro(callData.call.bairro || ""); setOlt(callData.call.olt); setSlotPon(callData.call.slotPon);
        setTechnicians(technicianData.technicians);
      },
    );
  }, [id]);
  if (!call) return <div className="empty-state">Carregando chamado...</div>;
  async function save() {
    const openingDate = new Date(openedAt);
    if (!openedAt || Number.isNaN(openingDate.getTime())) {
      setMessage("Informe uma data e hora de abertura validas.");
      return;
    }
    const current = call!;
    const wasClosed = CLOSED_STATUSES.includes(current.status);
    const finishing = status === "Finalizado" && !wasClosed;
    const cancelling = status === "Cancelado" && !wasClosed;
    setMessage("");
    setMissing([]);
    if (wasClosed && status === current.status) {
      setMessage("Chamado encerrado: troque o status para reabrir ou mudar o encerramento.");
      return;
    }
    const executionDate = new Date(executedAt);
    if (finishing) {
      const pending = [!technicianId && "Tecnico", (!executedAt || Number.isNaN(executionDate.getTime())) && "Data e hora de execucao", !result.trim() && "Resultado e observacao", ...(checklist ? checklist.items.filter((item) => !checkedItems.includes(item)).map((item) => `Checklist: ${item}`) : [])].filter(Boolean) as string[];
      if (pending.length) { setMissing(pending); setMessage("Preencha os campos para finalizar."); return; }
    }
    if (cancelling && cancelReason.trim().length < 3) { setMessage("Informe o motivo do cancelamento."); return; }
    setSaving(true);
    try {
      const fields = { orderNumber, bdesk, officeTrack, client, type, reason, region, city, address, bairro, olt, slotPon, technicianId: technicianId || null, openedAt: openingDate.toISOString(), notes };
      if (finishing || cancelling) {
        // Primeiro salva os dados (ex.: tecnico escolhido agora), depois encerra.
        await api.updateCall(id, { ...fields, status: current.status });
        if (finishing) await api.finishCall(id, { ...splitFinishText(result), executedAt: executionDate.toISOString(), checklist: checkedItems });
        else await api.cancelCall(id, cancelReason.trim());
        setMessage(finishing ? "Chamado finalizado com sucesso." : "Chamado cancelado com sucesso.");
      } else {
        const data = await api.updateCall(id, { ...fields, status });
        setCall(data.call); setStatus(data.call.status); setTechnicianId(data.call.technicianId || "");
        setMessage(wasClosed && !CLOSED_STATUSES.includes(status) ? "Chamado reaberto com sucesso." : "Chamado atualizado com sucesso.");
      }
      setConfirmed(true); setTimeout(() => window.location.reload(), 1100);
    } catch (error) {
      const typedError = error as Error & { missing?: string[] };
      setMessage(typedError.message || "Nao foi possivel salvar alteracoes.");
      setMissing(typedError.missing || []);
    }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!window.confirm("Deseja apagar este chamado de teste? Essa acao nao pode ser desfeita.")) return;
    setSaving(true);
    try {
      await api.deleteCall(id);
      setMessage("Chamado removido com sucesso.");
      setTimeout(() => { window.location.href = "/chamados/abertos"; }, 600);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel apagar o chamado.");
    } finally {
      setSaving(false);
    }
  }
  const closedNow = CLOSED_STATUSES.includes(call.status);
  const showFinish = status === "Finalizado" && !closedNow;
  const showCancel = status === "Cancelado" && !closedNow;
  const saveLabel = saving ? "Salvando..." : showFinish ? "Finalizar chamado" : showCancel ? "Cancelar chamado" : closedNow && !CLOSED_STATUSES.includes(status) ? "Reabrir chamado" : "Salvar alteracoes";
  return (
    <>
      <button className="back-button" onClick={() => navigate(-1)}>
        <ChevronRight size={16} className="back-icon" /> Voltar para chamados
      </button>
      <div className="call-detail-heading">
        <div>
          <span className="section-kicker">ORDEM {call.orderNumber}</span>
          <h1>{call.client}</h1>
          <p>
            {call.bdesk} · {call.officeTrack} · {call.city}, {call.region}
          </p>
        </div>
        <span
          className={`call-badge ${status.toLowerCase().replace(" ", "-")}`}
        >
          {status}
        </span>
      </div>
      <RepeatBanner callId={call.id} />
      <CallTimeline call={call} />
      <div className="detail-layout">
        <section className="panel detail-main">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">INFORMACOES DO CHAMADO</span>
              <h2>Dados operacionais</h2>
            </div>
          </div>
          <div className="detail-grid">
            <EditableDetailItem label="Ordem" value={orderNumber} onChange={setOrderNumber} />
            <EditableDetailItem label="BDESK" value={bdesk} onChange={setBdesk} />
            <EditableDetailItem label="Office Track" value={officeTrack} onChange={setOfficeTrack} />
            <EditableDetailItem label={`${type.trim().toUpperCase().includes("FIELD") ? "Cliente" : "Tecnico B2C"}${["NOC TX", "NOC ACESSO"].includes(type.trim().toUpperCase()) ? " (opcional)" : ""}`} value={client} onChange={setClient} />
            <EditableDetailItem label="Tipo" value={type} onChange={setType} />
            <EditableDetailItem label="Motivo" value={reason} onChange={setReason} />
            <label className="detail-item editable-detail-item"><span>Regiao</span><select className="region-detail-select" value={region} onChange={(event) => setRegion(event.target.value)}><option value="">Selecione uma região</option>{region && !operationalRegions.includes(region) && <option value={region}>{region}</option>}{operationalRegions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <EditableDetailItem label="Cidade" value={city} onChange={setCity} />
            <EditableDetailItem label="Bairro" value={bairro} onChange={setBairro} />
            <EditableDetailItem label="Endereço" value={address} onChange={setAddress} />
            <EditableDetailItem label="OLT" value={olt} onChange={setOlt} />
            <EditableDetailItem label="Slot/PON" value={slotPon} onChange={setSlotPon} />
            <label className="detail-item editable-detail-item"><span>Abertura</span><input type="datetime-local" value={openedAt} onChange={(event) => setOpenedAt(event.target.value)} required /></label>
            {call.eventAt && <DetailItem label="Data/Hora do evento" value={new Date(call.eventAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} />}
            {call.eventAt && <DetailItem label="Gap evento → acionamento" value={formatEventGap(call.eventAt, call.openedAt)} />}
            <DetailItem label="Status interno" value={status} />
            <DetailItem label="Status OFS" value={call.ofsStatus || "Não informado"} />
            {call.cluster && <DetailItem label="Cluster (OFS)" value={({ C08: "C.8 São Paulo", C09: "C.9 ABC", C11: "C.11 Alto Tietê", C12: "C.12 Guarulhos" } as Record<string, string>)[call.cluster] || call.cluster} />}
            {call.atrelada && <LinkedOrderItem order={call.atrelada} />}
            {call.executedAt || ["Finalizado", "Cancelado", "Baixar"].includes(call.status)
              ? <EndDateItem key={call.id} call={call} onSaved={setCall} />
              : <DetailItem label="Data Fim" value="Não informada" />}
            {/* Fechamento lido do formulario "Fechamento" do OFS pelo Coletor OFS. */}
            {(call.closingReason || call.closingSubreason || call.cableType) && <>
              <DetailItem label="Motivo de fechamento (OFS)" value={call.closingReason || "Não informado"} />
              <DetailItem label="Submotivo (OFS)" value={call.closingSubreason || "Não informado"} />
              <DetailItem label="Tipo do cabo (OFS)" value={call.cableType || "Não informado"} />
            </>}
          </div>
          {/* O texto do chamado (notes) aparece fixado no topo do historico de Observacoes, abaixo. */}
        </section>
        <aside className="panel detail-actions">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">ATENDIMENTO</span>
              <h2>Distribuicao</h2>
            </div>
          </div>
          <label className="detail-label">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as CallStatus)}
            >
              {["Aberto", "Atribuido", "Atrelado", "Deslocamento", "Em campo", "Finalizado", "Baixar", "Cancelado"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="detail-label">
            Tecnico
            <select
              value={technicianId}
              onChange={(event) => setTechnicianId(event.target.value)}
            >
              <option value="">Sem tecnico</option>
              {technicians
                .filter((technician) => technician.teamRole === "Tecnico" && technician.active && technician.employmentStatus !== "Demitido")
                .map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.name} · {technician.region}
                  </option>
                ))}
            </select>
          </label>
          {!CLOSED_STATUSES.includes(call.status) && <TechnicianSuggestions callId={call.id} selected={technicianId} onPick={setTechnicianId} />}
          <div className="assignment-note">
            {technicianId
              ? `Supervisor: ${technicians.find((technician) => technician.id === technicianId)?.supervisorName || "Nao definido"}`
              : "Este chamado ainda nao possui tecnico."}
          </div>
          {showFinish && (
            <div className="status-fields">
              <label className="detail-label">
                Data e hora de execucao
                <input type="datetime-local" value={executedAt} onChange={(event) => setExecutedAt(event.target.value)} />
                {call.executedAt && <span className="field-hint">Data Fim do OFS: {new Date(call.executedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>}
              </label>
              {checklist && <ChecklistBox template={checklist} checked={checkedItems} onChange={setCheckedItems} />}
              <label className="detail-label">
                Resultado e observacao
                <textarea value={result} onChange={(event) => setResult(event.target.value)} rows={4} placeholder={"Ex.: Reparo realizado\nGIGA+, fibra emendada na CTO"} />
                <span className="field-hint">A primeira linha vira o Resultado (relatórios); o texto todo fica como observação final.</span>
              </label>
            </div>
          )}
          {showCancel && (
            <div className="status-fields">
              <label className="detail-label">Motivo do cancelamento<textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={3} placeholder="Informe por que o chamado será cancelado" /></label>
            </div>
          )}
          <button className={showCancel ? "cancel-button save-call" : "primary-button save-call"} onClick={save} disabled={saving}>
            {saveLabel} {!showCancel && <ChevronRight size={17} />}
          </button>
          {missing.length > 0 && <div className="validation-error">Faltando: {missing.join(", ")}</div>}
          {message && <div className="save-message">{message}</div>}
          {canDeleteCall && <button type="button" className="delete-link" onClick={remove} disabled={saving}>Apagar chamado</button>}
        </aside>
      </div>
      {confirmed && <div className="call-confirmation" role="status"><span>✓</span><strong>Alteração confirmada</strong><small>A ordem foi atualizada. Recarregando os dados...</small></div>}
    </>
  );
}

export function AuditedCallDetailPage() {
  const { pathname, search } = useLocation();
  const id = pathname.split("/").pop()!;
  const teamScoped = new URLSearchParams(search).get("teamScope") === "true";
  const [observations, setObservations] = useState<CallObservation[]>([]);
  const [banners, setBanners] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<CallAuditLog[]>([]);
  const [text, setText] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [savingObservation, setSavingObservation] = useState(false);
  const [tab, setTab] = useState<"observations" | "logs">("observations");
  // Texto do proprio chamado (acionamento, importacao, "Atrelada > ..."): fica fixado no topo das Observacoes.
  const [callNotes, setCallNotes] = useState("");
  const [callOpenedAt, setCallOpenedAt] = useState("");
  useEffect(() => {
    api.call(id, { teamScope: teamScoped }).then((data) => { setCallNotes(data.call.notes || ""); setCallOpenedAt(data.call.openedAt); }).catch(() => undefined);
  }, [id, teamScoped]);
  async function refreshHistory() {
    const [observationData, logData] = await Promise.all([
      api.observations(id, { teamScope: teamScoped }),
      api.auditLogs(id),
    ]);
    setObservations(observationData.observations);
    setBanners(observationData.banners ?? {});
    setLogs(logData.logs);
  }
  useEffect(() => {
    refreshHistory();
  }, [id, teamScoped]);
  function selectAttachments(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected.length) return;
    const combined = [...attachmentFiles, ...selected];
    if (combined.length > 8) { setAttachmentError("Anexe no maximo 8 arquivos por observacao."); return; }
    if (selected.some((file) => file.size > 5 * 1024 * 1024)) { setAttachmentError("Cada arquivo pode ter no maximo 5 MB."); return; }
    if (combined.reduce((total, file) => total + file.size, 0) > 10 * 1024 * 1024) { setAttachmentError("O total de anexos pode ter no maximo 10 MB."); return; }
    setAttachmentFiles(combined);
    setAttachmentError("");
  }
  async function addNote() {
    if (!text.trim() && !attachmentFiles.length) return;
    setSavingObservation(true);
    setAttachmentError("");
    try {
      const attachments = await Promise.all(attachmentFiles.map(readObservationFile));
      await api.addObservation(id, text, attachments, { teamScope: teamScoped });
      setText("");
      setAttachmentFiles([]);
      await refreshHistory();
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Nao foi possivel salvar a observacao.");
    } finally {
      setSavingObservation(false);
    }
  }
  return (
    <>
      <CallDetailBase />
      <section className="panel history-panel">
        <div className="history-tabs">
          <button
            className={
              tab === "observations" ? "history-tab active" : "history-tab"
            }
            onClick={() => setTab("observations")}
          >
            Observacoes <b>{observations.length}</b>
          </button>
          <button
            className={tab === "logs" ? "history-tab active" : "history-tab"}
            onClick={() => setTab("logs")}
          >
            Auditoria <b>{logs.length}</b>
          </button>
        </div>
        {tab === "observations" ? (
          <>
            <div className="observation-compose">
              <MentionTextarea
                value={text}
                onChange={setText}
                onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void addNote(); } }}
                placeholder="Registrar uma observacao operacional... Use @ para mencionar alguém (Ctrl+Enter salva)"
                rows={3}
              />
              <div className="observation-compose-actions">
                <label className="secondary-button compact observation-attachment-picker"><Paperclip size={15}/>Anexar arquivos<input type="file" multiple onChange={selectAttachments}/></label>
                <button className="primary-button compact" onClick={addNote} disabled={savingObservation || (!text.trim() && !attachmentFiles.length)}>
                  {savingObservation ? "Salvando..." : "Adicionar observacao"}
                </button>
              </div>
            </div>
            {attachmentFiles.length > 0 && <div className="observation-selected-attachments">{attachmentFiles.map((file, index) => <span className="observation-selected-file" key={`${file.name}-${file.lastModified}-${index}`}><FileText size={14}/><span>{file.name}</span><button type="button" aria-label={`Remover ${file.name}`} onClick={() => setAttachmentFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}><X size={14}/></button></span>)}</div>}
            {attachmentError && <div className="form-error observation-attachment-error">{attachmentError}</div>}
            <div className="history-list">
              {callNotes.trim() && (
                <div className="history-item call-notes-item">
                  <div className="history-avatar" aria-hidden="true"><FileText size={15} /></div>
                  <div>
                    <strong>Registro do chamado</strong>
                    <small>{callOpenedAt ? `abertura ${new Date(callOpenedAt).toLocaleString("pt-BR")}` : "texto do chamado"}</small>
                    <p className="call-notes-text">{callNotes}</p>
                  </div>
                </div>
              )}
              {observations.length ? (
                observations.map((item) => banners[item.userId] ? (
                  // Autor com banner: banner ao fundo, nome sobre faixa escura e texto em caixa quase opaca.
                  <div className="history-item has-banner" key={item.id} style={{ backgroundImage: `url(${banners[item.userId]})` }}>
                    <div className="history-banner-head">
                      <div className="history-avatar">{item.userName.slice(0, 1)}</div>
                      <div>
                        <strong>{item.userName}</strong>
                        <small>{new Date(item.createdAt).toLocaleString("pt-BR")}</small>
                      </div>
                    </div>
                    {(item.text || item.attachments?.length > 0) && (
                      <div className="history-banner-body">
                        {item.text && <p>{withMentions(item.text)}</p>}
                        {item.attachments?.length > 0 && <div className="observation-attachments">{item.attachments.map((attachment) => <ObservationAttachmentItem key={attachment.id} callId={id} observationId={item.id} attachment={attachment} teamScoped={teamScoped}/>)}</div>}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="history-item" key={item.id}>
                    <div className="history-avatar">
                      {item.userName.slice(0, 1)}
                    </div>
                    <div>
                      <strong>{item.userName}</strong>
                      <small>
                        {new Date(item.createdAt).toLocaleString("pt-BR")}
                      </small>
                      {item.text && <p>{withMentions(item.text)}</p>}
                      {item.attachments?.length > 0 && <div className="observation-attachments">{item.attachments.map((attachment) => <ObservationAttachmentItem key={attachment.id} callId={id} observationId={item.id} attachment={attachment} teamScoped={teamScoped}/>)}</div>}
                    </div>
                  </div>
                ))
              ) : callNotes.trim() ? null : (
                <div className="empty-state">
                  Nenhuma observacao registrada.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="history-list">
            {logs.length ? (
              logs.map((item) => (
                <div className="history-item" key={item.id}>
                  <div className="history-avatar log">↗</div>
                  <div>
                    <strong>{item.userName}</strong>
                    <small>
                      {new Date(item.createdAt).toLocaleString("pt-BR")}
                    </small>
                    <p>
                      <b>{item.action}</b>
                      <br />
                      {item.previousValue || "vazio"} →{" "}
                      {item.newValue || "vazio"}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">Nenhuma alteracao registrada.</div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

export async function readObservationFile(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Nao foi possivel ler ${file.name}.`));
    reader.readAsDataURL(file);
  });
  return { fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, contentBase64: dataUrl.split(',')[1] || '' };
}

export function observationAttachmentBlob(base64: string, mimeType: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

export function ObservationAttachmentItem({ callId, observationId, attachment, teamScoped }: { callId: string; observationId: string; attachment: CallObservation['attachments'][number]; teamScoped: boolean }) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [attachmentError, setAttachmentError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const objectUrl = useRef('');
  const isImage = attachment.mimeType.startsWith('image/');

  useEffect(() => {
    if (!isImage) return;
    let active = true;
    api.observationAttachment(callId, observationId, attachment.id, { teamScope: teamScoped }).then(({ attachment: file }) => {
      const url = URL.createObjectURL(observationAttachmentBlob(file.contentBase64, file.mimeType));
      if (!active) { URL.revokeObjectURL(url); return; }
      objectUrl.current = url;
      setPreviewUrl(url);
    }).catch(() => setAttachmentError(true));
    return () => { active = false; if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); };
  }, [callId, observationId, attachment.id, teamScoped, isImage]);

  async function download() {
    setDownloading(true);
    setAttachmentError(false);
    try {
      let url = objectUrl.current;
      if (!url) {
        const { attachment: file } = await api.observationAttachment(callId, observationId, attachment.id, { teamScope: teamScoped });
        url = URL.createObjectURL(observationAttachmentBlob(file.contentBase64, file.mimeType));
      }
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (!isImage) window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setAttachmentError(true);
    } finally {
      setDownloading(false);
    }
  }

  return <button className={`observation-attachment${isImage ? ' image' : ' file'}`} type="button" onClick={() => void download()} title={`Baixar ${attachment.fileName}`}>
    {isImage ? previewUrl ? <img src={previewUrl} alt={`Prévia de ${attachment.fileName}`}/> : <span className="observation-image-loading">{attachmentError ? "Prévia indisponível" : "Carregando prévia..."}</span> : <FileText size={22}/>}
    <span className="observation-attachment-name">{attachment.fileName}</span><Download size={14}/>{downloading && <span className="observation-download-state">Baixando...</span>}
  </button>;
}

export function CallDetailRoute() {
  return <AuditedCallDetailPage />;
}

// Reincidencia: outros chamados no mesmo ponto (endereco + OLT + slot/PON). Aviso quando houve outro nos 30 dias
// anteriores; o historico completo do ponto fica recolhido.
function RepeatBanner({ callId }: { callId: string }) {
  const [data, setData] = useState<RepeatHistory | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { let active = true; api.repeatHistory(callId).then((result) => { if (active) setData(result); }).catch(() => undefined); return () => { active = false; }; }, [callId]);
  if (!data?.eligible || !data.history.length) return null;
  const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "–");
  return (
    <section className={`panel repeat-banner${data.isRepeat ? " is-repeat" : ""}`} aria-label="Histórico do mesmo ponto">
      <div className="repeat-banner-head">
        <div>
          {data.isRepeat ? <span className="call-badge reincidente">Reincidente</span> : null}
          <strong>{data.isRepeat ? `${data.previousWithin30Days} chamado(s) no mesmo endereço, OLT e slot/PON nos 30 dias anteriores` : `${data.history.length} chamado(s) anteriores no mesmo endereço, OLT e slot/PON`}</strong>
        </div>
        <button type="button" className="link-button" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Esconder histórico" : "Ver histórico"}</button>
      </div>
      {open && (
        <ul className="repeat-history">
          {data.history.map((item) => (
            <li key={item.id}>
              <Link to={`/chamados/${item.id}`} className="rp-order">{item.orderNumber}</Link>
              <span>{when(item.openedAt)}</span>
              <span>{item.status}{item.technicianName ? ` · ${item.technicianName}` : ""}</span>
              <span>{[item.closingReason, item.closingSubreason].filter(Boolean).join(" — ") || item.result || "–"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Data Fim editavel, inclusive com o chamado encerrado (nao precisa reabrir). Salva sozinha, separada do
// "Salvar alteracoes"; depois de corrigida aqui, a sincronizacao do OFS nao sobrescreve mais.
function EndDateItem({ call, onSaved }: { call: Call; onSaved: (call: Call) => void }) {
  const initial = call.executedAt ? toLocalDateTimeInput(call.executedAt) : "";
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const dirty = Boolean(value) && value !== initial;
  const fromOfs = Boolean(call.executedAt) && !["Finalizado", "Cancelado", "Baixar"].includes(call.status);
  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const data = await api.updateCallEndDate(call.id, value);
      setFeedback({ text: "Data Fim corrigida. O OFS não vai mais sobrescrever.", error: false });
      onSaved(data.call);
    } catch (err) {
      setFeedback({ text: err instanceof Error ? err.message : "Não foi possível salvar a Data Fim.", error: true });
    } finally { setSaving(false); }
  }
  return (
    <div className="detail-item editable-detail-item end-date-item">
      <label htmlFor="call-end-date"><span>Data Fim{fromOfs ? " (OFS)" : ""}</span></label>
      <input id="call-end-date" type="datetime-local" value={value} max={toLocalDateTimeInput(new Date().toISOString())} onChange={(event) => { setValue(event.target.value); setFeedback(null); }} />
      {dirty && (
        <div className="end-date-actions">
          <button className="primary-button compact" type="button" onClick={() => void save()} disabled={saving}>{saving ? "Salvando..." : "Salvar Data Fim"}</button>
          <button className="secondary-button compact" type="button" onClick={() => { setValue(initial); setFeedback(null); }} disabled={saving}>Desfazer</button>
        </div>
      )}
      {feedback && <small className={feedback.error ? "end-date-feedback is-error" : "end-date-feedback"} role={feedback.error ? "alert" : "status"}>{feedback.text}</small>}
    </div>
  );
}
