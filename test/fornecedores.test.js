import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const FO = await import('../src/fornecedores.js');
const { AREAS } = await import('../src/auth.js');
const { _interno: UI } = await import('../public/fornecedores.js');

test('fornecedores: lista com tradução, cores e fotos existentes', () => {
  const l = FO.listar();
  assert.ok(l.length >= 100);
  for (const f of l) {
    assert.ok(f.id && f.nome && f.setor, f.id);
    assert.match(f.design.fundo, /^#[0-9a-f]{6}$/);
    assert.ok(f.pt && typeof f.pt === 'object', 'tem tradução: ' + f.id);
    for (const ph of f.fotos) assert.ok(FO.caminhoFoto(...ph.src.split('/')), 'foto existe: ' + ph.src);
  }
  assert.equal(new Set(l.map((f) => f.id)).size, l.length, 'ids únicos');
});

test('fornecedores: fotos só por nome simples (sem sair da pasta) e acesso só para admin e sócio', () => {
  assert.equal(FO.caminhoFoto('f', '../../schema.sql'), null);
  assert.equal(FO.caminhoFoto('x', 'a.jpg'), null);
  assert.equal(FO.caminhoFoto('f', 'nao-existe.jpg'), null);
  const p = FO.caminhoFoto('f', 'img-8868.jpg');
  assert.ok(p && existsSync(p));
  assert.ok(AREAS.admin.includes('fornecedores') && AREAS.socio.includes('fornecedores'));
  assert.ok(!AREAS.comercial.includes('fornecedores') && !AREAS.financeiro.includes('fornecedores'));
});

test('fornecedores: WhatsApp só com número de verdade (celular chinês ganha +86)', () => {
  assert.equal(UI.numeroZap('só QR'), null);
  assert.equal(UI.numeroZap('19876712034 (ícone)'), '8619876712034');
  assert.equal(UI.numeroZap('+86 19906776070'), '8619906776070');
  assert.equal(UI.siteUrl('www.hushidaglobal.com'), 'https://www.hushidaglobal.com');
});
