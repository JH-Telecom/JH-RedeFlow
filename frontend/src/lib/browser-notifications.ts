import type { AppNotification } from "../api";

// Notificacoes (11/11/2026, card "Melhorar as notificacoes"):
// - "visto": ao abrir o sino, tudo o que esta na lista conta como visto e o ponto vermelho some. Volta quando
//   aparece algo novo (outra mencao, numero de chamados mudou, aviso novo). Guardado por login neste navegador.
// - navegador: com permissao, aviso do sistema (Windows/Chrome) quando chega algo novo e a aba nao esta na frente.
//   Funciona com o sistema aberto em alguma aba (mesmo minimizado); com o navegador fechado nao ha aviso.

// Assinatura de cada item: muda quando o texto ou a contagem muda (ex.: "3 chamados sem tecnico" -> "4").
export const signatureOf = (item: Pick<AppNotification, "id" | "title" | "count">) => `${item.id}|${item.title}|${item.count ?? ""}`;

function readSet(key: string) {
  try { const raw = localStorage.getItem(key); return raw ? new Set<string>(JSON.parse(raw)) : null; } catch { return null; }
}
function writeSet(key: string, values: Iterable<string>) {
  try { localStorage.setItem(key, JSON.stringify([...values].slice(-300))); } catch { /* sem armazenamento */ }
}

export const seenKey = (userId: string) => `jh-notif-vistas:${userId}`;
export function readSeen(userId: string) { return readSet(seenKey(userId)) ?? new Set<string>(); }
export function markSeen(userId: string, items: Array<Pick<AppNotification, "id" | "title" | "count">>) {
  const seen = readSeen(userId);
  items.forEach((item) => seen.add(signatureOf(item)));
  writeSet(seenKey(userId), seen);
  return seen;
}

// O que ja virou aviso do navegador (para nao repetir). Na primeira vez so guarda, sem avisar tudo de uma vez.
const notifiedKey = (userId: string) => `jh-notif-avisadas:${userId}`;
export function takeNew(userId: string, signatures: string[]) {
  const known = readSet(notifiedKey(userId));
  const fresh = known ? signatures.filter((signature) => !known.has(signature)) : [];
  writeSet(notifiedKey(userId), [...(known ?? []), ...signatures]);
  return new Set(fresh);
}

const OFF_KEY = "jh-notif-navegador-desligado";
export type BrowserNotificationState = "unsupported" | "default" | "granted" | "denied" | "off";
export function browserNotificationState(): BrowserNotificationState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") { try { if (localStorage.getItem(OFF_KEY) === "1") return "off"; } catch { /* segue */ } }
  return Notification.permission;
}
export async function enableBrowserNotifications(): Promise<BrowserNotificationState> {
  if (!("Notification" in window)) return "unsupported";
  try { localStorage.removeItem(OFF_KEY); } catch { /* segue */ }
  if (Notification.permission === "default") await Notification.requestPermission();
  return browserNotificationState();
}
export function disableBrowserNotifications() {
  try { localStorage.setItem(OFF_KEY, "1"); } catch { /* segue */ }
}
export const browserNotificationsOn = () => browserNotificationState() === "granted";
// So avisa quando a pessoa nao esta olhando o sistema (aba em segundo plano ou outra janela na frente).
export const pageInBackground = () => document.visibilityState !== "visible" || !document.hasFocus();

export function showBrowserNotification(input: { title: string; body: string; tag: string; icon?: string; onClick: () => void }) {
  if (!browserNotificationsOn()) return;
  try {
    const notification = new Notification(input.title, { body: input.body, tag: input.tag, icon: input.icon, lang: "pt-BR" });
    notification.onclick = () => { window.focus(); input.onClick(); notification.close(); };
  } catch { /* navegador recusou: sem aviso */ }
}
