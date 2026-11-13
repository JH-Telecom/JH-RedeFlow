// Leitor de KMZ/KML da rede de fibra. Puro (sem DOM): roda no navegador e no Node.
// Placemarks e estilos sao lidos por expressao regular, assim prefixos de
// namespace nao declarados (ex.: gx:) nao quebram a leitura.

export type NetKind = 'pop' | 'cto' | 'ceo' | 'outro';
export type NetElement = {
  kind: NetKind;
  code: string | null;
  name: string;
  projectCode: string | null;
  pop: string | null;
  fh: string | null;
  lat: number;
  lng: number;
};
export type NetCable = { name: string; color: string | null; points: [number, number][] };
export type ParsedKml = { elements: NetElement[]; cables: NetCable[] };

const ZERO_WIDTH = /[​‌‍⁠﻿]/g;

function cleanName(name: string): string {
  return name.replace(ZERO_WIDTH, '').trim();
}

export function classifyName(name: string): NetKind {
  const n = cleanName(name);
  if (/^M?CT(OI?|I)(?![A-Za-z])/i.test(n)) return 'cto';
  if (/CEO/i.test(n) || /^CES(?![A-Za-z])/i.test(n)) return 'ceo';
  if (/^POP(?![A-Za-z])/i.test(n)) return 'pop';
  return 'outro';
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

// Remove CDATA, tags HTML e entidades de um trecho de texto do KML. Descricoes vem com HTML codificado
// (as vezes duas vezes): decodifica e tira as tags a cada passo, e as tags sao tiradas DEPOIS da ultima
// decodificacao, para "&amp;lt;img onerror=...&amp;gt;" nunca virar marcacao de verdade.
const stripTags = (s: string) => s.replace(/<[^>]*>/g, ' ');
function plainText(raw: string): string {
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return stripTags(decodeEntities(stripTags(decodeEntities(unwrapped))));
}

export function projectCodeFrom(name: string, description: string): string | null {
  const desc = plainText(description || '');
  const m = /CMDISPLAYTEXT\s*:\s*(\S+)/i.exec(desc);
  if (m && !/^CM[A-Z]+$/.test(m[1])) return m[1];
  const fromName = /(?:^|[\s​])([A-Za-z0-9]+-FH\d+-\S+)/.exec((name || '').replace(/​/g, ' '));
  return fromName ? fromName[1] : null;
}

export function splitProjectCode(code: string | null): { pop: string | null; fh: string | null } {
  if (!code) return { pop: null, fh: null };
  const parts = code.split('-');
  const fh = parts.find((p) => /^FH\d+$/i.test(p)) ?? null;
  return { pop: parts[0] || null, fh };
}

// Douglas-Peucker em metros (projecao equiretangular local).
export function simplifyLine(points: [number, number][], toleranceMeters = 2): [number, number][] {
  if (points.length <= 2) return points.slice();
  const lat0 = (points[0][1] * Math.PI) / 180;
  const mLat = 111320;
  const mLng = 111320 * Math.cos(lat0);
  const xy = points.map(([lng, lat]) => [lng * mLng, lat * mLat]);
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a];
    const [bx, by] = xy[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      let d: number;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > toleranceMeters) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// O servidor aceita no maximo 5000 pontos por cabo: o que passar disso (ja simplificado) vira pedacos.
// Pedacos vizinhos repetem o ponto da emenda, para o desenho nao ter buraco.
export const MAX_CABLE_POINTS = 5000;
export function splitLine(points: [number, number][], max = MAX_CABLE_POINTS): [number, number][][] {
  if (points.length <= max) return [points];
  const out: [number, number][][] = [];
  for (let start = 0; start < points.length - 1; start += max - 1) out.push(points.slice(start, start + max));
  return out;
}

// So o primeiro token com digito e que nao seja so a palavra do tipo vira codigo ("CTO 12" nao tem codigo).
const TYPE_WORD = /^(M?CTOI?|CTI|CEO|CES|POP)$/i;
function codeFrom(token: string): string | null {
  return /\d/.test(token) &&!TYPE_WORD.test(token) ? token : null;
}

// KML usa aabbggrr; devolve #rrggbb.
function kmlColorToCss(c: string): string | null {
  const m = /^\s*([0-9a-f]{8})\s*$/i.exec(c);
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `#${h.slice(6, 8)}${h.slice(4, 6)}${h.slice(2, 4)}`;
}

function parseCoords(text: string): [number, number][] {
  const out: [number, number][] = [];
  for (const tok of text.trim().split(/\s+/)) {
    if (!tok) continue;
    const [lng, lat] = tok.split(',').map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) out.push([lng, lat]);
  }
  return out;
}

function tagText(block: string, tag: string): string {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  return m ? m[1] : '';
}

function lineColorOf(styleBody: string): string | null {
  const ls = /<LineStyle\b[^>]*>([\s\S]*?)<\/LineStyle>/i.exec(styleBody);
  if (!ls) return null;
  return kmlColorToCss(tagText(ls[1], 'color'));
}

function readStyles(text: string): Map<string, string | null> {
  const styles = new Map<string, string | null>();
  for (const m of text.matchAll(/<Style\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/Style>/gi)) {
    styles.set(m[1], lineColorOf(m[2]));
  }
  for (const m of text.matchAll(/<StyleMap\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/StyleMap>/gi)) {
    for (const pair of m[2].matchAll(/<Pair\b[^>]*>([\s\S]*?)<\/Pair>/gi)) {
      if (tagText(pair[1], 'key').trim() !== 'normal') continue;
      const ref = tagText(pair[1], 'styleUrl').trim().replace(/^#/, '');
      if (styles.has(ref)) styles.set(m[1], styles.get(ref) ?? null);
    }
  }
  return styles;
}

export function parseKml(text: string): ParsedKml {
  const src = text.replace(/^﻿/, '');
  const styles = readStyles(src);
  const elements: NetElement[] = [];
  const cables: NetCable[] = [];

  for (const pm of src.matchAll(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi)) {
    const body = pm[1];
    const rawName = plainText(tagText(body, 'name')).trim(); // sem decodificar de novo: plainText ja tirou as tags
    const name = rawName.replace(ZERO_WIDTH, '').trim();
    const description = tagText(body, 'description');

    const points: [number, number][] = [];
    for (const p of body.matchAll(/<Point\b[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/gi)) {
      const c = parseCoords(p[1])[0];
      if (c) points.push(c);
    }
    const lines: [number, number][][] = [];
    for (const l of body.matchAll(/<LineString\b[^>]*>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/gi)) {
      const c = parseCoords(l[1]);
      if (c.length >= 2) lines.push(c);
    }

    if (points.length) {
      const kind = classifyName(rawName);
      const projectCode = projectCodeFrom(rawName, description);
      const { pop, fh } = splitProjectCode(projectCode);
      const first = rawName.split(/[\s​]+/).find((t) => t.length > 0) ?? '';
      const code = kind === 'cto' || kind === 'ceo' ? codeFrom(first) : null;
      for (const [lng, lat] of points) elements.push({ kind, code, name, projectCode, pop, fh, lat, lng });
    }

    if (lines.length) {
      let color: string | null = null;
      const inline = /<Style\b[^>]*>([\s\S]*?)<\/Style>/i.exec(body);
      if (inline) color = lineColorOf(inline[1]);
      if (!color) {
        const ref = tagText(body, 'styleUrl').trim().replace(/^#/, '');
        if (ref) color = styles.get(ref) ?? null;
      }
      for (const pts of lines) for (const part of splitLine(simplifyLine(pts))) cables.push({ name, color, points: part });
    }
  }
  return { elements, cables };
}

const EMPTY = 'arquivo vazio ou corrompido';

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readFirstKmlFromZip(data: ArrayBuffer): Promise<Uint8Array | { skipped: string }> {
  const bytes = new Uint8Array(data);
  const view = new DataView(data);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { skipped: EMPTY };
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) return { skipped: EMPTY };
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const entryName = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.kml$/i.test(entryName) || /(^|\/)__MACOSX\//i.test(entryName)) continue; // __MACOSX/._x.kml e lixo do Mac
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) return { skipped: EMPTY };
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = bytes.subarray(start, start + compSize);
    if (method === 0) return raw;
    if (method === 8) {
      try {
        return await inflateRaw(raw);
      } catch {
        return { skipped: EMPTY };
      }
    }
    return { skipped: `compressao zip nao suportada (${method})` };
  }
  return { skipped: 'zip sem arquivo .kml' };
}

export async function readNetworkFile(name: string, data: ArrayBuffer): Promise<{ text: string } | { skipped: string }> {
  void name;
  const bytes = new Uint8Array(data);
  if (bytes.length === 0 || !bytes.some((b) => b !== 0)) return { skipped: EMPTY };
  let kml: Uint8Array;
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const r = await readFirstKmlFromZip(data);
    if (!(r instanceof Uint8Array)) return r;
    kml = r;
  } else {
    kml = bytes;
  }
  // TextDecoder descarta o BOM UTF-8 por padrao.
  const text = new TextDecoder('utf-8').decode(kml).replace(/^﻿/, '');
  if (!text.trim()) return { skipped: EMPTY };
  return { text };
}

export function toBatches<T>(items: T[], size = 2000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
