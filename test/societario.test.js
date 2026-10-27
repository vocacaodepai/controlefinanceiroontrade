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

test('quadro societário nasce com Luiz Amaro 20% e Luiz Túlio com o restante (80%)', async () => {
  const q = await SO.quadro();
  const amaro = q.socios.find((s) => s.nome === 'Luiz Amaro'), tulio = q.socios.find((s) => s.nome === 'Luiz Túlio');
  assert.equal(amaro.participacao_bp, 2000);
  assert.equal(amaro.aporte, 200000000);
  assert.equal(amaro.valor_implicito, 1000000000, 'R$ 2 mi por 20% => R$ 10 mi para 100%');
  assert.equal(tulio.participacao_bp, 8000);
  assert.deepEqual(q.sem_participacao, []);
  assert.equal(q.soma_bp, 10000);
  assert.ok(!q.socios.some((s) => s.nome === 'Elisa Maria'), 'Elisa Maria não é sócia');
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

test('patrimônio: visão geral + filtro por mês de entrada, baixa e variação dos ativos', async () => {
  assert.equal((await P.posicao('2026-08')).informado, false);
  assert.equal((await P.geral()).informado, false);
  await P.salvarItem(null, { mes: '2026-08', tipo: 'container', descricao: 'Container A — painéis P3.9', valor: 100000000, situacao: 'em_transito' }, { nome: 'Elisa' });
  const est = await P.salvarItem(null, { mes: '2026-08', tipo: 'estoque', descricao: 'Estoque Rio', valor: 30000000 }, { nome: 'Elisa' });
  // o item continua sendo da empresa nos meses seguintes, sem copiar nada
  const set = await P.posicao('2026-09');
  assert.equal(set.defasado, false);
  assert.equal(set.total, 130000000);
  await P.salvarItem(null, { mes: '2026-09', tipo: 'container', descricao: 'Container B', valor: 120000000 }, { nome: 'Elisa' });
  await P.salvarItem(est.id, { ...est, valor: 20000000 }, { nome: 'Elisa' }); // estoque caiu 10 mi
  assert.equal((await P.itensDoMes('2026-09')).length, 1, 'filtro por mês mostra só o que entrou nele');
  const g = await P.geral();
  assert.equal(g.total, 240000000); assert.equal(g.itens.length, 3); assert.equal(g.total_container, 220000000);

  // mês de caixa negativo, mas com ativos subindo: o resultado econômico mostra a diferença
  await lanc('2026-09-03', 'entrada', 50000000, 'Banco Safra', 'Recebimento de cliente');
  await lanc('2026-09-04', 'saida', 90000000, 'Banco Safra', 'Outras despesas'); // pagou o container B
  const painel = await S.painelMes('2026-09');
  assert.equal(painel.resultado, -40000000);
  const r = await P.resumoPainel('2026-09', painel);
  assert.equal(r.total, 240000000);
  assert.equal(r.variacao_ativos, 240000000 - 120000000); // 2026-08 ficou em 100 + 20
  assert.equal(r.resultado_economico, -40000000 + 120000000);

  // baixa: sai do geral, continua no histórico; não vale antes da entrada
  const a = (await P.itensDoMes('2026-08'))[0];
  await assert.rejects(P.baixar(a.id, { mes: '2026-07' }), /antes do mês de entrada/);
  await P.baixar(a.id, { mes: '2026-10' });
  assert.equal((await P.geral()).total, 240000000 - a.valor);
  assert.equal((await P.posicao('2026-09')).total, 240000000, 'em setembro ainda era da empresa');
  assert.equal((await P.itensBaixados()).length >= 1, true);
  await P.baixar(a.id, { desfazer: true });
  assert.equal((await P.geral()).total, 240000000);

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

test('patrimônio: carro e "outro" (com o que é) entram nos totais; "outro" exige descrição do tipo', async () => {
  const mes = '2031-04';
  await assert.rejects(P.salvarItem(null, { mes, tipo: 'outro', descricao: 'Algo', valor: 100 }, null), /o que é/);
  const c = await P.salvarItem(null, { mes, tipo: 'carro', descricao: 'Fiorino da empresa', valor: 5000000 }, null);
  const o = await P.salvarItem(null, { mes, tipo: 'outro', tipo_outro: 'Máquina de corte', descricao: 'Máquina serra', valor: 3000000 }, null);
  assert.equal(c.tipo, 'carro'); assert.equal(o.tipo_outro, 'Máquina de corte');
  const antes = await P.posicao('2031-03'), pos = await P.posicao(mes);
  assert.equal(pos.total_carro - antes.total_carro, 5000000); assert.equal(pos.total_outro - antes.total_outro, 3000000); assert.equal(pos.total - antes.total, 8000000);
  assert.equal(P.rotuloTipo(o), 'Outro: Máquina de corte');
  const e = await P.salvarItem(c.id, { mes, tipo: 'carro', descricao: 'Fiorino', valor: 4000000 }, null);
  assert.equal(e.tipo_outro, null);
  await assert.rejects(P.salvarItem(null, { mes, tipo: 'moto', descricao: 'x', valor: 1 }, null), /Tipo inválido/);
});

test('patrimônio: situação "outro" exige texto e chegada pode ser "não se aplica"', async () => {
  const mes = '2031-05';
  await assert.rejects(P.salvarItem(null, { mes, tipo: 'carro', descricao: 'Carro', valor: 100, situacao: 'outro' }, null), /situação/i);
  const a = await P.salvarItem(null, { mes, tipo: 'carro', descricao: 'Carro', valor: 100, situacao: 'outro', situacao_outro: 'Em uso', chegada_nao_se_aplica: '1', previsao_chegada: '2031-06-01' }, null);
  assert.equal(a.situacao_outro, 'Em uso'); assert.equal(a.chegada_nao_se_aplica, 1); assert.equal(a.previsao_chegada, null);
  assert.equal(P.rotuloSituacao(a), 'Outro: Em uso');
  const b = await P.salvarItem(null, { mes, tipo: 'container', descricao: 'Cont', valor: 100, previsao_chegada: '2031-07-01' }, null);
  assert.equal(b.chegada_nao_se_aplica, 0); assert.equal(String(b.previsao_chegada).slice(0, 10), '2031-07-01');
  const c = await P.salvarItem(null, { mes, tipo: 'estoque', descricao: 'Est', valor: 100, situacao: 'em_estoque', situacao_outro: 'lixo' }, null);
  assert.equal(c.situacao_outro, null);
});

test('patrimônio: valor inicial, avaliações de mercado e variação (valorização/desvalorização) ao longo dos meses', async () => {
  const mes = '2032-01';
  const it = await P.salvarItem(null, { mes, tipo: 'carro', descricao: 'RAM', valor: 22000000 }, { nome: 'Elisa' });
  assert.equal(it.valor_inicial, 22000000); assert.equal(it.valor, 22000000);
  await assert.rejects(P.avaliar(it.id, { mes: '2031-12', valor: 1 }, null), /antes do mês de entrada/);
  await assert.rejects(P.avaliar(it.id, { mes, valor: -5 }, null), /valor de mercado/);
  await P.avaliar(it.id, { mes: '2032-03', valor: 21000000, obs: 'FIPE' }, { nome: 'Elisa' });
  const h = await P.avaliar(it.id, { mes: '2032-06', valor: 22500000 }, { nome: 'Elisa' });
  assert.equal(h.item.valor, 22500000); assert.equal(h.item.variacao, 500000);
  assert.equal(h.avaliacoes[0].mes, '2032-06'); assert.equal(h.avaliacoes[0].variacao_anterior, 1500000); assert.equal(h.avaliacoes[1].variacao_inicial, -1000000);
  // a posição de cada mês usa a avaliação vigente naquele mês
  const val = async (m) => (await P.posicao(m)).itens.find((x) => x.id === it.id).valor;
  assert.equal(await val('2032-01'), 22000000); assert.equal(await val('2032-04'), 21000000); assert.equal(await val('2032-07'), 22500000);
  const g = await P.geral();
  assert.ok(g.total_variacao >= 500000 && g.total_inicial > 0);
  // editar o valor inicial não mexe no valor atual quando já há avaliação
  const e = await P.salvarItem(it.id, { mes, tipo: 'carro', descricao: 'RAM', valor: 20000000 }, null);
  assert.equal(e.valor_inicial, 20000000); assert.equal(e.valor, 22500000);
});
