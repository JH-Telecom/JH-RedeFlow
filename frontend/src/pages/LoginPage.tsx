import { useState } from "react";
import { Activity, ChevronRight, LockKeyhole } from "lucide-react";
import faviconUrl from "../../image/favicon.ico";
import { Link } from "react-router-dom";
import { api, type Role, type User } from "../api";

export function Login({
  onLogin,
}: {
  onLogin: (session: { token: string; user: User & { role: Role } }) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await api.login(email, password);
      onLogin(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel entrar.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="brand-mark">
          <img className="brand-logo-image" src={faviconUrl} alt="JH Telecom" />
          <div>
            <strong>JH Telecom - Rede</strong>
            <small>O&amp;M</small>
          </div>
        </div>
        <div className="intro-copy">
          <p className="eyebrow">OPERACAO DE REDE</p>
          <h1>Controle operacional da Rede em um só lugar.</h1>
          <p>
            Gerencie ordens, equipes, atendimentos e indicadores de forma
            simples e centralizada.
          </p>
        </div>
        <div className="intro-foot">
          <span>
            <Activity size={16} /> Plataforma em evolução
          </span>
          <span>
            <LockKeyhole size={16} /> Ambiente corporativo
          </span>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-brand">
            <img className="brand-logo-image" src={faviconUrl} alt="JH Telecom" />
            <strong>JH Telecom - Rede</strong>
          </div>
          <div className="form-heading">
            <span className="section-kicker">ACESSO INTERNO</span>
            <h2>Entrar</h2>
            <p>Use sua conta corporativa para acessar o sistema.</p>
          </div>
          <form onSubmit={submit}>
            <label>
              E-mail
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="user@jhtelecom.com"
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua senha"
                required
              />
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button" disabled={loading}>
              {loading ? "Entrando..." : "Entrar no sistema"}
              <ChevronRight size={18} />
            </button>
          </form>
          {/* Nao existe recuperacao automatica por e-mail: o botao diz o caminho real em vez de prometer um envio. */}
          <button className="text-button" type="button" aria-expanded={forgotOpen} aria-controls="login-forgot" onClick={() => setForgotOpen((open) => !open)}>
            Esqueci minha senha
          </button>
          {forgotOpen && <p id="login-forgot" className="login-forgot" role="status">Peça a um administrador do sistema para redefinir a sua senha. No próximo acesso você escolhe uma senha nova.</p>}
          <nav className="login-legal" aria-label="Documentos">
            <Link to="/privacidade">Política de Privacidade</Link>
            <Link to="/termos">Termos de Uso</Link>
          </nav>
        </div>
      </section>
    </main>
  );
}

export function FirstLoginPasswordChange({
  onComplete,
  onLogout,
}: {
  onComplete: (user: User & { role: Role }) => void;
  onLogout: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmation) {
      setError("As senhas novas nao conferem.");
      return;
    }
    setLoading(true);
    try {
      const result = await api.changePassword(currentPassword, newPassword);
      onComplete(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel trocar a senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="password-change-page">
      <section className="password-change-card">
        <div className="password-change-mark"><LockKeyhole size={20} /></div>
        <span className="section-kicker">PRIMEIRO ACESSO</span>
        <h1>Defina sua senha</h1>
        <p>Para continuar, troque a senha inicial por uma senha pessoal.</p>
        <form onSubmit={submit} autoComplete="off">
          <label>
            Senha atual
            <input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          </label>
          <label>
            Nova senha
            <input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          </label>
          <label>
            Confirme a nova senha
            <input type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button" disabled={loading}>
            {loading ? "Salvando..." : "Salvar nova senha"}
            <ChevronRight size={18} />
          </button>
        </form>
        <button className="text-button password-change-logout" type="button" onClick={onLogout}>Sair da conta</button>
      </section>
    </main>
  );
}
