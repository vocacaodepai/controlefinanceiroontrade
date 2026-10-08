import { query, one, tx } from './db.js';

export const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

export const isData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));
export const isMes = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || '');

export function intervaloMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}`, ultimo };
}

export function addDias(data, n) {
  const d = new Date(data + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export class ErroNegocio extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

// ---------- meta ----------
export async function meta() {
  const [empresas, contas, categorias, pessoas] = await Promise.all([
    query('SELECT * FROM empresas ORDER BY id'),
    query(`SELECT c.*, e.nome AS empresa FROM contas c JOIN empresas e ON e.id = c.empresa_id ORDER BY c.modalidade DESC, c.id`),
    query('SELECT * FROM categorias ORDER BY tipo, grupo, nome'),
    query('SELECT * FROM pessoas ORDER BY nome'),
  ]);
  return { empresas, contas, categorias, pessoas };
}

// ---------- saldos ----------
// Saldo de cada conta ao final do dia `ate` (inclusive).
export function saldos(ate) {
  return query(`
    SELECT c.id, c.nome, c.modalidade, c.tipo, e.nome AS empresa, c.saldo_inicial +
      COALESCE((SELECT SUM(CASE l.tipo WHEN 'entrada' THEN l.valor ELSE -l.valor END)
                FROM lancamentos l WHERE l.conta_id = c.id AND l.data <= $1), 0) +
      COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.conta_destino_id = c.id AND l.tipo = 'transferencia' AND l.data <= $1), 0)
      AS saldo
    FROM contas c JOIN empresas e ON e.id = c.empresa_id
    WHERE c.ativo = 1 ORDER BY c.modalidade DESC, c.id`, [ate]);
}

// ---------- lançamentos ----------
const SELECT_LANC = `
  SELECT l.*, c.nome AS conta, c.modalidade, e.nome AS empresa,
         cd.nome AS conta_destino, cat.nome AS categoria, cat.grupo AS grupo, p.nome AS pessoa
  FROM lancamentos l
  JOIN contas c ON c.id = l.conta_id
  JOIN empresas e ON e.id = c.empresa_id
  LEFT JOIN contas cd ON cd.id = l.conta_destino_id
  LEFT JOIN categorias cat ON cat.id = l.categoria_id
  LEFT JOIN pessoas p ON p.id = l.pessoa_id`;

export function listarLancamentos({ de, ate, conta_id, tipo } = {}) {
  const w = [], p = [];
  const add = (cond, v) => { p.push(v); w.push(cond.replace('?', '$' + p.length)); };
  if (de) { if (!isData(de)) throw new ErroNegocio('Data inicial inválida.'); add('l.data >= ?', de); }
  if (ate) { if (!isData(ate)) throw new ErroNegocio('Data final inválida.'); add('l.data <= ?', ate); }
  if (conta_id) { if (!Number.isInteger(Number(conta_id))) throw new ErroNegocio('Conta inválida.'); add('l.conta_id = ?', Number(conta_id)); }
  if (tipo) add('l.tipo = ?', String(tipo));
  return query(`${SELECT_LANC} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY l.data DESC, l.id DESC`, p);
}

export const diaFechado = async (data) => !!(await one('SELECT 1 AS x FROM fechamentos WHERE data = $1', [data]));
const buscarLanc = (id) => one(`${SELECT_LANC} WHERE l.id = $1`, [id]);

async function validar(b) {
  if (!isData(b.data)) throw new ErroNegocio('Data inválida.');
  if (!['entrada', 'saida', 'transferencia'].includes(b.tipo)) throw new ErroNegocio('Tipo inválido.');
  const valor = Math.round(Number(b.valor));
  if (!Number.isFinite(valor) || valor <= 0) throw new ErroNegocio('Valor deve ser maior que zero.');
  if (!Number.isInteger(Number(b.conta_id)) || !(await one('SELECT 1 AS x FROM contas WHERE id = $1', [Number(b.conta_id)]))) throw new ErroNegocio('Conta inválida.');
  if (b.tipo === 'transferencia') {
    if (!b.conta_destino_id || Number(b.conta_destino_id) === Number(b.conta_id))
      throw new ErroNegocio('Transferência precisa de uma conta de destino diferente da origem.');
  }
  if (b.tipo !== 'transferencia' && !b.categoria_id) throw new ErroNegocio('Escolha uma categoria.');
  return valor;
}

const vals = (b, valor) => [
  b.data, b.tipo, valor, Number(b.conta_id),
  b.tipo === 'transferencia' ? Number(b.conta_destino_id) : null,
  b.categoria_id ? Number(b.categoria_id) : null,
  b.pessoa_id ? Number(b.pessoa_id) : null,
  b.cliente?.trim() || null, b.descricao?.trim() || null, b.criado_por?.trim() || null,
];

export async function criarLancamento(b) {
  const valor = await validar(b);
  if (await diaFechado(b.data)) throw new ErroNegocio(`O dia ${b.data} já está fechado. Reabra o dia para lançar.`, 409);
  const r = await one(`INSERT INTO lancamentos
    (data,tipo,valor,conta_id,conta_destino_id,categoria_id,pessoa_id,cliente,descricao,criado_por)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, vals(b, valor));
  return buscarLanc(r.id);
}

export async function atualizarLancamento(id, b) {
  const atual = await one('SELECT * FROM lancamentos WHERE id = $1', [id]);
  if (!atual) throw new ErroNegocio('Lançamento não encontrado.', 404);
  const valor = await validar(b);
  if ((await diaFechado(atual.data)) || (await diaFechado(b.data))) throw new ErroNegocio('Dia fechado. Reabra o dia para editar.', 409);
  await query(`UPDATE lancamentos SET data=$1,tipo=$2,valor=$3,conta_id=$4,conta_destino_id=$5,categoria_id=$6,pessoa_id=$7,cliente=$8,descricao=$9,criado_por=$10 WHERE id=$11`,
    [...vals(b, valor), id]);
  return buscarLanc(id);
}

export async function excluirLancamento(id) {
  const atual = await one('SELECT * FROM lancamentos WHERE id = $1', [id]);
  if (!atual) throw new ErroNegocio('Lançamento não encontrado.', 404);
  if (await diaFechado(atual.data)) throw new ErroNegocio('Dia fechado. Reabra o dia para excluir.', 409);
  await query('DELETE FROM lancamentos WHERE id = $1', [id]);
}

// ---------- dia / fechamento ----------
export async function resumoDia(data) {
  const [ant, finais, movs, transfIn, fech, lancs] = await Promise.all([
    saldos(addDias(data, -1)),
    saldos(data),
    query(`SELECT conta_id,
      SUM(CASE WHEN tipo='entrada' THEN valor ELSE 0 END) AS entradas,
      SUM(CASE WHEN tipo='saida' THEN valor ELSE 0 END) AS saidas,
      SUM(CASE WHEN tipo='transferencia' THEN valor ELSE 0 END) AS transf_saida
      FROM lancamentos WHERE data = $1 GROUP BY conta_id`, [data]),
    query(`SELECT conta_destino_id AS id, SUM(valor) AS v FROM lancamentos WHERE data = $1 AND tipo='transferencia' GROUP BY conta_destino_id`, [data]),
    one('SELECT * FROM fechamentos WHERE data = $1', [data]),
    listarLancamentos({ de: data, ate: data }),
  ]);
  const anterior = Object.fromEntries(ant.map((s) => [s.id, s.saldo]));
  const mov = Object.fromEntries(movs.map((m) => [m.conta_id, m]));
  const tin = Object.fromEntries(transfIn.map((m) => [m.id, m.v]));
  const contados = fech
    ? Object.fromEntries((await query('SELECT * FROM fechamento_contas WHERE data = $1', [data])).map((r) => [r.conta_id, r]))
    : {};
  const contas = finais.map((s) => ({
    ...s,
    saldo_anterior: anterior[s.id] ?? 0,
    entradas: mov[s.id]?.entradas ?? 0,
    saidas: mov[s.id]?.saidas ?? 0,
    transf_saida: mov[s.id]?.transf_saida ?? 0,
    transf_entrada: tin[s.id] ?? 0,
    saldo_contado: contados[s.id]?.saldo_contado ?? null,
    saldo_fechado: contados[s.id]?.saldo_sistema ?? null,
  }));
  const soma = (k) => contas.reduce((a, c) => a + c[k], 0);
  return {
    data,
    fechado: fech || null,
    contas,
    totais: { entradas: soma('entradas'), saidas: soma('saidas'), saldo_anterior: soma('saldo_anterior'), saldo: soma('saldo') },
    lancamentos: lancs.reverse(),
  };
}

export async function fecharDia(data, { contagens = {}, obs, fechado_por } = {}) {
  if (!isData(data)) throw new ErroNegocio('Data inválida.');
  await tx(async () => {
    // trava a data para que dois cliques simultâneos não fechem duas vezes
    await query('SELECT pg_advisory_xact_lock(724520)'); 
    if (await diaFechado(data)) throw new ErroNegocio('Este dia já está fechado.', 409);
    // Não permite fechar um dia se houver dia anterior com lançamentos ainda aberto.
    const pendente = await one(`SELECT l.data FROM lancamentos l WHERE l.data < $1
      AND l.data NOT IN (SELECT data FROM fechamentos) ORDER BY l.data LIMIT 1`, [data]);
    if (pendente) throw new ErroNegocio(`Feche primeiro o dia ${pendente.data}, que ainda está aberto.`, 409);
    await query('INSERT INTO fechamentos (data, obs, fechado_por) VALUES ($1,$2,$3)', [data, obs?.trim() || null, fechado_por?.trim() || null]);
    for (const s of await saldos(data)) {
      const c = contagens[s.id];
      const contado = c === undefined || c === null || c === '' ? null : Math.round(Number(c));
      await query('INSERT INTO fechamento_contas (data, conta_id, saldo_sistema, saldo_contado) VALUES ($1,$2,$3,$4)', [data, s.id, s.saldo, Number.isFinite(contado) ? contado : null]);
    }
  });
  return resumoDia(data);
}

export async function reabrirDia(data) {
  if (!isData(data)) throw new ErroNegocio('Data inválida.');
  if (!(await diaFechado(data))) throw new ErroNegocio('Este dia não está fechado.', 409);
  const posterior = await one('SELECT data FROM fechamentos WHERE data > $1 ORDER BY data LIMIT 1', [data]);
  if (posterior) throw new ErroNegocio(`Reabra primeiro o dia ${posterior.data} (fechamentos posteriores dependem deste).`, 409);
  await query('DELETE FROM fechamentos WHERE data = $1', [data]);
}

// ---------- recorrências ----------
export async function recorrenciasDoMes(mes) {
  const { ultimo } = intervaloMes(mes);
  const rows = await query(`
    SELECT r.*, c.nome AS conta, cat.nome AS categoria, p.nome AS pessoa,
           rl.lancamento_id AS lancamento_id
    FROM recorrencias r
    JOIN contas c ON c.id = r.conta_id
    LEFT JOIN categorias cat ON cat.id = r.categoria_id
    LEFT JOIN pessoas p ON p.id = r.pessoa_id
    LEFT JOIN recorrencia_lancada rl ON rl.recorrencia_id = r.id AND rl.mes = $1
    WHERE r.ativo = 1 ORDER BY r.dia_mes, r.id`, [mes]);
  return rows.map((r) => ({
    ...r,
    data_prevista: `${mes}-${String(Math.min(r.dia_mes, ultimo)).padStart(2, '0')}`,
    lancada: !!r.lancamento_id,
  }));
}

export async function lancarRecorrencia(id, { mes, data, valor, criado_por }) {
  const r = await one('SELECT * FROM recorrencias WHERE id = $1', [id]);
  if (!r) throw new ErroNegocio('Recorrência não encontrada.', 404);
  if (!isMes(mes)) throw new ErroNegocio('Mês inválido.');
  return tx(async () => {
    await query('SELECT pg_advisory_xact_lock(724521)'); 
    if (await one('SELECT 1 AS x FROM recorrencia_lancada WHERE recorrencia_id=$1 AND mes=$2', [id, mes]))
      throw new ErroNegocio('Esta recorrência já foi lançada neste mês.', 409);
    const prevista = (await recorrenciasDoMes(mes)).find((x) => x.id === id).data_prevista;
    const l = await criarLancamento({
      data: data || prevista,
      tipo: r.tipo, valor: valor ?? r.valor, conta_id: r.conta_id, conta_destino_id: r.conta_destino_id,
      categoria_id: r.categoria_id, pessoa_id: r.pessoa_id, descricao: r.descricao || r.nome,
      criado_por,
    });
    await query('INSERT INTO recorrencia_lancada (recorrencia_id, mes, lancamento_id) VALUES ($1,$2,$3)', [id, mes, l.id]);
    return l;
  });
}

// ---------- painel mensal ----------
export async function painelMes(mes) {
  const { de, ate } = intervaloMes(mes);
  const [lancs, fechados, sal, recs, abertos] = await Promise.all([
    listarLancamentos({ de, ate }),
    one('SELECT COUNT(*) AS n FROM fechamentos WHERE data BETWEEN $1 AND $2', [de, ate]),
    saldos(ate),
    recorrenciasDoMes(mes),
    query(`SELECT DISTINCT data FROM lancamentos WHERE data BETWEEN $1 AND $2 AND data NOT IN (SELECT data FROM fechamentos) ORDER BY data`, [de, ate]),
  ]);
  const porMod = { com_nota: 0, sem_nota: 0 };
  const saidasPorPagador = {}, saidasPorGrupo = {}, saidasPorCategoria = {}, porConta = {}, dias = {};
  let entradas = 0, saidas = 0;

  for (const l of lancs) {
    dias[l.data] ??= { data: l.data, entradas: 0, saidas: 0 };
    porConta[l.conta] ??= { conta: l.conta, modalidade: l.modalidade, entradas: 0, saidas: 0 };
    if (l.tipo === 'entrada') {
      entradas += l.valor; porMod[l.modalidade] += l.valor;
      dias[l.data].entradas += l.valor; porConta[l.conta].entradas += l.valor;
    } else if (l.tipo === 'saida') {
      saidas += l.valor;
      dias[l.data].saidas += l.valor; porConta[l.conta].saidas += l.valor;
      saidasPorPagador[l.empresa] = (saidasPorPagador[l.empresa] || 0) + l.valor;
      saidasPorGrupo[l.grupo] = (saidasPorGrupo[l.grupo] || 0) + l.valor;
      saidasPorCategoria[l.categoria] = (saidasPorCategoria[l.categoria] || 0) + l.valor;
    }
  }
  const ord = (o) => Object.entries(o).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  return {
    mes, de, ate,
    entradas, saidas, resultado: entradas - saidas,
    entradas_com_nota: porMod.com_nota, entradas_sem_nota: porMod.sem_nota,
    saidas_por_pagador: ord(saidasPorPagador),
    saidas_por_grupo: ord(saidasPorGrupo),
    saidas_por_categoria: ord(saidasPorCategoria),
    por_conta: Object.values(porConta),
    serie: Object.values(dias).sort((a, b) => a.data.localeCompare(b.data)),
    saldos: sal,
    dias_fechados: fechados.n,
    qtd_lancamentos: lancs.length,
    recorrencias: recs,
    dias_abertos: abertos.map((r) => r.data),
  };
}

// ---------- cadastros ----------
const TABELAS = {
  contas: ['nome', 'empresa_id', 'tipo', 'modalidade', 'saldo_inicial', 'ativo', 'obs'],
  categorias: ['nome', 'tipo', 'grupo', 'ativo'],
  pessoas: ['nome', 'funcao', 'vinculo', 'pagador_padrao', 'obs', 'ativo'],
  recorrencias: ['nome', 'dia_mes', 'valor', 'estimado', 'tipo', 'conta_id', 'conta_destino_id', 'categoria_id', 'pessoa_id', 'descricao', 'ativo'],
};

export async function salvarCadastro(tabela, id, b) {
  const cols = TABELAS[tabela];
  if (!cols) throw new ErroNegocio('Cadastro desconhecido.', 404);
  const dados = cols.filter((c) => b[c] !== undefined);
  const valores = dados.map((c) => (b[c] === '' ? null : b[c]));
  if (id) {
    if (!dados.length) throw new ErroNegocio('Nada para atualizar.');
    const r = await one(`UPDATE ${tabela} SET ${dados.map((c, i) => `${c}=$${i + 1}`).join(',')} WHERE id=$${dados.length + 1} RETURNING *`, [...valores, id]);
    if (!r) throw new ErroNegocio('Registro não encontrado.', 404);
    return r;
  }
  if (!dados.length) throw new ErroNegocio('Dados insuficientes.');
  return one(`INSERT INTO ${tabela} (${dados.join(',')}) VALUES (${dados.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, valores);
}
