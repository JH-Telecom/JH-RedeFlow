// Status do dia do tecnico (12/11/2026): substitui "Situacao" (Disponivel/Em campo/Indisponivel) e o Ativo/Inativo na
// tela de Tecnicos, com os mesmos status da planilha de escala. Junto vai uma observacao livre (ex.: "chega 9h").
// O `active` continua existindo para o resto do sistema (apoio, plantao, atribuicao): segue o status escolhido.
export const DUTY_STATUSES = ['Ativo', 'Folga', 'Falta', 'Ativar às 13:00', 'Interjornada', 'Atestado', 'Vindo na base', 'Ativar às 22:00', 'Saiu de rota', 'Frota', 'Férias'] as const;
export type DutyStatus = (typeof DUTY_STATUSES)[number];
// Quem conta como trabalhando agora: ativo, voltando para a base ou que saiu da rota (ainda em servico).
const WORKING: ReadonlySet<string> = new Set(['Ativo', 'Vindo na base', 'Saiu de rota']);
export const isWorkingDuty = (status: string) => WORKING.has(status);

// Campos derivados ao trocar o status: ativo/inativo e a situacao antiga (para telas e relatorios que ainda usam).
export function dutyStatusChanges(status: DutyStatus, currentStatus: 'Disponivel' | 'Em campo' | 'Indisponivel') {
  const active = isWorkingDuty(status);
  return { active, currentStatus: active ? (currentStatus === 'Em campo' ? 'Em campo' as const : 'Disponivel' as const) : 'Indisponivel' as const };
}
