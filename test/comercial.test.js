import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { seed } = await import('../src/seed.js');
const { iniciar, query } = await import('../src/db.js');
const S = await import('../src/services.js');
const CO = await import('../src/comercial.js');
const { AREAS } = await import('../src/auth.js');

await iniciar(seed);
const hoje = S.hoje();
let n = 0;
// ficha completa e origem: agora são obrigatórias
const fic = (nome, extra = {}) => ({ nome, telefone: '(21) 99999-' + String(1000 + ++n), email: `c${n}@x.com`, aniversario: '1990-01-01', ...extra });
const O = { origem: 'instagram' };

test('catálogo nasce com P3.9 e P5; produto novo digitado entra no catálogo', async () => {
  assert.deepEqual((await CO.produtos()).map((p) => p.nome), ['Painel P3.9', 'Painel P5']);
  const o = await CO.criarOrcamento({ ...O, cliente: fic('Cliente Teste'), produto_nome: 'Painel P2.5', valor: 1500000 });
  assert.equal(o.produto, 'Painel P2.5');
  assert.equal((await CO.produtos()).length, 3);
});

test('orçamento de cliente novo: ficha criada, follow-up em 3 dias, tipo novo', async () => {
  const o = await CO.criarOrcamento({ ...O, cliente: { nome: 'Maria Silva', telefone: '(21) 99999-1111', email: 'maria@x.com', aniversario: '1990-05-12' }, produto_nome: 'Painel P3.9', valor: 4500000 });
  assert.equal(o.cliente_tipo, 'novo');
  assert.equal(o.status, 'aberto');
  assert.equal(o.followup_em, S.addDias(hoje, 3));
  assert.equal(o.valor, 4500000);
});

test('"cliente já cadastrado?": busca por nome/telefone/e-mail e o segundo orçamento é recorrente', async () => {
  assert.equal((await CO.buscarClientes('maria'))[0].nome, 'Maria Silva');
  assert.equal((await CO.buscarClientes('99999-1111'))[0].nome, 'Maria Silva');
  assert.equal((await CO.buscarClientes('maria@x.com'))[0].nome, 'Maria Silva');
  const [m] = await CO.buscarClientes('maria');
  const o = await CO.criarOrcamento({ ...O, cliente_id: m.id, produto_nome: 'Painel P5', valor: 2000000 });
  assert.equal(o.cliente_tipo, 'recorrente');
  const ficha = await CO.cliente(m.id);
  assert.equal(ficha.qtd_orcamentos, 2);
  assert.equal(ficha.orcamentos.length, 2);
});

test('validações: valor, data futura, cliente ausente, produto ausente, e-mail', async () => {
  await assert.rejects(CO.criarOrcamento({ ...O, cliente: fic('X'), produto_nome: 'P', valor: -1 }), /Valor/);
  await assert.rejects(CO.criarOrcamento({ ...O, cliente: fic('X'), produto_nome: 'P', valor: 1, data: '2999-01-01' }), /futura/);
  await assert.rejects(CO.criarOrcamento({ ...O, produto_nome: 'P', valor: 1 }), /cliente/i);
  await assert.rejects(CO.criarOrcamento({ ...O, cliente: fic('X'), valor: 1 }), /produto/i);
  await assert.rejects(CO.criarOrcamento({ ...O, cliente: fic('X', { email: 'errado' }), produto_nome: 'P', valor: 1 }), /E-mail/);
});

test('aviso de follow-up só aparece 3 dias depois, e some ao registrar contato (adia mais 3 dias)', async () => {
  const antigo = await CO.criarOrcamento({ ...O, cliente: fic('Cliente Antigo'), produto_nome: 'Painel P5', valor: 800000, data: S.addDias(hoje, -3) });
  assert.equal(antigo.followup_em, hoje);
  let pend = await CO.followupsPendentes();
  assert.ok(pend.some((p) => p.id === antigo.id), 'orçamento de 3 dias atrás deve avisar hoje');
  assert.ok(!pend.some((p) => p.cliente_nome === 'Maria Silva'), 'orçamentos de hoje ainda não avisam');
  const r = await CO.registrarContato(antigo.id, { nota: 'Liguei, pediu mais prazo' }, null);
  assert.equal(r.followup_em, S.addDias(hoje, 3));
  assert.equal(r.qtd_contatos, 1);
  pend = await CO.followupsPendentes();
  assert.ok(!pend.some((p) => p.id === antigo.id));
  await assert.rejects(CO.registrarContato(antigo.id, { adiar_dias: 0 }, null), /prazo/);
  const adiado = await CO.adiar(antigo.id, 7);
  assert.equal(adiado.followup_em, S.addDias(hoje, 7));
});

test('ganho, perdido e cancelado (motivo obrigatório) saem dos avisos', async () => {
  const [a, b, c] = await Promise.all([1, 2, 3].map((i) => CO.criarOrcamento({ ...O, cliente: fic('Fechamento '), produto_nome: 'Painel P5', valor: 100000 * i, data: S.addDias(hoje, -5) })));
  assert.ok((await CO.followupsPendentes()).some((p) => p.id === a.id));
  await assert.rejects(CO.mudarStatus(b.id, { status: 'perdido' }, null), /motivo/);
  assert.equal((await CO.mudarStatus(a.id, { status: 'ganho' }, null)).status, 'ganho');
  assert.equal((await CO.mudarStatus(b.id, { status: 'perdido', motivo: 'Preço' }, null)).motivo, 'Preço');
  assert.equal((await CO.mudarStatus(c.id, { status: 'cancelado', motivo: 'Cliente desistiu' }, null)).status, 'cancelado');
  const ids = (await CO.followupsPendentes()).map((p) => p.id);
  for (const o of [a, b, c]) assert.ok(!ids.includes(o.id));
  await assert.rejects(CO.registrarContato(a.id, {}, null), /encerrado/);
  const reaberto = await CO.mudarStatus(c.id, { status: 'aberto' }, null);
  assert.equal(reaberto.motivo, null);
  assert.equal(reaberto.followup_em, S.addDias(hoje, 3));
});

test('painel ao vivo: dia, mês, produtos, motivos, novos x recorrentes e comparativos', async () => {
  const v = await CO.aoVivo();
  assert.ok(v.dia.qtd >= 3);
  assert.ok(v.mes_atual.qtd >= v.dia.qtd);
  assert.equal(v.mes_atual.qtd_ganho, 1);
  assert.equal(v.mes_atual.valor_ganho, 100000);
  assert.ok(v.mes_atual.clientes_recorrentes >= 1 && v.mes_atual.clientes_novos >= 3);
  assert.ok(v.produtos.some((p) => p.nome === 'Painel P5'));
  assert.ok(v.motivos.some((m) => m.motivo === 'Preço'));
  assert.equal(v.serie.length, 12);
  assert.equal(v.serie.at(-1).mes, hoje.slice(0, 7));
  assert.ok(v.comparativos.mes_anterior_total && v.comparativos.ano_anterior && v.comparativos.semestre_anterior);
  assert.ok(v.followups_pendentes >= 0 && v.em_aberto.qtd > 0);
});

test('perfis: comercial vê o ao vivo e trabalha orçamentos; sócio só vê; financeiro continua fechado ao comercial', () => {
  assert.ok(AREAS.comercial.includes('comercial') && AREAS.comercial.includes('aovivo'));
  assert.ok(AREAS.socio.includes('aovivo') && !AREAS.socio.includes('comercial'));
  assert.ok(!AREAS.comercial.includes('painel') && !AREAS.comercial.includes('lancar'));
  assert.ok(!AREAS.operador.includes('comercial'));
});

test('dados para o PDF dos sócios saem do comercial do mês', async () => {
  const d = await CO.dadosParaRelatorio(hoje.slice(0, 7));
  assert.ok(d.qtd >= 3 && d.qtd_ganho === 1 && d.qtd_perdido >= 1);
  assert.equal(await CO.dadosParaRelatorio('2001-01'), null);
});

test('painel comercial resume retornos, próximos retornos, hoje e aniversários', async () => {
  const mmdd = S.addDias(hoje, 5).slice(5);
  await CO.criarOrcamento({ ...O, cliente: fic('Aniversariante', { aniversario: `1988-${mmdd}` }), produto_nome: 'Painel P5', valor: 100000 });
  const d = await CO.painelComercial();
  assert.ok(d.retornos.length >= 0 && Array.isArray(d.proximos_retornos));
  assert.ok(d.proximos_retornos.some((o) => o.cliente_nome === 'Aniversariante'), 'orçamento de hoje aparece nos retornos dos próximos 7 dias');
  assert.ok(d.aniversarios.some((c) => c.nome === 'Aniversariante' && c.data === S.addDias(hoje, 5)));
  assert.ok(d.orcamentos_hoje.length >= 1 && d.em_aberto.qtd >= 1);
});

test('campos obrigatórios: origem, ficha completa do cliente e orçamento maior que zero', async () => {
  const base = { cliente: fic('Obrigatório'), produto_nome: 'Painel P5', valor: 100000 };
  await assert.rejects(CO.criarOrcamento({ ...base }), /origem do orçamento/);
  await assert.rejects(CO.criarOrcamento({ ...base, origem: 'outro' }), /qual a origem/);
  await assert.rejects(CO.criarOrcamento({ ...base, origem: 'inexistente' }), /Origem do orçamento inválida/);
  await assert.rejects(CO.criarOrcamento({ ...base, origem: 'site', valor: 0 }), /maior que zero/);
  await assert.rejects(CO.criarOrcamento({ ...base, origem: 'site', cliente: { nome: 'Só nome' } }), /telefone, e-mail, aniversário/);
  await assert.rejects(CO.criarOrcamento({ ...base, origem: 'site', cliente: fic('Tel curto', { telefone: '123' }) }), /telefone/);
  const ok = await CO.criarOrcamento({ ...base, origem: 'outro', origem_detalhe: 'Panfleto no shopping' });
  assert.equal(ok.origem, 'outro');
  assert.equal(ok.origem_detalhe, 'Panfleto no shopping');
});

test('cliente antigo com ficha incompleta: bloqueia o orçamento até completar, e completa na hora', async () => {
  const velho = (await query(`INSERT INTO clientes (nome) VALUES ('Cliente Antigo Incompleto') RETURNING id`))[0];
  await assert.rejects(CO.criarOrcamento({ ...O, cliente_id: velho.id, produto_nome: 'Painel P5', valor: 100000 }), /ficha deste cliente está incompleta/);
  const o = await CO.criarOrcamento({ ...O, cliente_id: velho.id, cliente: fic('Cliente Antigo Incompleto'), produto_nome: 'Painel P5', valor: 100000 });
  assert.equal(o.cliente_nome, 'Cliente Antigo Incompleto');
  assert.deepEqual(CO.faltasCliente(await CO.cliente(velho.id)), []);
});

test('opções do formulário trazem origens e campanhas ativas', async () => {
  const op = await CO.opcoes();
  assert.equal(op.origens.instagram, 'Instagram');
  assert.ok(op.produtos.length >= 2 && Array.isArray(op.campanhas));
});
