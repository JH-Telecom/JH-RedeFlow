import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, Download, FileText, Paperclip, X } from "lucide-react";
import { api, type Call, type CallAuditLog, type CallObservation, type CallStatus, type Technician } from "../api";
import { toLocalDateTimeInput } from "../components/call-cells";
import { DetailItem, EditableDetailItem } from "../components/ui";
import { operationalRegions } from "../lib/constants";

// Tempo entre o evento informado no card e o envio do card no grupo (abertura).
function formatEventGap(eventAt: string, openedAt: string) {
  const minutes = Math.round((new Date(openedAt).getTime() - new Date(eventAt).getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 0) return "Evento depois da abertura";
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
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
  const navigate = useNavigate();
  useEffect(() => {
    Promise.all([api.call(id, { teamScope: teamScoped }), api.technicians()]).then(
      ([callData, technicianData]) => {
        setCall(callData.call);
        setStatus(callData.call.status);
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
    setSaving(true);
    try {
      const data = await api.updateCall(id, { orderNumber, bdesk, officeTrack, client, type, reason, region, city, address, bairro, olt, slotPon, status, technicianId: technicianId || null, openedAt: openingDate.toISOString(), notes });
      setCall(data.call); setStatus(data.call.status); setTechnicianId(data.call.technicianId || "");
      setMessage("Chamado atualizado com sucesso."); setConfirmed(true); setTimeout(() => window.location.reload(), 1100);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Nao foi possivel salvar alteracoes."); }
    finally { setSaving(false); }
  }
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
            <DetailItem label="Data Fim" value={call.executedAt
              // Chamado ainda aberto aqui, mas concluido no OFS: mostra a Data Fim que veio do OFS.
              ? `${new Date(call.executedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}${["Finalizado", "Cancelado", "Baixar"].includes(call.status) ? "" : " (OFS)"}`
              : "Não informada"} />
          </div>
          <label className="detail-label">
            Observacoes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={5}
            />
          </label>
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
              {[
                "Aberto",
                "Atribuido",
                "Deslocamento",
                "Em campo",
              ].map((item) => (
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
          <div className="assignment-note">
            {technicianId
              ? `Supervisor: ${technicians.find((technician) => technician.id === technicianId)?.supervisorName || "Nao definido"}`
              : "Este chamado ainda nao possui tecnico."}
          </div>
          <button className="primary-button save-call" onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alteracoes"} <ChevronRight size={17} />
          </button>
          {message && <div className="save-message">{message}</div>}
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
      <CallOutcomeActions />
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
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Registrar uma observacao operacional..."
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
                        {item.text && <p>{item.text}</p>}
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
                      {item.text && <p>{item.text}</p>}
                      {item.attachments?.length > 0 && <div className="observation-attachments">{item.attachments.map((attachment) => <ObservationAttachmentItem key={attachment.id} callId={id} observationId={item.id} attachment={attachment} teamScoped={teamScoped}/>)}</div>}
                    </div>
                  </div>
                ))
              ) : (
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

export function CallOutcomeActions() {
  const { pathname } = useLocation();
  const id = pathname.split("/").pop()!;
  const [call, setCall] = useState<Call | null>(null);
  const [result, setResult] = useState("");
  const [executedAt, setExecutedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [message, setMessage] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [canDeleteCall, setCanDeleteCall] = useState(false);
  useEffect(() => { api.call(id).then((data) => setCall(data.call)).catch(() => setCall(null)); }, [id]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('jh-redeflow-session');
      const session = raw ? JSON.parse(raw) : null;
      setCanDeleteCall(Boolean(session?.user?.role?.permissions?.includes('calls.delete')));
    } catch {
      setCanDeleteCall(false);
    }
  }, []);
  async function finish() {
    setMessage("");
    setMissing([]);
    setSaving(true);
    try {
      await api.finishCall(id, { result, executedAt, notes });
      setMessage("Chamado finalizado com sucesso."); setConfirmed(true); setTimeout(() => window.location.reload(), 1100);
    } catch (error) {
      const typedError = error as Error & { missing?: string[] };
      setMessage(typedError.message);
      setMissing(typedError.missing || []);
    } finally { setSaving(false); }
  }
  async function cancel() {
    if (!cancelReason.trim()) {
      setMessage("Informe o motivo do cancelamento.");
      return;
    }
    setSaving(true);
    try { await api.cancelCall(id, cancelReason); setMessage("Chamado cancelado com sucesso."); setConfirmed(true); setTimeout(() => window.location.reload(), 1100); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Nao foi possivel cancelar o chamado."); }
    finally { setSaving(false); }
  }
  async function reopen() {
    try { setSaving(true); const data = await api.reopenCall(id); setCall(data.call); setMessage("Chamado reaberto com sucesso."); setConfirmed(true); setTimeout(() => window.location.reload(), 1100); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Nao foi possivel reabrir o chamado."); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!window.confirm('Deseja apagar este chamado de teste? Essa acao nao pode ser desfeita.')) return;
    setSaving(true);
    try {
      await api.deleteCall(id);
      setMessage('Chamado removido com sucesso.');
      setTimeout(() => { window.location.href = '/chamados/abertos'; }, 600);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nao foi possivel apagar o chamado.');
    } finally {
      setSaving(false);
    }
  }
  const closed = call ? ["Finalizado", "Cancelado", "Baixar"].includes(call.status) : false;
  return (
    <section className="panel outcome-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">ENCERRAMENTO</span>
          <h2>Finalizar ou cancelar</h2>
        </div>
      </div>
      {closed ? <div className="closed-call-action"><p>Este chamado está encerrado e não pode mais ser alterado.</p><button className="primary-button compact" onClick={reopen} disabled={saving}>{saving ? "Reabrindo..." : "Reabrir chamado"} <ChevronRight size={16} /></button></div> : <div className="outcome-grid">
        <div>
          <div className="required-checks">
            <span>Tecnico</span><span>Resultado</span><span>Data/hora</span><span>Observacao</span>
          </div>
          <div className="outcome-fields">
            <label className="detail-label">Resultado<input value={result} onChange={(event) => setResult(event.target.value)} placeholder="Ex.: reparo realizado" /></label>
            <label className="detail-label">Data e hora de execucao<input type="datetime-local" value={executedAt} onChange={(event) => setExecutedAt(event.target.value)} /></label>
            <label className="detail-label">Observacao final<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Descreva a execucao" /></label>
          </div>
          <button className="primary-button compact" onClick={finish} disabled={saving}>{saving ? "Finalizando..." : "Finalizar chamado"} <ChevronRight size={16} /></button>
          {missing.length > 0 && <div className="validation-error">Faltando: {missing.join(", ")}</div>}
        </div>
        <div className="cancel-box">
          <span className="section-kicker">CANCELAMENTO</span>
          <label className="detail-label">Motivo<textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={3} placeholder="Informe por que o chamado será cancelado" /></label>
          <button className="cancel-button" onClick={cancel} disabled={saving}>{saving ? "Cancelando..." : "Cancelar chamado"}</button>
          {canDeleteCall && (
            <button className="delete-button" onClick={remove} disabled={saving}>{saving ? "Excluindo..." : "Apagar chamado"}</button>
          )}
        </div>
      </div>}
      {message && <div className="save-message">{message}</div>}
      {confirmed && <div className="call-confirmation" role="status"><span>✓</span><strong>Alteração confirmada</strong><small>Atualizando a ordem...</small></div>}
    </section>
  );
}

export function CallDetailRoute() {
  return <AuditedCallDetailPage />;
}
