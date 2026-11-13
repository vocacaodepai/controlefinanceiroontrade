import { test } from 'node:test';
import assert from 'node:assert/strict';

const FO = await import('../src/fornecedores.js');
const CT = await import('../public/catalogo.js');
const url = (p) => `/x/${p}`;
// tudo que identifica o fornecedor no catálogo da Gengu e não pode sair na versão do cliente
const PROIBIDO = /gengu|jude|bunny|zigong|jinchuan|gengutech|zggengu|亘古|187 0838|182 1561/i;

test('catálogo: dados, imagens e vínculo com a ficha do fornecedor', () => {
  const c = FO.catalogo('gengu');
  assert.ok(c.itens.length >= 600);
  for (const it of c.itens) assert.ok(FO.caminhoCatalogo('gengu', 'i', it.img), 'imagem existe: ' + it.img);
  for (const [k, v] of Object.entries(c.herois)) assert.ok(FO.caminhoCatalogo('gengu', 'h', v.img), 'foto grande existe: ' + k);
  const ids = new Set(c.itens.map((i) => i.id));
  assert.equal(ids.size, c.itens.length);
  for (const s of c.secoes) for (const id of s.itens) assert.ok(ids.has(id), id);
  const f = FO.listar().find((x) => x.catalogo === 'gengu');
  assert.equal(f.id, c.fornecedor_id);
});

test('catálogo: nomes e caminhos inválidos são recusados', () => {
  assert.equal(FO.catalogo('../fornecedores'), null);
  assert.equal(FO.catalogo('nao-existe'), null);
  assert.equal(FO.caminhoCatalogo('gengu', 'i', '../catalogo.json'), null);
  assert.equal(FO.caminhoCatalogo('gengu', 'x', 'g001.jpg'), null);
  assert.equal(FO.caminhoCatalogo('gengu', 'i', 'g001.png'), null);
});

test('catálogo: versão do cliente sai sem nenhum dado do fornecedor', () => {
  const c = FO.catalogo('gengu');
  const cli = CT.paginas(c, 'cliente', url).join('');
  assert.doesNotMatch(cli, PROIBIDO);
  assert.doesNotMatch(cli, /h\/(capa|cartao|fabrica)/, 'sem capa, cartões ou fotos da fábrica');
  assert.match(cli, /On Trade/);
  const int = CT.paginas(c, 'interna', url).join('');
  assert.match(int, /Gengu/); assert.match(int, /jude\.chan@gengutech\.com/);
  assert.match(int, /Uso interno/);
});

test('catálogo: medidas e itens a conferir', () => {
  const c = FO.catalogo('gengu');
  const t = c.itens.find((i) => i.legenda_orig === 'T-rex L=20M');
  assert.equal(CT.medidaTxt(t, 'cliente'), 'Comprimento 20 m');
  const p = c.itens.find((i) => i.legenda_orig === 'Pterosauria W=3.5M');
  assert.equal(CT.medidaTxt(p, 'interna'), 'Envergadura 3,5 m');
  const duvida = c.itens.find((i) => i.legenda_orig === 'Ankylosaurus L=40M');
  assert.ok(duvida.duvida);
  assert.equal(CT.medidaTxt(duvida, 'cliente'), 'Medida sob consulta');
  const sem = c.itens.find((i) => !i.nome_orig);
  assert.equal(CT.nomeItem(sem, 'cliente'), 'Modelo Sob Consulta');
});
