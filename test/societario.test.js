import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';

process.env.DB_PATH = ':memory:';
const { seed } = await import('../src/seed.js');
const { iniciar, query } = await import('../src/db.js');
const S = await import('../src/services.js');
const P = await import('../src/patrimonio.js');
const SO = await import('../src/societario.js');
const { gerarPdf } = await import('../src/relatorio.js');

await iniciar(seed);
const ids = {};
for (const c of await query('SELECT id, nome FROM contas')) ids['c:' + c.nome] = c.id;
for (const c of await query('SELECT id, nome FROM categorias')) ids['k:' + c.nome] = c.id;
for (const c of await query('SELECT id, nome FROM pessoas')) ids['p:' + c.nome] = c.id;
const lanc = (data, tipo, valor, conta, cat, extra = {}) => S.criarLancamento({ data, tipo, valor, conta_id: ids['c:' + conta], categoria_id: ids['k:' + cat], ...extra });

test('quadro societário nasce com Luiz Amaro 20% e sem presumir a parte do Luiz Túlio', async () => {
  const q = await SO.quadro();
  const amaro = q.socios.find((s) => s.nome === 'Luiz Amaro'), tulio = q.socios.find((s) => s.nome === 'Luiz Túlio');
  assert.equal(amaro.participacao_bp, 2000);
  assert.equal(amaro.aporte, 200000000);
  assert.equal(amaro.valor_implicito, 1000000000, 'R$ 2 mi por 20% => R$ 10 mi para 100%');
  assert.equal(tulio.participacao_bp, null);
  assert.deepEqual(q.sem_participacao, ['Luiz Túlio']);
  assert.equal(q.soma_bp, 2000);
});

test('não deixa as participações passarem de 100% nem repetir sócio', async () => {
  const q = await SO.quadro();
  const tulio = q.socios.find((s) => s.nome === 'Luiz Túlio');
  await assert.rejects(SO.salvarSocio(tulio.id, { nome: 'Luiz Túlio', participacao: 85 }), /passaria de 100%/);
  const ok = await SO.salvarSocio(tulio.id, { nome: 'Luiz Túlio', participacao: '80' });
  assert.equal(ok.participacao_bp, 8000);
  assert.equal((await SO.quadro()).soma_bp, 10000);
  await assert.rejects(SO.salvarSocio(null, { nome: 'Luiz Amaro', participacao: 0 }), /Já existe/);
  await assert.rejects(SO.salvarSocio(null, { nome: 'X', participacao: 120 }), /entre 0% e 100%/);
  await SO.salvarSocio(tulio.id, { nome: 'Luiz Túlio', participacao: null }); // volta ao estado "a confirmar"
});

test('patrimônio: usa o último mês informado quando o atual está vazio e calcula a variação dos ativos', async () => {
  assert.equal((await P.posicao('2026-08')).informado, false);
  await P.salvarItem(null, { mes: '2026-08', tipo: 'container', descricao: 'Container A — painéis P3.9', valor: 100000000, situacao: 'em_transito' }, { nome: 'Elisa' });
  await P.salvarItem(null, { mes: '2026-08', tipo: 'estoque', descricao: 'Estoque Rio', valor: 30000000 }, { nome: 'Elisa' });
  const set = await P.posicao('2026-09');
  assert.equal(set.defasado, true);
  assert.equal(set.mes_ref, '2026-08');
  assert.equal(set.total, 130000000);

  await P.copiarMes('2026-08', '2026-09');
  await assert.rejects(P.copiarMes('2026-08', '2026-09'), /já tem itens/);
  const itens = await P.itensDoMes('2026-09');
  await P.salvarItem(null, { mes: '2026-09', tipo: 'container', descricao: 'Container B', valor: 120000000 }, { nome: 'Elisa' });
  await P.salvarItem(itens[1].id, { ...itens[1], valor: 20000000 }, { nome: 'Elisa' }); // estoque caiu 10 mi

  // mês de caixa negativo, mas com ativos subindo: o resultado econômico mostra a diferença
  await lanc('2026-09-03', 'entrada', 50000000, 'Banco Safra', 'Recebimento de cliente');
  await lanc('2026-09-04', 'saida', 90000000, 'Banco Safra', 'Outras despesas'); // pagou o container B
  const painel = await S.painelMes('2026-09');
  assert.equal(painel.resultado, -40000000);
  const r = await P.resumoPainel('2026-09', painel);
  assert.equal(r.total, 100000000 + 20000000 + 120000000);
  assert.equal(r.variacao_ativos, 240000000 - 130000000);
  assert.equal(r.resultado_economico, -40000000 + 110000000);

  await assert.rejects(P.salvarItem(null, { mes: '2026-09', tipo: 'barco', descricao: 'x', valor: 1 }), /Tipo inválido/);
  await assert.rejects(P.salvarItem(null, { mes: '2026-09', tipo: 'estoque', descricao: '', valor: 1 }), /Descreva/);
  await assert.rejects(P.salvarItem(null, { mes: '2026-09', tipo: 'estoque', descricao: 'x', valor: -5 }), /valor/);
});

async function pdfDe(mes, socioId) {
  const d = await SO.dadosRelatorio(mes, socioId, { nome: 'Elisa Maria' });
  const partes = [];
  await new Promise((ok, erro) => {
    const w = new Writable({ write(c, _e, cb) { partes.push(c); cb(); } });
    w.on('finish', ok).on('error', erro);
    gerarPdf(d, w);
  });
  return { d, buf: Buffer.concat(partes) };
}

test('relatório mensal dos sócios: dados, alertas e PDF válido', async () => {
  await lanc('2026-09-05', 'saida', 1680000, 'LTON', 'Distribuição de lucros', { pessoa_id: ids['p:Luiz Amaro'] });
  await SO.salvarNota('2026-09', 'Mês de compra de containers; caixa apertado por escolha.', { nome: 'Elisa Maria' });
  const { d, buf } = await pdfDe('2026-09');
  assert.equal(d.rotulo, 'Setembro de 2026');
  assert.equal(d.atual.entradas, 50000000);
  assert.equal(d.serie.length, 6);
  assert.equal(d.serie.at(-1).mes, '2026-09');
  assert.equal(d.patrimonio.total, 240000000);
  assert.ok(d.alertas.some((a) => /resultado de caixa do mês foi negativo, mas os ativos/.test(a)));
  assert.ok(d.alertas.some((a) => /sem fechamento/.test(a)), 'dias sem fechamento tornam o relatório provisório');
  assert.equal(d.nota, 'Mês de compra de containers; caixa apertado por escolha.');
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buf.length > 4000);
  assert.match(buf.toString('latin1'), /%%EOF/);
});

test('relatório individual traz a parte do sócio', async () => {
  const amaro = (await SO.quadro()).socios.find((s) => s.nome === 'Luiz Amaro');
  const { d, buf } = await pdfDe('2026-09', amaro.id);
  assert.equal(d.socio.nome, 'Luiz Amaro');
  assert.equal(d.socio.pct, 20);
  assert.equal(d.socio.parte_resultado, Math.round(-41680000 * 0.2))  // inclui a distribuição de R$ 16.800 lançada no teste anterior;
  assert.equal(d.socio.recebido[0].categoria, 'Distribuição de lucros');
  assert.equal(d.socio.recebido[0].total, 1680000);
  assert.ok(buf.length > 4000);
  await assert.rejects(SO.dadosRelatorio('2026-09', 99999, {}), /não encontrado/);
  await assert.rejects(SO.dadosRelatorio('setembro', null, {}), /Mês inválido/);
});

test('mês sem nenhum dado também gera o PDF', async () => {
  const { d, buf } = await pdfDe('2025-01');
  assert.equal(d.atual.entradas, 0);
  assert.ok(d.alertas.some((a) => /não foram informados/.test(a)));
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
});
