import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { seed } = await import('../src/seed.js');
const { iniciar, query, one } = await import('../src/db.js');
const S = await import('../src/services.js');
const CO = await import('../src/comercial.js');
const CB = await import('../src/cobranca.js');
const { AREAS } = await import('../src/auth.js');

await iniciar(seed);
const hoje = S.hoje();
let n = 0;
const fic = (nome) => ({ nome, telefone: '(21) 98888-' + String(2000 + ++n), email: `k${n}@x.com`, aniversario: '1990-01-01' });
const novo = (nome, valor = 1000000, extra = {}) => CO.criarOrcamento({ origem: 'instagram', cliente: fic(nome), produto_nome: 'Painel P5', valor, ...extra });

test('cadência comercial: 3, 7, 14 e 21 dias após o orçamento; depois do 4º contato a cadência termina', async () => {
  const o = await novo('Cadência', 500000, { data: S.addDias(hoje, -3) });
  const v = [7, 14, 21].map((d) => S.addDias(hoje, d - 3));
  let r = await CO.registrarContato(o.id, { nota: '1', canal: 'whatsapp', resultado: 'sem_resposta' }, null);
  assert.equal(r.followup_em, v[0]);
  assert.equal(r.qtd_contatos, 1);
  r = await CO.registrarContato(o.id, { nota: '2', canal: 'ligacao', resultado: 'sem_resposta' }, null);
  assert.equal(r.followup_em, v[1]);
  r = await CO.registrarContato(o.id, { nota: '3', canal: 'email', resultado: 'sem_resposta' }, null);
  assert.equal(r.followup_em, v[2]);
  r = await CO.registrarContato(o.id, { nota: '4', canal: 'whatsapp', resultado: 'sem_resposta' }, null);
  assert.equal(r.followup_em, null);
  assert.ok((await CO.cadenciaConcluida()).some((p) => p.id === o.id));
});

test('aprovar orçamento tira do follow-up comercial e manda para a cobrança do financeiro', async () => {
  const o = await novo('Aprovado');
  const g = await CO.mudarStatus(o.id, { status: 'ganho' }, null);
  assert.equal(g.followup_em, null);
  assert.ok(!(await CO.followupsPendentes()).some((p) => p.id === o.id));
  const l = await CB.listar();
  const c = l.find((x) => x.id === o.id);
  assert.equal(c.cobranca_status, 'a_cobrar');
  assert.equal(c.cobranca_followup_em, S.addDias(hoje, 1));
  assert.equal(c.saldo, 1000000);
  assert.ok(!(await CB.pendentes()).some((p) => p.id === o.id), 'só cobra a partir de amanhã');
});

test('cobrança: contatos avançam a régua e depois do 4º toque pede escalonamento', async () => {
  const o = await novo('Régua');
  await CO.mudarStatus(o.id, { status: 'ganho' }, null);
  let d;
  for (let i = 0; i < 4; i++) d = await CB.registrarContato(o.id, { nota: 'toque ' + i, canal: 'whatsapp', resultado: 'sem_resposta' }, null);
  assert.equal(d.cobranca_status, 'em_cobranca');
  assert.equal(d.qtd_cobrancas, 4);
  assert.equal(d.cobranca_followup_em, null);
  assert.equal(d.escalar, true);
  await assert.rejects(CB.registrarContato(o.id, { resultado: 'combinou_data' }, null), /data combinada/);
  d = await CB.registrarContato(o.id, { resultado: 'combinou_data', vencimento: S.addDias(hoje, 5) }, null);
  assert.equal(d.cobranca_followup_em, S.addDias(hoje, 5));
});

test('pagamento parcial e total: lança entrada no caixa e encerra a cobrança', async () => {
  const o = await novo('Paga', 1000000, { numero: 'PG-1' });
  await CO.mudarStatus(o.id, { status: 'ganho' }, null);
  const conta = await one('SELECT id FROM contas ORDER BY id LIMIT 1');
  await assert.rejects(CB.registrarPagamento(o.id, { valor: 100 }, null), /conta/);
  await assert.rejects(CB.registrarPagamento(o.id, { valor: 99999999, conta_id: conta.id }, null), /passa/);
  let d = await CB.registrarPagamento(o.id, { valor: 400000, conta_id: conta.id }, null);
  assert.equal(d.cobranca_status, 'em_cobranca');
  assert.equal(d.saldo, 600000);
  assert.equal(d.pagamentos.length, 1);
  const lanc = await one('SELECT * FROM lancamentos WHERE id = $1', [d.pagamentos[0].lancamento_id]);
  assert.equal(lanc.tipo, 'entrada');
  assert.equal(Number(lanc.valor), 400000);
  await assert.rejects(CO.mudarStatus(o.id, { status: 'cancelado', motivo: 'x' }, null), /pagamento/i);
  d = await CB.registrarPagamento(o.id, { valor: 600000, conta_id: conta.id }, null);
  assert.equal(d.cobranca_status, 'pago');
  assert.equal(d.cobranca_followup_em, null);
  assert.equal(d.saldo, 0);
  await assert.rejects(CB.registrarPagamento(o.id, { valor: 1, conta_id: conta.id }, null), /já está pago/);
  const r = await CB.resumo();
  assert.ok(Number(r.recebido_mes) >= 1000000);
});

test('permissões: financeiro e admin acessam a cobrança; comercial não', () => {
  assert.ok(AREAS.operador.includes('cobranca'));
  assert.ok(AREAS.admin.includes('cobranca'));
  assert.ok(!AREAS.comercial.includes('cobranca'));
  assert.ok(!AREAS.socio.includes('cobranca'));
});
