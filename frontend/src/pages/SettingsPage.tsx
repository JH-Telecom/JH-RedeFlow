import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus, Search, Settings, Trash2 } from "lucide-react";
import { api, type OltRegionMapping, type OltRegionRequest, type Role, type User } from "../api";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { operationalRegions } from "../lib/constants";
import { FullExportPanel } from "../components/FullExportPanel";
import { ChecklistSettings } from "../components/FieldAdmin";
import { Pager, usePaged } from "../components/Pager";
import { ExtensionDownloadCard } from "../components/ExtensionDownload";
import { DbUsageCard } from "../components/DbUsageCard";
import { BackupCard } from "../components/BackupCard";

type ProfilePhotoControls = { photo: string | null; saving: boolean; error: string; onChange: (file: File) => Promise<void>; onRemove: () => Promise<void> };

// Configuracoes: atalho para Meu perfil para todo usuario; o restante so para quem tem settings.manage.
export function SettingsPage({ user, canManage, profile }: { user: User & { role: Role }; canManage: boolean; profile: ProfilePhotoControls }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">SISTEMA</span>
          <h1>Configurações</h1>
          <p>{canManage ? "Preferências gerais do ambiente O&M." : "Seu perfil no JH RedeFlow."}</p>
        </div>
      </div>
      <ProfileShortcut user={user} photo={profile.photo} />
      <ExtensionDownloadCard />
      {canManage && <DbUsageCard />}
      {canManage && <BackupCard />}
      {canManage && <SystemSettings />}
      {canManage && <ChecklistSettings />}
      {canManage && <FullExportPanel />}
    </>
  );
}

// Foto, banner, apelido e tema ficam na pagina Meu perfil (/perfil); aqui fica so o atalho.
function ProfileShortcut({ user, photo }: { user: User & { role: Role }; photo: string | null }) {
  return (
    <Link to="/perfil" className="panel settings-profile-shortcut">
      <ProfileAvatar name={user.name} photo={photo} className="avatar" />
      <span><strong>Meu perfil</strong><small>Foto, banner, apelido e tema de cor agora ficam no seu perfil.</small></span>
      <ChevronRight size={18} aria-hidden="true" />
    </Link>
  );
}

function SystemSettings() {
  const [settings, setSettings] = useState({ autoRefresh: true, refreshIntervalSeconds: 60, slaAlertHours: 8, defaultRegion: "Todas" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [oltRegions, setOltRegions] = useState<OltRegionMapping[]>([]);
  const [customRegions, setCustomRegions] = useState<string[]>([]);
  const [searchOlt, setSearchOlt] = useState("");
  const [newOlt, setNewOlt] = useState("");
  const [newOltRegion, setNewOltRegion] = useState(operationalRegions[0]);
  const [newRegion, setNewRegion] = useState("");
  const [mappingMessage, setMappingMessage] = useState("");
  const [mappingError, setMappingError] = useState("");
  const [mappingLoading, setMappingLoading] = useState(true);
  const [mappingSaving, setMappingSaving] = useState(false);
  const [oltRequests, setOltRequests] = useState<OltRegionRequest[]>([]);
  const [oltRequestRegions, setOltRequestRegions] = useState<Record<string, string>>({});
  const [oltRequestActionId, setOltRequestActionId] = useState<string | null>(null);
  const [canDeleteAllCalls] = useState(() => {
    try { return Boolean(JSON.parse(localStorage.getItem("jh-redeflow-session") || "null")?.user?.role?.permissions?.includes("calls.delete")); }
    catch { return false; }
  });
  const [deleteAllConfirmation, setDeleteAllConfirmation] = useState("");
  const [deletingAllCalls, setDeletingAllCalls] = useState(false);
  const [deleteAllMessage, setDeleteAllMessage] = useState("");
  const [deleteAllError, setDeleteAllError] = useState("");
  async function deleteAllCalls(event: React.FormEvent) {
    event.preventDefault();
    if (deleteAllConfirmation !== "APAGAR TODOS") return;
    setDeletingAllCalls(true);
    setDeleteAllMessage("");
    setDeleteAllError("");
    try {
      const result = await api.deleteAllCalls();
      setDeleteAllConfirmation("");
      setDeleteAllMessage(`${result.deleted} chamado(s) apagado(s).`);
    } catch (err) {
      setDeleteAllError(err instanceof Error ? err.message : "Não foi possível apagar os chamados.");
    } finally {
      setDeletingAllCalls(false);
    }
  }
  useEffect(() => { api.settings().then((data) => setSettings(data.settings)).catch((err) => setError(err.message)); }, []);
  useEffect(() => { api.oltRegionMappings().then((data) => setOltRegions(data.mappings)).catch((err) => setMappingError(err.message)).finally(() => setMappingLoading(false)); }, []);
  useEffect(() => { api.customOperationalRegions().then((data) => setCustomRegions(data.regions)).catch((err) => setMappingError(err.message)); }, []);
  useEffect(() => { api.oltRegionRequests().then((data) => setOltRequests(data.requests)).catch((err) => setMappingError(err.message)); }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try { const result = await api.updateSettings(settings); setSettings(result.settings); setMessage("Configuracoes salvas."); } catch (err) { setError(err instanceof Error ? err.message : "Nao foi possivel salvar configuracoes."); }
  }
  async function saveOltRegions(event: React.FormEvent) {
    event.preventDefault();
    setMappingSaving(true);
    setMappingError("");
    setMappingMessage("");
    try {
      const result = await api.saveOltRegionMappings(oltRegions.map(({ olt, region }) => ({ olt, region })));
      setOltRegions(result.mappings);
      setMappingMessage("Mapa de OLTs salvo.");
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : "Nao foi possivel salvar o mapa de OLTs.");
    } finally {
      setMappingSaving(false);
    }
  }
  async function addOltRequest(request: OltRegionRequest) {
    const region = oltRequestRegions[request.id];
    if (!region) return;
    setOltRequestActionId(request.id);
    setMappingError("");
    setMappingMessage("");
    try {
      await api.acceptOltRegionRequest(request.id, region);
      setOltRegions((current) => [...current.filter((item) => item.olt !== request.olt), { olt: request.olt, region }].sort((left, right) => left.olt.localeCompare(right.olt)));
      setOltRequests((current) => current.filter((item) => item.id !== request.id));
      setOltRequestRegions((current) => { const next = { ...current }; delete next[request.id]; return next; });
      setMappingMessage(`OLT ${request.olt} adicionada ao mapa em ${region}.`);
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : "Nao foi possivel adicionar a OLT.");
    } finally {
      setOltRequestActionId(null);
    }
  }
  async function ignoreOltRequest(request: OltRegionRequest) {
    setOltRequestActionId(request.id);
    setMappingError("");
    setMappingMessage("");
    try {
      await api.ignoreOltRegionRequest(request.id);
      setOltRequests((current) => current.filter((item) => item.id !== request.id));
      setMappingMessage(`Solicitação da OLT ${request.olt} ignorada.`);
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : "Nao foi possivel ignorar a OLT.");
    } finally {
      setOltRequestActionId(null);
    }
  }
  function addOlt() {
    const normalizedOlt = newOlt.trim().toUpperCase().replace(/\s+/g, "");
    if (!normalizedOlt || oltRegions.some((mapping) => mapping.olt.toUpperCase().replace(/\s+/g, "") === normalizedOlt)) {
      setMappingError(normalizedOlt ? "Esta OLT ja esta cadastrada." : "Informe o codigo da OLT.");
      return;
    }
    setOltRegions((current) => [...current, { olt: normalizedOlt, region: newOltRegion }].sort((left, right) => left.olt.localeCompare(right.olt)));
    setNewOlt("");
    setMappingError("");
    setMappingMessage("");
  }
  async function addRegion() {
    setMappingError("");
    setMappingMessage("");
    if (operationalRegions.some((region) => region.localeCompare(newRegion.trim(), "pt-BR", { sensitivity: "base" }) === 0)) {
      setMappingError("Esta região já está disponível.");
      return;
    }
    try {
      const result = await api.addCustomOperationalRegion(newRegion);
      setCustomRegions((current) => [...current, result.region].sort((left, right) => left.localeCompare(right)));
      setNewOltRegion(result.region);
      setNewRegion("");
      setMappingMessage(`Região ${result.region} adicionada.`);
    } catch (err) {
      setMappingError(err instanceof Error ? err.message : "Não foi possível adicionar a região.");
    }
  }
  const filteredOltRegions = oltRegions.filter((mapping) => `${mapping.olt} ${mapping.region}`.toLowerCase().includes(searchOlt.toLowerCase()));
  const pagedOlts = usePaged(filteredOltRegions, filteredOltRegions.length);
  const availableRegions = [...new Set([...operationalRegions, ...customRegions, ...oltRegions.map((mapping) => mapping.region)])].sort((left, right) => left.localeCompare(right));
  return (
    <>
      <form className="panel settings-panel settings-form" onSubmit={save}>
        <div className="settings-icon"><Settings size={20} /></div>
        <div className="settings-fields">
          <h2>Configuracoes operacionais</h2>
          <p>Defina os parametros usados pelo acompanhamento da operacao.</p>
          <label className="checkbox-label"><input type="checkbox" checked={settings.autoRefresh} onChange={(event) => setSettings({ ...settings, autoRefresh: event.target.checked })} /> Atualizar indicadores automaticamente</label>
          <label>Intervalo de atualizacao (segundos)<input type="number" min="10" max="3600" value={settings.refreshIntervalSeconds} onChange={(event) => setSettings({ ...settings, refreshIntervalSeconds: Number(event.target.value) })} /></label>
          <label>Alerta de SLA (horas)<input type="number" min="1" max="72" value={settings.slaAlertHours} onChange={(event) => setSettings({ ...settings, slaAlertHours: Number(event.target.value) })} /></label>
          <label>Regiao padrao<input value={settings.defaultRegion} onChange={(event) => setSettings({ ...settings, defaultRegion: event.target.value })} /></label>
          <button className="primary-button compact" type="submit">Salvar configuracoes <ChevronRight size={16} /></button>
          {message && <div className="save-message">{message}</div>}
          {error && <div className="form-error">{error}</div>}
        </div>
      </form>
      <form className="panel settings-olt-panel" onSubmit={saveOltRegions}>
        <div className="settings-olt-heading">
          <div><span className="section-kicker">MAPEAMENTO OPERACIONAL</span><h2>OLT por Região</h2><p>Altere a Região associada a uma OLT ou cadastre uma nova. Alterações passam a valer para os próximos chamados e sincronizações.</p></div>
          <button className="primary-button compact" type="submit" disabled={mappingSaving || mappingLoading}><Settings size={15}/>{mappingSaving ? "Salvando..." : "Salvar mapa"}</button>
        </div>
        <div className="settings-olt-toolbar"><label className="search-field"><Search size={16}/><input value={searchOlt} onChange={(event) => setSearchOlt(event.target.value)} placeholder="Buscar OLT ou Região" /></label><span>{filteredOltRegions.length} de {oltRegions.length} OLTs</span></div>
        <section className="settings-olt-requests" aria-labelledby="settings-olt-requests-title">
          <div className="settings-olt-requests-heading"><div><h3 id="settings-olt-requests-title">Solicitações de OLT desconhecidas</h3><p>Novas OLTs aguardam sua decisão; elas não entram no mapa automaticamente.</p></div><span>{oltRequests.length} pendentes</span></div>
          {oltRequests.length > 0 ? <div className="settings-olt-request-list">{oltRequests.map((request) => <div className="settings-olt-request-row" key={request.id}>
            <div className="settings-olt-request-details"><strong>{request.olt}</strong><small>{request.source} · {request.occurrences} ocorrência(s) · vista por último {new Date(request.lastSeenAt).toLocaleString("pt-BR")}</small></div>
            <label className="settings-olt-request-region"><span>Região para adicionar</span><select aria-label={`Região para ${request.olt}`} value={oltRequestRegions[request.id] || ""} onChange={(event) => setOltRequestRegions((current) => ({ ...current, [request.id]: event.target.value }))}><option value="">Selecione uma região</option>{availableRegions.map((region) => <option key={region} value={region}>{region}</option>)}</select></label>
            <div className="settings-olt-request-actions"><button className="primary-button compact" type="button" onClick={() => void addOltRequest(request)} disabled={oltRequestActionId === request.id || !oltRequestRegions[request.id]}><Plus size={14}/>{oltRequestActionId === request.id ? "Salvando..." : "Adicionar"}</button><button className="secondary-button compact settings-olt-ignore" type="button" onClick={() => void ignoreOltRequest(request)} disabled={oltRequestActionId === request.id}>Ignorar</button></div>
          </div>)}</div> : <div className="settings-olt-requests-empty">Nenhuma OLT desconhecida aguardando revisão.</div>}
        </section>
        <div className="settings-olt-add">
          <label>Nova OLT<input value={newOlt} onChange={(event) => setNewOlt(event.target.value)} placeholder="Ex.: VIP-OLT-SPO-01" maxLength={120}/></label>
          <label>Região<select value={newOltRegion} onChange={(event) => setNewOltRegion(event.target.value)}>{availableRegions.map((region) => <option key={region} value={region}>{region}</option>)}</select></label>
          <button className="secondary-button compact" type="button" onClick={addOlt}><Plus size={15}/> Adicionar OLT</button>
        </div>
        <div className="settings-olt-add-region"><label>Nova região<input value={newRegion} onChange={(event) => setNewRegion(event.target.value)} placeholder="Ex.: JARDIM NOVO" maxLength={160}/></label><button className="secondary-button compact" type="button" onClick={() => void addRegion()} disabled={!newRegion.trim()}><Plus size={15}/> Adicionar região</button></div>
        <div className="settings-olt-table-wrap"><table className="settings-olt-table"><thead><tr><th>OLT</th><th>Região</th><th>Origem</th><th>Ação</th></tr></thead><tbody>{pagedOlts.pageItems.map((mapping) => <tr key={mapping.olt}><td><strong>{mapping.olt}</strong></td><td><select aria-label={`Região da OLT ${mapping.olt}`} value={mapping.region} onChange={(event) => setOltRegions((current) => current.map((item) => item.olt === mapping.olt ? { ...item, region: event.target.value } : item))}>{availableRegions.map((region) => <option key={region} value={region}>{region}</option>)}</select></td><td>{mapping.defaultRegion ? "Padrão" : "Personalizada"}</td><td>{!mapping.defaultRegion && <button className="icon-button settings-olt-remove" type="button" aria-label={`Remover OLT ${mapping.olt}`} title="Remover OLT personalizada" onClick={() => setOltRegions((current) => current.filter((item) => item.olt !== mapping.olt))}><Trash2 size={15}/></button>}</td></tr>)}</tbody></table><Pager {...pagedOlts} noun={["OLT", "OLTs"]} />{mappingLoading && <div className="empty-state">Carregando mapeamentos...</div>}{!mappingLoading && !filteredOltRegions.length && <div className="empty-state">Nenhuma OLT encontrada.</div>}</div>
        {mappingMessage && <div className="save-message">{mappingMessage}</div>}{mappingError && <div className="form-error">{mappingError}</div>}
      </form>
      {canDeleteAllCalls && <form className="panel settings-danger-zone" onSubmit={(event) => void deleteAllCalls(event)} aria-labelledby="settings-danger-title">
        <div>
          <span className="section-kicker">ZONA DE PERIGO</span>
          <h2 id="settings-danger-title">Apagar todos os chamados</h2>
          <p>Remove definitivamente todos os chamados, observações e históricos de auditoria, inclusive os finalizados. Esta ação não pode ser desfeita.</p>
        </div>
        <label><span>Digite <strong>APAGAR TODOS</strong> para confirmar</span><input value={deleteAllConfirmation} onChange={(event) => setDeleteAllConfirmation(event.target.value)} autoComplete="off" disabled={deletingAllCalls} /></label>
        <button className="bulk-delete-button" type="submit" disabled={deletingAllCalls || deleteAllConfirmation !== "APAGAR TODOS"}><Trash2 size={15} />{deletingAllCalls ? "Apagando..." : "Apagar todos os chamados"}</button>
        {deleteAllMessage && <div className="save-message" role="status">{deleteAllMessage}</div>}
        {deleteAllError && <div className="form-error" role="alert">{deleteAllError}</div>}
      </form>}
    </>
  );
}
