import assert from 'node:assert/strict';
import test from 'node:test';
import { customThemeVars, hexToOklch } from '../../frontend/src/lib/custom-theme.ts';
import { themeSpecSchema } from '../src/store/team-themes.js';

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((index) => { const c = parseInt(hex.slice(index, index + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('team theme: accent sets hue and intensity; a light side color is darkened so white text stays readable', () => {
  const vars = customThemeVars({ name: 'Verde', accent: '#1f9d55', side: '#a7f3d0', background: 'colorido' });
  assert.ok(Math.abs(Number(vars['--ct-hue']) - hexToOklch('#1f9d55')[2]) < 0.2);
  assert.ok(Number(vars['--ct-chroma']) > 0.5);
  for (const side of [vars['--ct-side'], vars['--ct-side-d']]) {
    assert.ok(contrast('#ffffff', side) >= 7, `branco sobre ${side}`);
  }
  assert.ok(contrast(vars['--ct-side-muted'], vars['--ct-side']) >= 4.5);
  assert.ok(contrast(vars['--ct-side-muted-d'], vars['--ct-side-d']) >= 4.5);
  assert.match(vars['--ct-page'], /^linear-gradient/);
});

test('team theme: gray accent stays almost gray; neutral background uses the default page colors', () => {
  const vars = customThemeVars({ name: 'Cinza', accent: '#777777', side: '#22272e', background: 'neutro' });
  assert.equal(vars['--ct-chroma'], '0.080');
  assert.equal(vars['--ct-page'], '#f7f9fc');
  assert.equal(vars['--ct-page-d'], '#12151b');
});

test('team theme spec: name 2-40 letters, colors as #rrggbb, background colorido/neutro', () => {
  assert.deepEqual(themeSpecSchema.parse({ name: ' Verde Campo ', accent: '#1F9D55', side: '#123D36', background: 'neutro' }), { name: 'Verde Campo', accent: '#1f9d55', side: '#123d36', background: 'neutro' });
  for (const bad of [{ name: 'X', accent: '#123456', side: '#123456', background: 'neutro' }, { name: 'Ok tema', accent: 'red', side: '#123456', background: 'neutro' }, { name: 'Ok tema', accent: '#123456', side: '#123456;}', background: 'neutro' }, { name: 'Ok tema', accent: '#123456', side: '#123456', background: 'azul' }]) {
    assert.equal(themeSpecSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});
