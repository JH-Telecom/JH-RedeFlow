import { useEffect, useRef } from "react";
import { Bell, Chrome, ChartColumn, Database, List, MessageCircle, ShieldCheck, Sparkles, UserRound, Wrench, X } from "lucide-react";
import { Link } from "react-router-dom";
import { LATEST_RELEASE_ID, RELEASES, type Release, type ReleaseIcon, type ReleaseItem } from "../releases";

// "O que ha de novo": abre sozinho quando ha novidade que a pessoa ainda nao viu (por login, neste navegador) e de
// novo em Meu perfil > Novidades.
// Desde 11/11/2026 guarda CADA novidade vista (versao + titulo), nao so a versao: varias entregas no mesmo dia entram
// na mesma versao, e antes quem ja tinha visto a versao do dia nao via os itens acrescentados depois.
const ICONS: Record<ReleaseIcon, typeof Bell> = { sparkles: Sparkles, bell: Bell, list: List, chrome: Chrome, database: Database, whatsapp: MessageCircle, chart: ChartColumn, user: UserRound, shield: ShieldCheck, wrench: Wrench };
const legacySeenKey = (userId: string) => `jh-novidades-vistas:${userId}`; // formato antigo: id da ultima versao vista
const itemsSeenKey = (userId: string) => `jh-novidades-itens:${userId}`;
const itemKey = (release: Release, item: ReleaseItem) => `${release.id}|${item.title}`;

function readSeenItems(userId: string): Set<string> | null {
  try { const raw = window.localStorage.getItem(itemsSeenKey(userId)); return raw ? new Set<string>(JSON.parse(raw)) : null; } catch { return null; }
}
export function lastSeenRelease(userId: string) {
  try { return window.localStorage.getItem(legacySeenKey(userId)) || ""; } catch { return ""; }
}
// Marca como visto tudo o que existe hoje (todas as versoes).
export function markReleasesSeen(userId: string) {
  const keys = RELEASES.flatMap((release) => release.items.map((item) => itemKey(release, item)));
  try {
    window.localStorage.setItem(itemsSeenKey(userId), JSON.stringify(keys));
    window.localStorage.setItem(legacySeenKey(userId), LATEST_RELEASE_ID);
  } catch { /* sem armazenamento: aparece de novo, sem problema */ }
}

// Novidades que a pessoa ainda nao viu.
// - Com a lista de itens vistos: so os itens fora dela (inclusive os acrescentados depois numa versao ja vista).
// - So com o formato antigo (id da versao): versoes anteriores contam como vistas; a versao vista e as novas aparecem
//   (nao da para saber quais itens dela ja tinham sido vistos).
// - Primeiro acesso: so a versao mais recente.
export function unseenReleases(userId: string, canAccess: (permission: string) => boolean): Release[] {
  const seenItems = readSeenItems(userId);
  const legacy = lastSeenRelease(userId);
  const pending = seenItems
    ? RELEASES.map((release) => ({ ...release, items: release.items.filter((item) => !seenItems.has(itemKey(release, item))) }))
    : legacy ? RELEASES.filter((release) => release.id >= legacy) : RELEASES.slice(0, 1);
  return visibleReleases(pending, canAccess);
}
export function visibleReleases(releases: Release[], canAccess: (permission: string) => boolean) {
  return releases.map((release) => ({ ...release, items: release.items.filter((item) => !item.permission || canAccess(item.permission)) })).filter((release) => release.items.length);
}

export function ReleaseItemCard({ item }: { item: ReleaseItem }) {
  const Icon = ICONS[item.icon] ?? Sparkles;
  return (
    <li className="wn-item">
      <span className="wn-item-icon" aria-hidden="true"><Icon size={20} /></span>
      <div className="wn-item-text">
        <strong>{item.title}{item.tag && <span className={`wn-tag wn-tag-${item.tag === "Novo" ? "new" : item.tag === "Correção" ? "fix" : "better"}`}>{item.tag}</span>}</strong>
        <p>{item.text}</p>
      </div>
    </li>
  );
}

export function WhatsNewModal({ releases, onClose }: { releases: Release[]; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const total = releases.reduce((sum, release) => sum + release.items.length, 0);
  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!releases.length) return null;
  return (
    <div className="wn-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="wn-modal" role="dialog" aria-modal="true" aria-labelledby="wn-title">
        <header className="wn-head">
          <span className="wn-kicker">{releases.length === 1 ? `Versão de ${releases[0].label}` : `Versões de ${releases[releases.length - 1].label} a ${releases[0].label}`}</span>
          <h2 id="wn-title"><Sparkles size={22} aria-hidden="true" /> O que há de novo</h2>
          <p>{total === 1 ? "1 novidade pra você" : `${total} novidades pra você`}</p>
          <button ref={closeButton} type="button" className="wn-close" aria-label="Fechar novidades" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="wn-body">
          {releases.map((release) => (
            <section key={release.id} aria-label={`Novidades de ${release.label}`}>
              {releases.length > 1 && <h3 className="wn-date">{release.label}</h3>}
              <ul className="wn-list">{release.items.map((item) => <ReleaseItemCard key={item.title} item={item} />)}</ul>
            </section>
          ))}
        </div>
        <footer className="wn-foot">
          <span>Você pode ver de novo em <Link to="/perfil#novidades" onClick={onClose}>Perfil › Novidades</Link></span>
          <button type="button" className="primary-button" onClick={onClose}>Entendi</button>
        </footer>
      </div>
    </div>
  );
}
