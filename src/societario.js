// Quadro societário e dados do relatório mensal dos sócios.
import { query, one } from './db.js';
import { ErroNegocio, isMes, painelMes, hoje, intervaloMes, MESES } from './services.js';
import * as P from './patrimonio.js';

export const rotuloMes = (mes) => `${MESES[Number(mes.slice(5)) - 1].replace(/^./, (c) => c.toUpperCase())} de ${mes.slice(0, 4)}`;

// ---------- sócios ----------
export const listarSocios = () => query('SELECT * FROM socios ORDER BY ativo DESC, participacao_bp DESC NULLS LAST, nome');

export async function quadro() {
  const socios = await listarSocios();
  const ativos = socios.filter((s) => s.ativo);
  const soma = ativos.reduce((a, s) => a + (s.participacao_bp || 0), 0);
  return {
    socios: socios.map((s) => ({
      ...s,
      // referência: quanto vale 100% da empresa se o aporte pagou exatamente essa participação
      valor_implicito: s.aporte > 0 && s.participacao_bp > 0 ? Math.round(s.aporte / (s.participacao_bp / 10000)) : null,
    })),
    soma_bp: soma,
    sem_participacao: ativos.filter((s) => s.participacao_bp == null).map((s) => s.nome),
  };
}

function lerSocio(b) {
  if (!b.nome?.trim()) throw new ErroNegocio('Informe o nome do sócio.');
  let bp = null;
  if (b.participacao !== undefined && b.participacao !== null && b.participacao !== '') {
    const pct = Number(String(b.participacao).replace(',', '.'));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new ErroNegocio('Participação deve estar entre 0% e 100%.');
    bp = Math.round(pct * 100);
  }
  const aporte = Math.round(Number(b.aporte ?? 0));
  if (!Number.isFinite(aporte) || aporte < 0) throw new ErroNegocio('Aporte inválido.');
  if (b.data_entrada && !/^\d{4}-\d{2}-\d{2}$/.test(b.data_entrada)) throw new ErroNegocio('Data de entrada inválida.');
  return { nome: b.nome.trim(), documento: b.documento?.trim() || null, bp, aporte, data_entrada: b.data_entrada || null, obs: b.obs?.trim() || null, ativo: b.ativo === 0 || b.ativo === false ? 0 : 1 };
}

export async function salvarSocio(id, b) {
  const s = lerSocio(b);
  const outros = await query('SELECT participacao_bp FROM socios WHERE ativo = 1 AND ($1::bigint IS NULL OR id <> $1)', [id]);
  const soma = outros.reduce((a, o) => a + (o.participacao_bp || 0), 0) + (s.ativo ? s.bp || 0 : 0);
  if (soma > 10000) throw new ErroNegocio(`A soma das participações passaria de 100% (ficaria ${(soma / 100).toFixed(2).replace('.', ',')}%).`);
  try {
    if (id) {
      const r = await one(`UPDATE socios SET nome=$1,documento=$2,participacao_bp=$3,aporte=$4,data_entrada=$5,obs=$6,ativo=$7 WHERE id=$8 RETURNING *`, [s.nome, s.documento, s.bp, s.aporte, s.data_entrada, s.obs, s.ativo, id]);
      if (!r) throw new ErroNegocio('Sócio não encontrado.', 404);
      return r;
    }
    return await one(`INSERT INTO socios (nome,documento,participacao_bp,aporte,data_entrada,obs,ativo) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [s.nome, s.documento, s.bp, s.aporte, s.data_entrada, s.obs, s.ativo]);
  } catch (e) {
    if (e.code === '23505') throw new ErroNegocio('Já existe um sócio com este nome.', 409);
    throw e;
  }
}

// ---------- observação da administração (texto livre que entra no PDF) ----------
export const nota = async (mes) => (await one('SELECT texto FROM relatorio_notas WHERE mes = $1', [mes]))?.texto || '';
export async function salvarNota(mes, texto, usuario) {
  if (!isMes(mes)) throw new ErroNegocio('Mês inválido.');
  await query(`INSERT INTO relatorio_notas (mes, texto, atualizado_por) VALUES ($1,$2,$3)
    ON CONFLICT (mes) DO UPDATE SET texto = EXCLUDED.texto, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = (now() AT TIME ZONE 'America/Sao_Paulo')`,
  [mes, String(texto || '').slice(0, 3000), usuario?.nome || null]);
}

// ---------- séries e movimentos ----------
export async function serieMensal(mes, n = 6) {
  const meses = [mes];
  while (meses.length < n) meses.unshift(P.mesAnterior(meses[0]));
  const rows = await query(`SELECT to_char(data, 'YYYY-MM') AS mes,
      SUM(CASE WHEN tipo='entrada' THEN valor ELSE 0 END) AS entradas,
      SUM(CASE WHEN tipo='saida' THEN valor ELSE 0 END) AS saidas
    FROM lancamentos WHERE data >= $1 AND data <= $2 GROUP BY 1`, [`${meses[0]}-01`, intervaloMes(mes).ate]);
  const por = Object.fromEntries(rows.map((r) => [r.mes, r]));
  return meses.map((m) => ({ mes: m, entradas: por[m]?.entradas || 0, saidas: por[m]?.saidas || 0, resultado: (por[m]?.entradas || 0) - (por[m]?.saidas || 0) }));
}

// Distribuição de lucros e pró-labore pagos a pessoas (casando pelo nome com o sócio)
export const movimentosSocios = (mes) => {
  const { de, ate } = intervaloMes(mes);
  return query(`SELECT p.nome AS pessoa, k.nome AS categoria, SUM(l.valor) AS total
    FROM lancamentos l JOIN categorias k ON k.id = l.categoria_id JOIN pessoas p ON p.id = l.pessoa_id
    WHERE l.tipo = 'saida' AND k.nome IN ('Distribuição de lucros','Pró-labore') AND l.data BETWEEN $1 AND $2
    GROUP BY p.nome, k.nome ORDER BY p.nome, k.nome`, [de, ate]);
};

const resumo = (p) => p && ({ entradas: p.entradas, entradas_com_nota: p.entradas_com_nota, entradas_sem_nota: p.entradas_sem_nota, saidas: p.saidas, resultado: p.resultado, qtd: p.qtd_lancamentos });

// ---------- tudo que entra no PDF ----------
export async function dadosRelatorio(mes, socioId, usuario) {
  if (!isMes(mes)) throw new ErroNegocio('Mês inválido.');
  const [p, pAnt, pAno, serie, q, mov, texto] = await Promise.all([
    painelMes(mes), painelMes(P.mesAnterior(mes)), painelMes(P.mesDoAnoAnterior(mes)), serieMensal(mes, 6),
    quadro(), movimentosSocios(mes), nota(mes),
  ]);
  const patrimonio = await P.resumoPainel(mes, p);
  const contas = p.saldo_dia.contas;
  const saldoTotal = contas.reduce((a, c) => a + c.saldo, 0);
  const parcial = hoje() < intervaloMes(mes).ate; // no último dia do mês já é o fechamento

  let socio = null;
  if (socioId) {
    const s = q.socios.find((x) => x.id === Number(socioId));
    if (!s) throw new ErroNegocio('Sócio não encontrado.', 404);
    const bp = s.participacao_bp;
    socio = {
      ...s,
      pct: bp == null ? null : bp / 100,
      parte_resultado: bp == null ? null : Math.round((p.resultado * bp) / 10000),
      parte_posicao: bp == null ? null : Math.round(((saldoTotal + patrimonio.total) * bp) / 10000),
      recebido: mov.filter((m) => m.pessoa.toLowerCase() === s.nome.toLowerCase()),
    };
  }

  const alertas = [];
  const neg = contas.filter((c) => c.saldo < 0).map((c) => c.nome);
  if (neg.length) alertas.push(`Conta(s) com saldo negativo no fim do período: ${neg.join(', ')}.`);
  if (p.resultado < 0) alertas.push(patrimonio.informado && patrimonio.variacao_ativos > 0
    ? 'O resultado de caixa do mês foi negativo, mas os ativos (containers e estoque) cresceram no período. Veja o resultado econômico estimado.'
    : 'O resultado de caixa do mês foi negativo.');
  if (p.dias_abertos.length) alertas.push(`${p.dias_abertos.length} dia(s) com lançamentos ainda sem fechamento de caixa: os números são provisórios.`);
  if (parcial) alertas.push('Mês em andamento: os números são parciais, até a data de geração.');
  if (!patrimonio.informado) alertas.push('Ainda não foram informados os valores de containers e estoque; o patrimônio em ativos não está incluído.');
  else if (patrimonio.defasado) alertas.push(`Os valores de containers e estoque são os de ${rotuloMes(patrimonio.mes_ref)} (último mês informado).`);
  if (q.soma_bp !== 10000) alertas.push(`As participações cadastradas somam ${(q.soma_bp / 100).toFixed(2).replace('.', ',')}% (não fecham 100%): confira o quadro societário.`);

  return {
    mes, rotulo: rotuloMes(mes), parcial,
    gerado_em: new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }), gerado_por: usuario?.nome || '',
    atual: resumo(p), anterior: resumo(pAnt), ano_anterior: resumo(pAno),
    dias_abertos: p.dias_abertos, dias_fechados: p.dias_fechados,
    contas, saldo_total: saldoTotal,
    saidas_por_grupo: p.saidas_por_grupo, saidas_por_categoria: p.saidas_por_categoria, saidas_por_pagador: p.saidas_por_pagador,
    serie, patrimonio, quadro: q, socio, movimentos_socios: mov, nota: texto, alertas, comercial: null,
  };
}
