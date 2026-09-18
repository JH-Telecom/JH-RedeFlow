export type WuzApiMessage = { id?: string; message?: string; text?: string; source?: string; receivedAt?: string; [key: string]: unknown };

export function parseIncomingMessage(payload: unknown): WuzApiMessage {
  const data = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const event = (data.event && typeof data.event === 'object' ? data.event : {}) as Record<string, unknown>;
  const message = (event.Message && typeof event.Message === 'object' ? event.Message : {}) as Record<string, unknown>;
  const info = (event.Info && typeof event.Info === 'object' ? event.Info : {}) as Record<string, unknown>;
  const text = String(data.message || data.text || message.conversation || (message.extendedTextMessage as Record<string, unknown> | undefined)?.text || '');
  return { ...data, id: String(data.id || info.ID || `wuz-${crypto.randomUUID()}`), message: text, source: String(data.source || info.Chat || info.Sender || 'wuzapi'), receivedAt: String(data.receivedAt || new Date().toISOString()) };
}

export function extractOperationalData(message: string): Record<string, string> {
  const field = (name: string) => {
    const match = message.match(new RegExp(`${name}\\s*[:=-]\\s*([^\\n\\r]+)`, 'i'));
    return match?.[1]?.trim() || '';
  };
  return { orderNumber: field('ORDEM|OFFICE TRACK|OS OT'), bdesk: field('BDESK|TICKET'), type: message.toUpperCase().includes('NOC TX') ? 'NOC TX' : message.toUpperCase().includes('FIELD') ? 'ACIONAMENTO FIELD' : 'NOC ACESSO', reason: field('MOTIVO|TIPO DE FALHA'), olt: field('OLT'), slotPon: field('SLOT/PON|PLACA/PON'), client: field('CLIENTE'), region: field('REGIAO|REGIÃO'), city: field('CIDADE') };
}