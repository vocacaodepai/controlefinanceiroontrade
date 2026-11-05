// Estoque: itens e movimentos (entrada e saída). O saldo é sempre a soma das entradas menos as saídas.
import { query, one, tx } from './db.js';
import { ErroNegocio, isData, hoje } from './services.js';
import { TIPOS, AMBIENTES, classificar, montaBusca, termosBusca } from './estoque-catalogo.js';
export { TIPOS, AMBIENTES };

const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
const SALDO = `(SELECT coalesce(sum(CASE WHEN m.tipo = 'entrada' THEN m.quantidade ELSE -m.quantidade END), 0)::float8 FROM estoque_movimentos m WHERE m.item_id = i.id)`;

// Lista com busca e filtros. A busca aceita várias palavras em qualquer ordem, sem acento e com variações de pitch e medida
// (ex.: "p3.9 outdoor lote 9", "391 indoor modulo", "50x1", "MIC9065").
export async function listarItens({ todos, q, tipo, pitch, ambiente, lote, saldo } = {}) {
  const w = [], p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replaceAll('?', '$' + p.length)); };
  if (!todos) w.push('i.ativo = 1');
  for (const t of termosBusca(q)) add(`coalesce(i.busca, lower(i.nome)) LIKE ?`, `%${t}%`);
  if (tipo) add('i.tipo = ?', tipo);
  if (pitch) add('i.pitch = ?', pitch);
  if (ambiente) add('i.ambiente = ?', ambiente);
  if (lote) add('i.lote = ?', lote);
  if (saldo === 'com') w.push(`${SALDO} > 0`);
  if (saldo === 'zerado') w.push(`${SALDO} <= 0`);
  const l = await query(`SELECT i.id, i.nome, i.codigo, i.tipo, i.pitch, i.ambiente, i.dimensao, i.lote, i.marca, i.preco, i.unidade, i.minimo::float8 AS minimo, i.obs, i.ativo, ${SALDO} AS saldo,
      (SELECT max(m.criado_em) FROM estoque_movimentos m WHERE m.item_id = i.id) AS ultima_movimentacao
    FROM estoque_itens i ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
    ORDER BY i.ativo DESC, i.pitch NULLS LAST, i.tipo NULLS LAST, i.ambiente NULLS LAST, i.lote DESC NULLS LAST, lower(i.nome)`, p);
  return l.map((i) => ({ ...i, abaixo_minimo: i.ativo === 1 && i.minimo > 0 && i.saldo <= i.minimo, valor_estoque: i.preco && i.saldo > 0 ? Math.round(i.preco * i.saldo) : 0 }));
}

// Itens cadastrados por fora (importação, versões antigas) sem tipo/pitch/medida/lote ou sem texto de busca são completados aqui
export async function completarCatalogo() {
  const faltam = await query('SELECT id, nome, codigo, tipo, pitch, ambiente, dimensao, lote, marca FROM estoque_itens WHERE busca IS NULL OR tipo IS NULL');
  for (const i of faltam) {
    const a = classificar(i.nome);
    const c = { ...i, tipo: i.tipo || a.tipo, pitch: i.pitch || a.pitch, ambiente: i.ambiente || a.ambiente, dimensao: i.dimensao || a.dimensao, lote: i.lote || a.lote };
    await query('UPDATE estoque_itens SET tipo=$2, pitch=$3, ambiente=$4, dimensao=$5, lote=$6, busca=$7 WHERE id=$1', [i.id, c.tipo, c.pitch, c.ambiente, c.dimensao, c.lote, montaBusca(c)]);
  }
  return faltam.length;
}

// Valores que existem no catálogo, para montar os filtros da tela
export async function filtros() {
  const col = async (c) => (await query(`SELECT DISTINCT ${c} AS v FROM estoque_itens WHERE ativo = 1 AND ${c} IS NOT NULL ORDER BY 1`)).map((r) => r.v);
  return { tipos: TIPOS, ambientes: AMBIENTES, pitches: await col('pitch'), lotes: (await col('lote')).sort((a, b) => b.localeCompare(a, 'pt-BR', { numeric: true })) };
}

// Campos de catálogo deixados em branco são preenchidos pelo próprio nome (tipo, pitch, uso, medida e lote)
export async function salvarItem(id, b) {
  const nome = txt(b.nome);
  if (!nome) throw new ErroNegocio('Informe o nome do item.');
  const unidade = txt(b.unidade) || 'un';
  const minimo = b.minimo == null || b.minimo === '' ? 0 : num(b.minimo);
  if (!(minimo >= 0)) throw new ErroNegocio('O estoque mínimo deve ser zero ou mais.');
  const auto = classificar(nome);
  const tipo = txt(b.tipo) || auto.tipo;
  if (!TIPOS[tipo]) throw new ErroNegocio('Tipo inválido.');
  const ambiente = txt(b.ambiente) || auto.ambiente;
  if (ambiente && !AMBIENTES[ambiente]) throw new ErroNegocio('Uso inválido: escolha indoor ou outdoor.');
  const preco = b.preco == null || b.preco === '' ? null : Math.round(Number(b.preco));
  if (preco != null && (!Number.isFinite(preco) || preco < 0)) throw new ErroNegocio('Preço inválido.');
  const c = { nome, codigo: txt(b.codigo), tipo, pitch: txt(b.pitch) || auto.pitch, ambiente, dimensao: txt(b.dimensao) || auto.dimensao, lote: txt(b.lote) || auto.lote, marca: txt(b.marca) };
  const busca = montaBusca(c);
  const v = [nome, unidade, minimo, txt(b.obs), c.codigo, c.tipo, c.pitch, c.ambiente, c.dimensao, c.lote, c.marca, preco, busca];
  try {
    if (id) {
      const r = await one('UPDATE estoque_itens SET nome=$2, unidade=$3, minimo=$4, obs=$5, codigo=$6, tipo=$7, pitch=$8, ambiente=$9, dimensao=$10, lote=$11, marca=$12, preco=$13, busca=$14, ativo=$15 WHERE id=$1 RETURNING id',
        [id, ...v, b.ativo === 0 || b.ativo === false ? 0 : 1]);
      if (!r) throw new ErroNegocio('Item não encontrado.', 404);
      return id;
    }
    return (await one('INSERT INTO estoque_itens (nome, unidade, minimo, obs, codigo, tipo, pitch, ambiente, dimensao, lote, marca, preco, busca) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id', v)).id;
  } catch (e) {
    if (e.code === '23505') throw new ErroNegocio('Já existe um item com este nome.', 409);
    throw e;
  }
}

async function saldoDe(itemId) {
  return (await one(`SELECT ${SALDO} AS s FROM estoque_itens i WHERE i.id = $1`, [itemId]))?.s;
}

// Registra entrada ou saída. A saída exige o destino (cliente, obra ou motivo) e nunca deixa o saldo negativo.
export async function registrarMovimento(b, usuario) {
  const tipo = b.tipo;
  if (!['entrada', 'saida'].includes(tipo)) throw new ErroNegocio('Informe se é entrada ou saída.');
  const item = await one('SELECT id, nome, unidade, ativo FROM estoque_itens WHERE id = $1', [Number(b.item_id)]);
  if (!item) throw new ErroNegocio('Escolha o item.', 404);
  if (!item.ativo) throw new ErroNegocio('Este item está desativado.');
  const q = num(b.quantidade);
  if (!(q > 0)) throw new ErroNegocio('Informe a quantidade (maior que zero).');
  const data = b.data || hoje();
  if (!isData(data)) throw new ErroNegocio('Data inválida.');
  if (data > hoje()) throw new ErroNegocio('A data não pode ser futura.');
  const ref = txt(b.referencia);
  if (tipo === 'saida' && !ref) throw new ErroNegocio('Informe para onde o item foi: cliente, obra ou motivo da saída.');
  await tx(async () => {
    await query('SELECT pg_advisory_xact_lock(7102)');
    if (tipo === 'saida') {
      const s = await saldoDe(item.id);
      if (q > s) throw new ErroNegocio(`Saldo insuficiente de ${item.nome}: há ${s} ${item.unidade} em estoque.`, 409);
    }
    await query('INSERT INTO estoque_movimentos (item_id, tipo, quantidade, data, referencia, orcamento_numero, obs, usuario_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [item.id, tipo, q, data, ref, txt(b.orcamento_numero), txt(b.obs), usuario?.id ?? null]);
  });
  return (await listarItens({ todos: true })).find((i) => i.id === item.id);
}

export async function listarMovimentos({ item_id, tipo, de, ate, por } = {}) {
  const w = [], p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('?', '$' + p.length)); };
  if (item_id) add('m.item_id = ?', Number(item_id));
  if (tipo) { if (!['entrada', 'saida'].includes(tipo)) throw new ErroNegocio('Tipo inválido.'); add('m.tipo = ?', tipo); }
  if (de) { if (!isData(de)) throw new ErroNegocio('Data inicial inválida.'); add('m.data >= ?', de); }
  if (ate) { if (!isData(ate)) throw new ErroNegocio('Data final inválida.'); add('m.data <= ?', ate); }
  if (por) add('m.usuario_id = ?', Number(por));
  return query(`SELECT m.id, m.item_id, m.tipo, m.quantidade::float8 AS quantidade, m.data, m.referencia, m.orcamento_numero, m.obs, m.criado_em,
      i.nome AS item_nome, i.unidade, u.nome AS usuario_nome
    FROM estoque_movimentos m JOIN estoque_itens i ON i.id = m.item_id LEFT JOIN usuarios u ON u.id = m.usuario_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY m.data DESC, m.id DESC LIMIT 300`, p);
}

// Correção de lançamento errado (só administração): não pode deixar o saldo negativo
export async function excluirMovimento(id) {
  await tx(async () => {
    const m = await one('SELECT id, item_id, tipo, quantidade::float8 AS q FROM estoque_movimentos WHERE id = $1', [id]);
    if (!m) throw new ErroNegocio('Movimento não encontrado.', 404);
    if (m.tipo === 'entrada' && (await saldoDe(m.item_id)) - m.q < 0) throw new ErroNegocio('Não dá para excluir: o saldo ficaria negativo (já houve saída dessa entrada).', 409);
    await query('DELETE FROM estoque_movimentos WHERE id = $1', [id]);
  });
}
