// Lote E: checklist ao finalizar (9) e tela do tecnico em campo (8).

export type ChecklistTemplate = { id: string; name: string; callTypes: string[]; items: string[]; active: boolean };

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

// Checklist do chamado: o primeiro ativo cujo tipo bate (sem tipos = vale para todos). Especifico ganha do geral.
export function checklistFor(callType: string, templates: ChecklistTemplate[]): ChecklistTemplate | null {
  const type = fold(callType || '');
  const active = templates.filter((template) => template.active && template.items.length);
  return active.find((template) => template.callTypes.some((item) => fold(item) === type))
    ?? active.find((template) => !template.callTypes.length)
    ?? null;
}

// Itens que faltam marcar (compara pelo texto, sem acento/maiuscula).
export function missingChecklistItems(template: ChecklistTemplate | null, checked: string[] | undefined): string[] {
  if (!template) return [];
  const done = new Set((checked || []).map(fold));
  return template.items.filter((item) => !done.has(fold(item)));
}

// Linha que entra na observacao final: o que foi conferido.
export function checklistNote(template: ChecklistTemplate | null) {
  return template ? `Checklist "${template.name}": ${template.items.map((item) => `✔ ${item}`).join('; ')}` : '';
}

export const FIELD_STATUSES = ['Deslocamento', 'Em campo'] as const;
