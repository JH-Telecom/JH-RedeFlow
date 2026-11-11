// Atalhos de teclado do sistema (11/11/2026):
// - Esc volta para a tela anterior (ou para a tela principal) fora de campos e sem janela aberta.
// - Enter num campo de uma linha aciona o botao [data-save-button] da area [data-save-scope] mais proxima
//   (telas sem <form>, como o detalhe do chamado). Formularios <form> ja salvam com Enter sozinhos.

// Partes da tela com algo nao salvo (campos do chamado, rascunho de observacao) se registram aqui. Se alguma
// tiver, o Esc pergunta uma vez antes de sair.
const unsaved = new Set<() => boolean>();
export function registerUnsaved(hasUnsaved: () => boolean) { unsaved.add(hasUnsaved); return () => { unsaved.delete(hasUnsaved); }; }
export function canLeave() {
  if (![...unsaved].some((check) => check())) return true;
  return window.confirm("Há alterações que ainda não foram salvas. Sair mesmo assim?");
}

export function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element || !element.tagName) return false;
  return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

// Janela aberta (modal, busca rapida, ajuda, novidades): o Esc e dela.
export function hasOpenDialog() {
  return Boolean(document.querySelector('[role="dialog"], [aria-modal="true"], [role="alertdialog"]'));
}

const ENTER_INPUT_TYPES = new Set(["text", "search", "email", "number", "tel", "url", "date", "datetime-local", "time", "month", "week", ""]);
// Enter num campo de uma linha fora de <form>: clica no botao de salvar da area. Devolve true se clicou.
export function submitSaveScope(target: EventTarget | null) {
  const input = target as HTMLInputElement | null;
  if (!input || input.tagName !== "INPUT" || !ENTER_INPUT_TYPES.has((input.getAttribute("type") || "").toLowerCase())) return false;
  if (input.form) return false;
  const scope = input.closest("[data-save-scope]");
  const button = scope?.querySelector<HTMLButtonElement>("[data-save-button]");
  if (!button || button.disabled || button.closest("[data-save-scope]") !== scope) return false;
  button.click();
  return true;
}

// Enter salva, Shift+Enter quebra a linha (Ctrl+Enter continua salvando). Para caixas de observacao.
export function isSaveEnter(event: { key: string; shiftKey: boolean; altKey: boolean; nativeEvent?: { isComposing?: boolean } }) {
  return event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent?.isComposing;
}
