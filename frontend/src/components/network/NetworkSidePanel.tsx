import { useMemo } from "react";
import { ExternalLink, MapPinOff, X } from "lucide-react";
import type { NetworkElementRow, NetworkSituation, PonClient, PonView } from "../../api";
import { Pager, usePaged } from "../Pager";
import { ELEMENT_LABELS, SITUATION_COLORS, SITUATION_LABELS, SITUATION_ORDER } from "./network-colors";

// Painel lateral do Mapa da rede: detalhe do cliente ou da CTO clicada e a lista dos clientes da PON.
export type NetworkSelection = { type: "client"; client: PonClient } | { type: "element"; element: NetworkElementRow } | null;

export function since(iso: string | null | undefined) {
  if (!iso) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (!Number.isFinite(minutes)) return "—";
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}
const signal = (value: number | null) => (value === null || value === undefined ? "sem sinal" : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} dBm`);
const autoIspUrl = (int6: string) => `https://auto.alloha.com/gpon_clients/${encodeURIComponent(int6)}`;
const sortRank = (situation: NetworkSituation) => SITUATION_ORDER.indexOf(situation);

function SituationTag({ situation }: { situation: NetworkSituation }) {
  return (
    <span className={`netmap-tag is-${situation}`}>
      <i style={{ background: SITUATION_COLORS[situation] }} aria-hidden="true" />{SITUATION_LABELS[situation]}
    </span>
  );
}

type Props = {
  pon: PonView | null;
  ponLabel: string | null;
  loading: boolean;
  visible: Record<NetworkSituation, boolean>;
  selection: NetworkSelection;
  onSelectClient: (client: PonClient) => void;
  onClearSelection: () => void;
};

export function NetworkSidePanel({ pon, ponLabel, loading, visible, selection, onSelectClient, onClearSelection }: Props) {
  const sorted = useMemo(() => [...(pon?.clients ?? [])]
    .filter((client) => visible[client.situation])
    .sort((a, b) => sortRank(a.situation) - sortRank(b.situation) || (a.signalRx ?? 0) - (b.signalRx ?? 0) || a.contract.localeCompare(b.contract, "pt-BR")), [pon, visible]);
  const paged = usePaged(sorted, `${ponLabel}|${Object.values(visible).join()}`);
  const summary = pon?.summary;
  // Ultima leitura terminada: diz quando a PON veio vazia (sem erro) e quando nem todos os clientes foram lidos.
  const lastRead = pon?.request?.doneAt ? pon.request : null;
  const foundNone = Boolean(lastRead && lastRead.found === 0 && !lastRead.error);
  const partial = lastRead && lastRead.found !== null && lastRead.read !== null && lastRead.read < lastRead.found ? lastRead : null;

  return (
    <aside className="netmap-panel" aria-label="Detalhes do mapa">
      {selection && (
        <section className="netmap-card" aria-label="Detalhe selecionado">
          <div className="netmap-card-head">
            <strong>{selection.type === "client" ? `Contrato ${selection.client.contract}` : `${ELEMENT_LABELS[selection.element.kind]} ${selection.element.code || selection.element.name}`}</strong>
            <button type="button" className="icon-button" onClick={onClearSelection} aria-label="Fechar detalhe"><X size={16} aria-hidden="true" /></button>
          </div>
          {selection.type === "client" ? <ClientDetail client={selection.client} /> : <ElementDetail element={selection.element} clients={pon?.clients ?? []} onSelectClient={onSelectClient} />}
        </section>
      )}

      <section className="netmap-card" aria-label="Clientes da PON">
        <div className="netmap-card-head"><strong>{ponLabel ? `Clientes da PON ${ponLabel}` : "Clientes da PON"}</strong></div>
        {!ponLabel && <p className="netmap-muted">Escolha a OLT, o slot e a PON para ver os clientes lidos do AutoISP.</p>}
        {ponLabel && loading && !pon && <p className="netmap-muted">Carregando clientes...</p>}
        {ponLabel && pon && summary && (
          <p className="netmap-summary"><b>{summary.problema.toLocaleString("pt-BR")}</b> de <b>{summary.total.toLocaleString("pt-BR")}</b> clientes da PON com problema</p>
        )}
        {ponLabel && pon && foundNone && <p className="netmap-muted">Nenhum cliente encontrado nesta PON</p>}
        {ponLabel && pon && partial && <p className="netmap-muted">{partial.read!.toLocaleString("pt-BR")} de {partial.found!.toLocaleString("pt-BR")} lidos</p>}
        {ponLabel && pon && pon.clients.length === 0 && !foundNone && <p className="netmap-muted">Nenhum cliente lido para esta PON ainda. Use “Atualizar clientes desta PON”.</p>}
        {ponLabel && pon && pon.clients.length > 0 && sorted.length === 0 && <p className="netmap-muted">Nenhum cliente nas situações ligadas.</p>}
        {sorted.length > 0 && (
          <ul className="netmap-list">
            {paged.pageItems.map((client) => {
              const active = selection?.type === "client" && selection.client.contract === client.contract;
              return (
                <li key={`${client.contract}|${client.serial ?? ""}`}>
                  <button type="button" className={`netmap-row${active ? " is-active" : ""}`} onClick={() => onSelectClient(client)} aria-pressed={active}>
                    <i style={{ background: SITUATION_COLORS[client.situation] }} aria-hidden="true" />
                    <span className="netmap-row-main">
                      <strong>{client.contract}</strong>
                      <small>{SITUATION_LABELS[client.situation]} · {signal(client.signalRx)}</small>
                      {!client.precise && <em className="netmap-imprecise"><MapPinOff size={12} aria-hidden="true" /> sem localização precisa</em>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Pager {...paged} noun={["cliente", "clientes"]} />
      </section>
    </aside>
  );
}

function ClientDetail({ client }: { client: PonClient }) {
  return (
    <>
      <SituationTag situation={client.situation} />
      <dl className="netmap-dl">
        <dt>OLT</dt><dd>{client.olt}</dd>
        <dt>Slot/PON</dt><dd>{client.ponlink}</dd>
        <dt>Sinal</dt><dd>{signal(client.signalRx)} <small>· lido {since(client.readAt)}</small></dd>
        <dt>Status ONU</dt><dd>{client.onuStatus || "—"}</dd>
        <dt>Último contato</dt><dd>{since(client.lastInform)}</dd>
        <dt>Serial</dt><dd>{client.serial || "—"}</dd>
        <dt>CTO mais próxima</dt>
        <dd>
          {client.nearestCto ? <>{client.nearestCto.code || "sem código"} · {Math.round(client.nearestCto.meters).toLocaleString("pt-BR")} m <span className="netmap-estimate">estimativa por proximidade</span></> : "—"}
        </dd>
      </dl>
      {!client.precise && <p className="netmap-imprecise"><MapPinOff size={13} aria-hidden="true" /> sem localização precisa — não aparece no mapa</p>}
      {client.int6 && (
        <a className="secondary-button compact netmap-link" href={autoIspUrl(client.int6)} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} aria-hidden="true" /> Abrir no AutoISP
        </a>
      )}
    </>
  );
}

function ElementDetail({ element, clients, onSelectClient }: { element: NetworkElementRow; clients: PonClient[]; onSelectClient: (client: PonClient) => void }) {
  const near = element.code ? clients.filter((client) => client.nearestCto?.code === element.code).sort((a, b) => (a.nearestCto?.meters ?? 0) - (b.nearestCto?.meters ?? 0)).slice(0, 20) : [];
  return (
    <>
      <dl className="netmap-dl">
        <dt>Tipo</dt><dd>{ELEMENT_LABELS[element.kind]}</dd>
        <dt>Código</dt><dd>{element.code || "—"}</dd>
        {element.name && element.name !== element.code && <><dt>Nome</dt><dd>{element.name}</dd></>}
        <dt>Código de projeto</dt><dd>{element.projectCode || "—"}</dd>
        <dt>POP/FH</dt><dd>{element.pop || "—"}{element.fh ? ` / ${element.fh}` : ""}</dd>
        <dt>Arquivo de origem</dt><dd>{element.sourceFile}</dd>
      </dl>
      {near.length > 0 && (
        <div className="netmap-near">
          <small>Clientes da PON mais próximos <span className="netmap-estimate">estimativa por proximidade</span></small>
          <ul className="netmap-list">
            {near.map((client) => (
              <li key={client.contract}>
                <button type="button" className="netmap-row" onClick={() => onSelectClient(client)}>
                  <i style={{ background: SITUATION_COLORS[client.situation] }} aria-hidden="true" />
                  <span className="netmap-row-main"><strong>{client.contract}</strong><small>{SITUATION_LABELS[client.situation]} · {Math.round(client.nearestCto?.meters ?? 0)} m</small></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
