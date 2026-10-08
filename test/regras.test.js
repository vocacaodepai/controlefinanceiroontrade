import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { seed } = await import('../src/seed.js');
const { iniciar, one, query } = await import('../src/db.js');
const S = await import('../src/services.js');
const { excelMes, excelDia } = await import('../src/export.js');

await iniciar(seed);
const ids = {};
for (const c of await query('SELECT id, nome FROM contas')) ids['c:' + c.nome] = c.id;
for (const c of await query('SELECT id, nome FROM categorias')) ids['k:' + c.nome] = c.id;
const conta = (n) => ids['c:' + n];
const cat = (n) => ids['k:' + n];
const saldo = async (n, ate) => (await S.saldos(ate)).find((s) => s.nome === n).saldo;

test('seed cria contas com e sem nota e a recorrência do empréstimo', async () => {
  const mods = new Set((await query('SELECT modalidade FROM contas')).map((c) => c.modalidade));
  assert.deepEqual([...mods].sort(), ['com_nota', 'sem_nota']);
  const r = (await S.recorrenciasDoMes('2026-02'))[0];
  assert.equal(r.data_prevista, '2026-02-05');
  assert.equal(r.valor, 1680000);
});

test('saldo = inicial + entradas − saídas ± transferências', async () => {
  await S.salvarCadastro('contas', conta('Banco Safra'), { saldo_inicial: 100000 });
  await S.criarLancamento({ data: '2026-03-01', tipo: 'entrada', valor: 50000, conta_id: conta('Banco Safra'), categoria_id: cat('Recebimento de cliente') });
  await S.criarLancamento({ data: '2026-03-02', tipo: 'saida', valor: 1500, conta_id: conta('Banco Safra'), categoria_id: cat('Papelaria') });
  await S.criarLancamento({ data: '2026-03-02', tipo: 'transferencia', valor: 20000, conta_id: conta('Banco Safra'), conta_destino_id: conta('LTON') });
  assert.equal(await saldo('Banco Safra', '2026-03-01'), 150000);
  assert.equal(await saldo('Banco Safra', '2026-03-02'), 128500);
  assert.equal(await saldo('LTON', '2026-03-02'), 20000);
});

test('painel separa com/sem nota e quem pagou; transferência não conta como receita/despesa', async () => {
  await S.criarLancamento({ data: '2026-03-03', tipo: 'entrada', valor: 30000, conta_id: conta('LTON'), categoria_id: cat('Recebimento de cliente') });
  await S.criarLancamento({ data: '2026-03-03', tipo: 'saida', valor: 10000, conta_id: conta('LTON'), categoria_id: cat('Salário') });
  const p = await S.painelMes('2026-03');
  assert.equal(p.entradas_com_nota, 50000);
  assert.equal(p.entradas_sem_nota, 30000);
  assert.equal(p.saidas, 11500);
  assert.deepEqual(p.saidas_por_pagador.map((x) => x.nome).sort(), ['LTON', 'OnTrade']);
});

test('fechamento: exige ordem, trava edição e permite reabrir', async () => {
  await assert.rejects(S.fecharDia('2026-03-02'), /Feche primeiro o dia 2026-03-01/);
  await S.fecharDia('2026-03-01');
  await S.fecharDia('2026-03-02', { contagens: { [conta('Banco Safra')]: 128000 } });
  await assert.rejects(S.criarLancamento({ data: '2026-03-02', tipo: 'saida', valor: 100, conta_id: conta('LTON'), categoria_id: cat('Luz') }), /fechado/);
  await assert.rejects(S.reabrirDia('2026-03-01'), /Reabra primeiro/);
  await assert.rejects(S.fecharDia('2026-03-02'), /já está fechado/);
  const d = await S.resumoDia('2026-03-02');
  assert.equal(d.contas.find((c) => c.nome === 'Banco Safra').saldo_contado, 128000);
  await S.reabrirDia('2026-03-02');
  await S.reabrirDia('2026-03-01');
  assert.equal(await S.diaFechado('2026-03-01'), false);
});

test('validações básicas', async () => {
  await assert.rejects(S.criarLancamento({ data: '2026-03-04', tipo: 'saida', valor: 0, conta_id: 1, categoria_id: 1 }), /Valor/);
  await assert.rejects(S.criarLancamento({ data: '2026-03-04', tipo: 'saida', valor: 100, conta_id: 1 }), /categoria/);
  await assert.rejects(S.criarLancamento({ data: '2026-03-04', tipo: 'transferencia', valor: 100, conta_id: 1, conta_destino_id: 1 }), /destino/);
  await assert.rejects(S.criarLancamento({ data: '2026-03-04', tipo: 'saida', valor: 100, conta_id: 99999, categoria_id: 1 }), /Conta inválida/);
});

test('recorrência só lança uma vez por mês', async () => {
  const r = (await S.recorrenciasDoMes('2026-03'))[0];
  const l = await S.lancarRecorrencia(r.id, { mes: '2026-03' });
  assert.equal(l.valor, 1680000);
  assert.equal(l.data, '2026-03-05');
  await assert.rejects(S.lancarRecorrencia(r.id, { mes: '2026-03' }), /já foi lançada/);
});

test('gera os Excel do mês e do dia', async () => {
  const wb = await excelMes('2026-03');
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Resumo', 'Por conta', 'Pessoas e folha', 'Fechamento diário', 'Lançamentos', 'Mapa do fluxo']);
  const cab = wb.getWorksheet('Lançamentos').getRow(4).values.filter(Boolean);
  assert.ok(cab.includes('Lançado por') && cab.includes('Lançado em'), 'o Excel mostra quem lançou e quando');
  const buf = await (await excelDia('2026-03-02')).xlsx.writeBuffer();
  assert.ok(buf.byteLength > 3000);
});
