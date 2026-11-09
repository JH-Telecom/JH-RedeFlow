import { useEffect, useRef, useState } from "react";
import { Camera, Check, Download, Image as ImageIcon, Moon, Palette, ShieldCheck, Sun, Trash2, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { api, type ProfilePreferences, type Role, type User, type UserStatus } from "../api";
import { StatusEditor } from "../components/StatusEditor";
import { ProfileAvatar } from "../components/ProfileAvatar";
import { resizeBannerImage } from "../lib/banner-image";
import { PALETTES, type PaletteId, type Theme } from "../theme";

type ProfilePhotoControls = { photo: string | null; saving: boolean; error: string; onChange: (file: File) => Promise<void>; onRemove: () => Promise<void> };

// Meu perfil: foto, banner, apelido e tema. Abre pelo avatar/nome na lateral e no topo.
// O apelido aparece so para a propria pessoa (lateral e topo); para a equipe continua o nome.
export function ProfilePage({ user, profile, preferences, onSavePreferences, theme, onToggleTheme, status, onSaveStatus }: {
  user: User & { role: Role };
  profile: ProfilePhotoControls;
  preferences: ProfilePreferences;
  onSavePreferences: (next: ProfilePreferences) => Promise<void>;
  theme: Theme;
  onToggleTheme: () => void;
  status: UserStatus | null;
  onSaveStatus: (next: UserStatus | null) => Promise<void>;
}) {
  const photoInput = useRef<HTMLInputElement | null>(null);
  const bannerInput = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [nickname, setNickname] = useState(preferences.nickname ?? "");
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const [paletteSaving, setPaletteSaving] = useState<PaletteId | null>(null);
  const palette = (preferences.palette ?? "padrao") as PaletteId;
  const displayName = preferences.nickname || user.name;

  useEffect(() => { api.profileBanner().then((data) => setBanner(data.bannerDataUrl)).catch(() => undefined); }, []);
  useEffect(() => { setNickname(preferences.nickname ?? ""); }, [preferences.nickname]);

  function feedback(text: string, failed = false) { setError(failed ? text : ""); setMessage(failed ? "" : text); }

  async function changeBanner(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setBannerSaving(true);
    try {
      const saved = await api.saveProfileBanner(await resizeBannerImage(file));
      setBanner(saved.bannerDataUrl);
      feedback("Banner atualizado. Ele também aparece ao fundo das suas observações nos chamados.");
    } catch (err) { feedback(err instanceof Error ? err.message : "Não foi possível salvar o banner.", true); }
    finally { setBannerSaving(false); }
  }
  async function removeBanner() {
    setBannerSaving(true);
    try { await api.removeProfileBanner(); setBanner(null); feedback("Banner removido."); }
    catch (err) { feedback(err instanceof Error ? err.message : "Não foi possível remover o banner.", true); }
    finally { setBannerSaving(false); }
  }
  async function changePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    feedback("");
    await profile.onChange(file);
    feedback("Foto atualizada.");
  }
  async function removePhoto() { feedback(""); await profile.onRemove(); feedback("Foto removida."); }

  async function saveNickname(event: React.FormEvent) {
    event.preventDefault();
    setNicknameSaving(true);
    try {
      await onSavePreferences({ ...preferences, nickname: nickname.trim() || null });
      feedback(nickname.trim() ? "Apelido salvo. Ele aparece no lugar do seu nome só para você." : "Apelido removido. Voltou a aparecer o seu nome.");
    } catch (err) { feedback(err instanceof Error ? err.message : "Não foi possível salvar o apelido.", true); }
    finally { setNicknameSaving(false); }
  }
  async function choosePalette(id: PaletteId) {
    if (id === palette) return;
    setPaletteSaving(id);
    try { await onSavePreferences({ ...preferences, palette: id === "padrao" ? null : id }); feedback(`Tema ${PALETTES.find((item) => item.id === id)?.label} aplicado.`); }
    catch (err) { feedback(err instanceof Error ? err.message : "Não foi possível salvar o tema.", true); }
    finally { setPaletteSaving(null); }
  }

  return (
    <div className="pf-page">
      {/* Topo no estilo do perfil do Discord: faixa larga 7:2 na largura da pagina, preenchida pela foto, foto grande sobreposta
          no canto com anel da cor do cartao, nome e acoes logo abaixo. */}
      <section className="panel pf-hero" aria-labelledby="pf-name">
        <div className={`pf-banner${banner ? " has-banner" : ""}`} style={banner ? ({ "--pf-banner": `url(${banner})` } as React.CSSProperties) : undefined}>
          <div className="pf-banner-actions">
            <button className="pf-banner-button" type="button" onClick={() => bannerInput.current?.click()} disabled={bannerSaving}><ImageIcon size={14} />{bannerSaving ? "Salvando..." : banner ? "Trocar banner" : "Adicionar banner"}</button>
            {banner && <button className="pf-banner-button" type="button" onClick={() => void removeBanner()} disabled={bannerSaving} aria-label="Remover banner" title="Remover banner"><Trash2 size={14} /></button>}
            <input ref={bannerInput} className="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void changeBanner(event)} />
          </div>
        </div>
        <div className="pf-hero-body">
          <div className="pf-hero-row">
            <button type="button" className="pf-avatar-button" onClick={() => photoInput.current?.click()} disabled={profile.saving} title={profile.photo ? "Trocar foto" : "Adicionar foto"} aria-label={profile.photo ? "Trocar foto" : "Adicionar foto"}>
              <ProfileAvatar name={displayName} photo={profile.photo} className="pf-avatar" />
              <span className="pf-avatar-edit" aria-hidden="true"><Camera size={16} /></span>
            </button>
            <div className="pf-hero-identity">
              <h1 id="pf-name">{displayName}</h1>
              <p className="pf-hero-sub">{preferences.nickname ? `${user.name} · ${user.role.name}` : user.role.name}</p>
            </div>
            <div className="pf-hero-actions">
              <button className="primary-button compact" type="button" onClick={() => photoInput.current?.click()} disabled={profile.saving}><Camera size={15} />{profile.saving ? "Salvando..." : profile.photo ? "Trocar foto" : "Adicionar foto"}</button>
              {profile.photo && <button className="secondary-button compact" type="button" onClick={() => void removePhoto()} disabled={profile.saving}><Trash2 size={15} /> Remover foto</button>}
              <input ref={photoInput} className="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void changePhoto(event)} />
            </div>
          </div>
          <dl className="pf-hero-facts">
            <div><dt>E-mail</dt><dd>{user.email}</dd></div>
            <div><dt>Cargo</dt><dd>{user.role.name}</dd></div>
            <div><dt>Nome na equipe</dt><dd>{user.name}</dd></div>
          </dl>
          <small className="pf-hero-hint">JPG, PNG ou WebP. O banner é recortado em 7:2 (ideal 1600×457), o formato da faixa do topo; imagens de outros formatos perdem um pouco das bordas. GIF animado entra sem recorte e continua animado (banner até 3 MB, foto até 2 MB). Ele também vai ao fundo das suas observações nos chamados.</small>
        </div>
      </section>

      <div className="pf-main">
      {(profile.error || error) ? <div className="form-error" role="alert">{profile.error || error}</div> : message && <div className="save-message" role="status">{message}</div>}

      <form className="panel pf-card" onSubmit={(event) => void saveNickname(event)}>
        <div className="pf-card-heading"><span className="pf-card-icon"><UserRound size={18} /></span><div><h2>Apelido</h2><p>Opcional. Aparece no lugar do seu nome só para você, no menu lateral e no topo. Para a equipe, nos chamados e nos relatórios continua o nome <strong>{user.name}</strong>.</p></div></div>
        <div className="pf-nickname">
          <label>Como quer ser chamado<input value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={40} placeholder={user.name.split(" ")[0]} /></label>
          <button className="primary-button compact" type="submit" disabled={nicknameSaving || nickname.trim() === (preferences.nickname ?? "")}>{nicknameSaving ? "Salvando..." : "Salvar apelido"}</button>
          {preferences.nickname && <button className="secondary-button compact" type="button" disabled={nicknameSaving} onClick={() => { setNickname(""); void onSavePreferences({ ...preferences, nickname: null }).then(() => feedback("Apelido removido. Voltou a aparecer o seu nome.")).catch((err) => feedback(err instanceof Error ? err.message : "Não foi possível remover o apelido.", true)); }}>Remover</button>}
        </div>
      </form>

      <StatusEditor status={status} onSave={onSaveStatus} />

      <section className="panel pf-card" aria-labelledby="pf-theme-title">
        <div className="pf-card-heading">
          <span className="pf-card-icon"><Palette size={18} /></span>
          <div><h2 id="pf-theme-title">Tema</h2><p>Cada login escolhe o seu. Todos têm versão clara e escura; vermelho de crítico e verde de meta ficam iguais em todos.</p></div>
          <div className="pf-mode" role="group" aria-label="Claro ou escuro">
            <button type="button" className={theme === "light" ? "is-active" : ""} aria-pressed={theme === "light"} onClick={() => theme !== "light" && onToggleTheme()}><Sun size={14} /> Claro</button>
            <button type="button" className={theme === "dark" ? "is-active" : ""} aria-pressed={theme === "dark"} onClick={() => theme !== "dark" && onToggleTheme()}><Moon size={14} /> Escuro</button>
          </div>
        </div>
        <div className="pf-themes" role="radiogroup" aria-label="Tema de cor">
          {PALETTES.map((item) => {
            const preview = theme === "dark" ? item.dark : item.light;
            const selected = item.id === palette;
            return (
              <button key={item.id} type="button" role="radio" aria-checked={selected} className={`pf-theme${selected ? " is-selected" : ""}`} onClick={() => void choosePalette(item.id)} disabled={paletteSaving !== null}>
                <span className={`pf-theme-preview is-${theme}${item.id === "padrao" ? " is-padrao" : ""}`} style={{ background: preview.page }} aria-hidden="true">
                  <span className="pf-theme-side" style={{ background: preview.side }}><i /><i /><i /></span>
                  <span className="pf-theme-body"><b style={{ background: preview.accent }} /><span className="pf-theme-card" /><span className="pf-theme-card" /></span>
                </span>
                <span className="pf-theme-label"><span className="pf-theme-dot" style={{ background: item.swatch }} />{item.label}{selected && <Check size={14} aria-label="selecionado" />}{paletteSaving === item.id && <small>salvando...</small>}</span>
              </button>
            );
          })}
        </div>
      </section>

      <MyDataCard />
      </div>
    </div>
  );
}

// LGPD (art. 18): a pessoa baixa tudo o que o sistema guarda sobre ela e encontra a politica e os termos.
function MyDataCard() {
  const [busy, setBusy] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  async function download() {
    setBusy(true);
    setFeedbackText("");
    try {
      const data = await api.myData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedbackText("Arquivo gerado. Ele tem dados pessoais: guarde em local seguro.");
    } catch (err) {
      setFeedbackText(err instanceof Error ? err.message : "Não foi possível reunir os seus dados.");
    } finally { setBusy(false); }
  }
  return (
    <section className="panel pf-card" aria-labelledby="pf-data-title">
      <div className="pf-card-heading">
        <span className="pf-card-icon"><ShieldCheck size={18} aria-hidden="true" /></span>
        <div>
          <h2 id="pf-data-title">Privacidade e meus dados</h2>
          <p>Baixe uma cópia do que o sistema guarda sobre você: conta, preferências, foto, status e as alterações que você fez em chamados no último ano. Foto, banner, apelido e status são opcionais e podem ser removidos aqui mesmo.</p>
        </div>
      </div>
      <div className="pf-data-actions">
        <button className="secondary-button compact" type="button" onClick={() => void download()} disabled={busy}><Download size={15} aria-hidden="true" /> {busy ? "Reunindo..." : "Baixar meus dados"}</button>
        <Link to="/privacidade">Política de Privacidade</Link>
        <Link to="/termos">Termos de Uso</Link>
      </div>
      {feedbackText && <p className="pf-data-feedback" role="status">{feedbackText}</p>}
    </section>
  );
}
