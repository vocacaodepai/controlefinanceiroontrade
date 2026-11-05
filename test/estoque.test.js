import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { seed } = await import('../src/seed.js');
const { iniciar } = await import('../src/db.js');
const ES = await import('../src/estoque.js');
const { classificar, montaBusca } = await import('../src/estoque-catalogo.js');
await iniciar(seed);

test('catálogo: entende tipo, pitch, uso, medida e lote pelo nome', () => {
  assert.deepEqual(classificar('Painel de led P3.9 Indoor Magnético gabinete alumínio 0,50x1(lote 09) Fash lock'), { tipo: 'gabinete', pitch: 'P3.9', ambiente: 'indoor', dimensao: '100x50 cm', lote: '09' });
  assert.deepEqual(classificar('Módulo painel de led P5 outdoor 320x160mm (lote 04)'), { tipo: 'modulo', pitch: 'P5', ambiente: 'outdoor', dimensao: '32x16 cm', lote: '04' });
  assert.equal(classificar('P5 0UTDOOR 960X960 (Lote 07)').dimensao, '96x96 cm');
  assert.equal(classificar('Painel P3.9 gabinete 1x0,50 Outdoor (Lote 08)').dimensao, '100x50 cm');
  assert.equal(classificar('Painel de led P3.9 Outdoor gabinete 50x1000 ( Lote 06)').dimensao, '100x50 cm');
  assert.equal(classificar('Totem 2.5 Indoor 0,64cmX1,92m').pitch, 'P2.5');
  assert.equal(classificar('Módulo painel de led Indoor P3.91 25X25 (Lote 4)').pitch, 'P3.9');
  assert.equal(classificar('Receiver MRV 412-1').tipo, 'receiver');
  assert.equal(classificar('REF: (LVP 300) APARELHO ELETRICO PROCESSADOR DE VIDEO').tipo, 'processador');
  assert.equal(classificar('Papel de circuito impresso PCB P3.91').tipo, 'pcb');
  assert.equal(classificar('Painel P3.9 Outdoor (Lote 01 ONPRO)').lote, '01 (ONPRO)');
  const b = montaBusca({ nome: 'Painel X', tipo: 'gabinete', pitch: 'P3.9', dimensao: '100x50 cm', lote: '09' });
  for (const t of ['p3.91', 'p391', '50x100', 'lote 09', 'painel']) assert.ok(b.includes(t), t);
});

test('estoque: cadastro preenche o catálogo sozinho e a busca acha por pitch, lote, medida, código e sem acento', async () => {
  const a = await ES.salvarItem(null, { nome: 'Painel de led P3.9 Outdoor Gabinete 0,50x1 (lote 09)', codigo: '81669685807', marca: 'Yang Led On Trade', preco: 340000 });
  await ES.salvarItem(null, { nome: 'Módulo painel de led P3.91 indoor magnético 0,25x0,25m (lote 02)', codigo: '22527448988' });
  await ES.salvarItem(null, { nome: 'Receiver MRV208-1', codigo: '7326909010' });
  await ES.registrarMovimento({ item_id: a, tipo: 'entrada', quantidade: 55 }, null);
  const busca = async (q, extra = {}) => (await ES.listarItens({ q, ...extra })).map((i) => i.codigo);
  assert.deepEqual(await busca('p3.9 outdoor lote 9'), ['81669685807']);
  assert.deepEqual(await busca('modulo magnetico 391'), ['22527448988']);
  assert.deepEqual(await busca('50x100'), ['81669685807']);
  assert.deepEqual(await busca('7326909010'), ['7326909010']);
  assert.deepEqual(await busca('placa receptora'), ['7326909010']);
  assert.equal((await busca('', { pitch: 'P3.9' })).length, 2);
  assert.deepEqual(await busca('', { saldo: 'com' }), ['81669685807']);
  const it = (await ES.listarItens({ q: '81669685807' }))[0];
  assert.equal(it.tipo, 'gabinete'); assert.equal(it.dimensao, '100x50 cm'); assert.equal(it.valor_estoque, 340000 * 55);
  const f = await ES.filtros();
  assert.ok(f.pitches.includes('P3.9')); assert.ok(f.lotes.includes('09'));
  await assert.rejects(ES.salvarItem(null, { nome: 'X', tipo: 'nave' }), /Tipo inválido/);
});

test('itens gravados por fora (importação) são completados com tipo, pitch, medida, lote e busca', async () => {
  const { query } = await import('../src/db.js');
  await query(`INSERT INTO estoque_itens (nome, codigo) VALUES ('Painel P5 OUTDOOR gabinete 96x96 cm (lote 08)', 'MIC9047')`);
  assert.equal(await ES.completarCatalogo(), 1);
  const it = (await ES.listarItens({ q: 'p5 96x96 lote 8' }))[0];
  assert.equal(it.codigo, 'MIC9047'); assert.equal(it.tipo, 'gabinete'); assert.equal(it.lote, '08');
  assert.equal(await ES.completarCatalogo(), 0);
});
