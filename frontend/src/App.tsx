import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import faviconUrl from "../image/favicon.ico";
import { api, clearResponseCache, type Role, type User } from "./api";
import { clearDataCache } from "./lib/data-cache";
import { Shell } from "./components/Shell";
import { FirstLoginPasswordChange, Login } from "./pages/LoginPage";
import { PrivacyPolicyPage, TermsOfUsePage } from "./pages/LegalPages";
import { LicensesPage } from "./pages/LicensesPage";
import { StorageNotice } from "./components/StorageNotice";

export default function App() {
  const location = useLocation();
  const [session, setSession] = useState<{
    token: string;
    user: User & { role: Role };
  } | null>(() => {
    const raw = localStorage.getItem("jh-redeflow-session");
    return raw ? JSON.parse(raw) : null;
  });
  const [hydrating, setHydrating] = useState(() =>
    Boolean(localStorage.getItem("jh-redeflow-token")),
  );

  useEffect(() => {
    if (!localStorage.getItem("jh-redeflow-token")) {
      setHydrating(false);
      return;
    }

    api
      .me()
      .then(({ user }) => {
        const refreshedSession = {
          token: localStorage.getItem("jh-redeflow-token")!,
          user,
        };
        localStorage.setItem(
          "jh-redeflow-session",
          JSON.stringify(refreshedSession),
        );
        setSession(refreshedSession);
      })
      .catch(() => {
        localStorage.removeItem("jh-redeflow-token");
        localStorage.removeItem("jh-redeflow-session");
        setSession(null);
      })
      .finally(() => setHydrating(false));
  }, []);

  function login(nextSession: { token: string; user: User & { role: Role } }) {
    localStorage.setItem("jh-redeflow-token", nextSession.token);
    localStorage.setItem("jh-redeflow-session", JSON.stringify(nextSession));
    setSession(nextSession);
  }

  function logout() {
    // Avisa o servidor (fica offline na hora); o token e lido antes de ser apagado abaixo.
    void api.logout().catch(() => undefined);
    localStorage.removeItem("jh-redeflow-token");
    localStorage.removeItem("jh-redeflow-session");
    clearResponseCache();
    clearDataCache();
    setSession(null);
  }

  // Privacidade e Termos abrem com ou sem login.
  if (location.pathname === "/privacidade") return <><PrivacyPolicyPage /><StorageNotice /></>;
  if (location.pathname === "/termos") return <><TermsOfUsePage /><StorageNotice /></>;
  if (location.pathname === "/licencas") return <><LicensesPage /><StorageNotice /></>;
  if (hydrating)
    return (
      <div className="app-loading">
        <img className="loading-mark logo-image" src={faviconUrl} alt="JH Telecom" />
        <span>Carregando O&amp;M...</span>
      </div>
    );
  if (!session) return <><Login onLogin={login} /><StorageNotice /></>;
  if (session.user.mustChangePassword) return <FirstLoginPasswordChange
    onComplete={(user) => {
      const refreshedSession = { ...session, user };
      localStorage.setItem("jh-redeflow-session", JSON.stringify(refreshedSession));
      setSession(refreshedSession);
    }}
    onLogout={logout}
  />;
  return <><Shell user={session.user} onLogout={logout} /><StorageNotice /></>;
}
