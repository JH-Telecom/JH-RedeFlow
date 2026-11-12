import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, MapPinOff, Save } from "lucide-react";
import { api, type MissingRegionCall, type Role, type User } from "../api";

// Fila "Sem região": chamados com região vazia ou "Não informada" (qualquer status). Escolha a região e salve; com
// "todos desta OLT", os outros chamados sem região da mesma OLT recebem a mesma região (e, para quem gerencia as
// configurações, a OLT fica cadastrada nessa região para os próximos chamados).
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export function MissingRegionPage({ user }: { user: User & { role: Role } }) {
  const canEdit = user.role.permissions.includes("calls.edit");
  const canMapOlt = user.role.permissions.includes("settings.manage");
  const [calls, setCalls] = useState<MissingRegionCall[] | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [byOlt, setByOlt] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(target = page) {
    try {
      const data = await api.missingRegionCalls(target);
      setCalls(data.calls); setRegions(data.regions); setTotal(data.total); setPage(data.page); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar os chamados sem região."); }
  }
  useEffect(() => { void load(1); }, []);

  async function save(call: MissingRegionCall) {
    const region = choice[call.id];
    if (!region) return;
    setSaving(call.id); setNotice("");
    try {
      const applyOlt = Boolean(byOlt[call.id] && call.olt && call.sameOlt > 0);
      const result = await api.setCallRegion(call.id, region, applyOlt);
      setNotice(`Ordem ${call.orderNumber}: região ${region}${result.others ? ` · mais ${result.others} chamado(s) da OLT ${call.olt}` : ""}${result.oltSaved ? ` · OLT ${call.olt} cadastrada em ${region}` : ""}.`);
      await load(page);
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar a região."); }
    finally { setSaving(null); }
  }

  const pages = Math.max(1, Math.ceil(total / 100));
  return (
    <div className="mr-page">
      <div className="page-heading">
        <div>
          <span className="section-kicker">OPERAÇÃO</span>
          <h1>Sem região</h1>
          <p>Chamados com a região "Não informada". Coloque a região certa para eles entrarem nos filtros e indicadores por região.</p>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="mr-notice" role="status">{notice}</p>}
      <section className="panel table-panel">
        {!calls ? <div className="empty-state">Carregando…</div> : !calls.length ? (
          <div className="empty-state mr-empty"><MapPinOff size={22} aria-hidden="true" /> Nenhum chamado sem região. Tudo certo!</div>
        ) : (
          <>
            <div className="mr-summary"><strong>{total.toLocaleString("pt-BR")}</strong> chamado(s) sem região</div>
            <div className="mr-scroll">
              <table className="mr-table">
                <thead><tr><th>Ordem</th><th>Status</th><th>Tipo</th><th>OLT · Slot/PON</th><th>Local</th><th>Abertura</th><th>Região</th></tr></thead>
                <tbody>
                  {calls.map((call) => (
                    <tr key={call.id}>
                      <td><Link to={`/chamados/${call.id}`}><strong>{call.orderNumber}</strong></Link>{call.technicianName && <small>{call.technicianName}</small>}</td>
                      <td>{call.status}</td>
                      <td>{call.type}</td>
                      <td>{call.olt || "—"}{call.slotPon && <small>{call.slotPon}</small>}</td>
                      <td className="mr-place">{[call.bairro, call.city].filter(Boolean).join(" · ") || "—"}{call.address && <small>{call.address}</small>}</td>
                      <td>{dateTime(call.openedAt)}</td>
                      <td className="mr-edit">
                        {canEdit ? (
                          <>
                            <div className="mr-edit-row">
                              <select value={choice[call.id] || ""} onChange={(event) => setChoice((current) => ({ ...current, [call.id]: event.target.value }))} aria-label={`Região da ordem ${call.orderNumber}`}>
                                <option value="">Escolha a região</option>
                                {regions.map((region) => <option key={region}>{region}</option>)}
                              </select>
                              <button type="button" className="primary-button compact" disabled={!choice[call.id] || saving === call.id} onClick={() => void save(call)}><Save size={14} aria-hidden="true" />{saving === call.id ? "Salvando…" : "Salvar"}</button>
                            </div>
                            {call.olt && call.sameOlt > 0 && (
                              <label className="mr-olt">
                                <input type="checkbox" checked={Boolean(byOlt[call.id])} onChange={(event) => setByOlt((current) => ({ ...current, [call.id]: event.target.checked }))} />
                                Aplicar também aos outros {call.sameOlt} da OLT {call.olt}{canMapOlt ? " e cadastrar a OLT nessa região" : ""}
                              </label>
                            )}
                          </>
                        ) : <span className="mr-muted">Sem permissão para editar</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="mr-pager">
                <button type="button" className="icon-button" aria-label="Página anterior" disabled={page <= 1} onClick={() => void load(page - 1)}><ChevronLeft size={16} /></button>
                <span>Página {page} de {pages}</span>
                <button type="button" className="icon-button" aria-label="Próxima página" disabled={page >= pages} onClick={() => void load(page + 1)}><ChevronRight size={16} /></button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
