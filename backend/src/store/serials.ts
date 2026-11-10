import { appendSupabaseActivationData, isSupabaseConfigured, supabaseActivationDataForCalls } from '../integrations/supabase/client.js';
import { contractsFromActivationData, pickAutoIspSerial, serialFromActivationData, type AutoIspRow } from '../serial-number.js';
import type { CallStatus } from '../types.js';
import { getCall, listCalls } from './calls.js';
import { activations } from './demo-data.js';

// Dados do acionamento de cada chamado (Supabase ou demonstracao).
async function activationDataForCalls(callIds: string[]) {
  if (isSupabaseConfigured()) return supabaseActivationDataForCalls(callIds);
  const result = new Map<string, { activationId: string; extracted: Record<string, unknown> }>();
  for (const activation of activations.values()) {
    if (activation.createdCallId && callIds.includes(activation.createdCallId)) {
      result.set(activation.createdCallId, { activationId: activation.id, extracted: { ...activation.extractedData, _analysis: activation.analysis } });
    }
  }
  return result;
}

export async function getCallSerial(callId: string) {
  const data = (await activationDataForCalls([callId])).get(callId);
  if (!data) return { serialNumber: null, source: null, contracts: [] as string[] };
  const serial = serialFromActivationData(data.extracted);
  return { serialNumber: serial?.serialNumber || null, source: serial?.source || null, contract: serial?.contract || null, contracts: contractsFromActivationData(data.extracted) };
}

// Chamados em aberto sem SN e com contrato no card: a extensao procura cada um no AutoISP.
const LOOKUP_STATUSES: CallStatus[] = ['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo', 'GIGA+'];
export async function pendingSerialLookups(limit = 25) {
  const open = await listCalls(LOOKUP_STATUSES);
  const data = await activationDataForCalls(open.map((call) => call.id));
  const pending: Array<{ callId: string; orderNumber: string; olt: string; contracts: string[] }> = [];
  for (const call of open) {
    const item = data.get(call.id);
    if (!item || serialFromActivationData(item.extracted)) continue;
    const contracts = contractsFromActivationData(item.extracted);
    if (contracts.length) pending.push({ callId: call.id, orderNumber: call.orderNumber, olt: call.olt, contracts });
    if (pending.length >= limit) break;
  }
  return pending;
}

// Resultado da busca no AutoISP: guarda so o SN, o contrato e a OLT (nada de nome/endereco do assinante).
export async function saveAutoIspSerial(callId: string, contract: string, rows: AutoIspRow[]) {
  const call = await getCall(callId);
  if (!call) return { ok: false as const, message: 'Chamado nao encontrado.' };
  const picked = pickAutoIspSerial(rows, call.olt);
  if (!picked?.serial) return { ok: false as const, message: 'Contrato sem SN no AutoISP.' };
  const item = (await activationDataForCalls([callId])).get(callId);
  if (!item) return { ok: false as const, message: 'Chamado sem acionamento.' };
  const extracted = { ...item.extracted, autoispSerial: picked.serial, autoispContract: String(picked.contract || contract), autoispOlt: picked.olt || null, autoispAt: new Date().toISOString() };
  if (isSupabaseConfigured()) await appendSupabaseActivationData(item.activationId, extracted, 'autoisp-serial');
  else {
    const activation = activations.get(item.activationId);
    if (activation) activation.extractedData = { ...activation.extractedData, autoispSerial: picked.serial, autoispContract: String(picked.contract || contract) };
  }
  return { ok: true as const, serialNumber: picked.serial };
}
