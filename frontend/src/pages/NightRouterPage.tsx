import { useEffect, useMemo, useState } from "react";
import { Copy, Eraser, MoonStar, Save } from "lucide-react";
import { api, type NightRouterData, type NightShift, type Role, type User } from "../api";

// Roteirizador da madrugada: das 00h as 06h a extensao do PC da coleta move no OFS os chamados sem tecnico para o
// tecnico de plantao da regiao. Aqui: liga/desliga, modo teste, escala de plantao e o que o robo fez.
// Ver: quem ve a Integracao OFS. Mudar: quem gerencia as configuracoes.
const DAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABEL: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };
const RESULT_CLASS: Record<string, string> = { Movida: "is-ok", Teste: "is-test", Pulada: "is-skip", Erro: "is-error" };
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const cellKey = (region: string, weekday: number) => `${region}|${weekday}`;

export function NightRouterPage({ user }: { user: User & { role: Role } }) {
  const canManage = user.role.permissions.includes("settings.manage");
  const [data, setData] = useState<NightRouterData | null>(null);
  const [grid, setGrid] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const next = await api.nightRouter();
      setData(next);
      setGrid(Object.fromEntries(next.shifts.map((shift) => [cellKey(shift.region, shift.weekday), shift.technicianId])));
      setDirty(false);
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar o roteirizador."); }
  }
  useEffect(() => { void load(); }, []);

  const technicianName = useMemo(() => new Map((data?.technicians ?? []).map((tech) => [tech.id, tech.name])), [data]);
  const filled = Object.values(grid).filter(Boolean).length;

  async function saveSettings(change: Partial<{ enabled: boolean; testMode: boolean }>) {
    if (!data) return;
    setSaving(true); setNotice("");
    try {
      const { settings } = await api.saveNightRouterSettings({ enabled: data.settings.enabled, testMode: data.settings.testMode, ...change });
      setData({ ...data, settings });
      setNotice(settings.enabled ? (settings.testMode ? "Ligado em modo teste: nada é movido no OFS." : "Ligado: das 00h às 06h as ordens serão movidas no OFS.") : "Desligado.");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  }

  async function saveGrid() {
    setSaving(true); setNotice("");
    try {
      const shifts: NightShift[] = Object.entries(grid).filter(([, technicianId]) => technicianId).map(([key, technicianId]) => { const index = key.lastIndexOf("|"); return { region: key.slice(0, index), weekday: Number(key.slice(index + 1)), technicianId }; });
      await api.saveNightShifts(shifts);
      setDirty(false);
      setNotice("Escala salva.");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar a escala."); }
    finally { setSaving(false); }
  }

  const setCell = (region: string, weekday: number, technicianId: string) => { setGrid((current) => ({ ...current, [cellKey(region, weekday)]: technicianId })); setDirty(true); };
  const repeatRow = (region: string) => {
    const first = DAYS.map((day) => grid[cellKey(region, day)]).find(Boolean);
    if (!first) return;
    setGrid((current) => ({ ...current, ...Object.fromEntries(DAYS.map((day) => [cellKey(region, day), first])) }));
    setDirty(true);
  };
  const clearRow = (region: string) => { setGrid((current) => ({ ...current, ...Object.fromEntries(DAYS.map((day) => [cellKey(region, day), ""])) })); setDirty(true); };

  const settings = data?.settings;
  const state = !settings?.enabled ? "Desligado" : settings.testMode ? "Ligado · modo teste" : "Ligado";
  return (
    <div className="nr-page">
      <div className="page-heading">
        <div>
          <span className="section-kicker">ADMINISTRAÇÃO</span>
          <h1>Roteirizador da madrugada</h1>
          <p>Das 00:00 às 06:00, quando os mesários não estão, a extensão do computador da coleta move no OFS os chamados sem técnico para o técnico de plantão da região.</p>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="nr-notice" role="status">{notice}</p>}
      {!data ? (!error && <p className="nr-muted">Carregando…</p>) : (
        <>
          <section className="panel nr-status" aria-label="Situação do roteirizador">
            <div className="nr-status-head">
              <span className="nr-status-icon" aria-hidden="true"><MoonStar size={22} /></span>
              <div>
                <strong className={`nr-state ${settings?.enabled ? (settings.testMode ? "is-test" : "is-on") : "is-off"}`}>{state}</strong>
                <small>{data.janela ? "Agora é madrugada: o robô está na janela de trabalho." : "Fora da janela (00h–06h): o robô só move de madrugada."} · {data.semTecnico} chamado(s) sem técnico agora · escala com {filled} plantão(ões).</small>
                {settings?.updatedBy && <small>Última mudança: {settings.updatedBy}{settings.updatedAt ? `, ${dateTime(settings.updatedAt)}` : ""}.</small>}
              </div>
            </div>
            <div className="nr-switches">
              <label className="nr-switch"><input type="checkbox" checked={Boolean(settings?.enabled)} disabled={!canManage || saving} onChange={(event) => void saveSettings({ enabled: event.target.checked })} /> Ligado</label>
              <label className="nr-switch"><input type="checkbox" checked={Boolean(settings?.testMode)} disabled={!canManage || saving} onChange={(event) => void saveSettings({ testMode: event.target.checked })} /> Modo teste (faz tudo no OFS e clica Ignorar, sem mover)</label>
            </div>
            <ul className="nr-rules">
              <li>Só entram chamados abertos, atribuídos ou atrelados <b>sem técnico</b>, com o OFS pendente, de uma região com plantão na madrugada.</li>
              <li>No OFS, o robô só move a OS <b>pendente de hoje</b> que está num balde (CLUSTER_ ou BKI_). Se já estiver com uma pessoa, ele não mexe e registra como pulada.</li>
              <li>Motivo usado: “Reordenação de Prioridade - BackOffice”. A ordem fica na posição em que o OFS colocar e o chamado já recebe o técnico aqui.</li>
              <li>Precisa da extensão <b>1.10.0</b> no computador da coleta, com o OFS aberto e logado a noite toda. No popup, aba OFS, “Rodar agora” testa fora do horário (só no modo teste).</li>
            </ul>
          </section>

          <section className="panel nr-grid-panel" aria-label="Escala de plantão">
            <div className="nr-grid-head">
              <div><h2>Escala de plantão</h2><p className="nr-muted">Técnico de cada região em cada madrugada. “Seg” = de domingo para segunda (00h–06h de segunda).</p></div>
              {canManage && <button type="button" className="primary-button compact" onClick={() => void saveGrid()} disabled={!dirty || saving}><Save size={15} aria-hidden="true" />{saving ? "Salvando…" : "Salvar escala"}</button>}
            </div>
            {!data.regions.length ? <p className="nr-muted">Nenhuma região cadastrada ainda.</p> : (
              <div className="nr-table-wrap">
                <table className="nr-table">
                  <thead><tr><th scope="col">Região</th>{DAYS.map((day) => <th key={day} scope="col">{DAY_LABEL[day]}</th>)}{canManage && <th scope="col"><span className="sr-only">Ações</span></th>}</tr></thead>
                  <tbody>
                    {data.regions.map((region) => {
                      const local = data.technicians.filter((tech) => tech.region.localeCompare(region, "pt-BR", { sensitivity: "base" }) === 0);
                      const others = data.technicians.filter((tech) => !local.includes(tech));
                      return (
                        <tr key={region}>
                          <th scope="row">{region}</th>
                          {DAYS.map((day) => {
                            const value = grid[cellKey(region, day)] || "";
                            return (
                              <td key={day}>
                                {canManage ? (
                                  <select aria-label={`Plantão de ${region} na madrugada de ${DAY_LABEL[day]}`} value={value} onChange={(event) => setCell(region, day, event.target.value)} className={value ? "has-value" : ""}>
                                    <option value="">—</option>
                                    {local.length > 0 && <optgroup label={`Da região ${region}`}>{local.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</optgroup>}
                                    {others.length > 0 && <optgroup label="Outras regiões">{others.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</optgroup>}
                                  </select>
                                ) : <span>{technicianName.get(value) || "—"}</span>}
                              </td>
                            );
                          })}
                          {canManage && (
                            <td className="nr-row-actions">
                              <button type="button" className="icon-button" title="Repetir o primeiro plantão da linha em todos os dias" aria-label={`Repetir plantão de ${region} em todos os dias`} onClick={() => repeatRow(region)}><Copy size={15} /></button>
                              <button type="button" className="icon-button" title="Limpar a linha" aria-label={`Limpar plantão de ${region}`} onClick={() => clearRow(region)}><Eraser size={15} /></button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel nr-runs" aria-label="O que o roteirizador fez">
            <h2>O que o robô fez</h2>
            <p className="nr-muted">Últimas 100 ordens tentadas.</p>
            {!data.runs.length ? <p className="nr-muted">Nada ainda.</p> : (
              <div className="nr-table-wrap">
                <table className="nr-table nr-runs-table">
                  <thead><tr><th scope="col">Quando</th><th scope="col">Ordem</th><th scope="col">Região</th><th scope="col">Técnico</th><th scope="col">Resultado</th><th scope="col">Detalhe</th></tr></thead>
                  <tbody>
                    {data.runs.map((run) => (
                      <tr key={run.id}>
                        <td>{dateTime(run.createdAt)}</td>
                        <td><strong>{run.orderNumber}</strong></td>
                        <td>{run.region || "—"}</td>
                        <td>{run.technicianName || "—"}</td>
                        <td><span className={`nr-result ${RESULT_CLASS[run.result] || ""}`}>{run.result}</span></td>
                        <td className="nr-message">{run.message || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
