import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { seed } = await import('../src/seed.js');
const { iniciar, query } = await import('../src/db.js');
const S = await import('../src/services.js');

await iniciar(seed);
const ids = {};
for (const c of await query('SELECT id, nome FROM contas')) ids['c:' + c.nome] = c.id;
for (const c of await query('SELECT id, nome FROM categorias')) ids['k:' + c.nome] = c.id;
const hoje = S.hoje();
const mes = hoje.slice(0, 7);
const safra = ids['c:Banco Safra'];
const conta = (p, nome = 'Banco Safra') => p.saldo_dia.contas.find((c) => c.nome === nome);

test('saldo do painel acompanha cada lançamento do dia, sem esperar o fechamento', async () => {
  await S.salvarCadastro('contas', safra, { saldo_inicial: 15000000 }); // R$ 150.000
  let p = await S.painelMes(mes);
  assert.equal(p.saldo_dia.ao_vivo, true);
  assert.equal(p.saldo_dia.data, hoje);
  assert.equal(p.saldo_dia.fechado, null);
  assert.match(p.saldo_dia.atualizado_em, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(conta(p).saldo, 15000000);

  await S.criarLancamento({ data: hoje, tipo: 'saida', valor: 5000000, conta_id: safra, categoria_id: ids['k:Outras despesas'] }); // paga 50 mil
  p = await S.painelMes(mes);
  assert.equal(conta(p).saldo, 10000000, 'sobram R$ 100.000 antes do próximo pagamento');
  assert.equal(conta(p).movimento, -5000000);

  await S.criarLancamento({ data: hoje, tipo: 'entrada', valor: 1000000, conta_id: safra, categoria_id: ids['k:Recebimento de cliente'] });
  p = await S.painelMes(mes);
  assert.equal(conta(p).saldo, 11000000);
  assert.equal(conta(p).movimento, -4000000);
});

test('ao fechar o dia aparece o aviso de saldo fechado, com o saldo oficial de cada conta', async () => {
  await S.fecharDia(hoje, { fechado_por: 'Elisa Maria' });
  const p = await S.painelMes(mes);
  assert.equal(p.saldo_dia.fechado.data, hoje);
  assert.equal(p.saldo_dia.fechado.fechado_por, 'Elisa Maria');
  assert.equal(conta(p).saldo_fechado, 11000000);
  assert.equal(conta(p).saldo, 11000000);
  await S.reabrirDia(hoje);
  const q = await S.painelMes(mes);
  assert.equal(q.saldo_dia.fechado, null, 'sem fechamento do dia, o aviso some');
  assert.equal(conta(q).saldo_fechado, null);
});

test('mês passado mostra o saldo do último dia do mês, sem marcar como "ao vivo"', async () => {
  const d = new Date(hoje + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 2);
  const passado = d.toISOString().slice(0, 7);
  const p = await S.painelMes(passado);
  assert.equal(p.saldo_dia.ao_vivo, false);
  assert.equal(p.saldo_dia.data, S.intervaloMes(passado).ate);
  assert.equal(conta(p).saldo, 15000000, 'lançamentos de hoje não entram em meses anteriores');
  assert.equal(p.saldos.find((s) => s.nome === 'Banco Safra').saldo, 15000000);
});
