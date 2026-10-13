// Comercial: clientes (CRM), orçamentos, follow-up de 3 dias e números "ao vivo".
// Valores em centavos; datas em YYYY-MM-DD (America/Sao_Paulo).
import { query, one, tx } from './db.js';
import { ErroNegocio, isData, isMes, hoje, addDias, intervaloMes } from './services.js';

const soDigitos = (s) => String(s || '').replace(/\D/g, '');
// Cadência de follow-up (padrão de mercado para proposta/orçamento): toques nos dias 3, 7, 14 e 21 depois do envio.
// Cada toque deve acrescentar algo (dúvida, condição, prazo) e o último é o de encerramento. Sem resposta, a cadência acaba e o orçamento
// vai para a lista "cadência concluída" para a decisão de encerrar como sem retorno.
export const CADENCIA_FOLLOWUP = [3, 7, 14, 21];
export const PRAZO_FOLLOWUP = CADENCIA_FOLLOWUP[0];
export const CANAIS_CONTATO = { whatsapp: 'WhatsApp', ligacao: 'Ligação', email: 'E-mail', presencial: 'Presencial' };
export const RESULTADOS_CONTATO = { sem_resposta: 'Não respondeu', respondeu: 'Respondeu, vai avaliar', interessado: 'Interessado / negociando', pediu_prazo: 'Pediu mais prazo' };
// Data do próximo aviso: segue a cadência a partir da data do orçamento; se já passou, volta em 2 dias; interessado volta em até 3 dias
export function proximoAviso(dataOrc, contatosFeitos, resultado, adiarDias, h = hoje()) {
  if (adiarDias) return addDias(h, adiarDias);
  const dias = CADENCIA_FOLLOWUP[contatosFeitos];
  if (dias === undefined) return null; // cadência concluída
  let d = addDias(dataOrc, dias);
  if (d <= h) d = addDias(h, 2);
  if (resultado === 'interessado' && d > addDias(h, 3)) d = addDias(h, 3);
  return d;
}
export const STATUS = { aberto: 'Em aberto', ganho: 'Ganho', perdido: 'Perdido', cancelado: 'Cancelado' };
// De onde veio o orçamento (obrigatório): base do rastreio de marketing
export const ORIGENS = {
  instagram: 'Instagram', facebook: 'Facebook', google_anuncio: 'Google (anúncio)', google_busca: 'Google (busca)', tiktok: 'TikTok', youtube: 'YouTube',
  whatsapp: 'WhatsApp direto', site: 'Site', indicacao: 'Indicação', cliente_antigo: 'Cliente antigo', anuncio_rua: 'Anúncio na rua / outdoor', feira: 'Feira ou evento', outro: 'Outro',
};
// Origens que podem estar ligadas a uma campanha paga cadastrada no Marketing
export const CANAL_DA_ORIGEM = { instagram: 'instagram', facebook: 'facebook', google_anuncio: 'google', tiktok: 'tiktok', youtube: 'youtube', anuncio_rua: 'outdoor' };
// Checklists de conferência: o formulário só envia depois que a pessoa marca todos os itens (o servidor confere de novo)
export const CHECKLIST_ORCAMENTO = {
  cliente: 'Conferi o nome do cliente, o telefone com DDD e o e-mail',
  produto_valor: 'Conferi o tipo de produto e o valor do orçamento',
  origem: 'Marquei de onde veio o orçamento (e a campanha, se veio de anúncio)',
  enviado: 'O orçamento já foi enviado ao cliente (WhatsApp ou e-mail)',
};
export const CHECKLIST_CLIENTE = {
  busca: 'Busquei antes e este cliente ainda não estava cadastrado',
  contato: 'Conferi o nome e o telefone com DDD',
  email_aniversario: 'Conferi o e-mail e a data de aniversário',
};
export function exigirChecklist(marcado, definicao, rotulo) {
  const falta = Object.keys(definicao).filter((k) => marcado?.[k] !== true);
  if (falta.length) throw new ErroNegocio(`Confirme o checklist ${rotulo} antes de registrar: marque todos os itens.`);
  return true;
}
const AGORA = "(now() AT TIME ZONE 'America/Sao_Paulo')";
const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

// ---------- catálogo de produtos ----------
export const produtos = () => query('SELECT id, nome FROM produtos_catalogo WHERE ativo = 1 ORDER BY nome');
async function produtoPorNome(nome) {
  const n = txt(nome);
  if (!n) return null;
  const achou = await one('SELECT id FROM produtos_catalogo WHERE lower(nome) = lower($1)', [n]);
  if (achou) { await query('UPDATE produtos_catalogo SET ativo = 1 WHERE id = $1', [achou.id]); return achou.id; }
  return (await one('INSERT INTO produtos_catalogo (nome) VALUES ($1) RETURNING id', [n])).id;
}

// ---------- clientes ----------
// Campos obrigatórios da ficha do cliente (o formulário marca com asterisco)
export const OBRIGATORIOS_CLIENTE = { nome: 'nome', telefone: 'telefone', email: 'e-mail', aniversario: 'aniversário' };
export const faltasCliente = (c) => Object.entries(OBRIGATORIOS_CLIENTE).filter(([k]) => !txt(c?.[k]) || (k === 'telefone' && String(c[k]).replace(/\D/g, '').length < 10)).map(([, r]) => r);

function lerCliente(b) {
  const faltas = faltasCliente(b);
  if (faltas.length) throw new ErroNegocio(`Preencha os campos obrigatórios da ficha do cliente: ${faltas.join(', ')}.`);
  const nome = txt(b.nome);
  const aniv = txt(b.aniversario);
  if (!isData(aniv)) throw new ErroNegocio('Data de aniversário inválida.');
  const email = txt(b.email);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ErroNegocio('E-mail inválido.');
  return { nome, telefone: txt(b.telefone), email, aniversario: aniv, empresa: txt(b.empresa), origem: txt(b.origem), obs: txt(b.obs) };
}

export async function salvarCliente(id, b, usuario) {
  const c = lerCliente(b);
  // não deixa cadastrar a mesma pessoa duas vezes (mesmo e-mail ou mesmo telefone)
  const dig = soDigitos(c.telefone);
  const igual = await one(`SELECT id, nome FROM clientes WHERE ($3::bigint IS NULL OR id <> $3) AND (lower(email) = lower($1) OR regexp_replace(coalesce(telefone,''), '\\D', '', 'g') = $2) LIMIT 1`, [c.email, dig, id ?? null]);
  if (igual) throw new ErroNegocio(`Já existe um cliente com este e-mail ou telefone: ${igual.nome}. Busque por ele em Clientes.`, 409);
  if (id) {
    const r = await one(`UPDATE clientes SET nome=$1,telefone=$2,email=$3,aniversario=$4,empresa=$5,origem=coalesce($6,origem),obs=$7 WHERE id=$8 RETURNING *`,
      [c.nome, c.telefone, c.email, c.aniversario, c.empresa, c.origem, c.obs, id]);
    if (!r) throw new ErroNegocio('Cliente não encontrado.', 404);
    return r;
  }
  return one(`INSERT INTO clientes (nome,telefone,email,aniversario,empresa,origem,obs,criado_por_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [c.nome, c.telefone, c.email, c.aniversario, c.empresa, c.origem, c.obs, usuario?.id ?? null]);
}


// Filtros do histórico: dia em que foi cadastrado (cadastrado_em) e quem cadastrou (por)
function filtrosCliente({ cadastrado_em, por } = {}, p = []) {
  const w = [];
  if (cadastrado_em) { if (!isData(cadastrado_em)) throw new ErroNegocio('Data inválida.'); p.push(cadastrado_em); w.push(`c.criado_em::date = $${p.length}`); }
  if (por) { p.push(Number(por)); w.push(`c.criado_por_id = $${p.length}`); }
  return w;
}

// "Cliente já cadastrado?": procura por nome, telefone ou e-mail
export async function buscarClientes(q, filtros = {}) {
  const t = txt(q);
  const p = [], w = [];
  if (t) {
    const dig = soDigitos(t);
    p.push(`%${t.toLowerCase()}%`);
    let busca = `lower(c.nome) LIKE $1 OR lower(coalesce(c.email,'')) LIKE $1 OR lower(coalesce(c.empresa,'')) LIKE $1`;
    if (dig.length >= 4) { p.push(`%${dig}%`); busca += ` OR regexp_replace(coalesce(c.telefone,''), '\\D', '', 'g') LIKE $2`; }
    w.push(`(${busca})`);
  }
  w.push(...filtrosCliente(filtros, p));
  return query(`${BASE_CLIENTES} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} GROUP BY c.id, uc.nome ORDER BY ${filtros.cadastrado_em || filtros.por ? 'c.criado_em DESC' : 'lower(c.nome)'} LIMIT ${t ? 30 : 500}`, p);
}
const BASE_CLIENTES = `SELECT c.*, uc.nome AS criado_por_nome, count(o.id)::int AS qtd_orcamentos, coalesce(sum(o.valor),0)::bigint AS valor_orcado,
    coalesce(sum(CASE WHEN o.status='ganho' THEN o.valor END),0)::bigint AS valor_comprado, max(o.data) AS ultimo_orcamento
  FROM clientes c LEFT JOIN orcamentos o ON o.cliente_id = c.id LEFT JOIN usuarios uc ON uc.id = c.criado_por_id`;
export const listarClientes = (filtros) => buscarClientes('', filtros);

export async function cliente(id) {
  const c = await one(`${BASE_CLIENTES} WHERE c.id = $1 GROUP BY c.id, uc.nome`, [id]);
  if (!c) throw new ErroNegocio('Cliente não encontrado.', 404);
  const orcamentos = await query(`${BASE_ORC} WHERE o.cliente_id = $1 ORDER BY o.data DESC, o.id DESC`, [id]);
  const contatos = await query(`SELECT t.*, u.nome AS usuario_nome FROM contatos t LEFT JOIN usuarios u ON u.id = t.usuario_id WHERE t.cliente_id = $1 ORDER BY t.criado_em DESC LIMIT 50`, [id]);
  return { ...c, orcamentos, contatos };
}

// ---------- orçamentos ----------
// Número automático e obrigatório: ANO-0001, ANO-0002... (recomeça do zero a cada ano). Quem digita não escolhe o número.
// Só em 2026, como o ano já estava adiantado e houve orçamentos antes do sistema, a contagem continua a partir de 0572.
export const NUMERO_INICIAL_2026 = 572;
export async function proximoNumero(data = hoje()) {
  const ano = String(data).slice(0, 4);
  const r = await one(`SELECT coalesce(max(substring(numero from '[0-9]+$')::int), $2) + 1 AS n FROM orcamentos WHERE numero ~ $1`, [`^${ano}-[0-9]+$`, ano === '2026' ? NUMERO_INICIAL_2026 - 1 : 0]);
  return `${ano}-${String(r.n).padStart(4, '0')}`;
}

const BASE_ORC = `SELECT o.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email,
    coalesce(p.nome, o.produto_desc, 'Sem produto') AS produto, u.nome AS criado_por_nome, cp.nome AS campanha_nome,
    (SELECT count(*)::int FROM contatos t WHERE t.orcamento_id = o.id AND t.tipo = 'follow-up') AS qtd_contatos,
    (SELECT count(*)::int FROM contatos t WHERE t.orcamento_id = o.id AND t.tipo = 'cobranca') AS qtd_cobrancas,
    (SELECT coalesce(sum(g.valor),0)::bigint FROM pagamentos g WHERE g.orcamento_id = o.id) AS recebido
  FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id
  LEFT JOIN produtos_catalogo p ON p.id = o.produto_id LEFT JOIN usuarios u ON u.id = o.criado_por_id
  LEFT JOIN campanhas cp ON cp.id = o.campanha_id`;

const centavos = (v) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) throw new ErroNegocio('Valor do orçamento inválido.');
  return n;
};

export async function criarOrcamento(b, usuario) {
  const falta = [];
  if (!b.produto_id && !txt(b.produto_nome) && !txt(b.produto_desc)) falta.push('tipo de produto');
  if (b.valor === undefined || b.valor === null || b.valor === '') falta.push('valor');
  if (!b.origem) falta.push('origem do orçamento');
  if (b.origem === 'outro' && !txt(b.origem_detalhe)) falta.push('qual a origem (campo "Outro")');
  if (falta.length) throw new ErroNegocio(`Preencha os campos obrigatórios: ${falta.join(', ')}.`);
  if (!ORIGENS[b.origem]) throw new ErroNegocio('Origem do orçamento inválida.');
  const valor = centavos(b.valor);
  if (valor <= 0) throw new ErroNegocio('O valor do orçamento deve ser maior que zero.');
  const data = b.data || hoje();
  if (!isData(data)) throw new ErroNegocio('Data inválida.');
  if (data > hoje()) throw new ErroNegocio('A data do orçamento não pode ser futura.');
  return tx(async () => {
    await query('SELECT pg_advisory_xact_lock(7101)'); // dois lançamentos ao mesmo tempo não repetem o número
    const numero = await proximoNumero(data);
    let cli;
    if (b.cliente_id) {
      cli = await one('SELECT * FROM clientes WHERE id = $1', [Number(b.cliente_id)]);
      if (!cli) throw new ErroNegocio('Cliente não encontrado.', 404);
      if (b.cliente) cli = await salvarCliente(cli.id, b.cliente, usuario); // completa a ficha na hora, se faltava algo
      const faltas = faltasCliente(cli);
      if (faltas.length) throw new ErroNegocio(`A ficha deste cliente está incompleta: faltam ${faltas.join(', ')}. Complete a ficha antes de enviar o orçamento.`);
    } else {
      if (!b.cliente) throw new ErroNegocio('Escolha um cliente já cadastrado ou preencha a ficha de um novo.');
      cli = await salvarCliente(null, b.cliente, usuario);
    }
    let campanhaId = null;
    if (b.campanha_id) {
      const c = await one('SELECT id FROM campanhas WHERE id = $1', [Number(b.campanha_id)]);
      if (!c) throw new ErroNegocio('Campanha não encontrada.', 404);
      campanhaId = c.id;
    }
    // novo = primeiro orçamento deste cliente; recorrente = já tinha orçamento antes
    const antes = await one('SELECT count(*)::int AS n FROM orcamentos WHERE cliente_id = $1', [cli.id]);
    const produtoId = b.produto_id ? Number(b.produto_id) : await produtoPorNome(b.produto_nome);
    if (!produtoId && !txt(b.produto_desc)) throw new ErroNegocio('Informe o tipo de produto (ex.: Painel P3.9).');
    const r = await one(`INSERT INTO orcamentos (numero,cliente_id,produto_id,produto_desc,valor,cliente_tipo,data,followup_em,obs,criado_por_id,origem,origem_detalhe,campanha_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [numero, cli.id, produtoId, txt(b.produto_desc), valor, antes.n > 0 ? 'recorrente' : 'novo', data, addDias(data, PRAZO_FOLLOWUP), txt(b.obs), usuario?.id ?? null,
        b.origem, b.origem === 'outro' ? txt(b.origem_detalhe) : null, campanhaId]);
    if (!cli.origem) await query('UPDATE clientes SET origem = $1 WHERE id = $2', [b.origem, cli.id]); // como o cliente chegou até nós
    return one(`${BASE_ORC} WHERE o.id = $1`, [r.id]);
  });
}

// Tudo o que o formulário de orçamento precisa: produtos, origens e campanhas ativas (para ligar o orçamento ao anúncio)
export async function opcoes() {
  const camp = await query(`SELECT id, nome, canal FROM campanhas WHERE ativa = 1 ORDER BY data_inicio DESC`);
  return { proximo_numero: await proximoNumero(), produtos: await produtos(), origens: ORIGENS, canal_da_origem: CANAL_DA_ORIGEM, campanhas: camp, cadencia: CADENCIA_FOLLOWUP, canais_contato: CANAIS_CONTATO, resultados_contato: RESULTADOS_CONTATO, checklist_orcamento: CHECKLIST_ORCAMENTO, checklist_cliente: CHECKLIST_CLIENTE };
}

export async function listarOrcamentos({ status, de, ate, q, cliente_id, lancado_em, por } = {}) {
  const w = [], p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('?', '$' + p.length)); };
  if (status) { if (!STATUS[status]) throw new ErroNegocio('Situação inválida.'); add('o.status = ?', status); }
  if (de) { if (!isData(de)) throw new ErroNegocio('Data inicial inválida.'); add('o.data >= ?', de); }
  if (ate) { if (!isData(ate)) throw new ErroNegocio('Data final inválida.'); add('o.data <= ?', ate); }
  if (cliente_id) add('o.cliente_id = ?', Number(cliente_id));
  if (lancado_em) { if (!isData(lancado_em)) throw new ErroNegocio('Data inválida.'); add('o.criado_em::date = ?', lancado_em); } // histórico: lançados neste dia
  if (por) add('o.criado_por_id = ?', Number(por));          // histórico: lançados por esta pessoa
  if (txt(q)) { p.push(`%${txt(q).toLowerCase()}%`); w.push(`(lower(c.nome) LIKE $${p.length} OR lower(coalesce(o.numero,'')) LIKE $${p.length})`); }
  return query(`${BASE_ORC} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY ${lancado_em || por ? 'o.criado_em DESC' : 'o.data DESC, o.id DESC'} LIMIT 500`, p);
}

export async function editarOrcamento(id, b) {
  const atual = await one('SELECT * FROM orcamentos WHERE id = $1', [id]);
  if (!atual) throw new ErroNegocio('Orçamento não encontrado.', 404);
  const valor = b.valor !== undefined ? centavos(b.valor) : atual.valor;
  const produtoId = b.produto_id ? Number(b.produto_id) : b.produto_nome ? await produtoPorNome(b.produto_nome) : atual.produto_id;
  await query('UPDATE orcamentos SET valor=$1, produto_id=$2, obs=$3 WHERE id=$4', // o número é automático e não muda
    [valor, produtoId, b.obs !== undefined ? txt(b.obs) : atual.obs, id]);
  return one(`${BASE_ORC} WHERE o.id = $1`, [id]);
}

// ganho / perdido / cancelado (com motivo) ou volta para aberto
export async function mudarStatus(id, { status, motivo }, usuario) {
  if (!STATUS[status]) throw new ErroNegocio('Situação inválida.');
  const m = txt(motivo);
  if ((status === 'perdido' || status === 'cancelado') && !m) throw new ErroNegocio('Informe o motivo (por que foi perdido/cancelado).');
  const atual = await one('SELECT id, status, (SELECT count(*)::int FROM pagamentos g WHERE g.orcamento_id = orcamentos.id) AS pagamentos FROM orcamentos WHERE id = $1', [id]);
  if (!atual) throw new ErroNegocio('Orçamento não encontrado.', 404);
  if (atual.pagamentos > 0 && status !== 'ganho') throw new ErroNegocio('Este orçamento já tem pagamento registrado pelo financeiro; não dá para reabrir ou encerrar de outra forma.', 409);
  if (status === 'aberto') {
    // volta para o follow-up, reiniciando a cadência a partir de hoje (sai da fila de cobrança do financeiro)
    await query(`UPDATE orcamentos SET status='aberto', motivo=NULL, fechado_em=NULL, fechado_por_id=NULL, followup_em=$2, cobranca_status=NULL, cobranca_followup_em=NULL, cobranca_vencimento=NULL WHERE id=$1`, [id, addDias(hoje(), PRAZO_FOLLOWUP)]);
  } else if (status === 'ganho') {
    // aprovado: sai do follow-up do comercial e entra na cobrança do financeiro (primeiro contato no dia seguinte)
    await query(`UPDATE orcamentos SET status='ganho', motivo=NULL, fechado_em=${AGORA}, fechado_por_id=$2, followup_em=NULL, cobranca_status=coalesce(cobranca_status,'a_cobrar'), cobranca_followup_em=coalesce(cobranca_followup_em,$3) WHERE id=$1`, [id, usuario?.id ?? null, addDias(hoje(), 1)]);
  } else {
    await query(`UPDATE orcamentos SET status=$2, motivo=$3, fechado_em=${AGORA}, fechado_por_id=$4, followup_em=NULL WHERE id=$1`, [id, status, m, usuario?.id ?? null]);
  }
  return one(`${BASE_ORC} WHERE o.id = $1`, [id]);
}

// ---------- follow-up ----------
// Orçamentos em aberto cujo aviso já venceu (3 dias depois do envio, ou o prazo escolhido ao adiar)
// Pendentes de hoje. A pessoa do comercial responde pelos orçamentos que ela mesma lançou; administração vê todos.
export const followupsPendentes = (usuario) => usuario?.papel === 'comercial'
  ? query(`${BASE_ORC} WHERE o.status = 'aberto' AND o.followup_em <= $1 AND o.criado_por_id = $2 ORDER BY o.followup_em, o.id`, [hoje(), usuario.id])
  : query(`${BASE_ORC} WHERE o.status = 'aberto' AND o.followup_em <= $1 ORDER BY o.followup_em, o.id`, [hoje()]);

// Registra o contato feito e agenda o próximo aviso (padrão: mais 3 dias)
export async function registrarContato(id, { nota, adiar_dias, canal, resultado, mensagem }, usuario) {
  const o = await one('SELECT id, cliente_id, status, data, (SELECT count(*)::int FROM contatos t WHERE t.orcamento_id = orcamentos.id AND t.tipo = \'follow-up\') AS feitos FROM orcamentos WHERE id = $1', [id]);
  if (!o) throw new ErroNegocio('Orçamento não encontrado.', 404);
  if (o.status !== 'aberto') throw new ErroNegocio('Este orçamento já foi encerrado.');
  if (canal && !CANAIS_CONTATO[canal]) throw new ErroNegocio('Canal de contato inválido.');
  if (resultado && !RESULTADOS_CONTATO[resultado]) throw new ErroNegocio('Resultado do contato inválido.');
  let adiar = adiar_dias == null || adiar_dias === '' ? null : Number(adiar_dias);
  if (adiar != null && (!Number.isInteger(adiar) || adiar < 1 || adiar > 60)) throw new ErroNegocio('O novo prazo deve ser de 1 a 60 dias.');
  if (resultado === 'pediu_prazo' && adiar == null) adiar = 7; // pediu mais prazo: volta em uma semana, se ninguém escolher outro
  const proximo = proximoAviso(o.data, o.feitos + 1, resultado, adiar);
  await tx(async () => {
    await query(`INSERT INTO contatos (orcamento_id, cliente_id, usuario_id, tipo, nota, canal, resultado, mensagem) VALUES ($1,$2,$3,'follow-up',$4,$5,$6,$7)`, [id, o.cliente_id, usuario?.id ?? null, txt(nota), canal || null, resultado || null, txt(mensagem)]);
    await query('UPDATE orcamentos SET followup_em = $2 WHERE id = $1', [id, proximo]);
  });
  return one(`${BASE_ORC} WHERE o.id = $1`, [id]);
}

// Cadência concluída: já teve todos os toques e continua sem resposta; falta decidir (encerrar como sem retorno ou retomar)
export const cadenciaConcluida = () => query(`${BASE_ORC} WHERE o.status = 'aberto' AND o.followup_em IS NULL ORDER BY o.data, o.id`);

// Só adia o aviso, sem registrar contato
export async function adiar(id, dias) {
  const d = Number(dias);
  if (!Number.isInteger(d) || d < 1 || d > 60) throw new ErroNegocio('O novo prazo deve ser de 1 a 60 dias.');
  const r = await one(`UPDATE orcamentos SET followup_em = $2 WHERE id = $1 AND status = 'aberto' RETURNING id`, [id, addDias(hoje(), d)]);
  if (!r) throw new ErroNegocio('Orçamento não encontrado ou já encerrado.', 404);
  return one(`${BASE_ORC} WHERE o.id = $1`, [id]);
}

// ---------- números ----------
// Totais de um período [de, ate]: orçado (pela data do orçamento) e vendido/perdido (pela data do encerramento)
export async function periodo(de, ate) {
  const o = await one(`SELECT count(*)::int AS qtd, coalesce(sum(valor),0)::bigint AS valor,
      count(*) FILTER (WHERE cliente_tipo='novo')::int AS qtd_novos, count(*) FILTER (WHERE cliente_tipo='recorrente')::int AS qtd_recorrentes,
      count(DISTINCT cliente_id) FILTER (WHERE cliente_tipo='novo')::int AS clientes_novos,
      count(DISTINCT cliente_id) FILTER (WHERE cliente_tipo='recorrente')::int AS clientes_recorrentes
    FROM orcamentos WHERE data BETWEEN $1 AND $2`, [de, ate]);
  const f = await one(`SELECT count(*) FILTER (WHERE status='ganho')::int AS qtd_ganho, coalesce(sum(valor) FILTER (WHERE status='ganho'),0)::bigint AS valor_ganho,
      count(*) FILTER (WHERE status='perdido')::int AS qtd_perdido, coalesce(sum(valor) FILTER (WHERE status='perdido'),0)::bigint AS valor_perdido,
      count(*) FILTER (WHERE status='cancelado')::int AS qtd_cancelado, coalesce(sum(valor) FILTER (WHERE status='cancelado'),0)::bigint AS valor_cancelado
    FROM orcamentos WHERE status <> 'aberto' AND fechado_em::date BETWEEN $1 AND $2`, [de, ate]);
  const rev = await one(`SELECT count(DISTINCT orcamento_id)::int AS n FROM contatos WHERE criado_em::date BETWEEN $1 AND $2`, [de, ate]);
  const cn = await one('SELECT count(*)::int AS n FROM clientes WHERE criado_em::date BETWEEN $1 AND $2', [de, ate]);
  return { de, ate, ...o, ...f, revisitados: rev.n, clientes_cadastrados: cn.n };
}

export const produtosDoPeriodo = (de, ate) => query(`SELECT coalesce(p.nome, o.produto_desc, 'Sem produto') AS nome, count(*)::int AS qtd,
    coalesce(sum(o.valor),0)::bigint AS valor_orcado,
    coalesce(sum(o.valor) FILTER (WHERE o.status='ganho'),0)::bigint AS valor_ganho, count(*) FILTER (WHERE o.status='ganho')::int AS qtd_ganho
  FROM orcamentos o LEFT JOIN produtos_catalogo p ON p.id = o.produto_id WHERE o.data BETWEEN $1 AND $2
  GROUP BY 1 ORDER BY valor_orcado DESC, qtd DESC LIMIT 12`, [de, ate]);

export const motivosDoPeriodo = (de, ate) => query(`SELECT status, motivo, count(*)::int AS qtd, coalesce(sum(valor),0)::bigint AS valor FROM orcamentos
  WHERE status IN ('perdido','cancelado') AND fechado_em::date BETWEEN $1 AND $2 GROUP BY status, motivo ORDER BY qtd DESC, valor DESC`, [de, ate]);

// Mesmo recorte em outro mês (ex.: dias 1..8 de setembro quando hoje é dia 8 de outubro)
const recorte = (mes, dia) => { const { de, ultimo } = intervaloMes(mes); return [de, `${mes}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`]; };
const mesAnt = (m) => { const [a, n] = m.split('-').map(Number); return n === 1 ? `${a - 1}-12` : `${a}-${String(n - 1).padStart(2, '0')}`; };
const anoAnt = (m) => `${Number(m.slice(0, 4)) - 1}-${m.slice(5)}`;

export async function serieMensal(mesFim, n = 12) {
  let m = mesFim; const meses = [];
  for (let i = 0; i < n; i++) { meses.unshift(m); m = mesAnt(m); }
  const orc = await query(`SELECT to_char(data,'YYYY-MM') AS mes, count(*)::int AS qtd, coalesce(sum(valor),0)::bigint AS orcado FROM orcamentos WHERE data BETWEEN $1 AND $2 GROUP BY 1`, [`${meses[0]}-01`, intervaloMes(mesFim).ate]);
  const ven = await query(`SELECT to_char(fechado_em,'YYYY-MM') AS mes, count(*)::int AS qtd, coalesce(sum(valor),0)::bigint AS vendido FROM orcamentos WHERE status='ganho' AND fechado_em::date BETWEEN $1 AND $2 GROUP BY 1`, [`${meses[0]}-01`, intervaloMes(mesFim).ate]);
  return meses.map((mes) => ({ mes, qtd: orc.find((x) => x.mes === mes)?.qtd || 0, orcado: orc.find((x) => x.mes === mes)?.orcado || 0, vendido: ven.find((x) => x.mes === mes)?.vendido || 0, qtd_vendas: ven.find((x) => x.mes === mes)?.qtd || 0 }));
}

// Painel ao vivo: dia, mês até agora e comparativos
export async function aoVivo() {
  const h = hoje();
  const mes = h.slice(0, 7), dia = Number(h.slice(8));
  const de = `${mes}-01`, ate = h;
  const ano = h.slice(0, 4);
  const semIni = Number(mes.slice(5)) <= 6 ? `${ano}-01-01` : `${ano}-07-01`;
  const semAntIni = Number(mes.slice(5)) <= 6 ? `${Number(ano) - 1}-07-01` : `${ano}-01-01`;
  const semAntFim = Number(mes.slice(5)) <= 6 ? `${Number(ano) - 1}-12-31` : `${ano}-06-30`;
  const [mAntDe, mAntAte] = recorte(mesAnt(mes), dia);
  const [aAntDe, aAntAte] = recorte(anoAnt(mes), dia);
  const [
    hojeP, mesP, mesAntParcial, mesAntTotal, anoAntParcial, semP, semAntP, anoP, anoAntP, serie, prods, motivos, pend, abertos,
  ] = await Promise.all([
    periodo(h, h), periodo(de, ate), periodo(mAntDe, mAntAte), periodo(`${mesAnt(mes)}-01`, intervaloMes(mesAnt(mes)).ate), periodo(aAntDe, aAntAte),
    periodo(semIni, h), periodo(semAntIni, semAntFim), periodo(`${ano}-01-01`, h), periodo(`${Number(ano) - 1}-01-01`, `${Number(ano) - 1}-12-31`),
    serieMensal(mes), produtosDoPeriodo(de, ate), motivosDoPeriodo(de, ate), followupsPendentes(),
    one(`SELECT count(*)::int AS qtd, coalesce(sum(valor),0)::bigint AS valor FROM orcamentos WHERE status='aberto'`),
  ]);
  const recentes = await query(`${BASE_ORC} WHERE o.data = $1 ORDER BY o.id DESC LIMIT 12`, [h]);
  return {
    atualizado_em: new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }), hoje: h, mes,
    dia: hojeP, mes_atual: mesP,
    comparativos: {
      mes_anterior_parcial: { rotulo: `${mesAnt(mes)} (dias 1 a ${mAntAte.slice(8)})`, ...mesAntParcial },
      mes_anterior_total: { rotulo: mesAnt(mes), ...mesAntTotal },
      mesmo_mes_ano_anterior: { rotulo: anoAnt(mes), ...anoAntParcial },
      semestre: { rotulo: 'Semestre atual', ...semP }, semestre_anterior: { rotulo: 'Semestre anterior', ...semAntP },
      ano: { rotulo: ano, ...anoP }, ano_anterior: { rotulo: String(Number(ano) - 1), ...anoAntP },
    },
    serie, produtos: prods, motivos, em_aberto: abertos, followups_pendentes: pend.length, recentes,
  };
}

// Bloco usado no PDF mensal dos sócios
export async function dadosParaRelatorio(mes) {
  if (!isMes(mes)) return null;
  const { de, ate } = intervaloMes(mes);
  const p = await periodo(de, ate);
  if (!p.qtd && !p.qtd_ganho) return null;
  const prods = await produtosDoPeriodo(de, ate);
  return {
    qtd: p.qtd, valor_orcado: p.valor, qtd_ganho: p.qtd_ganho, valor_ganho: p.valor_ganho,
    qtd_perdido: p.qtd_perdido + p.qtd_cancelado, clientes_novos: p.clientes_novos, clientes_recorrentes: p.clientes_recorrentes,
    produtos: prods.map((x) => ({ nome: x.nome, valor: x.valor_ganho || x.valor_orcado })),
  };
}

// Painel comercial: resumo de tudo o que o time precisa no dia a dia (retornos, orçamentos, clientes)
export async function painelComercial() {
  const h = hoje(), mes = h.slice(0, 7);
  const [hojeP, mesP, abertos, retornos, proximos, deHoje, aniv, concluidos, aprovados] = await Promise.all([
    periodo(h, h), periodo(`${mes}-01`, h),
    one(`SELECT count(*)::int AS qtd, coalesce(sum(valor),0)::bigint AS valor FROM orcamentos WHERE status='aberto'`),
    followupsPendentes(),
    query(`${BASE_ORC} WHERE o.status = 'aberto' AND o.followup_em > $1 AND o.followup_em <= $2 ORDER BY o.followup_em, o.id LIMIT 15`, [h, addDias(h, 7)]),
    query(`${BASE_ORC} WHERE o.data = $1 ORDER BY o.id DESC LIMIT 15`, [h]),
    query(`SELECT id, nome, telefone, aniversario, to_char(aniversario, 'MM-DD') AS mmdd FROM clientes WHERE aniversario IS NOT NULL ORDER BY mmdd`),
    cadenciaConcluida(),
    query(`${BASE_ORC} WHERE o.status = 'ganho' ORDER BY o.fechado_em DESC, o.id DESC LIMIT 8`),
  ]);
  // aniversários dos clientes nos próximos 30 dias (vira o ano se preciso)
  const anoAtual = h.slice(0, 4);
  const aniversarios = aniv.map((c) => {
    let d = `${anoAtual}-${c.mmdd}`;
    if (!isData(d)) d = `${anoAtual}-02-28`;
    if (d < h) d = `${Number(anoAtual) + 1}-${isData(`${Number(anoAtual) + 1}-${c.mmdd}`) ? c.mmdd : '02-28'}`;
    return { id: c.id, nome: c.nome, telefone: c.telefone, data: d };
  }).filter((c) => c.data <= addDias(h, 30)).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 8);
  return {
    atualizado_em: new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }), hoje: h, mes,
    dia: hojeP, mes_atual: mesP, em_aberto: abertos, retornos, cadencia_concluida: concluidos, aprovados_recentes: aprovados, cadencia: CADENCIA_FOLLOWUP, proximos_retornos: proximos, orcamentos_hoje: deHoje, aniversarios,
  };
}

// Mensagem de follow-up enviada: a pessoa confirma o envio e assume a responsabilidade (o sistema não tem como ler o WhatsApp)
export async function followupEnviado(id, { canal = 'whatsapp', mensagem, responsabilidade }, usuario) {
  if (responsabilidade !== true) throw new ErroNegocio('Confirme que enviou a mensagem e que se responsabiliza pelo envio.');
  if (!txt(mensagem)) throw new ErroNegocio('A mensagem enviada não pode ficar vazia.');
  return registrarContato(id, { canal, mensagem, nota: `Mensagem enviada. ${usuario?.nome || 'Usuário'} confirmou o envio e assumiu a responsabilidade.` }, usuario);
}

// Controle de follow-up: o que foi enviado (quem, quando, qual orçamento) e o que vem pela frente
export async function painelFollowup({ de, ate, por } = {}) {
  const h = hoje();
  const ini = de || addDias(h, -6), fim = ate || h;
  if (!isData(ini) || !isData(fim)) throw new ErroNegocio('Período inválido.');
  const p = [ini, fim];
  let filtroPor = '';
  if (por) { p.push(Number(por)); filtroPor = ` AND x.usuario_id = $${p.length}`; }
  const enviados = await query(`SELECT * FROM (
      SELECT t.id, t.criado_em, t.canal, t.resultado, t.nota, t.mensagem, t.usuario_id, u.nome AS usuario_nome,
        o.id AS orcamento_id, o.numero, o.valor, c.nome AS cliente_nome, coalesce(pc.nome, o.produto_desc, 'Sem produto') AS produto,
        row_number() OVER (PARTITION BY t.orcamento_id ORDER BY t.id)::int AS etapa
      FROM contatos t JOIN orcamentos o ON o.id = t.orcamento_id JOIN clientes c ON c.id = o.cliente_id
      LEFT JOIN produtos_catalogo pc ON pc.id = o.produto_id LEFT JOIN usuarios u ON u.id = t.usuario_id WHERE t.tipo = 'follow-up') x
    WHERE x.criado_em::date BETWEEN $1 AND $2${filtroPor} ORDER BY x.criado_em DESC, x.id DESC LIMIT 500`, p);
  const agenda = await query(`${BASE_ORC} WHERE o.status = 'aberto' AND o.followup_em > $1 ORDER BY o.followup_em, o.id LIMIT 300`, [h]);
  const dias = (d) => Math.round((new Date(d + 'T12:00:00') - new Date(h + 'T12:00:00')) / 86400000);
  const bucket = { ate_3: 0, de_4_a_7: 0, de_8_a_14: 0, acima_14: 0 };
  for (const o of agenda) { const n = dias(String(o.followup_em).slice(0, 10)); if (n <= 3) bucket.ate_3++; else if (n <= 7) bucket.de_4_a_7++; else if (n <= 14) bucket.de_8_a_14++; else bucket.acima_14++; }
  const r = await one(`SELECT count(*) FILTER (WHERE status = 'aberto' AND followup_em <= $1)::int AS para_hoje,
      count(*) FILTER (WHERE status = 'aberto' AND followup_em IS NULL)::int AS cadencia_concluida FROM orcamentos`, [h]);
  const hojeEnv = await one(`SELECT count(*)::int AS n FROM contatos WHERE tipo = 'follow-up' AND criado_em::date = $1`, [h]);
  const porPessoa = {};
  for (const e of enviados) porPessoa[e.usuario_nome || 'Sem usuário'] = (porPessoa[e.usuario_nome || 'Sem usuário'] || 0) + 1;
  return {
    hoje: h, de: ini, ate: fim,
    resumo: { enviados_hoje: hojeEnv.n, enviados_periodo: enviados.length, para_hoje: r.para_hoje, cadencia_concluida: r.cadencia_concluida, agenda: bucket },
    por_pessoa: Object.entries(porPessoa).map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd),
    enviados, agenda,
  };
}
