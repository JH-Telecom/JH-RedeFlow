import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "jh-redeflow:theme";

function readSavedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#12151b" : "#1264e8");
}

// Escolha salva vale sempre; sem escolha, segue o sistema operacional (e acompanha se ele mudar).
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => currentTheme());

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const follow = () => {
      if (readSavedTheme()) return;
      const next = systemTheme();
      applyTheme(next);
      setTheme(next);
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Sem armazenamento (aba privada): o tema vale ate recarregar.
    }
  }, []);

  return { theme, toggle };
}

// ---- Temas de cor (Perfil > Tema) ----
// O tema fica no perfil de cada login (servidor) e numa copia local, para abrir ja com a cor certa.
// Cada tema tem versao clara e escura: o claro/escuro continua sendo o botao do topo.
export type PaletteId = "padrao" | "jh-azul" | "ardosia" | "nevoa" | "flor" | "aurora" | "neon";
// preview: lateral, fundo e cor de destaque do cartaozinho do seletor (claro / escuro).
type PalettePreview = { side: string; page: string; accent: string };
export const PALETTES: { id: PaletteId; label: string; swatch: string; light: PalettePreview; dark: PalettePreview }[] = [
  { id: "padrao", label: "Padrão", swatch: "linear-gradient(135deg, #ffffff 0 50%, #1264e8 50% 100%)", light: { side: "#ffffff", page: "#f7f9fc", accent: "#1264e8" }, dark: { side: "#1a1e25", page: "#12151b", accent: "#1a5fd6" } },
  { id: "jh-azul", label: "JH Azul", swatch: "linear-gradient(135deg, #0f2b52, #1264e8)", light: { side: "#0f2b52", page: "linear-gradient(160deg, #f5f9ff, #dbe8fa)", accent: "#1264e8" }, dark: { side: "#0b1730", page: "linear-gradient(160deg, #0e1526, #12244a)", accent: "#1a5fd6" } },
  { id: "ardosia", label: "Ardósia", swatch: "linear-gradient(135deg, #2b333f, #6b7480)", light: { side: "#2b333f", page: "linear-gradient(160deg, #f5f6f8, #e3e7ed)", accent: "#527293" }, dark: { side: "#181c22", page: "linear-gradient(160deg, #131619, #1e232b)", accent: "#4e6b89" } },
  { id: "nevoa", label: "Névoa", swatch: "linear-gradient(135deg, #4a1a5e, #a43ccf)", light: { side: "#4a1a5e", page: "linear-gradient(160deg, #fcf8fe, #eee0f6)", accent: "#9d3ab9" }, dark: { side: "#220c2d", page: "linear-gradient(160deg, #160c1c, #2c1338)", accent: "#923aac" } },
  { id: "flor", label: "Flor", swatch: "linear-gradient(135deg, #6b1d3a, #e0457a)", light: { side: "#6b1d3a", page: "linear-gradient(160deg, #fff8fa, #fde9e4)", accent: "#c12175" }, dark: { side: "#2c0d19", page: "linear-gradient(160deg, #180d11, #31141f)", accent: "#b3266e" } },
  { id: "aurora", label: "Aurora", swatch: "linear-gradient(135deg, #1d1440, #7b5cf0)", light: { side: "#1d1440", page: "linear-gradient(160deg, #f8f7ff, #e6e0fc)", accent: "#734bdf" }, dark: { side: "#110b26", page: "linear-gradient(160deg, #0d0a1a, #29174f)", accent: "#6c49ce" } },
  { id: "neon", label: "Neon", swatch: "linear-gradient(135deg, #2f5be0, #7a2ee0)", light: { side: "linear-gradient(180deg, #101845, #1d0d4a)", page: "linear-gradient(160deg, #f5f8ff, #f1e9ff)", accent: "linear-gradient(135deg, #2f5be0, #7a2ee0)" }, dark: { side: "linear-gradient(180deg, #080c26, #12072c)", page: "linear-gradient(160deg, #080b1a, #1c0c3a)", accent: "linear-gradient(135deg, #2f5be0, #7a2ee0)" } },
];
const PALETTE_KEY = "jh-redeflow:palette";
// So os temas que trocam a cor da marca tem arquivo gerado; carregado sob demanda (fora do pacote inicial).
const paletteCss: Partial<Record<PaletteId, () => Promise<unknown>>> = {
  ardosia: () => import("./themes/ardosia.css"),
  nevoa: () => import("./themes/nevoa.css"),
  flor: () => import("./themes/flor.css"),
  aurora: () => import("./themes/aurora.css"),
  neon: () => import("./themes/neon.css"),
};

export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((palette) => palette.id === value);
}

export function currentPalette(): PaletteId {
  const value = document.documentElement.dataset.palette;
  return isPaletteId(value) ? value : "padrao";
}

export function applyPalette(id: PaletteId) {
  void paletteCss[id]?.().catch(() => undefined);
  if (id === "padrao") delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = id;
  try { window.localStorage.setItem(PALETTE_KEY, id); } catch { /* sem armazenamento */ }
}

// Aplica o tema salvo neste navegador na abertura (o index.html ja marca o data-palette antes do React).
export function restorePalette() {
  let saved: string | null = null;
  try { saved = window.localStorage.getItem(PALETTE_KEY); } catch { /* sem armazenamento */ }
  applyPalette(isPaletteId(saved) ? saved : "padrao");
}
