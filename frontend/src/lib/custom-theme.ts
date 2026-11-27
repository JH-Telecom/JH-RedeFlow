// Temas criados pela equipe (27/11/2026). Um tema e so: nome, cor de destaque, cor da lateral e fundo (colorido ou
// neutro). Daqui saem as variaveis CSS que o arquivo gerado src/themes/custom.css usa (--ct-*), no claro e no escuro.
// A luminosidade das cores do sistema nao muda (so o matiz e a intensidade): o contraste fica o mesmo do Padrao.
// A lateral e escurecida o quanto for preciso para o texto branco continuar legivel.

export type CustomThemeSpec = { name: string; accent: string; side: string; background: "colorido" | "neutro" };
export const HEX = /^#[0-9a-f]{6}$/i;
export const CUSTOM_VARS_KEY = "jh-redeflow:custom-vars";

type Oklch = [number, number, number];
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = [1, 3, 5].map((index) => toLinear(parseInt(hex.slice(index, index + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

function oklchToRgb([L, C, h]: Oklch) {
  const A = C * Math.cos((h * Math.PI) / 180), B = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
// Fora da faixa de cores da tela: reduz a intensidade ate caber (mantem luminosidade e matiz).
export function oklchToHex([L, C, h]: Oklch) {
  let chroma = C;
  let rgb = oklchToRgb([L, chroma, h]);
  while (chroma > 0 && rgb.some((c) => c < -0.0005 || c > 1.0005)) { chroma -= 0.005; rgb = oklchToRgb([L, Math.max(0, chroma), h]); }
  return `#${rgb.map((c) => Math.round(clamp(fromLinear(clamp(c))) * 255).toString(16).padStart(2, "0")).join("")}`;
}

const BASE_BLUE_CHROMA = 0.2133; // intensidade do azul da marca (#1264e8)
export type CustomThemeVars = Record<string, string>;

export function customThemeVars(spec: CustomThemeSpec): CustomThemeVars {
  const [, accentC, accentH] = hexToOklch(spec.accent);
  const gray = accentC < 0.025;
  const chroma = gray ? 0.08 : clamp(accentC / BASE_BLUE_CHROMA, 0.12, 1.3);
  const neutral = gray ? 0.25 : chroma < 0.4 ? 0.6 : 1.2;
  const [sideL, sideC, sideH] = hexToOklch(spec.side);
  const sideLight = clamp(sideL, 0.16, 0.4);
  const sideDark = clamp(Math.min(sideLight * 0.62, 0.24), 0.12, 0.24);
  const muted = (L: number) => oklchToHex([L, Math.min(sideC, 0.06), sideH]);
  const tint = gray ? 0 : 1;
  const colorful = spec.background === "colorido";
  return {
    "--ct-hue": accentH.toFixed(1),
    "--ct-chroma": chroma.toFixed(3),
    "--ct-neutral": neutral.toFixed(3),
    "--ct-side": oklchToHex([sideLight, sideC, sideH]),
    "--ct-side-2": oklchToHex([Math.max(0.1, sideLight - 0.05), sideC, sideH]),
    "--ct-side-muted": muted(0.86),
    "--ct-side-d": oklchToHex([sideDark, Math.min(sideC, 0.1), sideH]),
    "--ct-side-2-d": oklchToHex([Math.max(0.09, sideDark - 0.03), Math.min(sideC, 0.1), sideH]),
    "--ct-side-muted-d": muted(0.8),
    "--ct-page": colorful ? `linear-gradient(160deg, ${oklchToHex([0.985, 0.012 * tint, accentH])} 0%, ${oklchToHex([0.955, 0.028 * tint, accentH])} 60%, ${oklchToHex([0.93, 0.04 * tint, accentH])} 100%)` : "#f7f9fc",
    "--ct-base": colorful ? oklchToHex([0.955, 0.028 * tint, accentH]) : "#f7f9fc",
    "--ct-page-d": colorful ? `linear-gradient(160deg, ${oklchToHex([0.17, 0.02 * tint, accentH])} 0%, ${oklchToHex([0.2, 0.035 * tint, accentH])} 60%, ${oklchToHex([0.25, 0.06 * tint, accentH])} 100%)` : "#12151b",
    "--ct-base-d": colorful ? oklchToHex([0.2, 0.035 * tint, accentH]) : "#12151b",
    "--ct-top-d": `${colorful ? oklchToHex([0.18, 0.025 * tint, accentH]) : "#12151b"}cc`,
  };
}

export const customVarsText = (vars: CustomThemeVars) => Object.entries(vars).map(([name, value]) => `${name}:${value}`).join(";");

// Miniatura do seletor de temas (mesmo formato dos temas prontos).
export function customPreview(spec: CustomThemeSpec) {
  const vars = customThemeVars(spec);
  const [accentL, accentC, accentH] = hexToOklch(spec.accent);
  const accent = (L: number) => oklchToHex([L, Math.min(accentC, 0.32), accentH]);
  return {
    swatch: `linear-gradient(135deg, ${vars["--ct-side"]}, ${accent(clamp(accentL, 0.45, 0.65))})`,
    light: { side: vars["--ct-side"], page: vars["--ct-page"], accent: accent(0.54) },
    dark: { side: vars["--ct-side-d"], page: vars["--ct-page-d"], accent: accent(0.52) },
  };
}

let loaded: Promise<unknown> | null = null;
export function loadCustomThemeCss() { loaded ??= import("../themes/custom.css").catch(() => { loaded = null; }); return loaded; }

export function applyCustomVars(spec: CustomThemeSpec | null) {
  const root = document.documentElement;
  for (const name of [...root.style].filter((item) => item.startsWith("--ct-"))) root.style.removeProperty(name);
  if (!spec) { try { localStorage.removeItem(CUSTOM_VARS_KEY); } catch { /* sem armazenamento */ } return; }
  const vars = customThemeVars(spec);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  void loadCustomThemeCss();
  try { localStorage.setItem(CUSTOM_VARS_KEY, customVarsText(vars)); } catch { /* sem armazenamento */ }
}
