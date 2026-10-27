import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { seed } = await import('../src/seed.js');
const { iniciar } = await import('../src/db.js');
const S = await import('../src/services.js');
const PE = await import('../src/pendencias.js');
await iniciar(seed);

test('pendências: criar, aparecer no painel e resolver com registro de quem e do quê', async () => {
  await assert.rejects(PE.criar({ titulo: ' ' }, null), /Escreva/);
  const conta = (await S.meta()).contas[0], cat = (await S.meta()).categorias.find((c) => c.tipo === 'saida');
  const l = await S.criarLancamento({ data: S.hoje(), tipo: 'saida', valor: 200000, conta_id: conta.id, categoria_id: cat.id, descricao: 'PIX Elisa' });
  const p = await PE.criar({ titulo: 'Entender o PIX de R$ 2.000', detalhe: 'Salário, pró-labore ou empréstimo?', lancamento_id: l.id }, { nome: 'Elisa' });
  assert.equal((await PE.abertas()).length, 1);
  assert.equal((await PE.abertas())[0].lancamento_valor, 200000);
  await assert.rejects(PE.criar({ titulo: 'x', lancamento_id: 99999 }, null), /não encontrado/);
  const r = await PE.resolver(p.id, { resolucao: 'Era pró-labore' }, { nome: 'Carla' });
  assert.equal(r.resolvida_por, 'Carla'); assert.equal(r.resolucao, 'Era pró-labore');
  assert.equal((await PE.abertas()).length, 0);
  assert.equal((await PE.resolvidas()).length, 1);
  await assert.rejects(PE.resolver(p.id, {}, null), /já resolvida/);
});
