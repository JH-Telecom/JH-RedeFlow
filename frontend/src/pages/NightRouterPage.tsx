import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Eraser, MoonStar, Save } from "lucide-react";
import { api, type NightRouterData, type NightShift, type NightSummary, type Role, type User } from "../api";
import { SkeletonRows } from "../components/Skeleton";
import { readDataCache, writeDataCache } from "../lib/data-cache";
import { usePeriodicLoad } from "../lib/screen-cache";

// Roteirizador da madrugada: das 22h as 06h a extensao do PC da coleta move no OFS os chamados sem tecnico (acionados
// desde as 22h) para o tecnico unico da madrugada, se escolhido, ou para o tecnico de plantao da regiao. Os acionamentos
// pendentes que chegam nesse horario sao aceitos pelo sistema. Aqui: liga/desliga, modo teste, tecnico unico, escala e
// o que o robo fez.
// Ver: quem ve a Integracao OFS. Mudar: quem gerencia as configuracoes.
const DAYS = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABEL: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };
const RESULT_CLASS: Record<string, string> = { Movida: "is-ok", Teste: "is-test", Pulada: "is-skip", Erro: "is-error" };
const dateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const cellKey = (region: string, weekday: number) => `${region}|${weekday}`;

// Resumo da madrugada (18/11/2026): o que o robo fez da ultima vez, para quem chega de manha.
const clock = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
function NightSummaryPanel({ summary }: { summary: NightSummary }) {
  const day = new Date(summary.to).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const nothing = !summary.aceitos && !summary.movidas && !summary.teste && !summary.erros && !summary.puladas;
  return (
    <section className="panel nr-summary" aria-label="Resumo da madrugada">
      <div className="nr-summary-head">
        <h2>{summary.inProgress ? "Madrugada em andamento" : `Resumo da madrugada · ${day}`}</h2>
        <span className={`nr-summary-state ${summary.inProgress ? "is-running" : summary.erros ? "is-error" : "is-ok"}`}>{summary.inProgress ? "Em andamento" : summary.erros ? `${summary.erros} com erro` : "Sem erros"}</span>
      </div>
      <p className="nr-muted">De {clock(summary.from)} a {clock(summary.to)}.{nothing ? " O robô não aceitou nem moveu nenhum chamado." : ""}</p>
      <div className="nr-summary-kpis">
        <div><b>{summary.aceitos}</b><span>aceitos automaticamente</span></div>
        <div><b>{summary.movidas}</b><span>enviados ao técnico no OFS</span></div>
        <div className={summary.erros ? "is-error" : ""}><b>{summary.erros}</b><span>com erro</span></div>
        {summary.teste > 0 && <div><b>{summary.teste}</b><span>só testados (modo teste)</span></div>}
        {summary.puladas > 0 && <div><b>{summary.puladas}</b><span>pulados</span></div>}
      </div>
      {summary.problemas.length > 0 && (
        <ul className="nr-summary-errors">
          {summary.problemas.map((item) => <li key={`${item.orderNumber}-${item.createdAt}`}><time>{clock(item.createdAt)}</time><strong>{item.orderNumber}</strong><span>{[item.region, item.message].filter(Boolean).join(" · ")}</span></li>)}
        </ul>
      )}
    </section>
  );
}

export function NightRouterPage({ user }: { user: User & { role: Role } }) {
  const canManage = user.role.permissions.includes("settings.manage");
  const [data, setData] = useState<NightRouterData | null>(() => readDataCache<NightRouterData>("tela:roteirizador") ?? null);
  const [grid, setGrid] = useState<Record<string, string>>(() => Object.fromEntries((readDataCache<NightRouterData>("tela:roteirizador")?.shifts ?? []).map((shift) => [cellKey(shift.region, shift.weekday), shift.technicianId])));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const next = await api.nightRouter();
      setData(next);
      writeDataCache("tela:roteirizador", next);
      setGrid(Object.fromEntries(next.shifts.map((shift) => [cellKey(shift.region, shift.weekday), shift.technicianId])));
      setDirty(false);
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível carregar o roteirizador."); }
  }
  // Escala com mudanca nao salva: a atualizacao periodica espera (nao apaga o que a pessoa esta editando).
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  usePeriodicLoad("tela:roteirizador", () => (dirtyRef.current ? undefined : load()));

  const technicianName = useMemo(() => new Map((data?.technicians ?? []).map((tech) => [tech.id, tech.name])), [data]);
  const filled = Object.values(grid).filter(Boolean).length;

  async function saveSettings(change: Partial<{ enabled: boolean; testMode: boolean; singleTechnicianId: string | null }>) {
    if (!data) return;
    setSaving(true); setNotice("");
    try {
      const { settings } = await api.saveNightRouterSettings({ enabled: data.settings.enabled, testMode: data.settings.testMode, ...change });
      setData({ ...data, settings });
      if ("singleTechnicianId" in change) setNotice(settings.singleTechnicianId ? `Técnico único da madrugada: ${technicianName.get(settings.singleTechnicianId) ?? "salvo"}. Todos os chamados vão para ele.` : "Sem técnico único: vale a escala por região.");
      else setNotice(settings.enabled ? (settings.testMode ? "Ligado em modo teste: nada é movido no OFS e nenhum acionamento é aceito." : "Ligado: das 22h às 06h os acionamentos são aceitos e as ordens são movidas no OFS.") : "Desligado.");
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
  const singleId = settings?.singleTechnicianId ?? "";
  const state = !settings?.enabled ? "Desligado" : settings.testMode ? "Ligado · modo teste" : "Ligado";
  return (
    <div className="nr-page">
      <div className="page-heading">
        <div>
          <span className="section-kicker">ADMINISTRAÇÃO</span>
          <h1>Roteirizador da madrugada</h1>
          <p>Das 22:00 às 06:00, quando os mesários não estão, o sistema aceita os acionamentos que chegam e a extensão do computador da coleta move no OFS os chamados sem técnico para o técnico único da madrugada (se escolhido) ou para o técnico de plantão da região.</p>
        </div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="nr-notice" role="status">{notice}</p>}
      {!data ? (!error && <SkeletonRows rows={4} columns={3} label="Carregando o roteirizador..." />) : (
        <>
          {data.resumo && <NightSummaryPanel summary={data.resumo} />}
          <section className="panel nr-status" aria-label="Situação do roteirizador">
            <div className="nr-status-head">
              <span className="nr-status-icon" aria-hidden="true"><MoonStar size={22} /></span>
              <div>
                <strong className={`nr-state ${settings?.enabled ? (settings.testMode ? "is-test" : "is-on") : "is-off"}`}>{state}</strong>
                <small>{data.janela ? "Agora é madrugada: o robô está na janela de trabalho." : "Fora da janela (22h–06h): o robô só trabalha de madrugada."} · {data.semTecnico} chamado(s) sem técnico agora · escala com {filled} plantão(ões).</small>
                {settings?.updatedBy && <small>Última mudança: {settings.updatedBy}{settings.updatedAt ? `, ${dateTime(settings.updatedAt)}` : ""}.</small>}
              </div>
            </div>
            <div className="nr-switches">
              <label className="nr-switch"><input type="checkbox" checked={Boolean(settings?.enabled)} disabled={!canManage || saving} onChange={(event) => void saveSettings({ enabled: event.target.checked })} /> Ligado</label>
              <label className="nr-switch"><input type="checkbox" checked={Boolean(settings?.testMode)} disabled={!canManage || saving} onChange={(event) => void saveSettings({ testMode: event.target.checked })} /> Modo teste (faz tudo no OFS e clica Ignorar, sem mover; não aceita acionamentos)</label>
            </div>
            <div className="nr-single">
              <label htmlFor="nr-single-tech" className="nr-switch">Técnico único da madrugada</label>
              {canManage ? (
                <select id="nr-single-tech" value={singleId} disabled={saving} onChange={(event) => void saveSettings({ singleTechnicianId: event.target.value || null })}>
                  <option value="">Nenhum (usar a escala por região)</option>
                  {singleId && !technicianName.has(singleId) && <option value={singleId}>Técnico indisponível (usa a escala)</option>}
                  {data.technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                </select>
              ) : <strong>{singleId ? technicianName.get(singleId) ?? "Técnico indisponível (usa a escala)" : "Nenhum (usa a escala por região)"}</strong>}
              <small className="nr-muted">Escolhido, recebe <b>todos</b> os chamados da madrugada, de qualquer região e tipo (NOC ACESSO, NOC TX, Backbone, Field…), e a escala abaixo é ignorada. Se ele for desligado ou deixar de ser técnico, volta a valer a escala.</small>
            </div>
            <ul className="nr-rules">
              <li>Só entram chamados <b>acionados a partir das 22h</b> desta madrugada, abertos, atribuídos ou atrelados <b>sem técnico</b> e com o OFS pendente (de uma região com plantão, se não houver técnico único). O que chegou antes das 22h fica com os mesários.</li>
              <li>Acionamentos pendentes recebidos das 22h às 06h são <b>aceitos pelo sistema</b> (“Roteirizador da madrugada”); card repetido é ligado ao chamado que já existe. Os recebidos antes das 22h continuam esperando o aceite manual. No modo teste nada é aceito.</li>
              <li>No OFS, o robô só move a OS <b>pendente de hoje</b> que está num balde (CLUSTER_ ou BKI_). Se já estiver com uma pessoa, ele não mexe e registra como pulada.</li>
              <li>Motivo usado: “Reordenação de Prioridade - BackOffice”. A ordem fica na posição em que o OFS colocar e o chamado já recebe o técnico aqui.</li>
              <li>Precisa da extensão <b>1.12.1</b> no computador da coleta, com o OFS aberto e logado a noite toda. No popup, aba OFS, “Rodar agora” testa fora do horário (só no modo teste).</li>
            </ul>
          </section>

          <section className="panel nr-grid-panel" aria-label="Escala de plantão">
            <div className="nr-grid-head">
              <div><h2>Escala de plantão</h2><p className="nr-muted">Técnico de cada região em cada madrugada. “Seg” = de domingo para segunda (22h de domingo às 06h de segunda).{singleId && technicianName.has(singleId) ? " Ignorada enquanto houver técnico único." : ""}</p></div>
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
