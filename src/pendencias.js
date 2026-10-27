// Pendências: dúvidas e coisas que a equipe precisa descobrir. Aparecem no painel até alguém marcar como resolvida.
import { query, one } from './db.js';
import { ErroNegocio } from './services.js';

const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

export const abertas = () => query(`SELECT p.*, l.data AS lancamento_data, l.valor AS lancamento_valor, l.descricao AS lancamento_descricao
  FROM pendencias p LEFT JOIN lancamentos l ON l.id = p.lancamento_id WHERE p.resolvida_em IS NULL ORDER BY p.criada_em, p.id`);

export const resolvidas = (limite = 30) => query(`SELECT * FROM pendencias WHERE resolvida_em IS NOT NULL ORDER BY resolvida_em DESC, id DESC LIMIT $1`, [limite]);

export async function criar({ titulo, detalhe, lancamento_id }, usuario) {
  if (!txt(titulo)) throw new ErroNegocio('Escreva o que precisa ser entendido.');
  if (lancamento_id && !(await one('SELECT 1 AS x FROM lancamentos WHERE id = $1', [Number(lancamento_id)]))) throw new ErroNegocio('Lançamento não encontrado.', 404);
  return one('INSERT INTO pendencias (titulo, detalhe, lancamento_id, criada_por) VALUES ($1,$2,$3,$4) RETURNING *',
    [txt(titulo).slice(0, 200), txt(detalhe), lancamento_id ? Number(lancamento_id) : null, usuario?.nome || null]);
}

export async function resolver(id, { resolucao }, usuario) {
  const r = await one(`UPDATE pendencias SET resolvida_em = (now() AT TIME ZONE 'America/Sao_Paulo'), resolvida_por = $2, resolucao = $3 WHERE id = $1 AND resolvida_em IS NULL RETURNING *`,
    [id, usuario?.nome || null, txt(resolucao)]);
  if (!r) throw new ErroNegocio('Pendência não encontrada ou já resolvida.', 404);
  return r;
}
