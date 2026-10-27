// Patrimônio em ativos (containers e estoque): valores informados mês a mês, para o painel e para o relatório dos sócios.
// É uma visão GERENCIAL (não contábil): serve para mostrar que um mês de caixa negativo pode ter virado ativo.
import { query, one } from './db.js';
import { ErroNegocio, isMes, intervaloMes, hoje } from './services.js';

export const TIPOS = { container: 'Container', estoque: 'Estoque', carro: 'Carro', outro: 'Outro' };
// Nome do tipo para exibir: "Outro" mostra o que o usuário escreveu
export const rotuloTipo = (i) => (i.tipo === 'outro' && i.tipo_outro ? `Outro: ${i.tipo_outro}` : TIPOS[i.tipo] || i.tipo);
export const SITUACOES = { em_transito: 'Em trânsito (no mar)', no_porto: 'No porto / desembaraço', em_estoque: 'Em estoque', outro: 'Outro' };

// Situação para exibir: "Outro" mostra o que o usuário escreveu
export const rotuloSituacao = (i) => (i.situacao === 'outro' && i.situacao_outro ? `Outro: ${i.situacao_outro}` : SITUACOES[i.situacao] || i.situacao);

export const mesAnterior = (mes) => {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
};
export const mesDoAnoAnterior = (mes) => `${Number(mes.slice(0, 4)) - 1}-${mes.slice(5)}`;

// Cada item "entra" em um mês (coluna mes) e continua sendo da empresa até a baixa (vendido, baixado ou perdido).
export const itensDoMes = async (mes) => (await query('SELECT * FROM patrimonio_itens WHERE mes = $1 ORDER BY tipo, id', [mes])).map(comVariacao);          // o que entrou neste mês
export const itensAtivos = async () => (await query('SELECT * FROM patrimonio_itens WHERE baixa_mes IS NULL ORDER BY mes DESC, tipo, id')).map(comVariacao);   // patrimônio geral hoje
export const itensBaixados = async () => (await query('SELECT * FROM patrimonio_itens WHERE baixa_mes IS NOT NULL ORDER BY baixa_mes DESC, id')).map(comVariacao);

// valor = valor atual (última avaliação) ou o inicial; variação = quanto valorizou (+) ou desvalorizou (−) desde a entrada
const comVariacao = (i) => ({ ...i, valor_inicial: i.valor_inicial ?? i.valor, variacao: i.valor - (i.valor_inicial ?? i.valor) });
const totais = (itens) => {
  const soma = (t) => itens.filter((i) => i.tipo === t).reduce((a, i) => a + i.valor, 0);
  const total = itens.reduce((a, i) => a + i.valor, 0), inicial = itens.reduce((a, i) => a + (i.valor_inicial ?? i.valor), 0);
  return { total_container: soma('container'), total_estoque: soma('estoque'), total_carro: soma('carro'), total_outro: soma('outro'), total, total_inicial: inicial, total_variacao: total - inicial };
};

// Patrimônio geral hoje: tudo o que entrou e ainda não teve baixa
export async function geral() {
  const itens = await itensAtivos();
  return { itens, ...totais(itens), informado: itens.length > 0 };
}

// Posição ao fim de um mês: o que já tinha entrado até lá e ainda não tinha baixa
export async function posicao(mes) {
  // cada item vale, naquele mês, a última avaliação até então (ou o valor inicial, se ainda não houve avaliação)
  const itens = (await query(`SELECT i.*, coalesce((SELECT a.valor FROM patrimonio_avaliacoes a WHERE a.item_id = i.id AND a.mes <= $1 ORDER BY a.mes DESC, a.id DESC LIMIT 1), i.valor_inicial, i.valor) AS valor_no_mes
    FROM patrimonio_itens i WHERE i.mes <= $1 AND (i.baixa_mes IS NULL OR i.baixa_mes > $1) ORDER BY i.mes, i.tipo, i.id`, [mes])).map(({ valor_no_mes, ...i }) => comVariacao({ ...i, valor: Number(valor_no_mes) }));
  return { mes_ref: mes, defasado: false, itens, ...totais(itens), informado: itens.length > 0 };
}

// Meses em que entrou algum item (para o filtro da tela)
export const mesesComItens = async () => (await query('SELECT DISTINCT mes FROM patrimonio_itens ORDER BY mes DESC')).map((r) => r.mes);

// Baixa (vendido, baixado, perdido) ou desfazer a baixa
export async function baixar(id, { mes, desfazer } = {}) {
  const i = await one('SELECT * FROM patrimonio_itens WHERE id = $1', [id]);
  if (!i) throw new ErroNegocio('Item não encontrado.', 404);
  if (desfazer) { await query('UPDATE patrimonio_itens SET baixa_mes = NULL WHERE id = $1', [id]); return one('SELECT * FROM patrimonio_itens WHERE id = $1', [id]); }
  const m = mes || hojeMes();
  if (!isMes(m)) throw new ErroNegocio('Mês da baixa inválido.');
  if (m < i.mes) throw new ErroNegocio('A baixa não pode ser antes do mês de entrada.');
  await query('UPDATE patrimonio_itens SET baixa_mes = $2 WHERE id = $1', [id, m]);
  return one('SELECT * FROM patrimonio_itens WHERE id = $1', [id]);
}
const hojeMes = () => hoje().slice(0, 7);

// Quadro do painel: caixa x ativos
export async function resumoPainel(mes, painel) {
  const atual = await posicao(mes);
  const anterior = await posicao(mesAnterior(mes));
  const saldoContas = (painel.saldo_dia?.contas || []).reduce((a, c) => a + c.saldo, 0);
  const variacao = atual.informado && anterior.informado ? atual.total - anterior.total : null;
  return {
    ...atual,
    ativos_anterior: anterior.informado ? anterior.total : null,
    variacao_ativos: variacao,
    saldo_contas: saldoContas,
    posicao_total: saldoContas + atual.total,
    // resultado de caixa + quanto os ativos cresceram no mês: mostra o mês "com os containers rodando"
    resultado_economico: variacao === null ? null : painel.resultado + variacao,
  };
}

function validar(b) {
  if (!isMes(b.mes)) throw new ErroNegocio('Mês inválido.');
  if (!Object.hasOwn(TIPOS, b.tipo)) throw new ErroNegocio('Tipo inválido (container, estoque, carro ou outro).');
  const tipoOutro = b.tipo === 'outro' ? String(b.tipo_outro || '').trim().slice(0, 60) : null;
  if (b.tipo === 'outro' && !tipoOutro) throw new ErroNegocio('Escreva o que é este "outro" (ex.: máquina, terreno, equipamento).');
  if (!b.descricao?.trim()) throw new ErroNegocio('Descreva o item (ex.: Container MSKU 123 — painéis P3.9).');
  const valor = Math.round(Number(b.valor));
  if (!Number.isFinite(valor) || valor < 0) throw new ErroNegocio('Informe o valor do item.');
  const situacao = b.situacao || (b.tipo === 'estoque' ? 'em_estoque' : b.tipo === 'container' ? 'em_transito' : 'outro');
  if (!Object.hasOwn(SITUACOES, situacao)) throw new ErroNegocio('Situação inválida.');
  const situacaoOutro = situacao === 'outro' ? String(b.situacao_outro || (b.situacao ? '' : 'Em uso')).trim().slice(0, 60) : null;
  if (situacao === 'outro' && !situacaoOutro) throw new ErroNegocio('Escreva qual é a situação (ex.: em uso, em manutenção, à venda).');
  const semChegada = b.chegada_nao_se_aplica === true || b.chegada_nao_se_aplica === 1 || b.chegada_nao_se_aplica === '1' || b.chegada_nao_se_aplica === 'on' ? 1 : 0;
  const prev = semChegada ? null : b.previsao_chegada || null;
  if (prev && !/^\d{4}-\d{2}-\d{2}$/.test(prev)) throw new ErroNegocio('Data de chegada inválida.');
  return [b.mes, b.tipo, b.descricao.trim().slice(0, 200), valor, situacao, prev, b.obs?.trim() || null, tipoOutro, situacaoOutro, semChegada];
}

export async function salvarItem(id, b, usuario) {
  const v = validar(b);
  if (id) {
    // o valor digitado aqui é o valor inicial (custo); o valor atual só muda por avaliação, ou acompanha o inicial se ainda não houve nenhuma
    const r = await one(`UPDATE patrimonio_itens SET mes=$1,tipo=$2,descricao=$3,valor_inicial=$4,valor=CASE WHEN EXISTS (SELECT 1 FROM patrimonio_avaliacoes a WHERE a.item_id = $11) THEN valor ELSE $4 END,situacao=$5,previsao_chegada=$6,obs=$7,tipo_outro=$8,situacao_outro=$9,chegada_nao_se_aplica=$10 WHERE id=$11 RETURNING *`, [...v, id]);
    if (!r) throw new ErroNegocio('Item não encontrado.', 404);
    return r;
  }
  return one(`INSERT INTO patrimonio_itens (mes,tipo,descricao,valor,valor_inicial,situacao,previsao_chegada,obs,tipo_outro,situacao_outro,chegada_nao_se_aplica,criado_por) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [...v, usuario?.nome || null]);
}

// Avaliação de mercado: valor do ativo em um mês. O valor atual do item passa a ser o da avaliação mais recente.
export async function avaliar(id, { mes, valor, obs }, usuario) {
  const i = await one('SELECT id, mes FROM patrimonio_itens WHERE id = $1', [id]);
  if (!i) throw new ErroNegocio('Item não encontrado.', 404);
  if (!isMes(mes)) throw new ErroNegocio('Mês da avaliação inválido.');
  if (mes < i.mes) throw new ErroNegocio('A avaliação não pode ser antes do mês de entrada do item.');
  const v = Math.round(Number(valor));
  if (!Number.isFinite(v) || v < 0) throw new ErroNegocio('Informe o valor de mercado.');
  await query('INSERT INTO patrimonio_avaliacoes (item_id, mes, valor, obs, criado_por) VALUES ($1,$2,$3,$4,$5)', [id, mes, v, b2(obs), usuario?.nome || null]);
  const ult = await one('SELECT valor FROM patrimonio_avaliacoes WHERE item_id = $1 ORDER BY mes DESC, id DESC LIMIT 1', [id]);
  await query('UPDATE patrimonio_itens SET valor = $2 WHERE id = $1', [id, ult.valor]);
  return historico(id);
}
const b2 = (t) => (t == null || String(t).trim() === '' ? null : String(t).trim());

// Histórico do ativo: valor inicial e cada avaliação, com a variação em relação ao valor inicial e à avaliação anterior
export async function historico(id) {
  const i = await one('SELECT * FROM patrimonio_itens WHERE id = $1', [id]);
  if (!i) throw new ErroNegocio('Item não encontrado.', 404);
  const ini = i.valor_inicial ?? i.valor;
  let ant = ini;
  const av = (await query('SELECT * FROM patrimonio_avaliacoes WHERE item_id = $1 ORDER BY mes, id', [id])).map((a) => { const o = { ...a, variacao_inicial: a.valor - ini, variacao_anterior: a.valor - ant }; ant = a.valor; return o; });
  return { item: comVariacao(i), avaliacoes: av.reverse() };
}

export async function excluirItem(id) {
  const r = await one('DELETE FROM patrimonio_itens WHERE id = $1 RETURNING id', [id]);
  if (!r) throw new ErroNegocio('Item não encontrado.', 404);
}

export { intervaloMes };
