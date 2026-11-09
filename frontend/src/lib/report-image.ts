// Gerador unico de imagem de tabela/relatorio para mandar no WhatsApp.
// Monta a imagem a partir dos DADOS (nao do HTML da tela): largura de leitura, letra grande, etiquetas legiveis,
// um titulo so, e renderiza em 3x. Depois copia para a area de transferencia, baixa o PNG e avisa o app
// (evento "jh-redeflow:image-ready", mostrado pelo ImageReadyToast com Copiar/Compartilhar).

export type ReportTone = "blue" | "cyan" | "amber" | "green" | "red" | "gray" | "muted";
export type ReportAlign = "left" | "center" | "right";
export type ReportCell = { text: string; sub?: string; tone?: ReportTone; strong?: boolean };
export type ReportColumn = { label: string; width: number; align?: ReportAlign };
export type ReportSpec = {
  kicker?: string;
  title: string;
  subtitle?: string;
  badge?: string;
  columns: ReportColumn[];
  rows: ReportCell[][];
  totalRow?: ReportCell[];
  empty?: string;
};
// parts: todas as imagens geradas (lista com mais de 20 linhas vira varias imagens); blob/fileName = a primeira.
export type ImageReadyDetail = { blob: Blob; fileName: string; copied: boolean; parts: { blob: Blob; fileName: string }[] };

const TONES: Record<ReportTone, string> = {
  blue: "background:#e8f0ff;color:#1d4fd7",
  cyan: "background:#e2f6f8;color:#0b7285",
  amber: "background:#fff3d6;color:#a35a00",
  green: "background:#e3f6ec;color:#137a4b",
  red: "background:#fde4e5;color:#b4232c",
  gray: "background:#eef1f5;color:#4b5a6e",
  muted: "background:#f3f5f8;color:#5f6c80",
};
const MAX_PIXELS = 80_000_000;
const FONT = "'DM Sans','Segoe UI',Arial,sans-serif";
const TITLE_FONT = "'Manrope','DM Sans','Segoe UI',Arial,sans-serif";

function element<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string) {
  const node = document.createElement(tag);
  node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cellContent(cell: ReportCell, align: ReportAlign, total: boolean) {
  const wrapper = element("div", `display:flex;flex-direction:column;gap:3px;align-items:${align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start"}`);
  if (cell.tone) {
    wrapper.appendChild(element("span", `display:inline-block;min-width:38px;padding:5px 10px;border-radius:7px;box-sizing:border-box;text-align:center;font-size:16px;font-weight:700;line-height:1.25;${TONES[cell.tone]}${total ? ";box-shadow:inset 0 0 0 1px rgba(23,35,59,.08);background-color:#fff" : ""}`, cell.text));
  } else {
    wrapper.appendChild(element("span", `color:${cell.strong || total ? "#13223a" : "#22324a"};font-size:17px;font-weight:${cell.strong || total ? 700 : 600};line-height:1.35;overflow-wrap:anywhere`, cell.text || "–"));
  }
  if (cell.sub) wrapper.appendChild(element("span", "color:#6b7a90;font-size:14px;font-weight:500;line-height:1.35;overflow-wrap:anywhere", cell.sub));
  return wrapper;
}

function buildReport(spec: ReportSpec) {
  const tableWidth = spec.columns.reduce((sum, column) => sum + column.width, 0);
  const width = tableWidth + 2 * 24;
  const host = element("div", `position:fixed;left:-100000px;top:0;width:${width}px;box-sizing:border-box;padding:24px;background:#eef2f7;font-family:${FONT};color:#13223a`);
  const card = element("div", "overflow:hidden;border:1px solid #dbe3ee;border-radius:16px;background:#fff");

  const header = element("div", "display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:26px 28px 20px");
  const titles = element("div", "min-width:0");
  if (spec.kicker) titles.appendChild(element("div", "margin-bottom:6px;color:#2563eb;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase", spec.kicker));
  titles.appendChild(element("div", `color:#13223a;font-family:${TITLE_FONT};font-size:30px;font-weight:800;line-height:1.2;letter-spacing:-.3px`, spec.title));
  if (spec.subtitle) titles.appendChild(element("div", "margin-top:8px;color:#5b6b80;font-size:15px;font-weight:500", spec.subtitle));
  header.appendChild(titles);
  if (spec.badge) header.appendChild(element("div", "flex:none;padding:9px 14px;border:1px solid #d6e3f7;border-radius:10px;background:#f2f7fe;color:#1d4fd7;font-size:15px;font-weight:700;white-space:nowrap", spec.badge));

  const table = element("table", `width:${tableWidth}px;table-layout:fixed;border-collapse:collapse`);
  const colgroup = document.createElement("colgroup");
  spec.columns.forEach((column) => { const col = document.createElement("col"); col.style.width = `${column.width}px`; colgroup.appendChild(col); });
  table.appendChild(colgroup);
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  spec.columns.forEach((column, index) => {
    const th = element("th", `padding:14px ${index === 0 ? 28 : 14}px 14px ${index === 0 ? 28 : 14}px;border-top:1px solid #e6ecf3;border-bottom:1px solid #e6ecf3;background:#f5f8fc;color:#4b5a6e;font-size:14px;font-weight:700;text-align:${column.align ?? "left"};white-space:nowrap`, column.label);
    headRow.appendChild(th);
  });
  head.appendChild(headRow);
  table.appendChild(head);

  const body = document.createElement("tbody");
  const addRow = (cells: ReportCell[], index: number, total = false) => {
    const tr = element("tr", total ? "background:#eaf1fb" : index % 2 ? "background:#f9fbfd" : "background:#fff");
    spec.columns.forEach((column, columnIndex) => {
      const td = element("td", `padding:14px ${columnIndex === 0 ? 28 : 14}px;border-${total ? "top:2px solid #c9d6e8" : "bottom:1px solid #edf1f6"};vertical-align:middle;text-align:${column.align ?? "left"}`);
      td.appendChild(cellContent(cells[columnIndex] ?? { text: "–" }, column.align ?? "left", total));
      tr.appendChild(td);
    });
    body.appendChild(tr);
  };
  spec.rows.forEach((row, index) => addRow(row, index));
  if (!spec.rows.length) {
    const tr = document.createElement("tr");
    const td = element("td", "padding:36px;color:#6b7a90;font-size:17px;text-align:center", spec.empty ?? "Nada para mostrar com os filtros atuais.");
    td.colSpan = spec.columns.length;
    tr.appendChild(td);
    body.appendChild(tr);
  }
  if (spec.totalRow) addRow(spec.totalRow, 0, true);
  table.appendChild(body);

  card.append(header, table, element("div", "padding:14px 28px;color:#94a1b2;font-size:12px;font-weight:600;text-align:right", `JH Telecom · RedeFlow · gerado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`));
  host.appendChild(card);
  return { host, width };
}

export async function renderReportImage(spec: ReportSpec): Promise<Blob> {
  const { host, width } = buildReport(spec);
  document.body.appendChild(host);
  try {
    await document.fonts.ready;
    const height = host.scrollHeight;
    const scale = Math.min(3, Math.sqrt(MAX_PIXELS / Math.max(1, width * height)));
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(host, { backgroundColor: "#eef2f7", scale, width, height, windowWidth: width, windowHeight: height, logging: false });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Nao foi possivel gerar a imagem.");
    return blob;
  } finally {
    host.remove();
  }
}

export async function copyImage(blob: Blob) {
  if (!navigator.clipboard?.write || !window.ClipboardItem) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
    return true;
  } catch {
    return false;
  }
}

export function downloadImage(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// Imagens com no maximo 20 linhas: lista maior vira varias imagens ("parte 1 de 3"), para caber bem no WhatsApp.
export const MAX_ROWS_PER_IMAGE = 20;

export function splitReportSpec(spec: ReportSpec, maxRows = MAX_ROWS_PER_IMAGE): ReportSpec[] {
  if (spec.rows.length <= maxRows) return [spec];
  const total = Math.ceil(spec.rows.length / maxRows);
  return Array.from({ length: total }, (_, index) => {
    const from = index * maxRows;
    const rows = spec.rows.slice(from, from + maxRows);
    const part = `Parte ${index + 1} de ${total} · linhas ${from + 1}–${from + rows.length} de ${spec.rows.length}`;
    return { ...spec, rows, subtitle: spec.subtitle ? `${part} · ${spec.subtitle}` : part, totalRow: index === total - 1 ? spec.totalRow : undefined };
  });
}

function partFileName(fileName: string, index: number, total: number) {
  if (total === 1) return fileName;
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? `${fileName.slice(0, dot)}-parte-${index + 1}${fileName.slice(dot)}` : `${fileName}-parte-${index + 1}`;
}

// Gera, baixa e avisa o app. Uma imagem so: tambem copia e retorna se a copia funcionou. Varias partes: baixa
// todas (o aviso oferece copiar cada uma, na ordem, para colar no WhatsApp) e retorna false.
export async function shareReportImage(spec: ReportSpec, fileName: string) {
  const specs = splitReportSpec(spec);
  const parts: { blob: Blob; fileName: string }[] = [];
  for (const [index, partSpec] of specs.entries()) parts.push({ blob: await renderReportImage(partSpec), fileName: partFileName(fileName, index, specs.length) });
  const copied = parts.length === 1 ? await copyImage(parts[0].blob) : false;
  for (const [index, part] of parts.entries()) {
    if (index) await new Promise((resolve) => setTimeout(resolve, 350));
    downloadImage(part.blob, part.fileName);
  }
  window.dispatchEvent(new CustomEvent<ImageReadyDetail>("jh-redeflow:image-ready", { detail: { blob: parts[0].blob, fileName: parts[0].fileName, copied, parts } }));
  return copied;
}

export function slugFileName(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
