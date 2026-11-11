// Acionamento repetido: se ja existe chamado (nao cancelado) com a mesma OS (ordem / Office Track), nao aciona de novo.
// O BDESK NAO conta: o NOC reaproveita o mesmo BDESK para chamados diferentes (ex.: 678676 com uma OS na OLT PAL e
// outra na GZ1). Vale na chegada do card (webhook) e no aceite. Chamado cancelado nao conta: pode ser acionado de novo.
import type { Call } from './types.js';

const digits = (value: unknown) => String(value ?? '').replace(/[^0-9a-z]/gi, '').toUpperCase();

export type ActivationKeys = { orders: string[] };

// OS: Office Track / ordem (6+ caracteres, sem "PEND-").
export function activationKeys(input: { orders: Array<string | null | undefined> }): ActivationKeys {
  return { orders: [...new Set(input.orders.filter((value) => value && !/^PEND-/i.test(String(value))).map(digits).filter((value) => value.length >= 6))] };
}

export function findDuplicateCall<T extends Pick<Call, 'id' | 'status' | 'orderNumber' | 'officeTrack'>>(keys: ActivationKeys, calls: T[]): T | undefined {
  if (!keys.orders.length) return undefined;
  return calls.find((call) => call.status !== 'Cancelado'
    && [call.orderNumber, call.officeTrack].filter((value) => value && !/^PEND-/i.test(value)).map(digits).some((value) => value.length >= 6 && keys.orders.includes(value)));
}

// Um aceite de cada vez: dois aceites ao mesmo tempo (toast + tela, ou dois mesarios) nao criam dois chamados.
let queue: Promise<unknown> = Promise.resolve();
export function serializeAccept<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}
