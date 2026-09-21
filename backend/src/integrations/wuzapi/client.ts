export type WuzApiMessage = {
  id?: string;
  message?: string;
  text?: string;
  source?: string;
  chatId?: string;
  sender?: string;
  isGroup?: boolean;
  receivedAt?: string;
  eventType?: string;
  timestamp?: string;
  from?: string;
  to?: string;
  groupId?: string;
  isFromMe?: boolean;
  senderName?: string;
  messageType?: string;
  quotedMessage?: string;
  rawPayload?: unknown;
  [key: string]: unknown;
};

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function readBoolean(...values: unknown[]): boolean {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
      if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    }
    if (typeof value === 'number') return value === 1;
  }
  return false;
}

export function parseIncomingMessage(payload: unknown): WuzApiMessage {
  const data = getObject(payload);
  let nestedPayload: unknown = data.data ?? data.payload ?? data.event ?? {};
  if (data.jsonData && typeof data.jsonData === 'string') {
    try {
      nestedPayload = JSON.parse(data.jsonData);
    } catch {
      nestedPayload = {};
    }
  }
  const nestedData = getObject(nestedPayload);
  const eventValue = nestedData.event ?? data.event;
  const event = getObject(eventValue);
  const info = getObject(event.Info ?? event.info ?? nestedData.Info ?? nestedData.info ?? data.Info ?? data.info ?? {});
  const messageNode = getObject(event.Message ?? event.message ?? nestedData.Message ?? nestedData.message ?? data.Message ?? data.message ?? {});
  const text = readString(
    data.message,
    data.text,
    event.message,
    event.text,
    nestedData.message,
    nestedData.text,
    messageNode.conversation,
    messageNode.text,
    messageNode.body,
    messageNode.content,
    (messageNode.extendedTextMessage as Record<string, unknown> | undefined)?.text,
    (messageNode.imageMessage as Record<string, unknown> | undefined)?.caption,
  );
  const chatId = readString(
    info.Chat,
    info.chat,
    info.chatId,
    info.groupJid,
    info.remoteJid,
    info.remoteJid,
    event.chatId,
    event.chat,
    event.remoteJid,
    nestedData.chatId,
    nestedData.chat,
    nestedData.remoteJid,
    data.chatId,
    data.chat,
    data.remoteJid,
    event.key && typeof event.key === 'object' ? (event.key as Record<string, unknown>).remoteJid : undefined,
  );
  const key = event.key && typeof event.key === 'object' ? event.key as Record<string, unknown> : {};
  const sender = readString(
    info.Sender,
    info.sender,
    info.participant,
    event.sender,
    data.sender,
    event.key && typeof event.key === 'object' ? (event.key as Record<string, unknown>).participant : undefined,
  );
  const recipient = readString(info.To, info.to, info.Recipient, info.recipient, event.to, event.recipient, data.to);
  const senderName = readString(info.PushName, info.pushName, info.SenderName, info.senderName, event.senderName, data.senderName);
  const timestamp = readString(data.timestamp, data.receivedAt, event.timestamp, event.receivedAt, info.Timestamp, info.timestamp, event.Timestamp, new Date().toISOString());
  const isFromMe = readBoolean(info.IsFromMe, info.isFromMe, info.FromMe, info.fromMe, event.isFromMe, event.fromMe, data.isFromMe, data.fromMe, key.fromMe);
  const typedMessageNode = Object.values(messageNode).find((value) => value && typeof value === 'object') as Record<string, unknown> | undefined;
  const contextInfo = typedMessageNode?.contextInfo && typeof typedMessageNode.contextInfo === 'object'
    ? typedMessageNode.contextInfo as Record<string, unknown>
    : messageNode.contextInfo && typeof messageNode.contextInfo === 'object'
      ? messageNode.contextInfo as Record<string, unknown>
      : undefined;
  const quotedNode = contextInfo?.quotedMessage;
  const quotedMessage = readString(
    messageNode.quotedMessage,
    quotedNode && typeof quotedNode === 'object' ? (quotedNode as Record<string, unknown>).conversation : undefined,
    quotedNode && typeof quotedNode === 'object' ? (quotedNode as Record<string, unknown>).text : undefined,
    quotedNode && typeof quotedNode === 'object' ? ((quotedNode as Record<string, unknown>).extendedTextMessage as Record<string, unknown> | undefined)?.text : undefined,
  );
  const messageType = Object.keys(messageNode).find((key) => /Message$/.test(key)) || (text ? 'text' : 'unknown');
  const explicitGroup = [info.IsGroup, info.isGroup, event.isGroup, event.IsGroup, nestedData.isGroup, nestedData.IsGroup, data.isGroup, data.IsGroup].some((value) => value !== undefined && value !== null);
  const isGroup = explicitGroup
    ? readBoolean(info.IsGroup, info.isGroup, event.isGroup, event.IsGroup, nestedData.isGroup, nestedData.IsGroup, data.isGroup, data.IsGroup)
    : /@g\.us$/i.test(chatId);
  const receivedAt = timestamp;
  const source = readString(data.source, event.source, chatId || sender || 'wuzapi');

  return {
    ...data,
    ...nestedData,
    ...event,
    id: readString(data.id, event.id, info.ID, info.id, event.key && typeof event.key === 'object' ? (event.key as Record<string, unknown>).id : undefined, `wuz-${crypto.randomUUID()}`),
    message: text,
    source,
    chatId: chatId || undefined,
    sender: sender || undefined,
    isGroup,
    receivedAt,
    timestamp,
    from: sender || undefined,
    to: recipient || undefined,
    groupId: isGroup ? chatId || undefined : undefined,
    isFromMe,
    senderName: senderName || undefined,
    messageType,
    quotedMessage: quotedMessage || undefined,
    rawPayload: payload,
    eventType: readString(data.type, typeof data.event === 'string' ? data.event : undefined, nestedData.type, typeof nestedData.event === 'string' ? nestedData.event : undefined, event.type, event.eventType, event.name),
  };
}

export function extractOperationalData(message: string): Record<string, string> {
  const valueFor = (candidate: string, patterns: RegExp[], fallbackPattern?: RegExp) => {
    for (const pattern of patterns) {
      const match = candidate.match(pattern);
      if (match && match[1]) return match[1].replace(/^\s*[*-]\s*/, '').replace(/\s*[*]\s*$/, '').trim();
    }
    if (fallbackPattern) {
      const match = candidate.match(fallbackPattern);
      if (match && match[1]) return match[1].replace(/^\s*[*-]\s*/, '').replace(/\s*[*]\s*$/, '').trim();
    }
    return '';
  };
  const normalized = message.toUpperCase();
  const isFieldActivation = /ACIONAMENTO\s+FIELD/i.test(message);
  const isBackboneActivation = /EVENTO\s+BACKBONE|VALIDAR\s+COM\s+NOC\s+TX/i.test(message);
  const hasNocTx = /NOC\s+TX/i.test(normalized);
  const officeTrack = valueFor(message, [/TAREFA\s+OFFICE\s+TRACK\s*[:=-]\s*([^\n\r]+)/i, /OFFICE\s+TRACK\s*[:=-]\s*([^\n\r]+)/i, /OS\s+OT\s*[:=-]\s*([^\n\r]+)/i, /OFFICETRACK\s*[:=-]\s*([^\n\r]+)/i, /OFFICETRACK\s+([^\n\r]+)/i]);
  const orderNumber = valueFor(message, [/ORDEM\s+DE\s+SERVIÇO\s*[:=-]\s*([^\n\r]+)/i, /ORDEM\s*[:=-]\s*([^\n\r]+)/i, /ORDEM\s+([^\n\r]+)/i, /O\.S\.\s*[:=-]\s*([^\n\r]+)/i]) || officeTrack;
  const type = isBackboneActivation ? 'NOC TX' : isFieldActivation ? 'ACIONAMENTO FIELD' : hasNocTx ? 'NOC TX' : 'NOC ACESSO';
  const addresses = /Endere[cç]os?\s*:/i.test(message) ? message.split(/Endere[cç]os?\s*:/i)[1]?.split(/COPE\s+REDE:/i)[0]?.trim() || '' : '';
  const slotPon = (() => {
    const combined = message.match(/SLOT\s*\/\s*PON\s*[:=-]\s*([^\n\r]+)/i);
    if (combined) return combined[1].replace(/[*]/g, '').trim();
    const slot = message.match(/SLOT\s*[:=-]?\s*([^|\n]+).*?PON\s*[:=-]?\s*([^\n]+)/i);
    if (slot) return `${slot[1].replace(/[*]/g, '').trim()} / ${slot[2].replace(/[*]/g, '').trim()}`;
    return valueFor(message, [/SLOT\s*(?:\/|[-:])?\s*PON\s*[:=-]\s*([^\n\r]+)/i, /SLOT\s*\/\s*PON\s*[:=-]\s*([^\n\r]+)/i, /PLACA\s*\/\s*PON\s*[:=-]\s*([^\n\r]+)/i, /PLACA\s*[:=-]\s*([^\n\r]+)/i]);
  })();

  return {
    orderNumber,
    officeTrack,
    bdesk: valueFor(message, [/BDESK\s*[:=-]\s*([^\n\r]+)/i, /TICKET\s*[:=-]\s*([^\n\r]+)/i]),
    type,
    reason: valueFor(message, [/MOTIVO\s*[:=-]\s*([^\n\r]+)/i, /TIPO\s+DE\s+FALHA\s*[:=-]\s*([^\n\r]+)/i, /TIPO\s*[:=-]\s*([^\n\r]+)/i]),
    eventAt: valueFor(message, [/DATA\s*(?:\/|[-])?\s*HORA\s+DO\s+EVENTO\s*[:=-]\s*([^\n\r]+)/i, /DATA\s*(?:\/|[-])?\s*HORA\s*[:=-]\s*([^\n\r]+)/i, /DATA\s+HORA\s+DO\s+EVENTO\s*[:=-]\s*([^\n\r]+)/i]),
    olt: valueFor(message, [/OLT\s*[:=-]\s*([^\n\r]+)/i]),
    slotPon,
    affectedCount: valueFor(message, [/AFETADOS\s*[:=-]\s*([^\n\r]+)/i, /AFETA[ÇC]Ã?O\s*[:=-]\s*([^\n\r]+)/i]),
    contract: valueFor(message, [/CONTRATO(?:S)?\s+EXEMPLO(?:S)?\s*[:=-]\s*([^\n\r]+)/i, /CONTRATO\s*[:=-]\s*([^\n\r]+)/i]),
    technician: valueFor(message, [/TÉCNICO\s+REDE\s*[:=-]\s*([^\n\r]+)/i, /TECNICO\s+REDE\s*[:=-]\s*([^\n\r]+)/i, /TÉCNICO\s*[:=-]\s*([^\n\r]+)/i, /TECNICO\s*[:=-]\s*([^\n\r]+)/i]),
    cope: valueFor(message, [/COPE\s+REDE\s*[:=-]\s*([^\n\r]+)/i]),
    client: valueFor(message, [/CLIENTE\s*[:=-]\s*([^\n\r]+)/i]),
    region: valueFor(message, [/REGIÃ?O\s*[:=-]\s*([^\n\r]+)/i, /REGIAO\s*[:=-]\s*([^\n\r]+)/i]),
    city: valueFor(message, [/CIDADE\s*[:=-]\s*([^\n\r]+)/i]),
    phone: valueFor(message, [/TELEFONE\s*[:=-]\s*([^\n\r]+)/i]),
    customerOrder: valueFor(message, [/O\.S\.\s*CASA\s+CLIENTE\s*[:=-]\s*([^\n\r]+)/i, /O\.S\.?\s*[:=-]\s*([^\n\r]+)/i]),
    ticket: valueFor(message, [/TICKET\s*[:=-]\s*([^\n\r]+)/i]),
    serialNumber: valueFor(message, [/S\/N\s*[:=-]\s*([^\n\r]+)/i]),
    ctoId: valueFor(message, [/ID\s*\/\s*CTO\s*[:=-]\s*([^\n\r]+)/i, /ID\/CTO\s*[:=-]\s*([^\n\r]+)/i]),
    ctoLocation: valueFor(message, [/LOC\s+CTO\s*[:=-]\s*([^\n\r]+)/i]),
    title: valueFor(message, [/TITULO\s*[:=-]\s*([^\n\r]+)/i, /TÍTULO\s*[:=-]\s*([^\n\r]+)/i]),
    openedAt: valueFor(message, [/ABERTO\s+EM\s*[:=-]\s*([^\n\r]+)/i]),
    observations: valueFor(message, [/OBSERVA[ÇC]Õ?ES\s*[:=-]\s*([^\n\r]+)/i]),
    outageStart: valueFor(message, [/INÍ?CIO\s+DA\s+QUEDA\s*[:=-]\s*([^\n\r]+)/i, /INICIO\s+DA\s+QUEDA\s*[:=-]\s*([^\n\r]+)/i]),
    addresses,
  };
}
