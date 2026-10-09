import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { seed } = await import('../src/seed.js');
const { iniciar } = await import('../src/db.js');
const S = await import('../src/services.js');
const CO = await import('../src/comercial.js');
const MK = await import('../src/marketing.js');
const { AREAS } = await import('../src/auth.js');

await iniciar(seed);
const hoje = S.hoje(), mes = hoje.slice(0, 7);
let n = 0;
const fic = (nome) => ({ nome, telefone: '(21) 98888-' + String(2000 + ++n), email: `m${n}@x.com`, aniversario: '1991-02-02' });

test('campanha: campos obrigatórios e validações', async () => {
  await assert.rejects(MK.salvarCampanha(null, {}), /nome da campanha, canal, data de início/);
  await assert.rejects(MK.salvarCampanha(null, { nome: 'X', canal: 'orkut', data_inicio: mes + '-01' }), /Canal inválido/);
  await assert.rejects(MK.salvarCampanha(null, { nome: 'X', canal: 'instagram', data_inicio: mes + '-10', data_fim: mes + '-05' }), /antes da inicial/);
  const c = await MK.salvarCampanha(null, { nome: 'Lançamento P3.9', canal: 'instagram', data_inicio: mes + '-01', verba: 500000 });
  assert.equal(c.ativa, 1);
});

test('números diários: obrigatórios, sem data futura, e o mesmo dia é atualizado (não duplica)', async () => {
  const [c] = await MK.listarCampanhas();
  await assert.rejects(MK.lancarDia({ campanha_id: c.id }), /data, valor gasto/);
  await assert.rejects(MK.lancarDia({ campanha_id: c.id, data: '2999-01-01', gasto: 1 }), /futura/);
  await assert.rejects(MK.lancarDia({ campanha_id: c.id, data: mes + '-01', gasto: -5 }), /inválido/);
  await MK.lancarDia({ campanha_id: c.id, data: mes + '-02', gasto: 10000, impressoes: 5000, cliques: 120, leads: 8 });
  await MK.lancarDia({ campanha_id: c.id, data: mes + '-02', gasto: 12000, impressoes: 5200, cliques: 130, leads: 10 });
  await MK.lancarDia({ campanha_id: c.id, data: mes + '-03', gasto: 8000, impressoes: 4000, cliques: 90, leads: 5 });
  const dias = await MK.listarDias(c.id);
  assert.equal(dias.length, 2);
  assert.equal(dias.find((d) => d.data === mes + '-02').gasto, 12000);
});

test('painel: gasto, leads, orçamentos vindos da campanha, vendas, CPL, ROAS e origem', async () => {
  const [c] = await MK.listarCampanhas();
  const o1 = await CO.criarOrcamento({ cliente: fic('Lead Insta 1'), produto_nome: 'Painel P3.9', valor: 3000000, origem: 'instagram', campanha_id: c.id });
  await CO.criarOrcamento({ cliente: fic('Lead Insta 2'), produto_nome: 'Painel P5', valor: 1000000, origem: 'instagram', campanha_id: c.id });
  await CO.criarOrcamento({ cliente: fic('Placa na rua'), produto_nome: 'Painel P5', valor: 500000, origem: 'anuncio_rua' });
  await CO.mudarStatus(o1.id, { status: 'ganho' }, null);
  const p = await MK.painel(mes);
  assert.equal(p.atual.gasto, 20000);
  assert.equal(p.atual.leads, 15);
  assert.equal(p.atual.orcamentos, 2, 'só os orçamentos ligados a campanha');
  assert.equal(p.atual.orcamentos_todos, 3);
  assert.equal(p.atual.vendas, 1);
  assert.equal(p.atual.valor_vendido, 3000000);
  assert.equal(p.atual.cpl, 20000 / 15);
  assert.equal(p.atual.roas, 150);
  const camp = p.por_campanha.find((x) => x.id === c.id);
  assert.equal(camp.orcamentos, 2);
  assert.equal(camp.custo_orcamento, 10000);
  assert.equal(p.por_origem.find((x) => x.origem === 'instagram').qtd, 2);
  assert.equal(p.por_origem.find((x) => x.origem === 'anuncio_rua').rotulo, 'Anúncio na rua / outdoor');
  assert.ok(p.semanas.length >= 1 && p.semanas.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.semana)));
  await assert.rejects(MK.painel('2026-13'), /Mês inválido/);
});

test('orçamento aceita só campanha existente', async () => {
  await assert.rejects(CO.criarOrcamento({ cliente: fic('Camp ruim'), produto_nome: 'Painel P5', valor: 1000, origem: 'instagram', campanha_id: 9999 }), /Campanha não encontrada/);
});

test('perfis: marketing vê só o marketing; sócio e admin veem; comercial e operador não', () => {
  assert.deepEqual(AREAS.marketing, ['marketing']);
  assert.ok(AREAS.admin.includes('marketing') && AREAS.socio.includes('marketing'));
  assert.ok(!AREAS.comercial.includes('marketing') && !AREAS.operador.includes('marketing'));
});
