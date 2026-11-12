import { slaLimits } from "../lib/sla";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, MapPin, Navigation, RefreshCw, Wrench } from "lucide-react";
import { api, type FieldCall } from "../api";
import { ChecklistBox } from "../components/FieldAdmin";

// Meus chamados: tela do tecnico no celular. So os chamados do tecnico ligado ao usuario, com botoes grandes:
// "Sai para o local" (Deslocamento), "Cheguei" (Em campo), observacao com foto e "Finalizar" (com o checklist).

const elapsed = (iso: string) => { const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000)); return minutes < 60 ? `${minutes} min` : minutes < 2880 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}` : `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`; };
const tone = (iso: string, type?: string) => { const minutes = (Date.now() - Date.parse(iso)) / 60_000; const limits = slaLimits(type); return minutes > limits.outlierMinutes ? "outlier" : minutes > limits.onTimeMinutes ? "late" : limits.onTimeMinutes - minutes <= limits.soonMinutes ? "soon" : "ok"; };
const mapsUrl = (call: FieldCall) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([call.address, call.bairro, call.city].filter(Boolean).join(", "))}`;

async function resizePhoto(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  const contentBase64 = dataUrl.split(",")[1];
  return { fileName: `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`, mimeType: "image/jpeg", sizeBytes: atob(contentBase64).length, contentBase64 };
}

export function FieldPage() {
  const [data, setData] = useState<{ technician: { name: string }; calls: FieldCall[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.fieldCalls()); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar seus chamados."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); const interval = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(interval); }, [load]);
  const active = (data?.calls ?? []).filter((call) => call.status !== "Finalizado");
  const done = (data?.calls ?? []).filter((call) => call.status === "Finalizado");
  return (
    <div className="fd-page">
      <div className="fd-head">
        <div><span className="section-kicker">EM CAMPO</span><h1>Meus chamados</h1>{data && <p>{data.technician.name} · {active.length} aberto(s) · {done.length} finalizado(s) hoje</p>}</div>
        <button type="button" className="secondary-button compact" onClick={() => void load()} disabled={loading} aria-label="Atualizar"><RefreshCw size={16} className={loading ? "ih-spin" : ""} /></button>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {data && !active.length && <div className="panel fd-empty"><CheckCircle2 size={28} aria-hidden="true" /><strong>Nenhum chamado aberto com você.</strong><span>Quando o operador atribuir um chamado, ele aparece aqui.</span></div>}
      {active.map((call) => <FieldCard key={call.id} call={call} onChanged={load} />)}
      {done.length > 0 && <section className="fd-done"><h2>Finalizados hoje</h2>{done.map((call) => <div key={call.id} className="fd-done-row"><strong>{call.orderNumber}</strong><span>{call.result || call.type}</span></div>)}</section>}
    </div>
  );
}

function FieldCard({ call, onChanged }: { call: FieldCall; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<"" | "note" | "finish">("");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const photoInput = useRef<HTMLInputElement | null>(null);

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(done); setMode(""); setText(""); setPhotos([]); setChecked([]); await onChanged(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  const sendNote = () => run(async () => api.fieldObservation(call.id, text.trim(), await Promise.all(photos.map(resizePhoto))), "Observação enviada.");
  const finish = () => run(async () => {
    // Fotos do fechamento vao numa observacao antes de finalizar (depois o chamado fica encerrado).
    if (photos.length) await api.fieldObservation(call.id, "Fotos do fechamento", await Promise.all(photos.map(resizePhoto)));
    await api.fieldFinish(call.id, text.trim(), checked);
  }, "Chamado finalizado.");

  return (
    <article className={`panel fd-card is-${tone(call.openedAt, call.type)}`}>
      <header>
        <div><strong>{call.orderNumber}</strong><span>{call.type}{call.reason ? ` · ${call.reason}` : ""}</span></div>
        <span className={`fd-time is-${tone(call.openedAt, call.type)}`}>{elapsed(call.openedAt)}</span>
      </header>
      <dl className="fd-info">
        {call.client && <div><dt>Cliente</dt><dd>{call.client}</dd></div>}
        <div><dt>Endereço</dt><dd>{[call.address, call.bairro, call.city].filter(Boolean).join(" · ") || "Não informado"}</dd></div>
        <div><dt>OLT · Slot/PON</dt><dd>{call.olt || "–"} · {call.slotPon || "–"}</dd></div>
        <div><dt>Status</dt><dd>{call.status}</dd></div>
      </dl>
      {(call.address || call.bairro) && <a className="fd-map" href={mapsUrl(call)} target="_blank" rel="noreferrer"><MapPin size={15} aria-hidden="true" /> Abrir no mapa</a>}
      <div className="fd-actions">
        <button type="button" className={`fd-btn${call.status === "Deslocamento" ? " is-current" : ""}`} disabled={busy || call.status === "Deslocamento"} onClick={() => void run(() => api.fieldStatus(call.id, "Deslocamento"), "Indo para o local.")}><Navigation size={18} /> Saí para o local</button>
        <button type="button" className={`fd-btn${call.status === "Em campo" ? " is-current" : ""}`} disabled={busy || call.status === "Em campo"} onClick={() => void run(() => api.fieldStatus(call.id, "Em campo"), "Chegada registrada.")}><MapPin size={18} /> Cheguei</button>
        <button type="button" className={`fd-btn${mode === "note" ? " is-current" : ""}`} disabled={busy} onClick={() => setMode(mode === "note" ? "" : "note")}><Camera size={18} /> Observação / foto</button>
        <button type="button" className={`fd-btn is-finish${mode === "finish" ? " is-current" : ""}`} disabled={busy} onClick={() => setMode(mode === "finish" ? "" : "finish")}><Wrench size={18} /> Finalizar</button>
      </div>
      {mode && (
        <div className="fd-form">
          {mode === "finish" && call.checklist && <ChecklistBox template={call.checklist} checked={checked} onChange={setChecked} />}
          <label>{mode === "finish" ? "Resultado e observação (a 1ª linha é o resultado)" : "Observação"}<textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} placeholder={mode === "finish" ? "Ex.: Reparo realizado\nEmenda feita na CTO, sinal ok" : "Ex.: Cheguei, CTO sem sinal"} /></label>
          <div className="fd-photos">
            <button type="button" className="secondary-button compact" onClick={() => photoInput.current?.click()}><Camera size={15} /> {photos.length ? `${photos.length} foto(s)` : "Adicionar foto"}</button>
            <input ref={photoInput} type="file" accept="image/*" capture="environment" multiple hidden onChange={(event) => setPhotos(Array.from(event.target.files ?? []).slice(0, 4))} />
          </div>
          <button type="button" className="primary-button fd-submit" disabled={busy || (mode === "note" ? !text.trim() && !photos.length : text.trim().length < 3)} onClick={() => void (mode === "note" ? sendNote() : finish())}>{busy ? "Enviando..." : mode === "note" ? "Enviar observação" : "Finalizar chamado"}</button>
        </div>
      )}
      {error ? <div className="form-error" role="alert">{error}</div> : message && <div className="save-message" role="status">{message}</div>}
    </article>
  );
}
