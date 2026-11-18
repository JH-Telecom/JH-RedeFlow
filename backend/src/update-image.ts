import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import { slaLimits } from './sla.js';
import type { Call } from './types.js';

// Imagem "Chamados em atendimento" gerada no servidor (18/11/2026), igual a que a tela Em atendimento copia
// (frontend/src/lib/report-image.ts), para mandar sozinha no WhatsApp em horarios fixos. Monta um SVG com a fonte
// DM Sans (a mesma do sistema, pacote @expo-google-fonts/dm-sans) e converte em PNG com o resvg.

export type ImageTone = 'blue' | 'cyan' | 'amber' | 'green' | 'red' | 'gray' | 'muted';
export type ImageCell = { text: string; sub?: string; tone?: ImageTone; strong?: boolean };
export type ImageSpec = { kicker?: string; title: string; subtitle?: string; badge?: string; columns: Array<{ label: string; width: number }>; rows: ImageCell[][]; empty?: string; footer: string };

const TONES: Record<ImageTone, { bg: string; fg: string }> = {
  blue: { bg: '#e8f0ff', fg: '#1d4fd7' }, cyan: { bg: '#e2f6f8', fg: '#0b7285' }, amber: { bg: '#fff3d6', fg: '#a35a00' },
  green: { bg: '#e3f6ec', fg: '#137a4b' }, red: { bg: '#fde4e5', fg: '#b4232c' }, gray: { bg: '#eef1f5', fg: '#4b5a6e' }, muted: { bg: '#f3f5f8', fg: '#5f6c80' },
};
const FONT = 'DM Sans';
const require = createRequire(import.meta.url);
const fontFiles = ['400Regular/DMSans_400Regular.ttf', '500Medium/DMSans_500Medium.ttf', '600SemiBold/DMSans_600SemiBold.ttf', '700Bold/DMSans_700Bold.ttf', '800ExtraBold/DMSans_800ExtraBold.ttf']
  .map((file) => require.resolve(`@expo-google-fonts/dm-sans/${file}`));

const escapeXml = (value: string) => value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[char]!));
// Largura aproximada do texto em DM Sans (media por caractere; maiusculas e digitos um pouco mais largos).
export function textWidth(text: string, size: number, weight = 600) {
  let units = 0;
  for (const char of text) units += /[A-Z0-9]/.test(char) ? 0.64 : /[ilj.,:;|!']/.test(char) ? 0.28 : char === ' ' ? 0.27 : /[mwMW]/.test(char) ? 0.82 : 0.53;
  return units * size * (weight >= 700 ? 1.04 : 1);
}
// Quebra em linhas que cabem na largura; passou de maxLines, corta com reticencias.
export function wrapText(text: string, maxWidth: number, size: number, weight: number, maxLines: number) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, weight) <= maxWidth || !line) { line = candidate; continue; }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  // Palavra sozinha maior que a coluna (ex.: hostname de OLT): quebra no meio.
  const split = lines.flatMap((item) => {
    if (textWidth(item, size, weight) <= maxWidth) return [item];
    const parts: string[] = [];
    let current = '';
    for (const char of item) { if (textWidth(current + char, size, weight) > maxWidth && current) { parts.push(current); current = char; } else current += char; }
    if (current) parts.push(current);
    return parts;
  });
  if (split.length <= maxLines) return split;
  const kept = split.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && textWidth(`${last}…`, size, weight) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

export function renderImageSvg(input: ImageSpec) {
  const columns = input.columns.map((column) => ({ ...column, width: Math.round(column.width * 1.2) }));
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const outer = 24, width = tableWidth + outer * 2;
  const parts: string[] = [];
  let y = outer + 26;
  // Cabecalho
  const head: string[] = [];
  if (input.kicker) { head.push(`<text x="${outer + 28}" y="${y + 15}" font-size="15" font-weight="800" fill="#2563eb" letter-spacing="1.8">${escapeXml(input.kicker.toUpperCase())}</text>`); y += 21; }
  head.push(`<text x="${outer + 28}" y="${y + 36}" font-size="36" font-weight="800" fill="#13223a">${escapeXml(input.title)}</text>`);
  y += 43;
  if (input.subtitle) { head.push(`<text x="${outer + 28}" y="${y + 26}" font-size="18" font-weight="500" fill="#5b6b80">${escapeXml(input.subtitle)}</text>`); y += 30; }
  if (input.badge) {
    const badgeWidth = textWidth(input.badge, 18, 700) + 28;
    head.push(`<rect x="${outer + tableWidth - 28 - badgeWidth}" y="${outer + 26}" width="${badgeWidth}" height="40" rx="10" fill="#f2f7fe" stroke="#d6e3f7"/><text x="${outer + tableWidth - 28 - badgeWidth / 2}" y="${outer + 52}" font-size="18" font-weight="700" fill="#1d4fd7" text-anchor="middle">${escapeXml(input.badge)}</text>`);
  }
  y += 20;
  parts.push(...head);
  // Linha de titulos das colunas
  const headY = y;
  parts.push(`<rect x="${outer}" y="${headY}" width="${tableWidth}" height="48" fill="#f5f8fc"/><line x1="${outer}" x2="${outer + tableWidth}" y1="${headY}" y2="${headY}" stroke="#e6ecf3"/><line x1="${outer}" x2="${outer + tableWidth}" y1="${headY + 48}" y2="${headY + 48}" stroke="#e6ecf3"/>`);
  let x = outer;
  columns.forEach((column, index) => {
    const pad = index === 0 ? 28 : 14;
    parts.push(`<text x="${x + pad}" y="${headY + 30}" font-size="17" font-weight="700" fill="#4b5a6e">${escapeXml(column.label)}</text>`);
    x += column.width;
  });
  y = headY + 48;
  // Linhas
  const rowsSvg: string[] = [];
  input.rows.forEach((row, rowIndex) => {
    const cells = columns.map((column, index) => {
      const cell = row[index] ?? { text: '–' };
      const pad = index === 0 ? 28 : 14;
      const inner = column.width - pad - 14;
      const main = cell.tone ? [cell.text] : wrapText(cell.text || '–', inner, 21, cell.strong ? 700 : 600, 3);
      const sub = cell.sub ? wrapText(cell.sub, inner, 17, 500, 2) : [];
      const height = (cell.tone ? 36 : main.length * 28) + (sub.length ? 3 + sub.length * 23 : 0);
      return { cell, pad, main, sub, height };
    });
    const rowHeight = Math.max(...cells.map((item) => item.height)) + 28;
    rowsSvg.push(`<rect x="${outer}" y="${y}" width="${tableWidth}" height="${rowHeight}" fill="${rowIndex % 2 ? '#f9fbfd' : '#ffffff'}"/><line x1="${outer}" x2="${outer + tableWidth}" y1="${y + rowHeight}" y2="${y + rowHeight}" stroke="#edf1f6"/>`);
    let cellX = outer;
    cells.forEach((item, index) => {
      let textY = y + (rowHeight - item.height) / 2;
      const left = cellX + item.pad;
      if (item.cell.tone) {
        const tone = TONES[item.cell.tone];
        const chipWidth = Math.max(38, textWidth(item.cell.text, 19, 700) + 20);
        rowsSvg.push(`<rect x="${left}" y="${textY}" width="${chipWidth}" height="34" rx="7" fill="${tone.bg}"/><text x="${left + chipWidth / 2}" y="${textY + 23}" font-size="19" font-weight="700" fill="${tone.fg}" text-anchor="middle">${escapeXml(item.cell.text)}</text>`);
        textY += 36;
      } else {
        item.main.forEach((line) => { rowsSvg.push(`<text x="${left}" y="${textY + 21}" font-size="21" font-weight="${item.cell.strong ? 700 : 600}" fill="${item.cell.strong ? '#13223a' : '#22324a'}">${escapeXml(line)}</text>`); textY += 28; });
      }
      if (item.sub.length) { textY += 3; item.sub.forEach((line) => { rowsSvg.push(`<text x="${left}" y="${textY + 17}" font-size="17" font-weight="500" fill="#5f6c80">${escapeXml(line)}</text>`); textY += 23; }); }
      cellX += columns[index].width;
    });
    y += rowHeight;
  });
  if (!input.rows.length) {
    rowsSvg.push(`<text x="${outer + tableWidth / 2}" y="${y + 56}" font-size="20" font-weight="500" fill="#5f6c80" text-anchor="middle">${escapeXml(input.empty ?? 'Nada para mostrar.')}</text>`);
    y += 92;
  }
  parts.push(...rowsSvg);
  parts.push(`<text x="${outer + tableWidth - 28}" y="${y + 32}" font-size="14" font-weight="600" fill="#7a879a" text-anchor="end">${escapeXml(input.footer)}</text>`);
  const cardHeight = y + 50 - outer;
  const height = cardHeight + outer * 2;
  return {
    width, height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">`
      + `<rect width="${width}" height="${height}" fill="#eef2f7"/>`
      + `<clipPath id="card"><rect x="${outer}" y="${outer}" width="${tableWidth}" height="${cardHeight}" rx="16"/></clipPath>`
      + `<rect x="${outer}" y="${outer}" width="${tableWidth}" height="${cardHeight}" rx="16" fill="#ffffff"/>`
      + `<g clip-path="url(#card)">${parts.join('')}</g>`
      + `<rect x="${outer + 0.5}" y="${outer + 0.5}" width="${tableWidth - 1}" height="${cardHeight - 1}" rx="16" fill="none" stroke="#dbe3ee"/>`
      + '</svg>',
  };
}

export function renderImagePng(spec: ImageSpec, scale = 2): Buffer {
  const { svg, width } = renderImageSvg(spec);
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(width * scale) }, font: { fontFiles, loadSystemFonts: false, defaultFontFamily: FONT } });
  return resvg.render().asPng();
}

// ---------- Chamados em atendimento ----------
const ATTENDANCE: Call['status'][] = ['Aberto', 'Atribuido', 'Atrelado', 'Deslocamento', 'Em campo'];
const dateTime = (value: string | number | Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const shortDateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
function duration(minutes: number) {
  if (minutes < 60) return `${minutes}min`;
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), rest = minutes % 60;
  return days ? `${days}d ${hours}h` : `${hours}h ${String(rest).padStart(2, '0')}min`;
}
const statusTone = (status: string): ImageTone => (status === 'Aberto' ? 'amber' : status === 'GIGA+' ? 'cyan' : 'blue');

// Mesmas regras da tela Em atendimento (aba Todos): ativos com tecnico, mais antigos primeiro.
export function attendanceCalls(calls: Call[]) {
  return calls.filter((call) => ATTENDANCE.includes(call.status) && call.technicianId).sort((a, b) => a.openedAt.localeCompare(b.openedAt));
}

export function attendanceImageSpec(calls: Call[], lastNotes: Record<string, { text: string }>, now = Date.now()): ImageSpec {
  const clip = (text: string, max = 180) => { const flat = text.replace(/\s+/g, ' ').trim(); return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat; };
  const rows = calls.map((call): ImageCell[] => {
    const minutes = Math.max(0, Math.round((now - Date.parse(call.openedAt)) / 60_000));
    const limits = slaLimits(call.type);
    const state = minutes > limits.outlierHours * 60 ? 'Outlier' : minutes > limits.onTimeHours * 60 ? 'Fora do prazo' : 'No prazo';
    const tone: ImageTone = state === 'Outlier' ? 'red' : state === 'Fora do prazo' ? 'amber' : 'green';
    const note = lastNotes[call.id]?.text || call.notes;
    return [
      { text: call.orderNumber, strong: true, sub: call.bdesk && call.bdesk !== call.orderNumber ? `BDESK ${call.bdesk}` : undefined },
      { text: call.technicianName || 'Sem técnico', sub: call.supportTechnicianName ? `Apoio: ${call.supportTechnicianName}` : call.supervisorName || undefined },
      { text: duration(minutes), tone, sub: `${state} · desde ${shortDateTime(call.openedAt)}` },
      { text: call.type, sub: call.reason || undefined },
      { text: call.bairro || call.city || call.region || 'Sem bairro', sub: [call.bairro || call.city ? call.region : '', call.olt].filter(Boolean).join(' · ') || undefined },
      { text: call.status, tone: statusTone(call.status), sub: call.ofsStatus ? `OFS: ${call.ofsStatus}` : undefined },
      { text: note ? clip(note) : '–' },
    ];
  });
  const stamp = dateTime(now);
  return {
    kicker: 'JH Telecom · Rede',
    title: 'Chamados em atendimento',
    subtitle: stamp,
    badge: `${calls.length} ${calls.length === 1 ? 'chamado' : 'chamados'}`,
    columns: [{ label: 'Ordem', width: 210 }, { label: 'Técnico', width: 220 }, { label: 'Na fila', width: 180 }, { label: 'Evento', width: 200 }, { label: 'Local', width: 270 }, { label: 'Status', width: 170 }, { label: 'Observação', width: 340 }],
    rows,
    empty: 'Nenhum chamado em atendimento agora.',
    footer: `JH Telecom · RedeFlow · gerado em ${stamp}`,
  };
}

// Horarios fixos de envio (Sao Paulo), ex.: "09:00,13:00,17:00". Vazio = desligado.
export function parseSendTimes(value: string | undefined) {
  return [...new Set(String(value ?? '').split(/[,;\s]+/).map((item) => item.trim()).filter((item) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(item)).map((item) => item.padStart(5, '0')))].sort();
}

// Horario ja passou hoje e ainda nao foi enviado (o job roda a cada poucos minutos; tolera 20 min de atraso).
export function dueSendTime(times: string[], nowClock: string, sentToday: string[]) {
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const now = toMinutes(nowClock);
  return times.find((time) => !sentToday.includes(time) && now >= toMinutes(time) && now - toMinutes(time) <= 20) ?? null;
}
