import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminModal } from "./ui";
import { hasOpenDialog, isTypingTarget } from "../lib/keyboard";

// Atalhos de teclado (18/11/2026): "?" mostra a lista; "g" e depois uma letra vai direto para uma tela.
const GO: Array<{ key: string; to: string; label: string }> = [
  { key: "v", to: "/", label: "Visão geral" },
  { key: "a", to: "/chamados/abertos", label: "Chamados abertos" },
  { key: "e", to: "/chamados/atendimento", label: "Em atendimento" },
  { key: "f", to: "/chamados/finalizados", label: "Finalizados e cancelados" },
  { key: "c", to: "/carga", label: "Carga dos técnicos" },
  { key: "m", to: "/acionamentos", label: "Acionamentos" },
  { key: "t", to: "/tecnicos", label: "Técnicos" },
];
const GENERAL: Array<[string, string]> = [
  ["Ctrl + K", "Busca rápida (telas e chamados)"],
  ["Ctrl + J", "Abrir ou fechar o Jota H"],
  ["?", "Esta lista de atalhos"],
  ["Esc", "Fechar janela ou voltar"],
  ["Enter", "Salvar o campo de uma linha"],
];
const QUEUE: Array<[string, string]> = [
  ["/", "Ir para a busca da fila"],
  ["↓ ou j / ↑ ou k", "Andar pelas linhas"],
  ["Home / End", "Primeira ou última linha"],
  ["Enter", "Abrir o chamado da linha"],
];

export function ShortcutsHelp({ canGo }: { canGo: (to: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const pendingGo = useRef(0);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.key === "?") { event.preventDefault(); setOpen((current) => !current); return; }
      if (hasOpenDialog()) return;
      if (event.key === "g") { pendingGo.current = Date.now(); return; }
      if (pendingGo.current && Date.now() - pendingGo.current < 1500) {
        pendingGo.current = 0;
        const target = GO.find((item) => item.key === event.key.toLowerCase());
        if (target && canGo(target.to)) { event.preventDefault(); navigate(target.to); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, canGo]);
  if (!open) return null;
  const goList = GO.filter((item) => canGo(item.to));
  return (
    <AdminModal title="Atalhos de teclado" onClose={() => setOpen(false)}>
      <div className="kb-help">
        <section><h3>Em qualquer tela</h3><dl>{GENERAL.map(([keys, text]) => <div key={keys + text}><dt>{keys.split(" ").map((part, index) => part === "+" || part === "/" || part === "ou" ? <span key={index}> {part} </span> : <kbd key={index}>{part}</kbd>)}</dt><dd>{text}</dd></div>)}</dl></section>
        {goList.length > 0 && <section><h3>Ir para uma tela: g e depois a letra</h3><dl>{goList.map((item) => <div key={item.key}><dt><kbd>g</kbd> <kbd>{item.key}</kbd></dt><dd>{item.label}</dd></div>)}</dl></section>}
        <section><h3>Na fila de chamados</h3><dl>{QUEUE.map(([keys, text]) => <div key={keys}><dt>{keys.split(" ").map((part, index) => part === "/" && keys !== "/" || part === "ou" ? <span key={index}> {part} </span> : <kbd key={index}>{part}</kbd>)}</dt><dd>{text}</dd></div>)}</dl></section>
      </div>
    </AdminModal>
  );
}
