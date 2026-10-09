// Marketing: campanhas, números diários dos anúncios, leads, orçamentos gerados e retorno.
// Hoje os números diários (gasto, impressões, cliques, leads) são lançados à mão; as APIs de anúncios (Meta, Google) entram depois.
import { query, one } from './db.js';
import { ErroNegocio, isData, isMes, hoje, addDias, intervaloMes } from './services.js';
import { ORIGENS } from './comercial.js';

export const CANAIS = { instagram: 'Instagram', facebook: 'Facebook', google: 'Google Ads', tiktok: 'TikTok', youtube: 'YouTube', outdoor: 'Anúncio na rua / outdoor', outro: 'Outro' };
const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const inteiro = (v, rot) => { const n = v === '' || v == null ? 0 : Number(v); if (!Number.isInteger(n) || n < 0) throw new ErroNegocio(`${rot} inválido.`); return n; };

// ---------- campanhas ----------
export async function salvarCampanha(id, b, usuario) {
  const falta = [];
  if (!txt(b.nome)) falta.push('nome da campanha');
  if (!b.canal) falta.push('canal');
  if (!txt(b.data_inicio)) falta.push('data de início');
  if (falta.length) throw new ErroNegocio(`Preencha os campos obrigatórios: ${falta.join(', ')}.`);
  if (!CANAIS[b.canal]) throw new ErroNegocio('Canal inválido.');
  if (!isData(b.data_inicio)) throw new ErroNegocio('Data de início inválida.');
  const fim = txt(b.data_fim);
  if (fim && (!isData(fim) || fim < b.data_inicio)) throw new ErroNegocio('A data final não pode ser antes da inicial.');
  const verba = b.verba == null || b.verba === '' ? null : Math.round(Number(b.verba));
  if (verba != null && (!Number.isFinite(verba) || verba < 0)) throw new ErroNegocio('Verba inválida.');
  const ativa = b.ativa === 0 || b.ativa === false ? 0 : 1;
  if (id) {
    const r = await one('UPDATE campanhas SET nome=$1,canal=$2,data_inicio=$3,data_fim=$4,objetivo=$5,verba=$6,ativa=$7,obs=$8 WHERE id=$9 RETURNING *',
      [b.nome.trim(), b.canal, b.data_inicio, fim, txt(b.objetivo), verba, ativa, txt(b.obs), id]);
    if (!r) throw new ErroNegocio('Campanha não encontrada.', 404);
    return r;
  }
  return one('INSERT INTO campanhas (nome,canal,data_inicio,data_fim,objetivo,verba,ativa,obs,criado_por_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [b.nome.trim(), b.canal, b.data_inicio, fim, txt(b.objetivo), verba, ativa, txt(b.obs), usuario?.id ?? null]);
}
export const listarCampanhas = () => query(`SELECT c.*, coalesce((SELECT sum(gasto) FROM campanha_dias d WHERE d.campanha_id = c.id),0)::bigint AS gasto_total,
    coalesce((SELECT sum(leads) FROM campanha_dias d WHERE d.campanha_id = c.id),0)::int AS leads_total,
    (SELECT count(*) FROM orcamentos o WHERE o.campanha_id = c.id)::int AS orcamentos_total
  FROM campanhas c ORDER BY c.ativa DESC, c.data_inicio DESC, c.id DESC`);

// ---------- números diários ----------
export async function lancarDia(b) {
  const falta = [];
  if (!b.campanha_id) falta.push('campanha');
  if (!txt(b.data)) falta.push('data');
  if (b.gasto === undefined || b.gasto === null || b.gasto === '') falta.push('valor gasto');
  if (falta.length) throw new ErroNegocio(`Preencha os campos obrigatórios: ${falta.join(', ')}.`);
  if (!isData(b.data)) throw new ErroNegocio('Data inválida.');
  if (b.data > hoje()) throw new ErroNegocio('A data não pode ser futura.');
  const camp = await one('SELECT id, data_inicio FROM campanhas WHERE id = $1', [Number(b.campanha_id)]);
  if (!camp) throw new ErroNegocio('Campanha não encontrada.', 404);
  if (b.data < camp.data_inicio) throw new ErroNegocio('A data é anterior ao início da campanha.');
  const gasto = Math.round(Number(b.gasto));
  if (!Number.isFinite(gasto) || gasto < 0) throw new ErroNegocio('Valor gasto inválido.');
  return one(`INSERT INTO campanha_dias (campanha_id,data,gasto,impressoes,cliques,leads) VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (campanha_id,data) DO UPDATE SET gasto=EXCLUDED.gasto, impressoes=EXCLUDED.impressoes, cliques=EXCLUDED.cliques, leads=EXCLUDED.leads RETURNING *`,
    [camp.id, b.data, gasto, inteiro(b.impressoes, 'Impressões'), inteiro(b.cliques, 'Cliques'), inteiro(b.leads, 'Leads')]);
}
export const listarDias = (campanhaId) => query('SELECT * FROM campanha_dias WHERE campanha_id = $1 ORDER BY data DESC LIMIT 120', [campanhaId]);
export async function excluirDia(id) {
  const r = await one('DELETE FROM campanha_dias WHERE id = $1 RETURNING id', [id]);
  if (!r) throw new ErroNegocio('Lançamento não encontrado.', 404);
}

// ---------- painel ----------
const razao = (a, b) => (b > 0 ? a / b : null);
const mesAnt = (m) => { const [a, n] = m.split('-').map(Number); return n === 1 ? `${a - 1}-12` : `${a}-${String(n - 1).padStart(2, '0')}`; };

async function totais(de, ate) {
  const g = await one(`SELECT coalesce(sum(gasto),0)::bigint AS gasto, coalesce(sum(impressoes),0)::bigint AS impressoes, coalesce(sum(cliques),0)::bigint AS cliques, coalesce(sum(leads),0)::bigint AS leads
    FROM campanha_dias WHERE data BETWEEN $1 AND $2`, [de, ate]);
  const o = await one(`SELECT count(*) FILTER (WHERE campanha_id IS NOT NULL)::int AS orcamentos, coalesce(sum(valor) FILTER (WHERE campanha_id IS NOT NULL),0)::bigint AS valor_orcado,
      count(*) FILTER (WHERE campanha_id IS NOT NULL AND status='ganho')::int AS vendas, coalesce(sum(valor) FILTER (WHERE campanha_id IS NOT NULL AND status='ganho'),0)::bigint AS valor_vendido,
      count(*)::int AS orcamentos_todos
    FROM orcamentos WHERE data BETWEEN $1 AND $2`, [de, ate]);
  const t = { ...g, ...o };
  return { ...t, cpl: razao(t.gasto, t.leads), custo_orcamento: razao(t.gasto, t.orcamentos), roas: razao(t.valor_vendido, t.gasto), ctr: razao(t.cliques * 100, t.impressoes), lead_para_orcamento: razao(t.orcamentos * 100, t.leads) };
}

export async function painel(mes) {
  if (!isMes(mes)) throw new ErroNegocio('Mês inválido.');
  const { de, ate } = intervaloMes(mes);
  const ant = intervaloMes(mesAnt(mes));
  const [atual, anterior] = await Promise.all([totais(de, ate), totais(ant.de, ant.ate)]);
  const porCampanha = (await query(`SELECT c.id, c.nome, c.canal, c.data_inicio, c.data_fim, c.ativa, c.verba,
      coalesce((SELECT sum(gasto) FROM campanha_dias d WHERE d.campanha_id=c.id AND d.data BETWEEN $1 AND $2),0)::bigint AS gasto,
      coalesce((SELECT sum(leads) FROM campanha_dias d WHERE d.campanha_id=c.id AND d.data BETWEEN $1 AND $2),0)::int AS leads,
      coalesce((SELECT sum(cliques) FROM campanha_dias d WHERE d.campanha_id=c.id AND d.data BETWEEN $1 AND $2),0)::int AS cliques,
      coalesce((SELECT sum(gasto) FROM campanha_dias d WHERE d.campanha_id=c.id),0)::bigint AS gasto_total,
      (SELECT count(*) FROM orcamentos o WHERE o.campanha_id=c.id AND o.data BETWEEN $1 AND $2)::int AS orcamentos,
      coalesce((SELECT sum(valor) FROM orcamentos o WHERE o.campanha_id=c.id AND o.data BETWEEN $1 AND $2),0)::bigint AS valor_orcado,
      (SELECT count(*) FROM orcamentos o WHERE o.campanha_id=c.id AND o.status='ganho' AND o.data BETWEEN $1 AND $2)::int AS vendas,
      coalesce((SELECT sum(valor) FROM orcamentos o WHERE o.campanha_id=c.id AND o.status='ganho' AND o.data BETWEEN $1 AND $2),0)::bigint AS valor_vendido
    FROM campanhas c WHERE c.data_inicio <= $2 AND (c.data_fim IS NULL OR c.data_fim >= $1) ORDER BY c.ativa DESC, gasto DESC, c.id`, [de, ate]))
    .map((c) => ({ ...c, cpl: razao(c.gasto, c.leads), custo_orcamento: razao(c.gasto, c.orcamentos), roas: razao(c.valor_vendido, c.gasto) }));
  // semana a semana (segunda a domingo)
  const gsem = await query(`SELECT to_char(date_trunc('week', data::timestamp),'YYYY-MM-DD') AS semana, sum(gasto)::bigint AS gasto, sum(leads)::int AS leads, sum(cliques)::int AS cliques
    FROM campanha_dias WHERE data BETWEEN $1 AND $2 GROUP BY 1`, [de, ate]);
  const osem = await query(`SELECT to_char(date_trunc('week', data::timestamp),'YYYY-MM-DD') AS semana, count(*)::int AS orcamentos,
      coalesce(sum(valor) FILTER (WHERE status='ganho'),0)::bigint AS valor_vendido FROM orcamentos WHERE campanha_id IS NOT NULL AND data BETWEEN $1 AND $2 GROUP BY 1`, [de, ate]);
  const semanas = [...new Set([...gsem, ...osem].map((x) => x.semana))].sort().map((s) => {
    const g = gsem.find((x) => x.semana === s) || {}, o = osem.find((x) => x.semana === s) || {};
    return { semana: s, ate: addDias(s, 6), gasto: g.gasto || 0, leads: g.leads || 0, cliques: g.cliques || 0, orcamentos: o.orcamentos || 0, valor_vendido: o.valor_vendido || 0 };
  });
  // de onde vêm todos os orçamentos (com ou sem campanha paga)
  const porOrigem = (await query(`SELECT coalesce(origem,'sem_origem') AS origem, count(*)::int AS qtd, coalesce(sum(valor),0)::bigint AS valor_orcado,
      count(*) FILTER (WHERE status='ganho')::int AS vendas, coalesce(sum(valor) FILTER (WHERE status='ganho'),0)::bigint AS valor_vendido
    FROM orcamentos WHERE data BETWEEN $1 AND $2 GROUP BY 1 ORDER BY qtd DESC, valor_orcado DESC`, [de, ate]))
    .map((x) => ({ ...x, rotulo: x.origem === 'sem_origem' ? 'Sem origem (lançado antes do rastreio)' : ORIGENS[x.origem] || x.origem }));
  return { mes, de, ate, hoje: hoje(), atual, anterior, por_campanha: porCampanha, semanas, por_origem: porOrigem, canais: CANAIS };
}
