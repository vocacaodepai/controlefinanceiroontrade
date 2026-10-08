import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { seed } = await import('../src/seed.js');
const S = await import('../src/services.js');
const { db } = await import('../src/db.js');
const { excelMes, excelDia } = await import('../src/export.js');

seed();
const conta = (n) => db.prepare('SELECT id FROM contas WHERE nome = ?').get(n).id;
const cat = (n) => db.prepare('SELECT id FROM categorias WHERE nome = ?').get(n).id;
const saldo = (n, ate) => S.saldos(ate).find((s) => s.nome === n).saldo;

test('seed cria contas com e sem nota e a recorrência do empréstimo', () => {
  const mods = new Set(db.prepare('SELECT modalidade FROM contas').all().map((c) => c.modalidade));
  assert.deepEqual([...mods].sort(), ['com_nota', 'sem_nota']);
  const r = S.recorrenciasDoMes('2026-02')[0];
  assert.equal(r.data_prevista, '2026-02-05');
  assert.equal(r.valor, 1680000);
});

test('saldo = inicial + entradas − saídas ± transferências', () => {
  S.salvarCadastro('contas', conta('Banco Safra'), { saldo_inicial: 100000 });
  S.criarLancamento({ data: '2026-03-01', tipo: 'entrada', valor: 50000, conta_id: conta('Banco Safra'), categoria_id: cat('Recebimento de cliente') });
  S.criarLancamento({ data: '2026-03-02', tipo: 'saida', valor: 1500, conta_id: conta('Banco Safra'), categoria_id: cat('Papelaria') });
  S.criarLancamento({ data: '2026-03-02', tipo: 'transferencia', valor: 20000, conta_id: conta('Banco Safra'), conta_destino_id: conta('LT1') });
  assert.equal(saldo('Banco Safra', '2026-03-01'), 150000);
  assert.equal(saldo('Banco Safra', '2026-03-02'), 128500);
  assert.equal(saldo('LT1', '2026-03-02'), 20000);
});

test('painel separa com/sem nota e quem pagou; transferência não conta como receita/despesa', () => {
  S.criarLancamento({ data: '2026-03-03', tipo: 'entrada', valor: 30000, conta_id: conta('LT1'), categoria_id: cat('Recebimento de cliente') });
  S.criarLancamento({ data: '2026-03-03', tipo: 'saida', valor: 10000, conta_id: conta('LT1'), categoria_id: cat('Salário') });
  const p = S.painelMes('2026-03');
  assert.equal(p.entradas_com_nota, 50000);
  assert.equal(p.entradas_sem_nota, 30000);
  assert.equal(p.saidas, 11500);
  assert.deepEqual(p.saidas_por_pagador.map((x) => x.nome).sort(), ['LT1', 'OnTrade']);
});

test('fechamento: exige ordem, trava edição e permite reabrir', () => {
  assert.throws(() => S.fecharDia('2026-03-02'), /Feche primeiro o dia 2026-03-01/);
  S.fecharDia('2026-03-01');
  S.fecharDia('2026-03-02', { contagens: { [conta('Banco Safra')]: 128000 } });
  assert.throws(() => S.criarLancamento({ data: '2026-03-02', tipo: 'saida', valor: 100, conta_id: conta('LT1'), categoria_id: cat('Luz') }), /fechado/);
  assert.throws(() => S.reabrirDia('2026-03-01'), /Reabra primeiro/);
  S.reabrirDia('2026-03-02');
  S.reabrirDia('2026-03-01');
  assert.equal(S.diaFechado('2026-03-01'), false);
});

test('validações básicas', () => {
  assert.throws(() => S.criarLancamento({ data: '2026-03-04', tipo: 'saida', valor: 0, conta_id: 1, categoria_id: 1 }), /Valor/);
  assert.throws(() => S.criarLancamento({ data: '2026-03-04', tipo: 'saida', valor: 100, conta_id: 1 }), /categoria/);
  assert.throws(() => S.criarLancamento({ data: '2026-03-04', tipo: 'transferencia', valor: 100, conta_id: 1, conta_destino_id: 1 }), /destino/);
});

test('recorrência só lança uma vez por mês', () => {
  const r = S.recorrenciasDoMes('2026-03')[0];
  const l = S.lancarRecorrencia(r.id, { mes: '2026-03' });
  assert.equal(l.valor, 1680000);
  assert.equal(l.data, '2026-03-05');
  assert.throws(() => S.lancarRecorrencia(r.id, { mes: '2026-03' }), /já foi lançada/);
});

test('gera os Excel do mês e do dia', async () => {
  const wb = await excelMes('2026-03');
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['Resumo', 'Por conta', 'Pessoas e folha', 'Fechamento diário', 'Lançamentos', 'Mapa do fluxo']);
  const buf = await (await excelDia('2026-03-02')).xlsx.writeBuffer();
  assert.ok(buf.byteLength > 3000);
});
