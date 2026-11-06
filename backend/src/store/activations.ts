import { parseSaoPauloDateTime } from '../timezone.js';
import { createSupabaseActivation, decideSupabaseActivation, isSupabaseConfigured, listSupabaseActivations } from "../integrations/supabase/client.js";
import { findAtreladaCallOrder, identifyAtreladas, resolveOltRegion } from "../integrations/wuzapi/noc-consolidation.js";
import type { Activation, ActivationAnalysis, ActivationStatus, Call, User } from "../types.js";
import { listCalls } from "./calls.js";
import { activations, calls } from "./demo-data.js";
import { captureUnknownOltRequests } from "./settings.js";

export async function listActivations(status?: ActivationStatus): Promise<Activation[]> {
  if (isSupabaseConfigured()) return await listSupabaseActivations(status);
  return [...activations.values()].filter((item) => !status || item.status === status).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export async function receiveActivation(input: { source: string; originalMessage: string; extractedData: Record<string, string>; analysis?: ActivationAnalysis }): Promise<Activation> {
  await captureUnknownOltRequests([input.extractedData.olt, input.analysis?.olt], 'WuzAPI');
  if (isSupabaseConfigured()) return await createSupabaseActivation(input);
  const comparable = (value: string | undefined) => value?.trim().toLowerCase() || '';
  const incomingKeys = [input.originalMessage, input.extractedData.bdesk, input.extractedData.officeTrack, input.extractedData.orderNumber].map(comparable).filter(Boolean);
  const existing = [...activations.values()].find((activation) => activation.status !== 'Recusado' && [activation.originalMessage, activation.extractedData.bdesk, activation.extractedData.officeTrack, activation.extractedData.orderNumber].map(comparable).some((key) => incomingKeys.includes(key)));
  if (existing) return existing;
  const relatedOrder = input.analysis ? findAtreladaCallOrder(input.analysis, await listCalls()) : undefined;
  const enrichedAnalysis = input.analysis ? { ...input.analysis, atrelada: relatedOrder || null, atreladas: identifyAtreladas(input.analysis, [...activations.values()].map((activation) => ({ id: activation.id, analysis: activation.analysis }))) } : input.analysis;
  const activation: Activation = { id: `activation-${crypto.randomUUID()}`, source: input.source, originalMessage: input.originalMessage, receivedAt: new Date().toISOString(), status: 'Pendente', extractedData: input.extractedData, analysis: enrichedAnalysis }; activations.set(activation.id, activation); return activation;
}

export async function decideActivation(id: string, decision: 'Aceito' | 'Recusado', actor: User, rejectionReason?: string): Promise<{ activation?: Activation; call?: Call }> {
  if (isSupabaseConfigured()) return await decideSupabaseActivation(id, decision, actor.id, rejectionReason);
  const activation = activations.get(id);
  if (!activation || activation.status !== 'Pendente') return {};
  activation.status = decision; activation.decisionBy = actor.id; activation.decisionAt = new Date().toISOString(); activation.rejectionReason = rejectionReason;
  if (decision === 'Aceito') {
    const data = activation.extractedData;
    const analysis = activation.analysis;
    const olt = data.olt || analysis?.olt || '';
    // Mesmo card vindo de outro grupo: liga ao chamado que ja existe para a ordem (nao cancelado).
    const order = data.orderNumber?.trim();
    const existing = order ? [...calls.values()].find((item) => item.status !== 'Cancelado' && (item.orderNumber === order || item.officeTrack === order)) : undefined;
    if (existing) { activation.createdCallId = existing.id; return { activation, call: existing }; }
    const mappedRegion = resolveOltRegion(olt).region;
    const call: Call = { id: `call-${crypto.randomUUID()}`, orderNumber: data.orderNumber || `PEND-${id.slice(-6)}`, bdesk: data.bdesk || '', officeTrack: data.orderNumber || '', client: data.client || 'Cliente nao identificado', type: data.type || analysis?.tipo_registro || 'NOC ACESSO', reason: data.reason || analysis?.motivo || 'Acionamento recebido', region: mappedRegion || data.region || 'Nao informada', city: data.city || '', olt, slotPon: data.slotPon || analysis?.slot_pon?.join(', ') || '', atrelada: analysis?.atrelada || undefined, address: analysis?.endereco_principal || '', bairro: analysis?.bairro_principal || '', status: 'Aberto', openedAt: activation.receivedAt || new Date().toISOString(), eventAt: parseSaoPauloDateTime(analysis?.data_hora_evento), notes: analysis?.atrelada ? `Criado a partir de acionamento aceito.\nAtrelada > ${analysis.atrelada}` : 'Criado a partir de acionamento aceito.' };
    calls.set(call.id, call); activation.createdCallId = call.id;
    return { activation, call };
  }
  return { activation };
}
