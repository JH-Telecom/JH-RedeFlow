// Temas do WhatsApp publicados pela equipe (extensao). As cores entram direto no CSS/HTML do WhatsApp de quem baixa,
// entao so passam valores de cor de verdade: #hex, rgb/rgba/hsl/hsla, gradientes e sombras (box-shadow do "brilho").
// Nada de aspas, url(), ponto e virgula, < > ou chaves. Imagem: so data URL JPEG/PNG/WEBP em base64, ate ~600 KB.

const COLOR_KEYS = ['escuro', 'app', 'lista', 'hover', 'sel', 'cab', 'card', 'borda', 'fundo', 'inB', 'outB', 'tx', 'mu', 'ln', 'inp', 'ac', 'ac2', 'brilho'] as const;
const SAFE_CSS = /^[a-z0-9#%.,()\s+-]*$/i;
const ALLOWED_FUNCTIONS = /^(rgba?|hsla?|radial-gradient|linear-gradient|conic-gradient|at|transparent|circle|ellipse|to|left|right|top|bottom|center|closest-side|farthest-corner|px|deg|inset)$/i;
const MAX_IMAGE_CHARS = 800_000;

export function safeCssValue(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text.length > 400 || !SAFE_CSS.test(text) || /url\s*\(|expression|javascript/i.test(text)) return undefined;
  // Toda palavra precisa ser um numero/unidade, hex ou uma funcao/palavra de cor conhecida.
  const words = text.match(/[a-z][a-z-]*/gi) || [];
  return words.every((word) => ALLOWED_FUNCTIONS.test(word) || /^(px|em|rem|deg|turn)$/i.test(word) || /^[a-f]+$/i.test(word)) ? text : undefined;
}

export function safeImage(value: unknown) {
  if (typeof value !== 'string' || value.length > MAX_IMAGE_CHARS) return undefined;
  return /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/]+=*$/i.test(value) ? value : undefined;
}

export type ThemeColors = Record<string, string | boolean>;
export function sanitizeThemeColors(input: unknown): { colors: ThemeColors; image?: string } | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const source = input as Record<string, unknown>;
  const colors: ThemeColors = { escuro: Boolean(source.escuro) };
  for (const key of COLOR_KEYS) {
    if (key === 'escuro') continue;
    const value = safeCssValue(source[key]);
    if (value) colors[key] = value;
  }
  // Minimo para o tema funcionar.
  if (!colors.lista || !colors.fundo || !colors.tx) return undefined;
  const image = safeImage(source.img);
  return { colors, image };
}
