// Importação de extratos bancários: lê o arquivo, sugere categoria/pessoa (regras aprendidas + IA)
// e deixa tudo PENDENTE até alguém conferir e confirmar. Nada vira lançamento sozinho.
import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { query, one, tx } from './db.js';
import { ErroNegocio, isData, criarLancamento, diaFechado } from './services.js';

export const MAX_BYTES = 3 * 1024 * 1024; // limite de corpo da Vercel (4,5 MB) com folga para o base64
const MODELO = () => process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

// ---------- cliente de IA (substituível nos testes) ----------
let ia;
export const setIA = (c) => { ia = c; };
const cliente = () => {
  if (ia) return ia;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return (ia = new Anthropic());
};
export const iaDisponivel = () => !!cliente();

// ---------- utilidades ----------
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// termo da regra: descrição sem números/datas, primeiras palavras relevantes
export function termoDe(descricao) {
  const t = norm(descricao).replace(/[0-9]+/g, ' ').replace(/[^a-z ]/g, ' ').split(/\s+/).filter((p) => p.length > 2);
  return t.slice(0, 3).join(' ');
}

export function numeroBR(txt) {
  let s = String(txt ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (/^\+/.test(s)) s = s.slice(1);
  const v = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : (/\.\d{3}(\.|$)/.test(s) && s.split('.').length > 2 ? s.replace(/\./g, '') : s);
  const n = Math.round(parseFloat(v) * 100);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

export function dataBR(txt) {
  const s = String(txt ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s);
  if (!m) return null;
  const ano = m[3].length === 2 ? '20' + m[3] : m[3];
  const d = `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isData(d) ? d : null;
}

function texto(buf) {
  const u = buf.toString('utf8');
  return u.includes('�') ? buf.toString('latin1') : u;
}

// ---------- OFX (sem IA) ----------
export function lerOFX(buf) {
  const t = texto(buf);
  const blocos = t.split(/<STMTTRN>/i).slice(1);
  const campo = (b, tag) => new RegExp(`<${tag}>\\s*([^<\\r\\n]*)`, 'i').exec(b)?.[1]?.trim();
  const linhas = [];
  for (const b of blocos) {
    const dt = campo(b, 'DTPOSTED')?.slice(0, 8);
    const data = dt && /^\d{8}$/.test(dt) ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : null;
    const valor = Math.round(parseFloat(String(campo(b, 'TRNAMT') ?? '').replace(',', '.')) * 100);
    const descricao = [campo(b, 'NAME'), campo(b, 'MEMO')].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' — ');
    if (!data || !Number.isFinite(valor) || valor === 0) continue;
    linhas.push({ data, descricao: descricao || 'Sem descrição', valor: Math.abs(valor), tipo: valor > 0 ? 'entrada' : 'saida' });
  }
  if (!linhas.length) throw new ErroNegocio('Não encontrei lançamentos neste arquivo OFX.');
  return linhas;
}

// ---------- CSV (sem IA) ----------
function linhasCSV(t) {
  const sep = ((t.split('\n')[0].match(/;/g) || []).length >= (t.split('\n')[0].match(/,/g) || []).length) ? ';' : ',';
  const out = []; let linha = [], cel = '', asp = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (asp) { if (c === '"' && t[i + 1] === '"') { cel += '"'; i++; } else if (c === '"') asp = false; else cel += c; }
    else if (c === '"') asp = true;
    else if (c === sep) { linha.push(cel); cel = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; linha.push(cel); cel = ''; if (linha.some((x) => x.trim())) out.push(linha); linha = []; }
    else cel += c;
  }
  linha.push(cel); if (linha.some((x) => x.trim())) out.push(linha);
  return out;
}

export function lerCSV(buf) {
  const rows = linhasCSV(texto(buf).replace(/^﻿/, ''));
  const iCab = rows.findIndex((r) => r.some((c) => /^data/.test(norm(c))) && r.length >= 3);
  if (iCab < 0) throw new ErroNegocio('Não reconheci o cabeçalho do CSV (precisa de colunas de data, descrição e valor). Envie o PDF ou OFX do banco.');
  const cab = rows[iCab].map(norm);
  const col = (re) => cab.findIndex((c) => re.test(c));
  const iData = col(/^data/), iDesc = col(/descri|histor|lancamento|memo|detalhe/);
  const iValor = col(/^valor|^montante|amount/), iCred = col(/credit|entrada/), iDeb = col(/debit|saida/);
  if (iData < 0 || iDesc < 0 || (iValor < 0 && iCred < 0 && iDeb < 0)) throw new ErroNegocio('Não identifiquei as colunas de data, descrição e valor do CSV.');
  const linhas = [];
  for (const r of rows.slice(iCab + 1)) {
    const data = dataBR(r[iData]);
    if (!data) continue;
    let v = NaN;
    if (iValor >= 0) v = numeroBR(r[iValor]);
    if (!Number.isFinite(v) || v === 0) {
      const c = iCred >= 0 ? numeroBR(r[iCred]) : NaN, d = iDeb >= 0 ? numeroBR(r[iDeb]) : NaN;
      if (Number.isFinite(c) && c !== 0) v = Math.abs(c); else if (Number.isFinite(d) && d !== 0) v = -Math.abs(d);
    }
    if (!Number.isFinite(v) || v === 0) continue;
    linhas.push({ data, descricao: String(r[iDesc] ?? '').trim() || 'Sem descrição', valor: Math.abs(v), tipo: v > 0 ? 'entrada' : 'saida' });
  }
  if (!linhas.length) throw new ErroNegocio('Não encontrei lançamentos neste CSV.');
  return linhas;
}

// ---------- PDF / imagem (IA) ----------
const SchemaExtrato = z.object({
  lancamentos: z.array(z.object({
    data: z.string().describe('AAAA-MM-DD'),
    descricao: z.string(),
    valor_centavos: z.number().int().describe('valor absoluto em centavos de real, sempre positivo'),
    tipo: z.enum(['entrada', 'saida']),
  })),
  observacao: z.string().describe('problemas de leitura ou páginas ilegíveis; vazio se tudo certo'),
});

async function lerComIA(buf, mime) {
  const c = cliente();
  if (!c) throw new ErroNegocio('Para ler PDF ou foto é preciso configurar a IA (variável ANTHROPIC_API_KEY). Envie OFX ou CSV, ou peça ao administrador para configurá-la.', 503);
  const b64 = buf.toString('base64');
  const bloco = mime === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } };
  let r;
  try {
    r = await c.messages.parse({
      model: MODELO(),
      max_tokens: 16000,
      output_config: { effort: 'low', format: zodOutputFormat(SchemaExtrato) },
      system: 'Você extrai lançamentos de extratos bancários brasileiros com precisão contábil. Copie fielmente; nunca invente nem some linhas.',
      messages: [{ role: 'user', content: [bloco, { type: 'text', text:
        `Extraia TODOS os lançamentos deste extrato bancário. Regras:
- data no formato AAAA-MM-DD; se o extrato mostrar só dia/mês, deduza o ano pelo período impresso no cabeçalho (hoje é ${new Date().toISOString().slice(0, 10)}).
- valor_centavos: valor absoluto em centavos (R$ 1.234,56 = 123456).
- tipo: "entrada" para créditos/depósitos/recebimentos/PIX recebido; "saida" para débitos/pagamentos/tarifas/PIX enviado.
- IGNORE linhas de saldo (saldo anterior, saldo do dia, saldo final), totais e cabeçalhos.
- descricao: o texto do lançamento como aparece no extrato (inclua nome da contraparte quando houver).
- Na observacao, avise se alguma parte estava ilegível ou cortada.` }] }],
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new ErroNegocio(`A IA não conseguiu ler o arquivo (erro ${e.status}). Tente novamente ou envie OFX/CSV.`, 502);
    throw e;
  }
  if (r.stop_reason === 'max_tokens') throw new ErroNegocio('O extrato é grande demais para uma leitura só. Divida o arquivo por período (por exemplo, uma semana por vez).');
  if (r.stop_reason === 'refusal' || !r.parsed_output) throw new ErroNegocio('A IA não conseguiu processar este arquivo. Tente outro formato (OFX ou CSV).', 502);
  const linhas = [];
  for (const l of r.parsed_output.lancamentos) {
    const data = dataBR(l.data);
    const valor = Math.abs(Math.round(l.valor_centavos));
    if (data && valor > 0) linhas.push({ data, descricao: l.descricao.trim() || 'Sem descrição', valor, tipo: l.tipo });
  }
  if (!linhas.length) throw new ErroNegocio('A IA não encontrou lançamentos neste arquivo.');
  return { linhas, observacao: r.parsed_output.observacao || '' };
}

// ---------- classificação ----------
const SchemaClass = z.object({
  itens: z.array(z.object({
    i: z.number().int(),
    categoria: z.string().nullable().describe('nome EXATO de uma categoria da lista, ou null'),
    pessoa: z.string().nullable().describe('nome EXATO de uma pessoa da lista, ou null'),
    cliente: z.string().nullable().describe('nome do cliente se for recebimento, senão null'),
    confianca: z.enum(['alta', 'media', 'baixa']),
    motivo: z.string().describe('uma frase curta justificando'),
  })),
});

async function classificarComIA(linhas, ctx) {
  const c = cliente();
  if (!c || !linhas.length) return new Map();
  const cats = (t) => ctx.categorias.filter((x) => x.tipo === t && x.ativo).map((x) => `${x.nome} (${x.grupo})`).join('; ');
  const resultado = new Map();
  for (let ini = 0; ini < linhas.length; ini += 60) {
    const lote = linhas.slice(ini, ini + 60);
    try {
      const r = await c.messages.parse({
        model: MODELO(),
        max_tokens: 16000,
        output_config: { effort: 'low', format: zodOutputFormat(SchemaClass) },
        system: `Você classifica lançamentos de extrato para o controle financeiro da OnTrade (importação/exportação) e da LTON, empresa da Elisa Maria que recebe pagamentos de clientes SEM nota e paga folha e despesas da OnTrade.
Categorias de ENTRADA: ${cats('entrada')}.
Categorias de SAÍDA: ${cats('saida')}.
Pessoas cadastradas (nome — função, vínculo): ${ctx.pessoas.filter((p) => p.ativo).map((p) => `${p.nome} — ${p.funcao || ''}, ${p.vinculo}`).join('; ')}.
Exemplos já confirmados pela equipe (termo → categoria / pessoa): ${ctx.regras.map((r) => `${r.termo} → ${r.categoria || '-'} / ${r.pessoa || '-'}`).join('; ') || 'nenhum ainda'}.
Regras: use SOMENTE nomes exatos das listas. Se não tiver segurança, devolva categoria null e confiança baixa — é melhor deixar para a pessoa do que errar. Pagamentos a pessoas cadastradas: associe a pessoa. Transferências entre contas da própria empresa não são receita nem despesa: categoria null e diga isso no motivo.`,
        messages: [{ role: 'user', content: `Classifique:\n${lote.map((l, k) => `${ini + k}|${l.data}|${l.tipo}|R$ ${(l.valor / 100).toFixed(2)}|${l.descricao}`).join('\n')}` }],
      });
      for (const it of r.parsed_output?.itens ?? []) resultado.set(it.i, it);
    } catch (e) {
      if (!(e instanceof Anthropic.APIError)) throw e; // falha da IA não derruba a importação: fica sem sugestão
    }
  }
  return resultado;
}

// ---------- fluxo principal ----------
export function hashLinha(contaId, l, n) {
  return createHash('sha1').update(`${contaId}|${l.data}|${l.tipo}|${l.valor}|${norm(l.descricao)}|${n}`).digest('hex');
}

const MIMES = { 'application/pdf': 'pdf', 'image/png': 'imagem', 'image/jpeg': 'imagem', 'image/webp': 'imagem', 'image/gif': 'imagem' };

export async function importarExtrato({ conta_id, nome, base64, usuario }) {
  const conta = await one('SELECT id, nome FROM contas WHERE id = $1', [Number(conta_id)]);
  if (!conta) throw new ErroNegocio('Escolha a conta do extrato.');
  if (!base64 || typeof base64 !== 'string') throw new ErroNegocio('Arquivo ausente.');
  const buf = Buffer.from(base64, 'base64');
  if (!buf.length) throw new ErroNegocio('Arquivo vazio.');
  if (buf.length > MAX_BYTES) throw new ErroNegocio('Arquivo maior que 3 MB. Divida o extrato por período.', 413);
  const arquivo = String(nome || 'extrato').slice(0, 200);
  const ext = arquivo.toLowerCase().split('.').pop();
  const cabeca = buf.subarray(0, 8).toString('latin1');

  let linhas, formato, observacao = '', usouIA = false;
  if (cabeca.startsWith('%PDF')) { ({ linhas, observacao } = await lerComIA(buf, 'application/pdf')); formato = 'pdf'; usouIA = true; }
  else if (buf[0] === 0x89 && cabeca.includes('PNG')) { ({ linhas, observacao } = await lerComIA(buf, 'image/png')); formato = 'imagem'; usouIA = true; }
  else if (buf[0] === 0xff && buf[1] === 0xd8) { ({ linhas, observacao } = await lerComIA(buf, 'image/jpeg')); formato = 'imagem'; usouIA = true; }
  else if (cabeca.startsWith('RIFF') && buf.subarray(8, 12).toString() === 'WEBP') { ({ linhas, observacao } = await lerComIA(buf, 'image/webp')); formato = 'imagem'; usouIA = true; }
  else if (ext === 'ofx' || /<OFX>|OFXHEADER/i.test(texto(buf.subarray(0, 600)))) { linhas = lerOFX(buf); formato = 'ofx'; }
  else if (['csv', 'txt'].includes(ext)) { linhas = lerCSV(buf); formato = 'csv'; }
  else throw new ErroNegocio('Formato não suportado. Envie PDF, OFX, CSV ou foto (PNG/JPG).');
  if (linhas.length > 1500) throw new ErroNegocio('Extrato com lançamentos demais para uma vez. Divida por período.');

  const [categorias, pessoas, regrasRows] = await Promise.all([
    query('SELECT * FROM categorias'), query('SELECT * FROM pessoas'),
    query(`SELECT r.*, c.nome AS categoria, p.nome AS pessoa FROM regras_classificacao r
           LEFT JOIN categorias c ON c.id = r.categoria_id LEFT JOIN pessoas p ON p.id = r.pessoa_id ORDER BY r.usos DESC, r.atualizado_em DESC`),
  ]);
  const catPorNome = new Map(categorias.map((c) => [norm(c.nome), c]));
  const pesPorNome = new Map(pessoas.map((p) => [norm(p.nome), p]));

  // 1) regras aprendidas (certeza alta)  2) IA para o resto
  const sug = linhas.map((l) => {
    const t = termoDe(l.descricao);
    const r = t && regrasRows.find((x) => x.tipo === l.tipo && x.termo === t);
    return r ? { categoria_id: r.categoria_id, pessoa_id: r.pessoa_id, cliente: null, confianca: 'alta', motivo: `Regra aprendida (${r.usos}× confirmada)` } : null;
  });
  const faltam = linhas.map((l, i) => ({ ...l, i })).filter((l) => !sug[l.i]);
  const porIA = await classificarComIA(faltam, { categorias, pessoas, regras: regrasRows.slice(0, 40) });
  faltam.forEach((l, k) => {
    const it = porIA.get(k);
    if (!it) { sug[l.i] = { categoria_id: null, pessoa_id: null, cliente: null, confianca: 'baixa', motivo: iaDisponivel() ? 'Sem sugestão da IA' : 'Classificação manual (IA não configurada)' }; return; }
    const cat = it.categoria && catPorNome.get(norm(it.categoria));
    const catOk = cat && cat.tipo === l.tipo ? cat : null; // nunca aceita categoria de entrada numa saída (ou vice-versa)
    const pes = it.pessoa && pesPorNome.get(norm(it.pessoa));
    sug[l.i] = { categoria_id: catOk?.id ?? null, pessoa_id: pes?.id ?? null, cliente: it.cliente?.trim() || null, confianca: catOk ? it.confianca : 'baixa', motivo: String(it.motivo || '').slice(0, 300) };
  });

  return tx(async () => {
    const ext = await one(`INSERT INTO extratos (conta_id, arquivo_nome, formato, enviado_por, usou_ia) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [conta.id, arquivo, formato, usuario || null, usouIA || iaDisponivel() ? 1 : 0]);
    const vistos = new Map();
    let novos = 0, duplicados = 0;
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i], s = sug[i];
      const base = `${l.data}|${l.tipo}|${l.valor}|${norm(l.descricao)}`;
      const n = (vistos.get(base) ?? 0) + 1; vistos.set(base, n); // duas linhas idênticas no mesmo extrato são lançamentos distintos
      const r = await one(`INSERT INTO movimentos_importados
        (extrato_id, conta_id, data, descricao, valor, tipo, categoria_id, pessoa_id, cliente, confianca, motivo, hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (conta_id, hash) DO NOTHING RETURNING id`,
        [ext.id, conta.id, l.data, l.descricao.slice(0, 500), l.valor, l.tipo, s.categoria_id, s.pessoa_id, s.cliente, s.confianca, s.motivo, hashLinha(conta.id, l, n)]);
      if (r) novos++; else duplicados++;
    }
    return { id: ext.id, formato, total: linhas.length, novos, duplicados, observacao, ia_usada: usouIA || iaDisponivel() };
  });
}

// ---------- consulta e confirmação ----------
export const listarExtratos = () => query(`
  SELECT e.*, c.nome AS conta,
    (SELECT COUNT(*) FROM movimentos_importados m WHERE m.extrato_id = e.id) AS total,
    (SELECT COUNT(*) FROM movimentos_importados m WHERE m.extrato_id = e.id AND m.status = 'pendente') AS pendentes,
    (SELECT COUNT(*) FROM movimentos_importados m WHERE m.extrato_id = e.id AND m.status = 'lancado') AS lancados
  FROM extratos e JOIN contas c ON c.id = e.conta_id ORDER BY e.id DESC LIMIT 100`);

export async function detalheExtrato(id) {
  const e = await one('SELECT e.*, c.nome AS conta FROM extratos e JOIN contas c ON c.id = e.conta_id WHERE e.id = $1', [id]);
  if (!e) throw new ErroNegocio('Extrato não encontrado.', 404);
  const movimentos = await query(`SELECT m.*, c.nome AS categoria, p.nome AS pessoa FROM movimentos_importados m
    LEFT JOIN categorias c ON c.id = m.categoria_id LEFT JOIN pessoas p ON p.id = m.pessoa_id
    WHERE m.extrato_id = $1 ORDER BY m.data, m.id`, [id]);
  return { ...e, movimentos };
}

export async function editarMovimento(id, b) {
  const m = await one('SELECT * FROM movimentos_importados WHERE id = $1', [id]);
  if (!m) throw new ErroNegocio('Movimento não encontrado.', 404);
  if (m.status === 'lancado') throw new ErroNegocio('Este movimento já virou lançamento.', 409);
  const status = b.status ?? m.status;
  if (!['pendente', 'ignorado'].includes(status)) throw new ErroNegocio('Status inválido.');
  let categoria_id = b.categoria_id === undefined ? m.categoria_id : (b.categoria_id ? Number(b.categoria_id) : null);
  if (categoria_id) {
    const cat = await one('SELECT tipo FROM categorias WHERE id = $1', [categoria_id]);
    if (!cat || cat.tipo !== m.tipo) throw new ErroNegocio(`Categoria incompatível: este movimento é ${m.tipo === 'entrada' ? 'uma entrada' : 'uma saída'}.`);
  }
  const pessoa_id = b.pessoa_id === undefined ? m.pessoa_id : (b.pessoa_id ? Number(b.pessoa_id) : null);
  const cliente = b.cliente === undefined ? m.cliente : (b.cliente?.trim() || null);
  return one(`UPDATE movimentos_importados SET categoria_id=$1, pessoa_id=$2, cliente=$3, status=$4,
    confianca = CASE WHEN $1::bigint IS DISTINCT FROM categoria_id THEN 'alta' ELSE confianca END WHERE id=$5 RETURNING *`,
    [categoria_id, pessoa_id, cliente, status, id]);
}

async function aprender(m) {
  const termo = termoDe(m.descricao);
  if (!termo || !m.categoria_id) return;
  await query(`INSERT INTO regras_classificacao (termo, tipo, categoria_id, pessoa_id) VALUES ($1,$2,$3,$4)
    ON CONFLICT (termo, tipo) DO UPDATE SET categoria_id = EXCLUDED.categoria_id, pessoa_id = EXCLUDED.pessoa_id,
      usos = regras_classificacao.usos + 1, atualizado_em = (now() AT TIME ZONE 'America/Sao_Paulo')`, [termo, m.tipo, m.categoria_id, m.pessoa_id]);
}

// Transforma os movimentos escolhidos em lançamentos. Cada um é independente: o que não puder
// ser lançado (sem categoria, dia fechado...) volta no relatório e permanece pendente.
export async function lancarMovimentos(extratoId, ids, usuario) {
  const e = await one('SELECT id, conta_id FROM extratos WHERE id = $1', [extratoId]);
  if (!e) throw new ErroNegocio('Extrato não encontrado.', 404);
  if (!Array.isArray(ids) || !ids.length) throw new ErroNegocio('Selecione ao menos um movimento.');
  const lancados = [], falhas = [];
  for (const id of ids.map(Number).filter(Number.isInteger)) {
    const m = await one('SELECT * FROM movimentos_importados WHERE id = $1 AND extrato_id = $2', [id, extratoId]);
    if (!m || m.status !== 'pendente') { falhas.push({ id, motivo: 'Já processado ou inexistente.' }); continue; }
    if (!m.categoria_id) { falhas.push({ id, motivo: 'Escolha uma categoria.' }); continue; }
    if (await diaFechado(m.data)) { falhas.push({ id, motivo: `Dia ${m.data} já fechado. Reabra o dia para lançar.` }); continue; }
    try {
      await tx(async () => {
        const l = await criarLancamento({
          data: m.data, tipo: m.tipo, valor: m.valor, conta_id: e.conta_id, categoria_id: m.categoria_id,
          pessoa_id: m.pessoa_id, cliente: m.cliente, descricao: m.descricao, criado_por: `${usuario.nome} (extrato)`, criado_por_id: usuario.id,
        });
        await query("UPDATE movimentos_importados SET status='lancado', lancamento_id=$1 WHERE id=$2", [l.id, id]);
        await aprender(m);
      });
      lancados.push(id);
    } catch (err) {
      if (err instanceof ErroNegocio) falhas.push({ id, motivo: err.message }); else throw err;
    }
  }
  return { lancados: lancados.length, falhas };
}

export async function excluirExtrato(id) {
  const e = await one('SELECT id FROM extratos WHERE id = $1', [id]);
  if (!e) throw new ErroNegocio('Extrato não encontrado.', 404);
  const { n } = await one("SELECT COUNT(*) AS n FROM movimentos_importados WHERE extrato_id=$1 AND status='lancado'", [id]);
  if (n > 0) throw new ErroNegocio('Este extrato já tem movimentos lançados e não pode ser excluído.', 409);
  await query('DELETE FROM extratos WHERE id = $1', [id]);
}
