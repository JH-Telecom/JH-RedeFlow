import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Save } from "lucide-react";
import { api, type NetworkSource, type PopOlt } from "../api";
import { Pager, usePaged } from "../components/Pager";
import { parseKml, readNetworkFile, toBatches, type NetCable, type NetElement } from "../lib/network-kml";

// Importacao dos KMZ/KML da rede e tabela POP -> OLT. Exige a permissao network.manage.
type Row = {
  id: string; fileName: string; sha256: string; skipped: string | null;
  elements: NetElement[]; cables: NetCable[];
  state: "pronto" | "enviando" | "enviado" | "erro"; progress: string; error: string;
};
type Payload = { fileName: string; sha256: string; first: boolean; elements: NetElement[]; cables: NetCable[] };
const MAX_BATCH_BYTES = 3_500_000; // abaixo do limite de corpo do proxy da Vercel (~4,5 MB)
const MAX_SPLIT_DEPTH = 10;
const count = (items: NetElement[], kind: NetElement["kind"]) => items.filter((item) => item.kind === kind).length;
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

async function sha256Hex(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Divide o lote se o JSON passar de ~3,5 MB; se o servidor ainda responder 413, divide ao meio e tenta de novo.
async function sendBatch(payload: Payload, depth = 0): Promise<void> {
  const total = payload.elements.length + payload.cables.length;
  const tooBig = total > 1 && JSON.stringify(payload).length > MAX_BATCH_BYTES;
  if (!tooBig) {
    try { await api.networkImportBatch(payload); return; }
    catch (err) {
      if (!((err as { status?: number }).status === 413 && total > 1 && depth < MAX_SPLIT_DEPTH)) throw err;
    }
  }
  const { elements, cables } = payload;
  const useElements = elements.length > 1 || cables.length === 0;
  const cut = Math.ceil((useElements ? elements.length : cables.length) / 2);
  const halves = useElements
    ? [{ elements: elements.slice(0, cut), cables: [] as NetCable[] }, { elements: elements.slice(cut), cables }]
    : [{ elements, cables: cables.slice(0, cut) }, { elements: [] as NetElement[], cables: cables.slice(cut) }];
  await sendBatch({ ...payload, ...halves[0] }, depth + 1);
  await sendBatch({ ...payload, ...halves[1], first: false }, depth + 1);
}

export function NetworkImportPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [sources, setSources] = useState<NetworkSource[] | null>(null);
  const [popOlts, setPopOlts] = useState<PopOlt[] | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadLists() {
    try {
      const [fontes, tabela] = await Promise.all([api.networkSources(), api.popOlts()]);
      setSources(fontes.sources); setPopOlts(tabela.popOlts); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar os dados da rede."); }
  }
  useEffect(() => { void loadLists(); }, []);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setReading(true); setMessage("");
    const next: Row[] = [];
    for (const file of Array.from(files)) {
      const base: Row = { id: `${file.name}-${file.size}-${next.length}-${Date.now()}`, fileName: file.name, sha256: "", skipped: null, elements: [], cables: [], state: "pronto", progress: "", error: "" };
      try {
        const data = await file.arrayBuffer();
        const read = await readNetworkFile(file.name, data);
        if ("skipped" in read) next.push({ ...base, skipped: read.skipped });
        else { const parsed = parseKml(read.text); next.push({ ...base, sha256: await sha256Hex(data), elements: parsed.elements, cables: parsed.cables }); }
      } catch (err) { next.push({ ...base, skipped: err instanceof Error ? err.message : "erro ao ler o arquivo" }); }
    }
    setRows(next); setReading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  const update = (id: string, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const importable = rows.filter((row) => !row.skipped && row.state !== "enviado" && (row.elements.length || row.cables.length));

  async function importAll() {
    setSending(true); setMessage("");
    let done = 0; let failed = 0;
    for (const row of importable) {
      try {
        update(row.id, { state: "enviando", progress: "Preparando...", error: "" });
        const sha256 = row.sha256;
        const elementBatches = toBatches(row.elements);
        const cableBatches = toBatches(row.cables);
        const total = elementBatches.length + cableBatches.length;
        let sent = 0;
        let first = true;
        for (const batch of elementBatches) {
          await sendBatch({ fileName: row.fileName, sha256, first, elements: batch, cables: [] });
          first = false; sent += 1; update(row.id, { progress: `Enviando lote ${sent} de ${total}` });
        }
        for (const batch of cableBatches) {
          await sendBatch({ fileName: row.fileName, sha256, first, elements: [], cables: batch });
          first = false; sent += 1; update(row.id, { progress: `Enviando lote ${sent} de ${total}` });
        }
        update(row.id, { state: "enviado", progress: "Importado" }); done += 1;
      } catch (err) { failed += 1; const reason = err instanceof Error ? err.message : "erro desconhecido"; update(row.id, { state: "erro", progress: "", error: `Falha no envio: ${reason}. Os dados anteriores de "${row.fileName}" podem ter sido apagados e o arquivo está incompleto — importe de novo.` }); }
    }
    setSending(false);
    setMessage(`${done} importado(s), ${failed} com erro.`);
    void loadLists();
  }

  return (
    <div className="net-page">
      <div className="page-heading">
        <div>
          <span className="section-kicker">ADMINISTRAÇÃO</span>
          <h1>Rede (KMZ)</h1>
          <p>Importe os arquivos .kml ou .kmz da rede e mantenha a tabela de qual OLT atende cada POP.</p>
        </div>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}

      <section className="panel net-panel">
        <div className="panel-heading"><div><span className="section-kicker">IMPORTAR</span><h2>Arquivos da rede</h2></div></div>
        <div className="net-actions">
          <label className="secondary-button net-pick">
            <FileUp size={16} aria-hidden="true" /> Escolher arquivos
            <input ref={inputRef} type="file" accept=".kml,.kmz" multiple className="net-file-input" onChange={(event) => void pick(event.target.files)} disabled={reading || sending} />
          </label>
          <button type="button" className="primary-button" onClick={() => void importAll()} disabled={sending || reading || importable.length === 0}>
            {sending ? "Importando..." : `Importar${importable.length ? ` (${importable.length})` : ""}`}
          </button>
          {reading && <span className="net-hint">Lendo arquivos...</span>}
        </div>
        {message && <p className="net-ok" role="status">{message}</p>}
        {rows.length > 0 && (
          <ul className="net-files">
            {rows.map((row) => (
              <li key={row.id} className={`net-file${row.skipped || row.state === "erro" ? " is-bad" : ""}`}>
                <strong>{row.fileName}</strong>
                {row.skipped
                  ? <span>não lido: {row.skipped}</span>
                  : <span>{count(row.elements, "cto")} CTOs, {count(row.elements, "ceo")} CEOs, {count(row.elements, "pop")} POPs, {count(row.elements, "outro")} outros, {row.cables.length} cabos</span>}
                {row.progress && <em className="net-progress">{row.progress}</em>}
                {row.error && <em className="net-error" role="alert">{row.error}</em>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel net-panel">
        <div className="panel-heading"><div><span className="section-kicker">FONTES</span><h2>Arquivos já importados</h2></div></div>
        {!sources && !error && <div className="empty-state">Carregando...</div>}
        {sources && sources.length === 0 && <div className="empty-state">Nenhum arquivo importado ainda.</div>}
        {sources && sources.length > 0 && <SourcesTable sources={sources} />}
      </section>

      <section className="panel net-panel">
        <div className="panel-heading"><div><span className="section-kicker">POP → OLT</span><h2>Qual OLT atende cada POP</h2></div></div>
        {!popOlts && !error && <div className="empty-state">Carregando...</div>}
        {popOlts && <PopOltTable popOlts={popOlts} onSaved={() => void loadLists()} />}
      </section>
    </div>
  );
}

function SourcesTable({ sources }: { sources: NetworkSource[] }) {
  const paged = usePaged(sources);
  return (
    <>
      <div className="net-table-wrap">
        <table className="net-table">
          <thead><tr><th>Arquivo</th><th>Elementos</th><th>Cabos</th><th>Importado por</th><th>Em</th></tr></thead>
          <tbody>
            {paged.pageItems.map((source) => (
              <tr key={source.fileName}><td><strong>{source.fileName}</strong></td><td>{source.elements.toLocaleString("pt-BR")}</td><td>{source.cables.toLocaleString("pt-BR")}</td><td>{source.importedBy}</td><td>{dateTime(source.importedAt)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...paged} noun={["arquivo", "arquivos"]} />
    </>
  );
}

function PopOltTable({ popOlts, onSaved }: { popOlts: PopOlt[]; onSaved: () => void }) {
  const [draft, setDraft] = useState({ pop: "", olt: "", note: "" });
  const [addError, setAddError] = useState("");
  const [saving, setSaving] = useState(false);
  const sorted = useMemo(() => [...popOlts].sort((a, b) => a.pop.localeCompare(b.pop, "pt-BR") || a.olt.localeCompare(b.olt, "pt-BR")), [popOlts]);
  const paged = usePaged(sorted);

  async function add() {
    if (!draft.pop.trim() || !draft.olt.trim()) { setAddError("Informe o POP e a OLT."); return; }
    setSaving(true); setAddError("");
    try { await api.savePopOlt({ pop: draft.pop.trim(), olt: draft.olt.trim(), active: true, note: draft.note.trim() || null }); setDraft({ pop: "", olt: "", note: "" }); onSaved(); }
    catch (err) { setAddError(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="net-add">
        <input value={draft.pop} onChange={(event) => setDraft({ ...draft, pop: event.target.value })} placeholder="POP" aria-label="POP" />
        <input value={draft.olt} onChange={(event) => setDraft({ ...draft, olt: event.target.value })} placeholder="OLT" aria-label="OLT" />
        <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Observação (opcional)" aria-label="Observação" />
        <button type="button" className="secondary-button" onClick={() => void add()} disabled={saving}><Save size={15} aria-hidden="true" /> Adicionar</button>
      </div>
      {addError && <div className="form-error" role="alert">{addError}</div>}
      {sorted.length === 0 ? <div className="empty-state">Nenhum POP cadastrado.</div> : (
        <div className="net-table-wrap">
          <table className="net-table">
            <thead><tr><th>POP</th><th>OLT</th><th>Ativo</th><th>Observação</th><th>Última alteração</th></tr></thead>
            <tbody>{paged.pageItems.map((row) => <PopOltRow key={`${row.pop}|${row.olt}`} row={row} onSaved={onSaved} />)}</tbody>
          </table>
        </div>
      )}
      <Pager {...paged} noun={["POP", "POPs"]} />
    </>
  );
}

function PopOltRow({ row, onSaved }: { row: PopOlt; onSaved: () => void }) {
  const [note, setNote] = useState(row.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setNote(row.note ?? ""); }, [row.note, row.updatedAt]);

  async function save(active: boolean) {
    setBusy(true); setError("");
    try { await api.savePopOlt({ pop: row.pop, olt: row.olt, active, note: note.trim() || null }); onSaved(); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }
  const dirty = note.trim() !== (row.note ?? "").trim();
  return (
    <tr className={row.active ? "" : "is-off"}>
      <td><strong>{row.pop}</strong></td>
      <td>{row.olt}</td>
      <td>
        <label className="net-toggle">
          <input type="checkbox" checked={row.active} disabled={busy} onChange={(event) => void save(event.target.checked)} aria-label={`${row.pop} ativo`} />
          <span>{row.active ? "Ativo" : "Desativado"}</span>
        </label>
      </td>
      <td>
        <div className="net-note">
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={row.active ? "Observação" : "Motivo (obrigatório)"} aria-label={`Observação de ${row.pop}`} />
          {dirty && <button type="button" className="secondary-button compact" disabled={busy} onClick={() => void save(row.active)}>Salvar</button>}
        </div>
        {error && <small className="net-error" role="alert">{error}</small>}
      </td>
      <td><small>{dateTime(row.updatedAt)}{row.confirmedBy ? ` · ${row.confirmedBy}` : ""}</small></td>
    </tr>
  );
}
