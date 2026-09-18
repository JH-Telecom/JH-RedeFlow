export type WuzApiMessage = { id?: string; message?: string; text?: string; source?: string; chatId?: string; receivedAt?: string; [key: string]: unknown };

export function parseIncomingMessage(payload: unknown): WuzApiMessage {
  const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const event = (data.event && typeof data.event === 'object' ? data.event : {}) as Record<string, unknown>;
  const message = (event.Message && typeof event.Message === 'object' ? event.Message : {}) as Record<string, unknown>;
  const info = (event.Info && typeof event.Info === 'object' ? event.Info : {}) as Record<string, unknown>;
  const text = String(data.message || data.text || message.conversation || (message.extendedTextMessage as Record<string, unknown> | undefined)?.text || '');
  const chatId = String(data.chatId || data.chat || info.Chat || info.RemoteJid || info.Sender || '');
  return { ...data, id: String(data.id || info.ID || `wuz-${crypto.randomUUID()}`), message: text, source: String(data.source || chatId || 'wuzapi'), chatId, receivedAt: String(data.receivedAt || new Date().toISOString()) };
}

export function extractOperationalData(message: string): Record<string, string> {
  const field = (name: string) => {
    const match = message.match(new RegExp(`(?:${name})\\s*[:=-]\\s*([^\\n\\r]+)`, 'i'));
    return match?.[1]?.replace(/^\s*[*-]\s*/, '').replace(/\s*[*]\s*$/, '').trim() || '';
  };
  const normalized = message.toUpperCase();
  const isFieldActivation = normalized.includes('ACIONAMENTO FIELD');
  const isBackboneActivation = normalized.includes('EVENTO BACKBONE') || normalized.includes('VALIDAR COM NOC TX');
  const officeTrack = field('TAREFA\\s+OFFICE\\s+TRACK|OFFICE\\s+TRACK|OS\\s+OT|OFFICETRACK');
  const orderNumber = field('ORDEM|ORDEM\\s+DE\\s+SERVIÇO') || officeTrack;
  const type = isBackboneActivation ? 'NOC TX' : isFieldActivation ? 'ACIONAMENTO FIELD' : normalized.includes('NOC TX') ? 'NOC TX' : 'NOC ACESSO';
  const addresses = message.includes('Endereços:') || message.includes('Enderecos:') ? message.split(/Endereços?:/i)[1]?.split(/COPE\s+REDE:/i)[0]?.trim() || '' : '';
  const slotPon = (() => {
    const slot = message.match(/SLOT\s*:\s*([^|\n]+).*?PON\s*:\s*([^\n]+)/i);
    return slot ? `${slot[1].replace(/[*]/g, '').trim()} / ${slot[2].replace(/[*]/g, '').trim()}` : field('SLOT/PON|PLACA/PON');
  })();
  return {
    orderNumber,
    officeTrack,
    bdesk: field('BDESK|TICKET'),
    type,
    reason: field('MOTIVO|TIPO\\s+DE\\s+FALHA|TIPO'),
    eventAt: field('DATA\\s*/\\s*HORA\\s+DO\\s+EVENTO|DATA\\s+HORA\\s+DO\\s+EVENTO'),
    olt: field('OLT'),
    slotPon,
    affectedCount: field('AFETADOS|AFETAÇÃO|AFETACAO'),
    contract: field('CONTRATO(?:S)?\\s+EXEMPLO(?:S)?|CONTRATO'),
    technician: field('TÉCNICO\\s+REDE|TECNICO\\s+REDE|TÉCNICO|TECNICO'),
    cope: field('COPE\\s+REDE'),
    client: field('CLIENTE'),
    region: field('REGIÃO|REGIAO'),
    city: field('CIDADE'),
    phone: field('TELEFONE'),
    customerOrder: field('O\\.S\\.\\s+CASA\\s+CLIENTE'),
    ticket: field('TICKET'),
    serialNumber: field('S/N'),
    ctoId: field('ID/CTO'),
    ctoLocation: field('LOC\\s+CTO'),
    title: field('TITULO'),
    openedAt: field('ABERTO\\s+EM'),
    observations: field('OBSERVAÇÕES|OBSERVACOES'),
    outageStart: field('INÍCIO\\s+DA\\s+QUEDA|INICIO\\s+DA\\s+QUEDA'),
    addresses,
  };
}