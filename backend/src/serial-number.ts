// SN (numero de serie da ONU) dos chamados. Os testes da Rede sao feitos pelo SN.
// - FIELD: o card ja traz "S/N: 48575443601B38B3".
// - NOC e outros: o card traz contratos; a extensao procura o contrato no AutoISP e devolve o SN.

// "48575443 601B38B3", "hwtc601b38b3" -> "48575443601B38B3" / "HWTC601B38B3". Vazio se nao parece um SN.
export function normalizeSerial(raw: unknown) {
  const text = String(raw ?? '').toUpperCase().replace(/[\s:.-]/g, '');
  if (/^[0-9A-F]{16}$/.test(text)) return text;
  if (/^[A-Z]{4}[0-9A-F]{8}$/.test(text)) return text;
  return '';
}

type AnalysisLike = { sn?: string | null; contrato?: string | null; clientes_afetados?: Array<{ contrato?: string | null }> | null };

// SN ja conhecido do acionamento: o que a extensao achou no AutoISP ou o S/N do card.
export function serialFromActivationData(extracted: Record<string, unknown>) {
  const analysis = (extracted._analysis || {}) as AnalysisLike;
  const fromAutoIsp = normalizeSerial(extracted.autoispSerial);
  if (fromAutoIsp) return { serialNumber: fromAutoIsp, source: 'autoisp' as const, contract: String(extracted.autoispContract || '') || undefined };
  const fromCard = normalizeSerial(extracted.serialNumber) || normalizeSerial(analysis.sn);
  if (fromCard) return { serialNumber: fromCard, source: 'card' as const, contract: undefined };
  return undefined;
}

// Contratos do card para procurar no AutoISP: "5687878 | 4453310", "Contrato: 5687878.3" -> ["5687878", "4453310"].
// O ".3" e o servico do contrato; o AutoISP procura pelo numero do contrato. Ate 8, sem repetir.
export function contractsFromActivationData(extracted: Record<string, unknown>) {
  const analysis = (extracted._analysis || {}) as AnalysisLike;
  const sources = [extracted.contract, analysis.contrato, ...(analysis.clientes_afetados || []).map((item) => item?.contrato)];
  const found: string[] = [];
  for (const source of sources) {
    for (const match of String(source ?? '').matchAll(/(?<![\d.])(\d{5,9})(?:\.\d{1,3})?(?![\d])/g)) {
      if (!found.includes(match[1])) found.push(match[1]);
    }
  }
  return found.slice(0, 8);
}

// Resposta do AutoISP (lista de assinantes do contrato): prefere a linha da mesma OLT do chamado e com SN.
export type AutoIspRow = { serial?: string | null; olt?: string | null; contract?: string | number | null };
export function pickAutoIspSerial(rows: AutoIspRow[], callOlt?: string) {
  const olt = String(callOlt || '').trim().toUpperCase();
  const withSerial = rows.map((row) => ({ ...row, serial: normalizeSerial(row.serial) })).filter((row) => row.serial);
  return (olt && withSerial.find((row) => String(row.olt || '').trim().toUpperCase() === olt)) || withSerial[0];
}
