// Auditoria de contraste (WCAG) das telas, para rodar no preview local (npm run preview, logado).
// Uso: copie este arquivo para frontend/public/__contrast-audit.js, abra http://localhost:8000 e no console:
//   await import("/__contrast-audit.js"); await window.__contrastAudit(["/", "/chamados/abertos"], "dark")
// Lista, por tela, os textos abaixo de 4.5:1 (3:1 para texto grande). Nao deixe o arquivo em public/.

(function () {
  const parse = (value) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  };
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  function background(element) {
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== 'none' && !/gradient/.test(style.backgroundImage)) return null;
      const color = parse(style.backgroundColor);
      if (color && color.a > 0) { layers.push(color); if (color.a >= 1) break; }
    }
    let result = { r: 255, g: 255, b: 255, a: 1 };
    if (!layers.length || layers[layers.length - 1].a < 1) result = parse(getComputedStyle(document.body).backgroundColor) || result;
    for (let index = layers.length - 1; index >= 0; index -= 1) result = blend(layers[index], result);
    return result;
  }
  function describe(element) {
    const cls = typeof element.className === 'string' ? element.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const parentCls = element.parentElement && typeof element.parentElement.className === 'string' ? element.parentElement.className.trim().split(/\s+/)[0] : '';
    return `${parentCls ? parentCls + ' > ' : ''}${element.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
  }
  function auditPage() {
    const issues = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const value = text.textContent.trim();
      if (!value) continue;
      const element = text.parentElement;
      if (!element || element.closest('svg, option, script, style, [aria-hidden="true"], .sr-only')) continue;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      let opacity = 1;
      for (let node = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
      if (opacity < 0.2) continue;
      if (element.closest('button:disabled, [disabled]')) continue;
      const fg = parse(style.color);
      const bg = background(element);
      if (!fg || !bg) continue;
      const color = blend({ ...fg, a: fg.a * opacity }, bg);
      const l1 = lum(color); const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(style.fontSize); const bold = Number(style.fontWeight) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const min = large ? 3 : 4.5;
      if (ratio < min) {
        const key = describe(element);
        const current = issues.get(key);
        if (!current || ratio < current.ratio) issues.set(key, { ratio: Math.round(ratio * 100) / 100, min, sample: value.slice(0, 40), color: style.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`, count: (current?.count || 0) + 1 });
        else current.count += 1;
      }
    }
    return [...issues.entries()].map(([key, info]) => ({ key, ...info })).sort((a, b) => a.ratio - b.ratio);
  }
  window.__contrastAudit = async function (paths, theme) {
    document.documentElement.dataset.theme = theme;
    const style = document.getElementById('__audit-style') || Object.assign(document.createElement('style'), { id: '__audit-style' });
    style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
    document.head.appendChild(style);
    const result = {};
    for (const path of paths) {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
      await new Promise((resolve) => setTimeout(resolve, 1800));
      result[path] = auditPage();
    }
    return result;
  };
})();
