import { db, tx } from './db.js';

export const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

export const isData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s));
export const isMes = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s || '');

export function intervaloMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimo).padStart(2, '0')}`, ultimo };
}

export function addDias(data, n) {
  const d = new Date(data + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- meta ----------
export function meta() {
  return {
    empresas: db.prepare('SELECT * FROM empresas ORDER BY id').all(),
    contas: db.prepare(`SELECT c.*, e.nome AS empresa FROM contas c JOIN empresas e ON e.id = c.empresa_id ORDER BY c.modalidade DESC, c.id`).all(),
    categorias: db.prepare('SELECT * FROM categorias ORDER BY tipo, grupo, nome').all(),
    pessoas: db.prepare('SELECT * FROM pessoas ORDER BY nome').all(),
  };
}

// ---------- saldos ----------
// Saldo de cada conta ao final do dia `ate` (inclusive).
export function saldos(ate) {
  const rows = db.prepare(`
    SELECT c.id, c.nome, c.modalidade, c.tipo, e.nome AS empresa, c.saldo_inicial +
      COALESCE((SELECT SUM(CASE l.tipo WHEN 'entrada' THEN l.valor WHEN 'saida' THEN -l.valor WHEN 'transferencia' THEN -l.valor END)
                FROM lancamentos l WHERE l.conta_id = c.id AND l.data <= ?), 0) +
      COALESCE((SELECT SUM(l.valor) FROM lancamentos l WHERE l.conta_destino_id = c.id AND l.tipo = 'transferencia' AND l.data <= ?), 0)
      AS saldo
    FROM contas c JOIN empresas e ON e.id = c.empresa_id
    WHERE c.ativo = 1 ORDER BY c.modalidade DESC, c.id`).all(ate, ate);
  return rows;
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
  if (de) { w.push('l.data >= ?'); p.push(de); }
  if (ate) { w.push('l.data <= ?'); p.push(ate); }
  if (conta_id) { w.push('l.conta_id = ?'); p.push(Number(conta_id)); }
  if (tipo) { w.push('l.tipo = ?'); p.push(tipo); }
  const sql = `${SELECT_LANC} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY l.data DESC, l.id DESC`;
  return db.prepare(sql).all(...p);
}

export const diaFechado = (data) => !!db.prepare('SELECT 1 FROM fechamentos WHERE data = ?').get(data);

export class ErroNegocio extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

function validar(b) {
  if (!isData(b.data)) throw new ErroNegocio('Data inválida.');
  if (!['entrada', 'saida', 'transferencia'].includes(b.tipo)) throw new ErroNegocio('Tipo inválido.');
  const valor = Math.round(Number(b.valor));
  if (!Number.isFinite(valor) || valor <= 0) throw new ErroNegocio('Valor deve ser maior que zero.');
  if (!db.prepare('SELECT 1 FROM contas WHERE id = ?').get(b.conta_id)) throw new ErroNegocio('Conta inválida.');
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

export function criarLancamento(b) {
  const valor = validar(b);
  if (diaFechado(b.data)) throw new ErroNegocio(`O dia ${b.data} já está fechado. Reabra o dia para lançar.`, 409);
  const r = db.prepare(`INSERT INTO lancamentos
    (data,tipo,valor,conta_id,conta_destino_id,categoria_id,pessoa_id,cliente,descricao,criado_por)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(...vals(b, valor));
  return db.prepare(`${SELECT_LANC} WHERE l.id = ?`).get(r.lastInsertRowid);
}

export function atualizarLancamento(id, b) {
  const atual = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id);
  if (!atual) throw new ErroNegocio('Lançamento não encontrado.', 404);
  const valor = validar(b);
  if (diaFechado(atual.data) || diaFechado(b.data)) throw new ErroNegocio('Dia fechado. Reabra o dia para editar.', 409);
  db.prepare(`UPDATE lancamentos SET data=?,tipo=?,valor=?,conta_id=?,conta_destino_id=?,categoria_id=?,pessoa_id=?,cliente=?,descricao=?,criado_por=? WHERE id=?`)
    .run(...vals(b, valor), id);
  return db.prepare(`${SELECT_LANC} WHERE l.id = ?`).get(id);
}

export function excluirLancamento(id) {
  const atual = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id);
  if (!atual) throw new ErroNegocio('Lançamento não encontrado.', 404);
  if (diaFechado(atual.data)) throw new ErroNegocio('Dia fechado. Reabra o dia para excluir.', 409);
  db.prepare('DELETE FROM lancamentos WHERE id = ?').run(id);
}

// ---------- dia / fechamento ----------
export function resumoDia(data) {
  const anterior = Object.fromEntries(saldos(addDias(data, -1)).map((s) => [s.id, s.saldo]));
  const finais = saldos(data);
  const movs = db.prepare(`
    SELECT conta_id,
      SUM(CASE WHEN tipo='entrada' THEN valor ELSE 0 END) AS entradas,
      SUM(CASE WHEN tipo='saida' THEN valor ELSE 0 END) AS saidas,
      SUM(CASE WHEN tipo='transferencia' THEN valor ELSE 0 END) AS transf_saida
    FROM lancamentos WHERE data = ? GROUP BY conta_id`).all(data);
  const transfIn = db.prepare(`SELECT conta_destino_id AS id, SUM(valor) AS v FROM lancamentos WHERE data = ? AND tipo='transferencia' GROUP BY conta_destino_id`).all(data);
  const mov = Object.fromEntries(movs.map((m) => [m.conta_id, m]));
  const tin = Object.fromEntries(transfIn.map((m) => [m.id, m.v]));
  const fech = db.prepare('SELECT * FROM fechamentos WHERE data = ?').get(data);
  const contados = fech
    ? Object.fromEntries(db.prepare('SELECT * FROM fechamento_contas WHERE data = ?').all(data).map((r) => [r.conta_id, r]))
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
    lancamentos: listarLancamentos({ de: data, ate: data }).reverse(),
  };
}

export function fecharDia(data, { contagens = {}, obs, fechado_por } = {}) {
  if (!isData(data)) throw new ErroNegocio('Data inválida.');
  if (diaFechado(data)) throw new ErroNegocio('Este dia já está fechado.', 409);
  // Não permite fechar um dia se houver dia anterior com lançamentos ainda aberto.
  const pendente = db.prepare(`
    SELECT l.data FROM lancamentos l WHERE l.data < ? AND l.data NOT IN (SELECT data FROM fechamentos)
    ORDER BY l.data LIMIT 1`).get(data);
  if (pendente) throw new ErroNegocio(`Feche primeiro o dia ${pendente.data}, que ainda está aberto.`, 409);
  tx(() => {
    db.prepare('INSERT INTO fechamentos (data, obs, fechado_por) VALUES (?,?,?)').run(data, obs?.trim() || null, fechado_por?.trim() || null);
    const ins = db.prepare('INSERT INTO fechamento_contas (data, conta_id, saldo_sistema, saldo_contado) VALUES (?,?,?,?)');
    for (const s of saldos(data)) {
      const c = contagens[s.id];
      ins.run(data, s.id, s.saldo, c === undefined || c === null || c === '' ? null : Math.round(Number(c)));
    }
  });
  return resumoDia(data);
}

export function reabrirDia(data) {
  if (!diaFechado(data)) throw new ErroNegocio('Este dia não está fechado.', 409);
  const posterior = db.prepare('SELECT data FROM fechamentos WHERE data > ? ORDER BY data LIMIT 1').get(data);
  if (posterior) throw new ErroNegocio(`Reabra primeiro o dia ${posterior.data} (fechamentos posteriores dependem deste).`, 409);
  db.prepare('DELETE FROM fechamentos WHERE data = ?').run(data);
}

// ---------- recorrências ----------
export function recorrenciasDoMes(mes) {
  const { ultimo } = intervaloMes(mes);
  return db.prepare(`
    SELECT r.*, c.nome AS conta, cat.nome AS categoria, p.nome AS pessoa,
           rl.lancamento_id AS lancamento_id
    FROM recorrencias r
    JOIN contas c ON c.id = r.conta_id
    LEFT JOIN categorias cat ON cat.id = r.categoria_id
    LEFT JOIN pessoas p ON p.id = r.pessoa_id
    LEFT JOIN recorrencia_lancada rl ON rl.recorrencia_id = r.id AND rl.mes = ?
    WHERE r.ativo = 1 ORDER BY r.dia_mes`).all(mes).map((r) => ({
    ...r,
    data_prevista: `${mes}-${String(Math.min(r.dia_mes, ultimo)).padStart(2, '0')}`,
    lancada: !!r.lancamento_id,
  }));
}

export function lancarRecorrencia(id, { mes, data, valor }) {
  const r = db.prepare('SELECT * FROM recorrencias WHERE id = ?').get(id);
  if (!r) throw new ErroNegocio('Recorrência não encontrada.', 404);
  if (!isMes(mes)) throw new ErroNegocio('Mês inválido.');
  if (db.prepare('SELECT 1 FROM recorrencia_lancada WHERE recorrencia_id=? AND mes=?').get(id, mes))
    throw new ErroNegocio('Esta recorrência já foi lançada neste mês.', 409);
  const v = valor ?? r.valor;
  return tx(() => {
    const l = criarLancamento({
      data: data || recorrenciasDoMes(mes).find((x) => x.id === id).data_prevista,
      tipo: r.tipo, valor: v, conta_id: r.conta_id, conta_destino_id: r.conta_destino_id,
      categoria_id: r.categoria_id, pessoa_id: r.pessoa_id, descricao: r.descricao || r.nome,
    });
    db.prepare('INSERT INTO recorrencia_lancada VALUES (?,?,?)').run(id, mes, l.id);
    return l;
  });
}

// ---------- painel mensal ----------
export function painelMes(mes) {
  const { de, ate } = intervaloMes(mes);
  const lancs = listarLancamentos({ de, ate });
  const porMod = { com_nota: 0, sem_nota: 0 };
  const saidasPorPagador = {};
  const saidasPorGrupo = {};
  const saidasPorCategoria = {};
  const porConta = {};
  const dias = {};
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
  const fechados = db.prepare('SELECT COUNT(*) n FROM fechamentos WHERE data BETWEEN ? AND ?').get(de, ate).n;
  return {
    mes, de, ate,
    entradas, saidas, resultado: entradas - saidas,
    entradas_com_nota: porMod.com_nota, entradas_sem_nota: porMod.sem_nota,
    saidas_por_pagador: ord(saidasPorPagador),
    saidas_por_grupo: ord(saidasPorGrupo),
    saidas_por_categoria: ord(saidasPorCategoria),
    por_conta: Object.values(porConta),
    serie: Object.values(dias).sort((a, b) => a.data.localeCompare(b.data)),
    saldos: saldos(ate),
    dias_fechados: fechados,
    qtd_lancamentos: lancs.length,
    recorrencias: recorrenciasDoMes(mes),
    dias_abertos: db.prepare(`SELECT DISTINCT data FROM lancamentos WHERE data BETWEEN ? AND ? AND data NOT IN (SELECT data FROM fechamentos) ORDER BY data`).all(de, ate).map((r) => r.data),
  };
}

// ---------- cadastros ----------
const TABELAS = {
  contas: ['nome', 'empresa_id', 'tipo', 'modalidade', 'saldo_inicial', 'ativo', 'obs'],
  categorias: ['nome', 'tipo', 'grupo', 'ativo'],
  pessoas: ['nome', 'funcao', 'vinculo', 'pagador_padrao', 'obs', 'ativo'],
  recorrencias: ['nome', 'dia_mes', 'valor', 'estimado', 'tipo', 'conta_id', 'conta_destino_id', 'categoria_id', 'pessoa_id', 'descricao', 'ativo'],
};

export function salvarCadastro(tabela, id, b) {
  const cols = TABELAS[tabela];
  if (!cols) throw new ErroNegocio('Cadastro desconhecido.', 404);
  const dados = cols.filter((c) => b[c] !== undefined);
  if (id) {
    if (!dados.length) throw new ErroNegocio('Nada para atualizar.');
    db.prepare(`UPDATE ${tabela} SET ${dados.map((c) => c + '=?').join(',')} WHERE id=?`).run(...dados.map((c) => b[c] === '' ? null : b[c]), id);
    return db.prepare(`SELECT * FROM ${tabela} WHERE id=?`).get(id);
  }
  const r = db.prepare(`INSERT INTO ${tabela} (${dados.join(',')}) VALUES (${dados.map(() => '?').join(',')})`).run(...dados.map((c) => b[c] === '' ? null : b[c]));
  return db.prepare(`SELECT * FROM ${tabela} WHERE id=?`).get(r.lastInsertRowid);
}
