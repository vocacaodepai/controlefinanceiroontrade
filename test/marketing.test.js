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

test('vínculo automático: origem Instagram/Facebook + campanha ativa no período liga o orçamento sozinho', async () => {
  const ini = S.addDias(hoje, -10);
  const fb = await MK.salvarCampanha(null, { nome: 'Meta Teste Semana', canal: 'facebook', data_inicio: ini });
  // Instagram também vale para campanha da Meta cadastrada como Facebook
  const o = await CO.criarOrcamento({ cliente: fic('Lead Auto 1'), produto_nome: 'Painel P5', valor: 2000000, origem: 'instagram', data: S.addDias(hoje, -1) });
  const ligado = (await CO.listarOrcamentos({ q: 'Lead Auto 1' }))[0];
  const insta = (await MK.listarCampanhas()).find((c) => c.nome === 'Lançamento P3.9');
  assert.equal(ligado.campanha_id, insta.id, 'havendo campanha do mesmo canal, ela vale antes da campanha da Meta cadastrada como Facebook');
  assert.equal(ligado.campanha_auto, 1);
  // origem sem anúncio nunca liga
  const sem = await CO.criarOrcamento({ cliente: fic('Lead Indicação'), produto_nome: 'Painel P5', valor: 100000, origem: 'indicacao' });
  assert.equal(sem.campanha_id, null);
  // antes do início da campanha: não liga
  const antes = await CO.criarOrcamento({ cliente: fic('Lead Antigo'), produto_nome: 'Painel P5', valor: 100000, origem: 'facebook', data: S.addDias(ini, -5) });
  assert.ok(antes.campanha_id === null || antes.campanha_id === insta.id);
  // escolha manual continua valendo e não é marcada como automática
  const manual = await CO.criarOrcamento({ cliente: fic('Lead Manual'), produto_nome: 'Painel P5', valor: 100000, origem: 'facebook', campanha_id: fb.id });
  assert.equal(manual.campanha_id, fb.id); assert.equal(manual.campanha_auto, 0);
  // campanha nova cobrindo o período puxa os orçamentos que ficaram sem campanha
  const g = await MK.salvarCampanha(null, { nome: 'Antiga Retroativa', canal: 'facebook', data_inicio: S.addDias(ini, -8), data_fim: S.addDias(ini, -2) });
  assert.equal((await CO.listarOrcamentos({ q: 'Lead Antigo' }))[0].campanha_id, g.id);
  assert.equal(o.origem, 'instagram');
});

test('retorno da campanha: orçamento caminha até a venda e o recebimento e a campanha acompanha', async () => {
  const camp = await MK.salvarCampanha(null, { nome: 'Google Retorno', canal: 'google', data_inicio: S.addDias(hoje, -3) });
  await MK.lancarDia({ campanha_id: camp.id, data: S.addDias(hoje, -2), gasto: 100000, leads: 4, cliques: 40, impressoes: 900 });
  const o = await CO.criarOrcamento({ cliente: fic('Lead Google'), produto_nome: 'Painel P5', valor: 1000000, origem: 'google_anuncio' });
  assert.equal(o.campanha_id, camp.id);
  let r = await MK.retornoCampanha(camp.id);
  assert.equal(r.totais.orcamentos, 1); assert.equal(r.totais.vendas, 0); assert.equal(r.totais.custo_orcamento, 100000);
  await CO.mudarStatus(o.id, { status: 'ganho' }, null);
  r = await MK.retornoCampanha(camp.id);
  assert.equal(r.totais.valor_vendido, 1000000); assert.equal(r.totais.roas, 10); assert.equal(r.totais.valor_recebido, 0);
  const CB = await import('../src/cobranca.js');
  const { one } = await import('../src/db.js');
  const conta = await one('SELECT id FROM contas ORDER BY id LIMIT 1');
  await CB.registrarPagamento(o.id, { valor: 400000, conta_id: conta.id }, null);
  r = await MK.retornoCampanha(camp.id);
  assert.equal(r.totais.valor_recebido, 400000); assert.equal(r.totais.a_receber, 600000); assert.equal(r.totais.roas_recebido, 4);
  const p = await MK.painel(mes);
  const linha = p.por_campanha.find((c) => c.id === camp.id);
  assert.equal(linha.valor_recebido >= 400000 || linha.orcamentos === 0, true);
  await assert.rejects(MK.retornoCampanha(999999), /não encontrada/);
});

test('números do anúncio: alcance e conversas por mensagem entram no painel, com custo por conversa e frequência', async () => {
  const c = await MK.salvarCampanha(null, { nome: 'Conversas Teste', canal: 'tiktok', data_inicio: mes + '-01' });
  await assert.rejects(MK.lancarDia({ campanha_id: c.id, data: mes + '-01', gasto: 100, alcance: -1 }), /Alcance inválido/);
  await MK.lancarDia({ campanha_id: c.id, data: mes + '-02', gasto: 92622, impressoes: 43017, cliques: 500, leads: 0, alcance: 21665, conversas: 165 });
  const p = await MK.painel(mes);
  const l = p.por_campanha.find((x) => x.id === c.id);
  assert.equal(l.conversas, 165); assert.equal(l.alcance, 21665);
  assert.equal(Math.round(l.custo_conversa), 561); // R$ 5,61 por conversa, como no gerenciador de anúncios
  assert.ok(p.atual.conversas >= 165 && p.atual.alcance >= 21665 && p.atual.frequencia > 1);
  assert.equal((await MK.retornoCampanha(c.id)).totais.conversas, 165);
});
