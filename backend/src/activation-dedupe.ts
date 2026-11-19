// Acionamento repetido: se ja existe chamado (nao cancelado) com a mesma OS (ordem / Office Track), nao aciona de novo.
// O BDESK NAO conta: o NOC reaproveita o mesmo BDESK para chamados diferentes (ex.: 678676 com uma OS na OLT PAL e
// outra na GZ1). Vale na chegada do card (webhook) e no aceite. Chamado cancelado nao conta: pode ser acionado de novo.
import type { Call } from './types.js';

const digits = (value: unknown) => String(value ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase();

// 19/11/2026: card SEM OS (so com BDESK) e o mesmo chamado do BDESK. Com OS, o BDESK continua nao contando.
export type ActivationKeys = { orders: string[]; bdesks: string[] };

// OS: Office Track / ordem (6+ caracteres, sem "PEND-").
export function activationKeys(input: { orders: Array<string | null | undefined>; bdesks?: Array<string | null | undefined> }): ActivationKeys {
  const orders = [...new Set(input.orders.filter((value) => value && !/^PEND-/i.test(String(value))).map(digits).filter((value) => value.length >= 6))];
  const bdesks = [...new Set((input.bdesks ?? []).map(digits).filter((value) => value.length >= 4))];
  // BDESK que veio no lugar da OS (ordem = BDESK) nao e OS de verdade.
  return { orders: orders.filter((order) => !bdesks.includes(order)), bdesks };
}

export function findDuplicateCall<T extends Pick<Call, 'id' | 'status' | 'orderNumber' | 'officeTrack'> & { bdesk?: string }>(keys: ActivationKeys, calls: T[]): T | undefined {
  if (keys.orders.length) {
    return calls.find((call) => call.status !== 'Cancelado'
      && [call.orderNumber, call.officeTrack].filter((value) => value && !/^PEND-/i.test(value)).map(digits).some((value) => value.length >= 6 && keys.orders.includes(value)));
  }
  // Sem OS: o chamado nao cancelado do mesmo BDESK (o mais recente, se o NOC reaproveitou o BDESK).
  if (!keys.bdesks.length) return undefined;
  const same = calls.filter((call) => call.status !== 'Cancelado' && call.bdesk && keys.bdesks.includes(digits(call.bdesk)));
  return same[same.length - 1];
}

// Relatorio de encerramento do tecnico ("CAUSA DA FALHA", "TRATATIVA REALIZADA", "MATERIAL UTILIZADO", "QUANTIDADE DE
// FUSAO"...) mandado no grupo de acionamentos: nao e acionamento novo. Vira anotacao no chamado do mesmo BDESK.
export function isClosingReport(text: string) {
  const normalized = String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (/VALIDAR\s+COM\s+NOC|TAREFA\s+(?:OFS|OFFICE)|EVENTO\s+IDENTIFICADO|EVENTO\s+BACKBONE|ACIONAMENTO\s+FIELD/.test(normalized)) return false;
  const markers = [/TRATATIVA\s+REALIZADA/, /CAUSA\s+DA\s+FALHA/, /MATERIA(?:L|IS)\s+UTILIZAD/, /QUANTIDADE\s+DE\s+FUS/, /CABO\s+MANUSEADO/, /CAUSA\s+RAIZ/];
  return markers.filter((marker) => marker.test(normalized)).length >= 2;
}

// Um aceite de cada vez: dois aceites ao mesmo tempo (toast + tela, ou dois mesarios) nao criam dois chamados.
let queue: Promise<unknown> = Promise.resolve();
export function serializeAccept<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}
