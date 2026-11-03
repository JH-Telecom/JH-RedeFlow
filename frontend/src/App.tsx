import { useEffect, useState } from "react";
import faviconUrl from "../image/favicon.ico";
import { api, type Role, type User } from "./api";
import { Shell } from "./components/Shell";
import { FirstLoginPasswordChange, Login } from "./pages/LoginPage";

export default function App() {
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
    localStorage.removeItem("jh-redeflow-token");
    localStorage.removeItem("jh-redeflow-session");
    setSession(null);
  }

  if (hydrating)
    return (
      <div className="app-loading">
        <img className="loading-mark logo-image" src={faviconUrl} alt="JH Telecom" />
        <span>Carregando O&amp;M...</span>
      </div>
    );
  if (!session) return <Login onLogin={login} />;
  if (session.user.mustChangePassword) return <FirstLoginPasswordChange
    onComplete={(user) => {
      const refreshedSession = { ...session, user };
      localStorage.setItem("jh-redeflow-session", JSON.stringify(refreshedSession));
      setSession(refreshedSession);
    }}
    onLogout={logout}
  />;
  return <Shell user={session.user} onLogout={logout} />;
}
