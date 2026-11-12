import type { Technician } from "../api";

// Status do dia do tecnico (mesmos da planilha de escala). Igual ao backend (backend/src/duty-status.ts).
export const DUTY_STATUSES = ["Ativo", "Folga", "Falta", "Ativar às 13:00", "Interjornada", "Atestado", "Vindo na base", "Ativar às 22:00", "Saiu de rota", "Frota", "Férias"] as const;
const WORKING = new Set(["Ativo", "Vindo na base", "Saiu de rota"]);
export const isWorkingDuty = (status: string) => WORKING.has(status);

// Quem ainda nao teve status escolhido: "Ativo" se esta ativo no sistema; senao fica sem status ("—").
export const dutyOf = (technician: Pick<Technician, "dutyStatus" | "active">) => technician.dutyStatus || (technician.active ? "Ativo" : "");

export type DutyTone = "green" | "blue" | "amber" | "red" | "gray";
export function dutyTone(status: string): DutyTone {
  if (status === "Ativo") return "green";
  if (status === "Vindo na base" || status === "Saiu de rota") return "blue";
  if (status.startsWith("Ativar")) return "amber";
  if (status === "Falta" || status === "Atestado" || status === "Frota") return "red";
  return "gray";
}
