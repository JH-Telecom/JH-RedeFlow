import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, Search, Trophy, X } from "lucide-react";
import { api, type Highlight, type PersonCard, type UserStatus } from "../api";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { Pager, usePaged } from "../components/Pager";

// Pessoas: diretorio SO DE LEITURA, aberto a todos. Mostra quem faz parte do O&M e quem esta online,
// e abre o perfil (foto, banner, nome, cargo e e-mail). Criar e editar contas continua so em Usuarios.

function lastSeenText(person: PersonCard) {
  if (person.online) return "Online agora";
  if (!person.lastSeenAt) return "Offline";
  const minutes = Math.round((Date.now() - new Date(person.lastSeenAt).getTime()) / 60000);
  if (minutes < 60) return `Visto há ${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Visto há ${hours} h`;
  return `Visto em ${new Date(person.lastSeenAt).toLocaleDateString("pt-BR")}`;
}

export function PeoplePage({ currentUserId }: { currentUserId: string }) {
  const [people, setPeople] = useState<PersonCard[] | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, UserStatus>>({});
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const closeModal = useCallback(() => setOpenId(null), []);

  useEffect(() => {
    let active = true;
    const load = () => api.people()
      .then((data) => { if (!active) return; setPeople(data.people); setAvatars(data.avatars); setStatuses(data.status ?? {}); setError(""); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Não foi possível carregar as pessoas."); });
    void load();
    api.highlights().then((data) => { if (active) setHighlights(data.highlights); }).catch(() => undefined);
    const interval = window.setInterval(load, 30000); // status online atualiza sozinho
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  const onlineCount = people?.filter((person) => person.online).length ?? 0;
  const visible = useMemo(() => (people ?? []).filter((person) => (!onlyOnline || person.online) && `${person.name} ${person.email} ${person.roleName}`.toLowerCase().includes(query.trim().toLowerCase())), [people, onlyOnline, query]);
  const pagedPeople = usePaged(visible, `${onlyOnline}|${query}`);

  return (
    <div className="pp-page">
      <div className="page-heading">
        <div>
          <span className="section-kicker">EQUIPES</span>
          <h1>Pessoas</h1>
          <p>Quem faz parte do O&amp;M e quem está online agora. Clique em alguém para ver o perfil.</p>
        </div>
      </div>

      {highlights.length > 0 && (
        <section className="pp-highlights" aria-label="Destaques do mês">
          <span className="section-kicker"><Trophy size={13} aria-hidden="true" /> DESTAQUES DO MÊS</span>
          <div className="pp-highlight-list">
            {highlights.map((item) => (
              <article key={item.kind} className="panel pp-highlight">
                <span className="pp-highlight-icon" aria-hidden="true">🏆</span>
                <div><small>{item.title}</small><strong>{item.name}</strong><span>{item.detail}</span></div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="pp-toolbar">
        <label className="search-field pp-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, cargo ou e-mail" aria-label="Buscar pessoas" /></label>
        <div className="pp-filter" role="group" aria-label="Filtrar por status">
          <button type="button" className={!onlyOnline ? "is-active" : ""} aria-pressed={!onlyOnline} onClick={() => setOnlyOnline(false)}>Todos <b>{people?.length ?? 0}</b></button>
          <button type="button" className={onlyOnline ? "is-active" : ""} aria-pressed={onlyOnline} onClick={() => setOnlyOnline(true)}><i className="pp-dot is-online" aria-hidden="true" />Online <b>{onlineCount}</b></button>
        </div>
      </div>

      {error ? <div className="form-error" role="alert">{error}</div>
        : !people ? <div className="empty-state" role="status">Carregando pessoas...</div>
        : !visible.length ? <div className="panel empty-state">{onlyOnline ? "Ninguém online agora com esse filtro." : "Ninguém encontrado."}</div>
        : (
          <div className="pp-grid">
            {pagedPeople.pageItems.map((person) => (
              <button key={person.id} type="button" className="panel pp-card" onClick={() => setOpenId(person.id)}>
                <span className="pp-avatar-wrap">
                  <ProfileAvatar name={person.name} photo={avatars[person.id] ?? null} className="pp-avatar" />
                  <i className={`pp-dot${person.online ? " is-online" : ""}`} aria-hidden="true" />
                </span>
                <span className="pp-card-text">
                  <strong>{person.name}{person.id === currentUserId && <small className="pp-you">você</small>}{highlights.some((item) => item.userId === person.id) && <span className="pp-trophy" title="Destaque do mês">🏆</span>}</strong>
                  <span>{person.roleName}</span>
                  {statuses[person.id] && <span className="pp-custom-status">{statuses[person.id].emoji} {statuses[person.id].text}</span>}
                  <small className={person.online ? "pp-status is-online" : "pp-status"}>{lastSeenText(person)}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      <Pager {...pagedPeople} noun={["pessoa", "pessoas"]} />

      {openId && <PersonModal id={openId} card={people?.find((person) => person.id === openId)} photo={avatars[openId] ?? null} highlight={highlights.find((item) => item.userId === openId)} onClose={closeModal} />}
    </div>
  );
}

function PersonModal({ id, card, photo, highlight, onClose }: { id: string; card?: PersonCard; photo: string | null; highlight?: Highlight; onClose: () => void }) {
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [person, setPerson] = useState<PersonCard | undefined>(card);
  const [avatar, setAvatar] = useState<string | null>(photo);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.person(id).then((data) => { if (!active) return; setPerson(data.person); setAvatar(data.avatar); setBanner(data.banner); setStatus(data.status ?? null); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "Não foi possível abrir o perfil."); });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { active = false; window.removeEventListener("keydown", onKey); };
  }, [id, onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="pp-modal" role="dialog" aria-modal="true" aria-labelledby="pp-modal-name" onClick={(event) => event.stopPropagation()}>
        <div className={`pp-modal-banner${banner ? " has-banner" : ""}`} style={banner ? ({ "--pf-banner": `url(${banner})` } as React.CSSProperties) : undefined}>
          <button type="button" className="pf-banner-button pp-close" onClick={onClose} aria-label="Fechar perfil" autoFocus><X size={16} /></button>
        </div>
        <div className="pp-modal-body">
          {person ? <>
            <span className="pp-modal-avatar-wrap">
              <ProfileAvatar name={person.name} photo={avatar} className="pp-modal-avatar" />
              <i className={`pp-dot${person.online ? " is-online" : ""}`} aria-hidden="true" />
            </span>
            <h2 id="pp-modal-name">{person.name}</h2>
            <p className="pp-modal-role">{person.roleName}</p>
            {status && <p className="pp-custom-status pp-modal-status">{status.emoji} {status.text}</p>}
            {highlight && <p className="pp-modal-highlight">🏆 {highlight.title}: {highlight.detail}</p>}
            <p className={person.online ? "pp-status is-online" : "pp-status"}>{lastSeenText(person)}</p>
            <dl className="pf-hero-facts pp-modal-facts">
              <div><dt>E-mail</dt><dd><a href={`mailto:${person.email}`}><Mail size={13} aria-hidden="true" /> {person.email}</a></dd></div>
              <div><dt>Cargo</dt><dd>{person.roleName}</dd></div>
              <div><dt>No sistema desde</dt><dd>{new Date(person.createdAt).toLocaleDateString("pt-BR")}</dd></div>
            </dl>
          </> : !error && <div className="empty-state">Carregando perfil...</div>}
          {error && <div className="form-error" role="alert">{error}</div>}
        </div>
      </section>
    </div>
  );
}
