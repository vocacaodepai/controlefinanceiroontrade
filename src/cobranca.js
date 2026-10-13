// Cobrança dos orçamentos aprovados: o comercial vende, o FINANCEIRO cobra e registra o recebimento.
// Quando um orçamento é marcado como ganho (aprovado) ele sai do follow-up comercial e entra aqui.
import { query, one, tx } from './db.js';
import { ErroNegocio, isData, hoje, addDias, criarLancamento } from './services.js';
import { CANAIS_CONTATO } from './comercial.js';

// Régua de cobrança (padrão de mercado): primeiro contato 1 dia depois da aprovação (enviar dados de pagamento e confirmar),
// depois dias 3, 7 e 14. Passados os quatro toques sem pagamento, o caso sobe para a gestão decidir (escalonamento).
export const CADENCIA_COBRANCA = [1, 3, 7, 14];
export const SITUACOES = { a_cobrar: 'A cobrar', em_cobranca: 'Em cobrança', pago: 'Pago' };
export const RESULTADOS_COBRANCA = { sem_resposta: 'Não respondeu', combinou_data: 'Combinou data de pagamento', enviou_comprovante: 'Enviou comprovante', dificuldade: 'Pediu condição / dificuldade' };
const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

const BASE = `SELECT o.id, o.numero, o.valor, o.status, o.data, o.fechado_em, o.cobranca_status, o.cobranca_followup_em, o.cobranca_vencimento,
    c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email,
    coalesce(p.nome, o.produto_desc, 'Sem produto') AS produto, uv.nome AS vendedor_nome,
    (SELECT coalesce(sum(g.valor),0)::bigint FROM pagamentos g WHERE g.orcamento_id = o.id) AS recebido,
    (SELECT count(*)::int FROM contatos t WHERE t.orcamento_id = o.id AND t.tipo = 'cobranca') AS qtd_cobrancas,
    (SELECT max(t.criado_em) FROM contatos t WHERE t.orcamento_id = o.id AND t.tipo = 'cobranca') AS ultima_cobranca
  FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id
  LEFT JOIN produtos_catalogo p ON p.id = o.produto_id LEFT JOIN usuarios uv ON uv.id = o.criado_por_id`;

const enriquecer = (o) => ({
  ...o,
  saldo: Math.max(o.valor - o.recebido, 0),
  atrasado: !!o.cobranca_followup_em && o.cobranca_status !== 'pago' && o.cobranca_followup_em < hoje(),
  vence_hoje_ou_antes: !!o.cobranca_followup_em && o.cobranca_status !== 'pago' && o.cobranca_followup_em <= hoje(),
  vencido: !!o.cobranca_vencimento && o.cobranca_status !== 'pago' && o.cobranca_vencimento < hoje(),
  escalar: o.cobranca_status !== 'pago' && o.qtd_cobrancas >= CADENCIA_COBRANCA.length,
});

// Lista de aprovados: situacao = abertos (a cobrar + em cobrança), pagos ou todos
export async function listar({ situacao = 'abertos' } = {}) {
  const filtro = situacao === 'pagos' ? "o.cobranca_status = 'pago'" : situacao === 'todos' ? 'o.cobranca_status IS NOT NULL' : "o.cobranca_status IN ('a_cobrar','em_cobranca')";
  const l = await query(`${BASE} WHERE ${filtro} ORDER BY (o.cobranca_status = 'pago'), o.cobranca_followup_em NULLS LAST, o.id`);
  return l.map(enriquecer);
}

// Quem tem cobrança para fazer hoje (ou atrasada)
export async function pendentes() {
  return (await query(`${BASE} WHERE o.cobranca_status IN ('a_cobrar','em_cobranca') AND o.cobranca_followup_em <= $1 ORDER BY o.cobranca_followup_em, o.id`, [hoje()])).map(enriquecer);
}

export async function resumo() {
  const h = hoje();
  const r = await one(`SELECT count(*) FILTER (WHERE cobranca_status IN ('a_cobrar','em_cobranca'))::int AS abertos,
      coalesce(sum(valor - (SELECT coalesce(sum(g.valor),0) FROM pagamentos g WHERE g.orcamento_id = orcamentos.id)) FILTER (WHERE cobranca_status IN ('a_cobrar','em_cobranca')),0)::bigint AS a_receber,
      count(*) FILTER (WHERE cobranca_status IN ('a_cobrar','em_cobranca') AND cobranca_followup_em <= $1)::int AS para_hoje,
      count(*) FILTER (WHERE cobranca_status = 'pago')::int AS pagos
    FROM orcamentos WHERE cobranca_status IS NOT NULL`, [h]);
  const mes = await one(`SELECT coalesce(sum(valor),0)::bigint AS recebido_mes FROM pagamentos WHERE data >= $1 AND data <= $2`, [h.slice(0, 7) + '-01', h.slice(0, 7) + '-31']);
  return { ...r, ...mes };
}

export async function detalhe(id) {
  const o = await one(`${BASE} WHERE o.id = $1 AND o.cobranca_status IS NOT NULL`, [id]);
  if (!o) throw new ErroNegocio('Orçamento aprovado não encontrado.', 404);
  const contatos = await query(`SELECT t.id, t.nota, t.canal, t.resultado, t.criado_em, u.nome AS usuario_nome FROM contatos t LEFT JOIN usuarios u ON u.id = t.usuario_id WHERE t.orcamento_id = $1 AND t.tipo = 'cobranca' ORDER BY t.criado_em DESC`, [id]);
  const pagamentos = await query(`SELECT g.*, c.nome AS conta_nome, u.nome AS usuario_nome FROM pagamentos g LEFT JOIN contas c ON c.id = g.conta_id LEFT JOIN usuarios u ON u.id = g.criado_por_id WHERE g.orcamento_id = $1 ORDER BY g.data DESC, g.id DESC`, [id]);
  return { ...enriquecer(o), contatos, pagamentos };
}

// Próxima data da régua: dias após a aprovação; se já passou, volta em 2 dias. Depois do último toque, para de agendar (escalar).
function proximaCobranca(aprovadoEm, feitos, adiar) {
  const h = hoje();
  if (adiar) return addDias(h, adiar);
  const dias = CADENCIA_COBRANCA[feitos];
  if (dias === undefined) return null;
  const d = addDias(aprovadoEm, dias);
  return d <= h ? addDias(h, 2) : d;
}

export async function registrarContato(id, { nota, canal, resultado, adiar_dias, vencimento }, usuario) {
  const o = await one(`SELECT id, cliente_id, cobranca_status, fechado_em::date AS aprovado, (SELECT count(*)::int FROM contatos t WHERE t.orcamento_id = orcamentos.id AND t.tipo = 'cobranca') AS feitos FROM orcamentos WHERE id = $1`, [id]);
  if (!o || !o.cobranca_status) throw new ErroNegocio('Orçamento aprovado não encontrado.', 404);
  if (o.cobranca_status === 'pago') throw new ErroNegocio('Este orçamento já está pago.');
  if (canal && !CANAIS_CONTATO[canal]) throw new ErroNegocio('Canal de contato inválido.');
  if (resultado && !RESULTADOS_COBRANCA[resultado]) throw new ErroNegocio('Resultado do contato inválido.');
  let adiar = adiar_dias == null || adiar_dias === '' ? null : Number(adiar_dias);
  if (adiar != null && (!Number.isInteger(adiar) || adiar < 1 || adiar > 60)) throw new ErroNegocio('O novo prazo deve ser de 1 a 60 dias.');
  const venc = txt(vencimento);
  if (venc && !isData(venc)) throw new ErroNegocio('Data de vencimento inválida.');
  if (resultado === 'combinou_data' && !venc && adiar == null) throw new ErroNegocio('Informe a data combinada para o pagamento.');
  // data combinada com o cliente vira o próximo aviso (a cobrança volta no dia combinado)
  const proximo = resultado === 'combinou_data' && venc ? (venc > hoje() ? venc : addDias(hoje(), 1)) : proximaCobranca(o.aprovado || hoje(), o.feitos + 1, adiar);
  await tx(async () => {
    await query(`INSERT INTO contatos (orcamento_id, cliente_id, usuario_id, tipo, nota, canal, resultado) VALUES ($1,$2,$3,'cobranca',$4,$5,$6)`, [id, o.cliente_id, usuario?.id ?? null, txt(nota), canal || null, resultado || null]);
    await query(`UPDATE orcamentos SET cobranca_status = 'em_cobranca', cobranca_followup_em = $2, cobranca_vencimento = coalesce($3, cobranca_vencimento) WHERE id = $1`, [id, proximo, venc]);
  });
  return detalhe(id);
}

// Registra o recebimento (total ou parcial). Por padrão já lança a ENTRADA no caixa, na conta escolhida.
export async function registrarPagamento(id, { valor, data, conta_id, lancar = true, obs }, usuario) {
  const o = await one(`SELECT o.id, o.numero, o.valor, o.cobranca_status, c.nome AS cliente, (SELECT coalesce(sum(g.valor),0)::bigint FROM pagamentos g WHERE g.orcamento_id = o.id) AS recebido
    FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id WHERE o.id = $1`, [id]);
  if (!o || !o.cobranca_status) throw new ErroNegocio('Orçamento aprovado não encontrado.', 404);
  if (o.cobranca_status === 'pago') throw new ErroNegocio('Este orçamento já está pago.');
  const v = Math.round(Number(valor));
  if (!Number.isFinite(v) || v <= 0) throw new ErroNegocio('Informe o valor recebido (maior que zero).');
  if (v > o.valor - o.recebido) throw new ErroNegocio(`O valor passa do que falta receber (${((o.valor - o.recebido) / 100).toFixed(2).replace('.', ',')}).`);
  const dia = data || hoje();
  if (!isData(dia)) throw new ErroNegocio('Data do recebimento inválida.');
  if (dia > hoje()) throw new ErroNegocio('A data do recebimento não pode ser futura.');
  if (lancar && !conta_id) throw new ErroNegocio('Escolha a conta onde o dinheiro entrou.');
  await tx(async () => {
    let lancId = null;
    if (lancar) {
      const cat = await one(`SELECT id FROM categorias WHERE nome = 'Recebimento de cliente' AND tipo = 'entrada'`);
      if (!cat) throw new ErroNegocio('Categoria "Recebimento de cliente" não encontrada em Cadastros.');
      const l = await criarLancamento({ data: dia, tipo: 'entrada', valor: v, conta_id, categoria_id: cat.id, cliente: o.cliente, descricao: `Orçamento ${o.numero}${o.valor > v + o.recebido ? ' (parcial)' : ''}`, criado_por: usuario?.nome, criado_por_id: usuario?.id });
      lancId = l.id;
    }
    await query('INSERT INTO pagamentos (orcamento_id, data, valor, conta_id, lancamento_id, obs, criado_por_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, dia, v, lancar ? Number(conta_id) : conta_id ? Number(conta_id) : null, lancId, txt(obs), usuario?.id ?? null]);
    const quitado = o.recebido + v >= o.valor;
    // quitado: sai da cobrança. Parcial: continua em cobrança do saldo, com novo aviso em 3 dias
    await query('UPDATE orcamentos SET cobranca_status = $2, cobranca_followup_em = $3 WHERE id = $1', [id, quitado ? 'pago' : 'em_cobranca', quitado ? null : addDias(hoje(), 3)]);
  });
  return detalhe(id);
}
