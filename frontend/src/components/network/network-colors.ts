import type { NetworkKind, NetworkSituation } from "../../api";

// Cores e nomes da situacao do cliente (iguais a Central Rede). Cinza = sem leitura, nunca "desconectado".
export const SITUATION_COLORS: Record<NetworkSituation, string> = {
  problema: "#ef4444",
  atencao: "#f59e0b",
  ok: "#22c55e",
  sem: "#94a3b8",
};

export const SITUATION_LABELS: Record<NetworkSituation, string> = {
  problema: "Com problema",
  atencao: "Atenção",
  ok: "Sem problema",
  sem: "Sem leitura",
};

// Ordem da lista lateral: problema primeiro, depois atencao, sem leitura e ok.
export const SITUATION_ORDER: NetworkSituation[] = ["problema", "atencao", "sem", "ok"];

// Marcadores da rede no mapa (por tipo). O cabo usa a cor original do KMZ; sem cor, um cinza neutro.
export const ELEMENT_COLORS: Record<NetworkKind, string> = {
  pop: "#7c3aed",
  cto: "#0f766e",
  ceo: "#1d4ed8",
  outro: "#64748b",
};
export const ELEMENT_LABELS: Record<NetworkKind, string> = { pop: "POP", cto: "CTO", ceo: "CEO", outro: "Outro" };
export const CABLE_FALLBACK_COLOR = "#6b7280";
