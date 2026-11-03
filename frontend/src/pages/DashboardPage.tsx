import { useEffect, useState } from "react";
import { Activity, BarChart3, ChevronRight, SlidersHorizontal } from "lucide-react";
import { api, type Call, type Role, type User, type DashboardMetrics } from "../api";
import { toOperationalDate } from "../dates";
import { ActivityRow, DateRangeFilter, Metric } from "../components/ui";
import { RangeCallTable } from "./CallsPage";

export function DashboardWithDateFilter({ user }: { user: User & { role: Role } }) {
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  return <OperationalDashboard user={user} dateRange={dateRange} onDateRangeChange={setDateRange} />;
}

export function getDailyCallBars(calls: Call[], dateRange: { from: string; to: string }) {
  const endKey = dateRange.to || toOperationalDate();
  const end = Date.parse(`${endKey}T12:00:00Z`);
  const start = dateRange.from ? Date.parse(`${dateRange.from}T12:00:00Z`) : end - 6 * 86400000;
  const counts = new Map<string, number>();
  calls.forEach((call) => {
    const key = toOperationalDate(call.openedAt);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const bars: { key: string; label: string; value: number }[] = [];
  for (let cursor = start; cursor <= end; cursor += 86400000) {
    const key = new Date(cursor).toISOString().slice(0, 10);
    bars.push({ key, label: `${key.slice(8, 10)}/${key.slice(5, 7)}`, value: counts.get(key) || 0 });
  }
  return bars.slice(-14);
}

export function OperationalDashboard({ user, dateRange, onDateRangeChange }: { user: User; dateRange: { from: string; to: string }; onDateRangeChange: (value: { from: string; to: string }) => void }) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [callsInRange, setCallsInRange] = useState<Call[]>([]);
  const [error, setError] = useState("");
  const dailyCallBars = getDailyCallBars(callsInRange, dateRange);
  const dailyMax = Math.max(1, ...dailyCallBars.map((item) => item.value));
        useEffect(() => {
          api.dashboard(dateRange)
            .then((data) => {
              setMetrics(data.metrics);
              setError("");
            })
            .catch((err) => setError(err instanceof Error ? err.message : "Nao foi possivel carregar os indicadores."));
        }, [dateRange.from, dateRange.to]);

        useEffect(() => {
          api.calls(undefined, { from: dateRange.from, to: dateRange.to })
            .then((data) => setCallsInRange(data.calls))
            .catch(() => setCallsInRange([]));
        }, [dateRange.from, dateRange.to]);

        if (error) return <div className="empty-state">{error}</div>;
        if (!metrics) return <div className="empty-state">Carregando indicadores...</div>;

        return (
          <>
            <div className="page-heading dashboard-page-heading">
              <div>
                <span className="section-kicker">OPERACAO DE REDE</span>
                <h1>Visao geral</h1>
                <p>Indicadores calculados no backend a partir dos dados operacionais atuais.</p>
              </div>
              <div className="dashboard-toolbar">
                <DateRangeFilter value={dateRange} onChange={onDateRangeChange} />
                <button className="secondary-button dashboard-refresh-button" onClick={() => api.dashboard(dateRange).then((data) => setMetrics(data.metrics))}>
                  <Activity size={16}/> Atualizar
                </button>
              </div>
            </div>

            <div className="metric-grid">
              <Metric label="Recebidos hoje" value={String(metrics.receivedToday)} note="Chamados abertos hoje" positive />
              <Metric label="Chamados abertos" value={String(metrics.open)} note={`${metrics.unassigned} sem tecnico`} />
              <Metric label="Em atendimento" value={String(metrics.inProgress)} note="Atribuidos ou em campo" />
              <Metric label="Pendentes de aceite" value={String(metrics.pendingActivations)} note={`${metrics.finished} finalizados`} positive />
            </div>

            <div className="dashboard-grid">
              <section className="panel chart-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">STATUS</span>
                    <h2>Distribuicao dos chamados</h2>
                  </div>
                </div>
                <div className="bar-chart">
                  {metrics.byStatus.map((item) => (
                    <div className="bar-item" key={item.label}>
                      <div className="bar-track"><i style={{ height: `${Math.max(8, item.value * 28)}px` }} /></div>
                      <strong>{item.value}</strong>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="panel status-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">REGIOES</span>
                    <h2>Volume por regiao</h2>
                  </div>
                </div>
                <div className="rank-list rank-list-scroll">
                  {metrics.byRegion.map((item) => (
                    <div className="rank-row" key={item.label}>
                      <span>{item.label}</span>
                      <div><i style={{ width: `${Math.max(8, item.value * 30)}%` }} /></div>
                      <b>{item.value}</b>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="panel status-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">LOCALIDADE</span>
                  <h2>Chamados por Bairro</h2>
                </div>
              </div>
              <div className="rank-list rank-list-scroll">
                {metrics.byNeighborhood.length ? metrics.byNeighborhood.map((item) => (
                  <div className="rank-row" key={item.label}>
                    <span>{item.label}</span>
                    <div><i style={{ width: `${Math.max(8, item.value * 30)}%` }} /></div>
                    <b>{item.value}</b>
                  </div>
                )) : <div className="empty-state">Nenhum chamado com bairro no período.</div>}
              </div>
            </section>

            <section className="panel chart-panel daily-calls-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">ABERTURAS</span>
                  <h2>Chamados abertos por dia</h2>
                </div>
              </div>
              <div className="bar-chart daily-bar-chart">
                {dailyCallBars.map((item) => (
                  <div className="bar-item" key={item.key}>
                    <div className="bar-track"><i style={{ height: `${Math.max(8, (item.value / dailyMax) * 170)}px` }} /></div>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="dashboard-grid">
              <section className="panel status-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">TECNICOS</span>
                    <h2>Chamados atribuidos</h2>
                  </div>
                </div>
                <div className="rank-list rank-list-scroll">
                  {metrics.byTechnician.length ? metrics.byTechnician.map((item) => (
                    <div className="rank-row" key={item.label}>
                      <span>{item.label}</span>
                      <div><i style={{ width: `${Math.max(8, item.value * 30)}%` }} /></div>
                      <b>{item.value}</b>
                    </div>
                  )) : <div className="empty-state">Nenhum chamado atribuido.</div>}
                </div>
              </section>

              <section className="panel status-panel">
                <div className="panel-heading">
                  <div>
                    <span className="section-kicker">TIPOS</span>
                    <h2>Chamados por tipo</h2>
                  </div>
                </div>
                <div className="rank-list rank-list-scroll">
                  {metrics.byType.map((item) => (
                    <div className="rank-row" key={item.label}>
                      <span>{item.label}</span>
                      <div><i style={{ width: `${Math.max(8, item.value * 30)}%` }} /></div>
                      <b>{item.value}</b>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <RangeCallTable calls={callsInRange} />
          </>
        );
}

export function Dashboard({ user }: { user: User }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">
            QUARTA-FEIRA, 18 DE SETEMBRO DE 2026
          </span>
          <h1>Bom dia, {user.name.split(" ")[0]}.</h1>
          <p>
            Acompanhe o pulso da operação e mantenha sua equipe em movimento.
          </p>
        </div>
        <button className="secondary-button">
          <SlidersHorizontal size={16} /> Personalizar
        </button>
      </div>
      <div className="metric-grid">
        <Metric
          label="Chamados recebidos hoje"
          value="128"
          note="+12,4% vs. ontem"
          positive
        />
        <Metric label="Chamados abertos" value="42" note="8 sem técnico" />
        <Metric label="Em atendimento" value="67" note="14 em campo" />
        <Metric
          label="Finalizados hoje"
          value="19"
          note="Tempo médio 03h42"
          positive
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">FLUXO OPERACIONAL</span>
              <h2>Chamados por período</h2>
            </div>
            <button className="select-button">
              Últimos 7 dias <ChevronRight size={15} />
            </button>
          </div>
          <div className="chart">
            <div className="chart-y">
              <span>160</span>
              <span>120</span>
              <span>80</span>
              <span>40</span>
              <span>0</span>
            </div>
            <div className="chart-area">
              <div className="grid-line" />
              <div className="grid-line" />
              <div className="grid-line" />
              <div className="grid-line" />
              <svg viewBox="0 0 700 220" preserveAspectRatio="none">
                <path
                  className="chart-fill"
                  d="M0,176 C40,160 70,162 110,128 S175,145 220,112 S280,95 325,114 S380,75 430,88 S490,50 535,78 S590,45 640,61 S680,30 700,38 L700,220 L0,220Z"
                />
                <path
                  className="chart-line"
                  d="M0,176 C40,160 70,162 110,128 S175,145 220,112 S280,95 325,114 S380,75 430,88 S490,50 535,78 S590,45 640,61 S680,30 700,38"
                />
              </svg>
              <div className="chart-labels">
                <span>12 set</span>
                <span>13 set</span>
                <span>14 set</span>
                <span>15 set</span>
                <span>16 set</span>
                <span>17 set</span>
                <span>18 set</span>
              </div>
            </div>
          </div>
        </section>
        <section className="panel status-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">DISTRIBUICAO</span>
              <h2>Status dos chamados</h2>
            </div>
            <BarChart3 size={19} className="muted-icon" />
          </div>
          <div className="donut-wrap">
            <div className="donut">
              <div>
                <strong>128</strong>
                <small>Total</small>
              </div>
            </div>
            <div className="legend">
              <span>
                <i className="blue" />
                Em atendimento <b>67</b>
              </span>
              <span>
                <i className="cyan" />
                Abertos <b>42</b>
              </span>
              <span>
                <i className="gray" />
                Finalizados <b>19</b>
              </span>
            </div>
          </div>
        </section>
      </div>
      <section className="panel activity-panel">
        <div className="panel-heading">
          <div>
            <span className="section-kicker">ACOMPANHAMENTO</span>
            <h2>Atividade recente</h2>
          </div>
          <button className="link-button">
            Ver tudo <ChevronRight size={15} />
          </button>
        </div>
        <div className="activity-list">
          <ActivityRow
            color="blue"
            text="Novo chamado recebido"
            detail="Ordem #RF-240918 · Região Sul"
            time="há 4 min"
          />
          <ActivityRow
            color="green"
            text="Chamado finalizado"
            detail="Ordem #RF-240912 · Carlos Mendes"
            time="há 18 min"
          />
          <ActivityRow
            color="orange"
            text="Chamado sem técnico"
            detail="Ordem #RF-240905 · Região Leste"
            time="há 31 min"
          />
        </div>
      </section>
    </>
  );
}
