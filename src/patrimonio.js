// Patrimônio em ativos (containers e estoque): valores informados mês a mês, para o painel e para o relatório dos sócios.
// É uma visão GERENCIAL (não contábil): serve para mostrar que um mês de caixa negativo pode ter virado ativo.
import { query, one } from './db.js';
import { ErroNegocio, isMes, intervaloMes } from './services.js';

export const TIPOS = { container: 'Container', estoque: 'Estoque' };
export const SITUACOES = { em_transito: 'Em trânsito (no mar)', no_porto: 'No porto / desembaraço', em_estoque: 'Em estoque', outro: 'Outro' };

export const mesAnterior = (mes) => {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
};
export const mesDoAnoAnterior = (mes) => `${Number(mes.slice(0, 4)) - 1}-${mes.slice(5)}`;

export const itensDoMes = (mes) => query('SELECT * FROM patrimonio_itens WHERE mes = $1 ORDER BY tipo, id', [mes]);

// Posição de um mês. Se o mês não tem lançamento de ativos, usa o último mês anterior que tenha (e avisa).
export async function posicao(mes) {
  let ref = mes;
  let itens = await itensDoMes(mes);
  if (!itens.length) {
    const ult = await one('SELECT MAX(mes) AS mes FROM patrimonio_itens WHERE mes < $1', [mes]);
    if (!ult?.mes) return { mes_ref: null, defasado: false, itens: [], total_container: 0, total_estoque: 0, total: 0, informado: false };
    ref = ult.mes; itens = await itensDoMes(ref);
  }
  const soma = (t) => itens.filter((i) => i.tipo === t).reduce((a, i) => a + i.valor, 0);
  return { mes_ref: ref, defasado: ref !== mes, itens, total_container: soma('container'), total_estoque: soma('estoque'), total: itens.reduce((a, i) => a + i.valor, 0), informado: true };
}

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
  if (!Object.hasOwn(TIPOS, b.tipo)) throw new ErroNegocio('Tipo inválido (container ou estoque).');
  if (!b.descricao?.trim()) throw new ErroNegocio('Descreva o item (ex.: Container MSKU 123 — painéis P3.9).');
  const valor = Math.round(Number(b.valor));
  if (!Number.isFinite(valor) || valor < 0) throw new ErroNegocio('Informe o valor do item.');
  const situacao = b.situacao || (b.tipo === 'estoque' ? 'em_estoque' : 'em_transito');
  if (!Object.hasOwn(SITUACOES, situacao)) throw new ErroNegocio('Situação inválida.');
  const prev = b.previsao_chegada || null;
  if (prev && !/^\d{4}-\d{2}-\d{2}$/.test(prev)) throw new ErroNegocio('Data de chegada inválida.');
  return [b.mes, b.tipo, b.descricao.trim().slice(0, 200), valor, situacao, prev, b.obs?.trim() || null];
}

export async function salvarItem(id, b, usuario) {
  const v = validar(b);
  if (id) {
    const r = await one(`UPDATE patrimonio_itens SET mes=$1,tipo=$2,descricao=$3,valor=$4,situacao=$5,previsao_chegada=$6,obs=$7 WHERE id=$8 RETURNING *`, [...v, id]);
    if (!r) throw new ErroNegocio('Item não encontrado.', 404);
    return r;
  }
  return one(`INSERT INTO patrimonio_itens (mes,tipo,descricao,valor,situacao,previsao_chegada,obs,criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [...v, usuario?.nome || null]);
}

export async function excluirItem(id) {
  const r = await one('DELETE FROM patrimonio_itens WHERE id = $1 RETURNING id', [id]);
  if (!r) throw new ErroNegocio('Item não encontrado.', 404);
}

// Atalho de fim de mês: traz os itens do mês anterior para o mês escolhido, para só ajustar os valores.
export async function copiarMes(de, para) {
  if (!isMes(de) || !isMes(para) || de === para) throw new ErroNegocio('Meses inválidos.');
  if ((await itensDoMes(para)).length) throw new ErroNegocio('Este mês já tem itens. Edite-os ou exclua antes de copiar.', 409);
  const origem = await itensDoMes(de);
  if (!origem.length) throw new ErroNegocio('O mês de origem não tem itens.');
  for (const i of origem) {
    await query(`INSERT INTO patrimonio_itens (mes,tipo,descricao,valor,situacao,previsao_chegada,obs,criado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [para, i.tipo, i.descricao, i.valor, i.situacao, i.previsao_chegada, i.obs, i.criado_por]);
  }
  return origem.length;
}
export { intervaloMes };
