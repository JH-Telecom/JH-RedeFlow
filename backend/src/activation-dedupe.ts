// Acionamento repetido: se ja existe chamado (nao cancelado) com a mesma OS ou o mesmo BDESK, nao aciona de novo.
// Vale na chegada do card (webhook) e no aceite. Chamado cancelado nao conta: o card pode ser acionado de novo.
import type { Call } from './types.js';

const digits = (value: unknown) => String(value ?? '').replace(/^(?:bdesk|bd)[-\s]*/i, '').replace(/[^0-9a-z]/gi, '').toUpperCase();

export type ActivationKeys = { orders: string[]; bdesk: string };

// OS: Office Track / ordem (6+ caracteres, sem "PEND-"). BDESK: 5+ digitos.
export function activationKeys(input: { orders: Array<string | null | undefined>; bdesk?: string | null }): ActivationKeys {
  const orders = [...new Set(input.orders.filter((value) => value && !/^PEND-/i.test(String(value))).map(digits).filter((value) => value.length >= 6))];
  const bdesk = digits(input.bdesk);
  return { orders, bdesk: bdesk.length >= 5 ? bdesk : '' };
}

export function findDuplicateCall<T extends Pick<Call, 'id' | 'status' | 'orderNumber' | 'officeTrack' | 'bdesk'>>(keys: ActivationKeys, calls: T[]): T | undefined {
  if (!keys.orders.length && !keys.bdesk) return undefined;
  return calls.find((call) => call.status !== 'Cancelado' && (
    [call.orderNumber, call.officeTrack].map(digits).some((value) => value.length >= 6 && keys.orders.includes(value))
    || (Boolean(keys.bdesk) && digits(call.bdesk) === keys.bdesk)
  ));
}

// Um aceite de cada vez: dois aceites ao mesmo tempo (toast + tela, ou dois mesarios) nao criam dois chamados.
let queue: Promise<unknown> = Promise.resolve();
export function serializeAccept<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}
