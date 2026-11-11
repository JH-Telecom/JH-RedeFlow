import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, History, ImagePlus, KeyRound, Plus, RotateCcw, Search, UserRound, X } from "lucide-react";
import { api, type PopKey, type PopKeyMovement, type Role, type Supervisor, type Technician, type User } from "../api";
import { AdminModal } from "../components/ui";
import { toLocalDateTimeInput } from "../components/call-cells";
import { photoFromFile, photoFromVideo } from "../lib/person-photo";

// Chaves dos POPs: quem esta com cada chave, desde quando, com foto tirada na retirada e o historico.
// Ver: quem ve chamados. Retirar/devolver: quem edita chamados. POP novo: quem gerencia as configuracoes.
type Filter = "todas" | "Base" | "Retirada" | "A conferir";
const STATUS_LABEL: Record<PopKey["status"], string> = { Base: "Na base", Retirada: "Retirada", "A conferir": "A conferir" };
const KIND_LABEL: Record<string, string> = { Tecnico: "Técnico", Supervisor: "Supervisor", Outro: "" };
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Foto do movimento: carrega so quando aparece (a lista vem sem foto).
const photoCache = new Map<string, Promise<string | null>>();
function loadPhoto(movementId: string) {
  if (!photoCache.has(movementId)) photoCache.set(movementId, api.popKeyPhoto(movementId).then((data) => data.photo).catch(() => null));
  return photoCache.get(movementId)!;
}
function PersonPhoto({ movementId, name, size = "md", onOpen }: { movementId: string | null; name: string; size?: "md" | "lg"; onOpen?: (photo: string) => void }) {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => { let alive = true; setPhoto(null); if (movementId) void loadPhoto(movementId).then((value) => { if (alive) setPhoto(value); }); return () => { alive = false; }; }, [movementId]);
  if (!photo) return <span className={`pk-avatar is-${size}`} aria-hidden="true">{initials(name) || <UserRound size={18} />}</span>;
  return <button type="button" className={`pk-avatar is-${size} has-photo`} onClick={() => onOpen?.(photo)} aria-label={`Ver foto de ${name}`}><img src={photo} alt="" /></button>;
}

export function PopKeysPage({ user }: { user: User & { role: Role } }) {
  const canEdit = user.role.permissions.includes("calls.edit");
  const canManage = user.role.permissions.includes("settings.manage");
  const [keys, setKeys] = useState<PopKey[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");
  const [search, setSearch] = useState("");
  const [taking, setTaking] = useState<PopKey | null>(null);
  const [returning, setReturning] = useState<PopKey | null>(null);
  const [history, setHistory] = useState<PopKey | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    try { setKeys((await api.popKeys()).keys); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar as chaves."); }
  }
  useEffect(() => { void load(); }, []);
  const replace = (key: PopKey) => setKeys((current) => current?.map((item) => (item.id === key.id ? key : item)) ?? null);

  const counts = useMemo(() => ({ todas: keys?.length ?? 0, Base: keys?.filter((key) => key.status === "Base").length ?? 0, Retirada: keys?.filter((key) => key.status === "Retirada").length ?? 0, "A conferir": keys?.filter((key) => key.status === "A conferir").length ?? 0 }), [keys]);
  const visible = (keys ?? []).filter((key) => (filter === "todas" || key.status === filter) && (!search.trim() || normalize(`${key.pop} ${key.holderName || ""}`).includes(normalize(search.trim()))));

  return (
    <div className="pk-page">
      <div className="page-heading">
        <div>
          <span className="section-kicker">OPERAÇÃO</span>
          <h1>Chaves dos POPs</h1>
          <p>Quem está com cada chave e desde quando. Na retirada dá para tirar uma foto da pessoa com a chave.</p>
        </div>
        {canManage && <button type="button" className="secondary-button" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" /> Novo POP</button>}
      </div>

      <div className="pk-toolbar">
        <div className="dv-segmented" role="group" aria-label="Situação da chave">
          {(["todas", "Retirada", "Base", "A conferir"] as Filter[]).map((value) => (
            <button key={value} type="button" className={filter === value ? "is-selected" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {value === "todas" ? "Todas" : STATUS_LABEL[value]} <b>{counts[value]}</b>
            </button>
          ))}
        </div>
        <label className="pk-search"><Search size={15} aria-hidden="true" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar POP ou pessoa" aria-label="Buscar POP ou pessoa" /></label>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      {!keys && !error && <div className="empty-state">Carregando chaves...</div>}
      {keys && visible.length === 0 && <div className="empty-state">Nenhuma chave com esse filtro.</div>}

      <ul className="pk-grid">
        {visible.slice(0, 100).map((key) => (
          <li key={key.id} className={`pk-card is-${key.status === "Base" ? "base" : key.status === "Retirada" ? "out" : "check"}`}>
            <div className="pk-card-head">
              <strong className="pk-pop"><KeyRound size={15} aria-hidden="true" /> {key.pop}</strong>
              <span className={`pk-status is-${key.status === "Base" ? "base" : key.status === "Retirada" ? "out" : "check"}`}>{STATUS_LABEL[key.status]}</span>
            </div>
            {key.status === "Retirada" ? (
              <div className="pk-holder">
                <PersonPhoto movementId={key.hasPhoto ? key.currentMovementId : null} name={key.holderName || "?"} onOpen={setViewer} />
                <div>
                  <b>{key.holderName}</b>
                  <small>{[KIND_LABEL[key.holderKind || ""], key.takenAt ? `desde ${dateTime(key.takenAt)}` : "sem data de retirada"].filter(Boolean).join(" · ")}</small>
                  {key.takenAt && <small className={daysSince(key.takenAt) >= 7 ? "pk-days is-long" : "pk-days"}>{daysSince(key.takenAt) === 0 ? "retirada hoje" : `há ${daysSince(key.takenAt)} dia(s)`}</small>}
                </div>
              </div>
            ) : <p className="pk-empty">{key.status === "Base" ? "Chave na base." : "Situação não informada na planilha. Confira onde está a chave."}</p>}
            {key.notes && <p className="pk-notes">{key.notes}</p>}
            <div className="pk-actions">
              {canEdit && key.status !== "Retirada" && <button type="button" className="primary-button compact" onClick={() => setTaking(key)}>Registrar retirada</button>}
              {canEdit && key.status === "Retirada" && <button type="button" className="primary-button compact" onClick={() => setReturning(key)}><RotateCcw size={14} aria-hidden="true" /> Devolver</button>}
              {canEdit && key.status === "A conferir" && <button type="button" className="secondary-button compact" onClick={() => setReturning(key)}>Está na base</button>}
              <button type="button" className="icon-button pk-history-button" onClick={() => setHistory(key)} aria-label={`Histórico da chave de ${key.pop}`} title="Histórico"><History size={16} /></button>
            </div>
          </li>
        ))}
      </ul>

      {taking && <TakeModal popKey={taking} onClose={() => setTaking(null)} onSaved={(key) => { replace(key); setTaking(null); }} />}
      {returning && <ReturnModal popKey={returning} onClose={() => setReturning(null)} onSaved={(key) => { replace(key); setReturning(null); }} />}
      {history && <HistoryModal popKey={history} onClose={() => setHistory(null)} onOpenPhoto={setViewer} />}
      {adding && <AddPopModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load(); }} />}
      {viewer && <AdminModal title="Foto da retirada" onClose={() => setViewer(null)}><img className="pk-viewer" src={viewer} alt="Foto tirada na retirada da chave" /></AdminModal>}
    </div>
  );
}

function TakeModal({ popKey, onClose, onSaved }: { popKey: PopKey; onClose: () => void; onSaved: (key: PopKey) => void }) {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [person, setPerson] = useState(""); // "t:<id>", "s:<id>" ou "outro"
  const [otherName, setOtherName] = useState("");
  const [takenAt, setTakenAt] = useState(() => toLocalDateTimeInput(new Date().toISOString()));
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api.technicians().then((data) => setTechnicians(data.technicians.filter((item) => item.active && item.employmentStatus !== "Demitido").sort((a, b) => a.name.localeCompare(b.name)))).catch(() => undefined);
    api.supervisors().then((data) => setSupervisors(data.supervisors.filter((item) => item.active).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => undefined);
  }, []);

  function chosen() {
    if (person === "outro") return { holderName: otherName.trim(), holderKind: "Outro" as const, holderId: null };
    const [kind, id] = person.split(":");
    if (kind === "t") { const item = technicians.find((tech) => tech.id === id); return item ? { holderName: item.name, holderKind: "Tecnico" as const, holderId: item.id } : null; }
    if (kind === "s") { const item = supervisors.find((sup) => sup.id === id); return item ? { holderName: item.name, holderKind: "Supervisor" as const, holderId: item.id } : null; }
    return null;
  }
  async function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try { setPhoto(await photoFromFile(file)); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível usar essa foto."); }
  }
  async function save() {
    const holder = chosen();
    if (!holder || holder.holderName.length < 2) { setError("Escolha quem retirou a chave (ou escreva o nome)."); return; }
    const date = new Date(takenAt);
    if (Number.isNaN(date.getTime())) { setError("Informe a data e a hora da retirada."); return; }
    setSaving(true); setError("");
    try { onSaved((await api.takePopKey(popKey.id, { ...holder, notes: notes.trim() || null, photo, takenAt: date.toISOString() })).key); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível registrar a retirada."); }
    finally { setSaving(false); }
  }

  return (
    <AdminModal title={`Retirada da chave · ${popKey.pop}`} onClose={() => { if (!saving) onClose(); }}>
      <div className="pk-form" data-save-scope>
        <label>Quem retirou
          <select value={person} onChange={(event) => setPerson(event.target.value)} autoFocus>
            <option value="">Escolha a pessoa</option>
            {technicians.length > 0 && <optgroup label="Técnicos">{technicians.map((tech) => <option key={tech.id} value={`t:${tech.id}`}>{tech.name}{tech.teamRole === "Auxiliar" ? " (auxiliar)" : ""}</option>)}</optgroup>}
            {supervisors.length > 0 && <optgroup label="Supervisores">{supervisors.map((sup) => <option key={sup.id} value={`s:${sup.id}`}>{sup.name}</option>)}</optgroup>}
            <option value="outro">Outra pessoa (escrever o nome)</option>
          </select>
        </label>
        {person === "outro" && <label>Nome de quem retirou<input value={otherName} onChange={(event) => setOtherName(event.target.value)} maxLength={120} placeholder="Ex.: Mauro (GIGA+)" /></label>}
        <label>Data e hora da retirada<input type="datetime-local" value={takenAt} max={toLocalDateTimeInput(new Date().toISOString())} onChange={(event) => setTakenAt(event.target.value)} /></label>
        <label>Observação (opcional)<input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Ex.: manutenção no rack, devolve amanhã" /></label>

        <div className="pk-photo-field">
          <span>Foto da pessoa com a chave (opcional)</span>
          {photo ? (
            <div className="pk-photo-preview"><img src={photo} alt="Foto que vai junto com a retirada" /><button type="button" className="secondary-button compact" onClick={() => setPhoto(null)}><X size={14} aria-hidden="true" /> Tirar foto de novo</button></div>
          ) : camera ? (
            <CameraCapture onCapture={(value) => { setPhoto(value); setCamera(false); }} onCancel={() => setCamera(false)} onError={(message) => { setError(message); setCamera(false); }} />
          ) : (
            <div className="pk-photo-buttons">
              {typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia && <button type="button" className="secondary-button compact" onClick={() => setCamera(true)}><Camera size={15} aria-hidden="true" /> Usar a câmera</button>}
              <button type="button" className="secondary-button compact" onClick={() => fileInput.current?.click()}><ImagePlus size={15} aria-hidden="true" /> Escolher foto</button>
              <input ref={fileInput} type="file" accept="image/*" capture="user" hidden onChange={(event) => void pickFile(event)} />
            </div>
          )}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="pk-form-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="primary-button" onClick={() => void save()} disabled={saving} data-save-button>{saving ? "Salvando..." : "Registrar retirada"}</button>
        </div>
      </div>
    </AdminModal>
  );
}

function CameraCapture({ onCapture, onCancel, onError }: { onCapture: (photo: string) => void; onCancel: () => void; onError: (message: string) => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  // A camera abre uma vez so (onError muda a cada render da janela; vai por referencia).
  const errorRef = useRef(onError);
  errorRef.current = onError;
  useEffect(() => {
    let alive = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false })
      .then((media) => { if (!alive) { media.getTracks().forEach((track) => track.stop()); return; } stream.current = media; if (video.current) { video.current.srcObject = media; void video.current.play(); } })
      .catch(() => errorRef.current("Não foi possível abrir a câmera. Libere o acesso no navegador ou use \"Escolher foto\"."));
    return () => { alive = false; stream.current?.getTracks().forEach((track) => track.stop()); };
  }, []);
  return (
    <div className="pk-camera">
      <video ref={video} playsInline muted aria-label="Imagem da câmera" />
      <div className="pk-photo-buttons">
        <button type="button" className="primary-button compact" onClick={() => { try { if (video.current) onCapture(photoFromVideo(video.current)); } catch (err) { onError(err instanceof Error ? err.message : "Não foi possível tirar a foto."); } }}><Camera size={15} aria-hidden="true" /> Tirar foto</button>
        <button type="button" className="secondary-button compact" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

function ReturnModal({ popKey, onClose, onSaved }: { popKey: PopKey; onClose: () => void; onSaved: (key: PopKey) => void }) {
  const [returnedAt, setReturnedAt] = useState(() => toLocalDateTimeInput(new Date().toISOString()));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const checking = popKey.status === "A conferir";
  async function save() {
    const date = new Date(returnedAt);
    if (Number.isNaN(date.getTime())) { setError("Informe a data e a hora."); return; }
    setSaving(true); setError("");
    try { onSaved((await api.returnPopKey(popKey.id, { notes: notes.trim() || null, returnedAt: date.toISOString() })).key); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível registrar a devolução."); }
    finally { setSaving(false); }
  }
  return (
    <AdminModal title={`${checking ? "Chave na base" : "Devolução da chave"} · ${popKey.pop}`} onClose={() => { if (!saving) onClose(); }}>
      <div className="pk-form" data-save-scope>
        {!checking && <p className="pk-form-lead">Estava com <b>{popKey.holderName}</b>{popKey.takenAt ? ` desde ${dateTime(popKey.takenAt)}` : ""}.</p>}
        <label>{checking ? "Conferida em" : "Data e hora da devolução"}<input type="datetime-local" value={returnedAt} max={toLocalDateTimeInput(new Date().toISOString())} onChange={(event) => setReturnedAt(event.target.value)} autoFocus /></label>
        <label>Observação (opcional)<input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder={checking ? "Ex.: conferida no armário" : "Ex.: devolvida ao mesário"} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="pk-form-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="primary-button" onClick={() => void save()} disabled={saving} data-save-button>{saving ? "Salvando..." : checking ? "Confirmar na base" : "Registrar devolução"}</button>
        </div>
      </div>
    </AdminModal>
  );
}

const ACTION_LABEL: Record<PopKeyMovement["action"], string> = { Retirada: "Retirada", Devolucao: "Devolução", Ajuste: "Conferida na base" };
function HistoryModal({ popKey, onClose, onOpenPhoto }: { popKey: PopKey; onClose: () => void; onOpenPhoto: (photo: string) => void }) {
  const [movements, setMovements] = useState<PopKeyMovement[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api.popKeyHistory(popKey.id).then((data) => setMovements(data.movements)).catch((err) => setError(err instanceof Error ? err.message : "Não foi possível carregar o histórico.")); }, [popKey.id]);
  return (
    <AdminModal title={`Histórico da chave · ${popKey.pop}`} onClose={onClose}>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!movements && !error && <p className="pk-empty">Carregando...</p>}
      {movements && movements.length === 0 && <p className="pk-empty">Nenhuma retirada ou devolução registrada pelo sistema ainda.</p>}
      {movements && movements.length > 0 && (
        <ol className="pk-history">
          {movements.map((movement) => (
            <li key={movement.id}>
              {movement.action === "Retirada" ? <PersonPhoto movementId={movement.hasPhoto ? movement.id : null} name={movement.holderName || "?"} onOpen={onOpenPhoto} /> : <span className="pk-avatar is-md is-return" aria-hidden="true"><RotateCcw size={16} /></span>}
              <div>
                <b>{ACTION_LABEL[movement.action]}{movement.holderName ? ` · ${movement.holderName}` : ""}</b>
                <small>{dateTime(movement.happenedAt)}{movement.userName ? ` · registrado por ${movement.userName}` : ""}</small>
                {movement.notes && <small className="pk-notes">{movement.notes}</small>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </AdminModal>
  );
}

function AddPopModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [pop, setPop] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (pop.trim().length < 2) { setError("Informe o nome do POP."); return; }
    setSaving(true); setError("");
    try { await api.addPopKey(pop.trim()); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível cadastrar o POP."); }
    finally { setSaving(false); }
  }
  return (
    <AdminModal title="Novo POP" onClose={() => { if (!saving) onClose(); }}>
      <div className="pk-form" data-save-scope>
        <label>Nome do POP<input value={pop} onChange={(event) => setPop(event.target.value)} maxLength={80} placeholder="Ex.: GUARULHOS 6" autoFocus /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="pk-form-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className="primary-button" onClick={() => void save()} disabled={saving} data-save-button>{saving ? "Salvando..." : "Cadastrar POP"}</button>
        </div>
      </div>
    </AdminModal>
  );
}
