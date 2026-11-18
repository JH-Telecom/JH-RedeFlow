import { Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import faviconUrl from "../image/favicon.ico";
import { api, clearResponseCache, type Role, type User } from "./api";
import { clearDataCache } from "./lib/data-cache";
import { Shell } from "./components/Shell";
import { FirstLoginPasswordChange, Login } from "./pages/LoginPage";
import { StorageNotice } from "./components/StorageNotice";
import { lazyNamed } from "./lib/lazy-named";
import { PageSkeleton } from "./components/Skeleton";
const StatusPage = lazyNamed(() => import("./pages/StatusPage"), "StatusPage");
const PublicCallPage = lazyNamed(() => import("./pages/PublicCallPage"), "PublicCallPage");
const LicensesPage = lazyNamed(() => import("./pages/LicensesPage"), "LicensesPage");
const PrivacyPolicyPage = lazyNamed(() => import("./pages/LegalPages"), "PrivacyPolicyPage");
const TermsOfUsePage = lazyNamed(() => import("./pages/LegalPages"), "TermsOfUsePage");

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
  if (location.pathname === "/privacidade") return <><Suspense fallback={<PageSkeleton />}><PrivacyPolicyPage /></Suspense><StorageNotice /></>;
  if (location.pathname === "/termos") return <><Suspense fallback={<PageSkeleton />}><TermsOfUsePage /></Suspense><StorageNotice /></>;
  if (location.pathname === "/licencas") return <><Suspense fallback={<PageSkeleton />}><LicensesPage /></Suspense><StorageNotice /></>;
  // Status do sistema: aberta sem login (quando o banco cai, o login cai junto).
  if (location.pathname === "/status") return <><Suspense fallback={<PageSkeleton />}><StatusPage /></Suspense><StorageNotice /></>;
  // Link do informativo (Casa Cliente): so leitura, sem login, so aquele chamado.
  if (location.pathname.startsWith("/consulta/")) return <><Suspense fallback={<PageSkeleton />}><PublicCallPage token={location.pathname.slice("/consulta/".length)} /></Suspense><StorageNotice /></>;
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
