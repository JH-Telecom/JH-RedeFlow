// Gera src/theme-dark.css a partir dos CSS do app: cada declaracao com cor ganha uma copia sob
// :root[data-theme="dark"], com a cor convertida pelo papel que ela cumpre (fundo, borda, texto ou grafico).
// Os CSS originais nao mudam. Roda no build (npm run build) e manualmente com: npm run theme:dark
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const OUTPUT = 'theme-dark.css';
// :where() nao soma especificidade: cada regra escura pesa o mesmo que a original. Como o arquivo gerado
// replica as declaracoes de cor na mesma ordem e entra depois dos originais, a cascata do escuro e a do claro.
const PREFIX = ':where(:root[data-theme="dark"])';
const ROOT_PREFIX = ':root:where([data-theme="dark"])';
// Ajustes feitos a mao (tokens, superficies especificas) ficam neste arquivo e entram depois do gerado.
const MANUAL = 'theme-dark-manual.css';
const LIGHT_OUTPUT = 'theme-light-contrast.css';

// ---- cor: sRGB <-> OKLCH ----
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function rgbToOklch([r, g, b]) {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}
function oklchToRgb([L, C, h]) {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return rgb.map((c) => clamp(fromLinear(clamp(c))));
}

function parseColor(text) {
  const hex = text.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let value = hex[1];
    if (value.length === 3 || value.length === 4) value = [...value].map((c) => c + c).join('');
    if (value.length !== 6 && value.length !== 8) return null;
    const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
    const alpha = value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1;
    return { rgb: channels, alpha };
  }
  const fn = text.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    return { rgb: parts.slice(0, 3).map((c) => c / 255), alpha: parts[3] ?? 1 };
  }
  if (/^(white|#fff)$/i.test(text)) return { rgb: [1, 1, 1], alpha: 1 };
  if (/^black$/i.test(text)) return { rgb: [0, 0, 0], alpha: 1 };
  return null;
}

function formatColor(rgb, alpha) {
  const hex = rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
  return alpha >= 0.999 ? `#${hex}` : `#${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

// Papeis: mapeiam a luminosidade OKLCH (L) do tema claro para o escuro, preservando o matiz.
const NEUTRAL = 0.045; // abaixo disso a cor e tratada como cinza
const SLATE_H = (262 * Math.PI) / 180; // cinzas do tema escuro puxam para o azul-ardosia da marca
const SLATE_C = 0.014;
const mappers = {
  // Fundos claros viram superficies escuras; a pagina (mais escura no claro) continua mais escura que o cartao.
  background({ L, C, h, alpha }) {
    if (L >= 0.84) {
      // cartao (#fff) 0.225, pagina (#f7f9fc) 0.185; cinzas claros de hover/linhas ficam entre os dois.
      const next = L >= 0.975 ? 0.185 + (L - 0.975) * 1.6 : 0.2 + (0.97 - Math.min(L, 0.97)) * 0.25;
      const tinted = C >= 0.012;
      return [clamp(next, 0.15, 0.26), tinted ? Math.min(C * 1.6, 0.05) : SLATE_C, tinted ? h : SLATE_H, alpha];
    }
    if (C < NEUTRAL && L >= 0.6) return [0.32 + (0.84 - L) * 0.3, C, h, alpha]; // cinzas medios (trilhos, desabilitados)
    if (L < 0.32) return [Math.max(L, 0.08), C, h, alpha < 1 ? clamp(alpha * 1.8, 0, 0.75) : alpha]; // overlays e tooltips escuros (overlay mais denso no escuro)
    return [L, C, h, alpha]; // botoes e marcas coloridas mantem a cor
  },
  border({ L, C, h, alpha }) {
    if (L >= 0.78) return [clamp(0.31 + (1 - L) * 0.5, 0.29, 0.42), C >= 0.012 ? Math.min(C * 1.4, 0.07) : SLATE_C, C >= 0.012 ? h : SLATE_H, alpha];
    return [L, C, h, alpha];
  },
  text({ L, C, h, alpha }) {
    // Tinta azul-acinzentada do tema (C ate ~0.09) vira texto claro quase neutro; cores de status (C alto) clareiam.
    if (C < 0.09) return L > 0.82 ? [L, C, h, alpha] : [clamp(1.08 - 0.62 * L, 0.6, 0.95), C * 0.3, h, alpha];
    if (L > 0.86) return [L, C, h, alpha]; // texto claro sobre botao colorido
    return [clamp(Math.max(L, 0.74) + 0.04, 0, 0.9), Math.min(C, 0.16), h, alpha]; // cores de status mais claras
  },
  graphic({ L, C, h, alpha }) {
    if (C < NEUTRAL) return L >= 0.6 ? mappers.border({ L, C, h, alpha }) : mappers.text({ L, C, h, alpha });
    if (L >= 0.86) return mappers.background({ L, C, h, alpha });
    return [clamp(L, 0.58, 0.8), C, h, alpha];
  },
  shadow({ L, C, h, alpha }) {
    if (L >= 0.84) return mappers.background({ L, C, h, alpha }); // aneis da cor da superficie
    if (C >= 0.1) return [clamp(L, 0.55, 0.75), C, h, clamp(alpha * 1.6, 0, 0.5)]; // aneis de foco coloridos
    return [0, 0, 0, clamp(alpha * 2.2, 0, 0.6)];
  },
};

function convert(text, role) {
  const parsed = parseColor(text);
  if (!parsed) return text;
  const [L, C, h] = rgbToOklch(parsed.rgb);
  const [nextL, nextC, nextH, nextAlpha] = mappers[role]({ L, C, h, alpha: parsed.alpha });
  return formatColor(oklchToRgb([nextL, nextC, nextH]), nextAlpha);
}

const COLOR_PATTERN = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\bwhite\b|\bblack\b/gi;

function roleFor(prop) {
  const name = prop.toLowerCase();
  if (name.startsWith('--')) {
    if (/ink|text|muted|fg|label/.test(name)) return 'text';
    if (/line|border|grid|rail/.test(name)) return 'border';
    if (/bg|soft|surface|track|panel|background/.test(name)) return 'background';
    return 'graphic';
  }
  if (/radius|-width$|-style$|collapse|spacing|offset|-size$|-position|-repeat|-attachment|-clip$|-origin$|blend|-image$/.test(name)) return null;
  if (name === 'color' || name === 'caret-color' || name === '-webkit-text-fill-color' || name === 'text-decoration-color') return 'text';
  if (name.startsWith('border') || name.startsWith('outline') || name === 'column-rule-color') return 'border';
  if (name.includes('shadow')) return 'shadow';
  if (name === 'fill' || name === 'stroke' || name === 'stop-color' || name === 'accent-color') return 'graphic';
  if (name.startsWith('background')) return 'background';
  return null;
}

function prefixSelector(selector) {
  return selector.split(',').map((part) => {
    const trimmed = part.trim();
    if (!trimmed) return trimmed;
    if (/^:root\b/.test(trimmed)) return trimmed.replace(/^:root/, ROOT_PREFIX);
    if (/^html\b/.test(trimmed)) return trimmed.replace(/^html/, 'html:where([data-theme="dark"])');
    return `${PREFIX} ${trimmed}`;
  }).join(', ');
}

// Tema claro: so texto. Cinzas e cores de texto claros demais para fundo claro sao escurecidos (mesmo matiz)
// ate passar de 4.5:1 sobre branco; branco/quase branco (texto em botao colorido) nao muda.
function lightTextFix({ L, C, h, alpha }) {
  if (alpha < 0.999 || L >= 0.9) return [L, C, h, alpha];
  if (C < 0.09) return L > 0.54 ? [0.52, C, h, alpha] : [L, C, h, alpha];
  return L > 0.53 ? [0.5, C, h, alpha] : [L, C, h, alpha];
}
function lightConvert(text) {
  const parsed = parseColor(text);
  if (!parsed) return text;
  const [L, C, h] = rgbToOklch(parsed.rgb);
  const [nextL, nextC, nextH, nextAlpha] = lightTextFix({ L, C, h, alpha: parsed.alpha });
  return formatColor(oklchToRgb([nextL, nextC, nextH]), nextAlpha);
}
// Superficies que sao escuras nos dois temas (modo TV) ficam fora do ajuste do tema claro.
const LIGHT_SKIP = /\.tv-/;

const LIGHT_PREFIX = ':where(:root:not([data-theme="dark"]))';
function prefixLight(selector) {
  return selector.split(',').map((part) => {
    const trimmed = part.trim();
    if (!trimmed) return trimmed;
    if (/^:root\b/.test(trimmed)) return trimmed.replace(/^:root/, ':root:where(:not([data-theme="dark"]))');
    if (/^html\b/.test(trimmed)) return trimmed.replace(/^html/, 'html:where(:not([data-theme="dark"]))');
    return `${LIGHT_PREFIX} ${trimmed}`;
  }).join(', ');
}

function darkRulesFor(css, from, mode = 'dark') {
  const source = postcss.parse(css, { from });
  const output = postcss.root();
  source.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    if (mode === 'light' && LIGHT_SKIP.test(rule.selector)) return;
    const declarations = [];
    rule.each((node) => {
      if (node.type !== 'decl') return;
      const role = roleFor(node.prop);
      if (!role) return;
      if (mode === 'light') {
        // Tema claro: so propriedades de texto; tokens (--x) ficam como estao.
        if (role !== 'text' || node.prop.startsWith('--')) return;
        const value = node.value.replace(COLOR_PATTERN, (match) => lightConvert(match));
        COLOR_PATTERN.lastIndex = 0;
        declarations.push(postcss.decl({ prop: node.prop, value, important: node.important }));
        return;
      }
      // Declaracoes de cor sem cor literal (transparent, none, 0, var(...)) tambem sao replicadas sem mudanca:
      // assim a camada escura reproduz a cascata inteira das propriedades de cor, inclusive "border: 0".
      let value = node.value.replace(COLOR_PATTERN, (match) => convert(match, role));
      COLOR_PATTERN.lastIndex = 0;
      // Azul da marca usado como TEXTO fica escuro demais sobre os cartoes escuros: usa o azul claro de texto.
      if (role === 'text' && !node.prop.startsWith('--')) value = value.replace(/var\(--blue(?:-deep)?\)/g, 'var(--accent-text)');
      if (node.prop.startsWith('--') && value === node.value) return; // tokens sem cor ficam como estao
      declarations.push(postcss.decl({ prop: node.prop, value, important: node.important }));
    });
    if (!declarations.length) return;
    const clone = postcss.rule({ selector: mode === 'light' ? prefixLight(rule.selector) : prefixSelector(rule.selector) });
    declarations.forEach((declaration) => clone.append(declaration));
    let target = output;
    const chain = [];
    for (let parent = rule.parent; parent && parent.type === 'atrule'; parent = parent.parent) chain.unshift(parent);
    for (const atRule of chain) {
      const wrapper = postcss.atRule({ name: atRule.name, params: atRule.params });
      target.append(wrapper);
      target = wrapper;
    }
    target.append(clone);
  });
  return output;
}

// Mesma ordem do main.tsx, para as regras escuras respeitarem a cascata original.
const mainSource = readFileSync(join(root, 'main.tsx'), 'utf8');
const GENERATED = new Set([OUTPUT, MANUAL, LIGHT_OUTPUT]);
const ordered = [...mainSource.matchAll(/import '\.\/([^']+\.css)'/g)].map((match) => match[1]).filter((file) => !GENERATED.has(file));
const extra = readdirSync(root).filter((file) => file.endsWith('.css') && !ordered.includes(file) && !GENERATED.has(file));
if (extra.length) console.warn(`[theme:dark] CSS fora do main.tsx (ignorados): ${extra.join(', ')}`);

const header = '/* ARQUIVO GERADO por scripts/generate-dark-theme.mjs. Nao edite: ajustes manuais vao em theme-dark-manual.css. */\n';
const parts = ordered.map((file) => {
  const generated = darkRulesFor(readFileSync(join(root, file), 'utf8'), file).toString().trim();
  return generated ? `/* ${file} */\n${generated}\n` : '';
}).filter(Boolean);
writeFileSync(join(root, OUTPUT), header + parts.join('\n'));
console.log(`[theme:dark] ${OUTPUT} gerado a partir de ${ordered.length} arquivos.`);

// Contraste do tema claro: copia as declaracoes de cor de TEXTO (mesma ordem/peso) escurecendo as claras demais.
const lightHeader = '/* ARQUIVO GERADO por scripts/generate-dark-theme.mjs: contraste minimo de texto no tema claro (4.5:1). Nao edite. */\n';
const lightParts = ordered.map((file) => {
  const generated = darkRulesFor(readFileSync(join(root, file), 'utf8'), file, 'light').toString().trim();
  return generated ? `/* ${file} */\n${generated}\n` : '';
}).filter(Boolean);
writeFileSync(join(root, LIGHT_OUTPUT), lightHeader + lightParts.join('\n'));
console.log(`[theme:dark] ${LIGHT_OUTPUT} gerado.`);
