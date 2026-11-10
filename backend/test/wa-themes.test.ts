import assert from 'node:assert/strict';
import test from 'node:test';
import { safeCssValue, safeImage, sanitizeThemeColors } from '../src/wa-themes.js';

test('shared themes keep real colors, gradients and shadows', () => {
  for (const value of ['#f0f2f5', '#0B141A', 'rgba(37,99,235,.28)', 'transparent',
    'radial-gradient(900px 520px at 0% 0%,rgba(37,99,235,.28),transparent 60%),radial-gradient(900px 620px at 100% 100%,rgba(14,165,233,.22),transparent 60%),#dfe7f5',
    '0 0 0 1px rgba(37,99,235,.18),0 24px 70px rgba(30,64,175,.18)', 'linear-gradient(135deg,#2563eb,#0ea5e9)']) {
    assert.equal(safeCssValue(value), value, value);
  }
});

test('shared themes drop anything that could inject into the WhatsApp page', () => {
  for (const value of ['red" onmouseover="alert(1)', '#fff;background:url(https://x.test/a.png)', 'url(javascript:alert(1))', 'expression(alert(1))',
    '#fff</style><script>alert(1)</script>', 'var(--x)', '#fff}body{display:none', 'white']) {
    assert.equal(safeCssValue(value), undefined, value);
  }
  assert.equal(safeImage('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), 'data:image/jpeg;base64,/9j/4AAQSkZJRg==');
  assert.equal(safeImage('data:image/svg+xml;base64,PHN2Zz4='), undefined);
  assert.equal(safeImage('https://x.test/a.jpg'), undefined);
});

test('a theme needs the main colors; unknown keys are ignored', () => {
  const ok = sanitizeThemeColors({ escuro: true, lista: '#111b21', fundo: '#0b141a', tx: '#e9edef', ac: '#00a884', evil: '#fff', img: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.deepEqual(ok, { colors: { escuro: true, lista: '#111b21', fundo: '#0b141a', tx: '#e9edef', ac: '#00a884' }, image: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.equal(sanitizeThemeColors({ lista: '#fff', fundo: 'url(x)', tx: '#000' }), undefined);
  assert.equal(sanitizeThemeColors(null), undefined);
});
