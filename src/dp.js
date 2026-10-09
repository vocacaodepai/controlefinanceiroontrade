// Departamento de Pessoas: ficha do funcionário e controle de ausências (falta, atestado, férias...).
// Dados pessoais e de saúde são sensíveis (LGPD): só o administrador acessa (área 'dp').
import { query, one } from './db.js';
import { ErroNegocio, isData, isMes, hoje, addDias, intervaloMes } from './services.js';

export const REGIMES = { clt: 'CLT (registrado)', pj: 'PJ', comissionado: 'Comissionado', prestador: 'Prestador de serviço', informal: 'Sem registro', socio: 'Sócio', a_verificar: 'A verificar' };
export const VINCULOS = { lt1: 'Registrado na LTON', ontrade: 'Registrado na OnTrade', japeri: 'Registrado em Japeri', informal: 'Sem registro', socio: 'Sócio(a)', a_verificar: 'A verificar' };
export const GRUPOS = { funcionario: 'Funcionário', gestao: 'Diretoria e Gerência' };
export const TIPOS_AUSENCIA = { falta: 'Falta', atestado: 'Atestado médico', ferias: 'Férias', licenca: 'Licença', folga: 'Folga / banco de horas', atraso: 'Atraso' };
const ANEXO_MAX = 3 * 1024 * 1024; // cabe no limite de 4,5 MB do corpo da requisição na Vercel (base64 cresce ~33%)

const TEXTOS = ['nome', 'apelido', 'sexo', 'estado_civil', 'nacionalidade', 'naturalidade', 'escolaridade', 'nome_mae', 'nome_pai', 'dependentes', 'rg', 'rg_orgao', 'titulo_eleitor', 'cnh', 'pis',
  'ctps_numero', 'ctps_serie', 'ctps_uf', 'telefone', 'email', 'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'emergencia_nome', 'emergencia_parentesco', 'emergencia_telefone',
  'plano_saude', 'plano_saude_numero', 'tipo_sanguineo', 'alergias', 'cargo', 'setor', 'vale_transporte', 'tamanho_uniforme', 'banco', 'agencia', 'conta', 'pix', 'obs'];
const DATAS = ['data_nascimento', 'ctps_emissao', 'aso_admissional', 'aso_validade', 'data_admissao', 'data_demissao'];
const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

export function cpfValido(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dig = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
}

const hhmm = (v) => { const t = txt(v); if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new ErroNegocio('Horário inválido (use HH:MM).'); return t; };
const minutos = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// Horas de trabalho por dia, descontado o intervalo
export function jornadaHoras(f) {
  if (!f.jornada_entrada || !f.jornada_saida) return null;
  const min = minutos(f.jornada_saida) - minutos(f.jornada_entrada) - (f.jornada_intervalo_min || 0);
  return min > 0 ? Math.round((min / 60) * 100) / 100 : null;
}

function ler(b) {
  const o = {};
  for (const c of TEXTOS) o[c] = txt(b[c]);
  if (!o.nome) throw new ErroNegocio('Informe o nome do funcionário.');
  for (const c of DATAS) { o[c] = txt(b[c]); if (o[c] && !isData(o[c])) throw new ErroNegocio(`Data inválida em "${c.replace(/_/g, ' ')}".`); }
  const cpf = String(b.cpf || '').replace(/\D/g, '');
  if (cpf && !cpfValido(cpf)) throw new ErroNegocio('CPF inválido.');
  o.cpf = cpf || null;
  if (o.email && !/^\S+@\S+\.\S+$/.test(o.email)) throw new ErroNegocio('E-mail inválido.');
  if (o.uf) o.uf = o.uf.toUpperCase().slice(0, 2);
  if (o.ctps_uf) o.ctps_uf = o.ctps_uf.toUpperCase().slice(0, 2);
  if (o.data_admissao && o.data_demissao && o.data_demissao < o.data_admissao) throw new ErroNegocio('A demissão não pode ser antes da admissão.');
  o.vinculo = b.vinculo || 'a_verificar';
  if (!VINCULOS[o.vinculo]) throw new ErroNegocio('Vínculo inválido.');
  o.grupo = b.grupo === 'gestao' ? 'gestao' : 'funcionario';
  o.regime = b.regime || 'a_verificar';
  if (!REGIMES[o.regime]) throw new ErroNegocio('Regime inválido.');
  o.salario = b.salario == null || b.salario === '' ? null : Math.round(Number(b.salario));
  if (o.salario != null && (!Number.isFinite(o.salario) || o.salario < 0)) throw new ErroNegocio('Salário inválido.');
  o.jornada_entrada = hhmm(b.jornada_entrada); o.jornada_saida = hhmm(b.jornada_saida);
  o.jornada_intervalo_min = b.jornada_intervalo_min == null || b.jornada_intervalo_min === '' ? null : Number(b.jornada_intervalo_min);
  if (o.jornada_intervalo_min != null && (!Number.isInteger(o.jornada_intervalo_min) || o.jornada_intervalo_min < 0 || o.jornada_intervalo_min > 240)) throw new ErroNegocio('Intervalo inválido (em minutos).');
  const dias = Array.isArray(b.dias_trabalho) ? b.dias_trabalho : String(b.dias_trabalho ?? '1,2,3,4,5').split(',');
  const set = [...new Set(dias.map((d) => String(d).trim()).filter((d) => /^[0-6]$/.test(d)))].sort();
  o.dias_trabalho = set.join(',');
  o.ativo = b.ativo === 0 || b.ativo === false || b.ativo === '0' ? 0 : 1;
  return o;
}
const CAMPOS = [...TEXTOS, ...DATAS, 'cpf', 'vinculo', 'regime', 'grupo', 'salario', 'jornada_entrada', 'jornada_saida', 'jornada_intervalo_min', 'dias_trabalho', 'ativo'];

export async function salvar(id, b) {
  const o = ler(b);
  if (id) {
    const r = await one(`UPDATE funcionarios SET ${CAMPOS.map((c, i) => `${c}=$${i + 1}`).join(',')} WHERE id=$${CAMPOS.length + 1} RETURNING id`, [...CAMPOS.map((c) => o[c]), id]);
    if (!r) throw new ErroNegocio('Funcionário não encontrado.', 404);
    return ficha(id);
  }
  const r = await one(`INSERT INTO funcionarios (${CAMPOS.join(',')}) VALUES (${CAMPOS.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`, CAMPOS.map((c) => o[c]));
  return ficha(r.id);
}

// O que falta preencher na ficha
export function pendencias(f) {
  const falta = [];
  const gestao = f.grupo === 'gestao'; // sócios e gerentes: sem exigir horário nem carteira de trabalho
  const exige = [['cpf', 'CPF'], ['data_nascimento', 'Nascimento'], ['telefone', 'Telefone'], ['endereco', 'Endereço'], ['emergencia_nome', 'Contato de emergência'], ['emergencia_telefone', 'Telefone de emergência'], ['data_admissao', gestao ? 'Data de entrada' : 'Admissão'], ...(gestao ? [] : [['jornada_entrada', 'Horário de trabalho']])];
  for (const [c, n] of exige) if (!f[c]) falta.push(n);
  if (!gestao && ['clt', 'a_verificar'].includes(f.regime) && !f.ctps_numero) falta.push('Carteira de trabalho');
  return falta;
}

const comExtras = (f) => ({ ...f, jornada_horas: jornadaHoras(f), pendencias: pendencias(f) });

export async function listar({ todos } = {}) {
  const l = await query(`SELECT * FROM funcionarios ${todos ? '' : 'WHERE ativo = 1'} ORDER BY ativo DESC, (grupo = 'gestao') DESC, CASE WHEN grupo = 'gestao' THEN id END, lower(nome)`);
  return l.map(comExtras);
}

const COLS_AUS = 'a.id, a.funcionario_id, a.tipo, a.data_inicio, a.data_fim, a.justificada, a.obs, a.anexo_nome, a.anexo_tipo, a.anexo_tamanho, a.criado_em, u.nome AS criado_por_nome';

export async function ficha(id) {
  const f = await one('SELECT * FROM funcionarios WHERE id = $1', [id]);
  if (!f) throw new ErroNegocio('Funcionário não encontrado.', 404);
  const ausencias = await query(`SELECT ${COLS_AUS} FROM ausencias a LEFT JOIN usuarios u ON u.id = a.criado_por_id WHERE a.funcionario_id = $1 ORDER BY a.data_inicio DESC, a.id DESC`, [id]);
  return { ...comExtras(f), ausencias: ausencias.map((a) => ({ ...a, dias_uteis: diasAfetados(a.data_inicio, a.data_fim, f.dias_trabalho) })) };
}

// ---------- ausências ----------
// Conta só os dias em que a pessoa trabalharia (0 = domingo ... 6 = sábado)
export function diasAfetados(inicio, fim, diasTrabalho = '1,2,3,4,5') {
  const set = new Set(String(diasTrabalho).split(',').filter(Boolean).map(Number));
  let n = 0;
  for (let d = inicio; d <= fim; d = addDias(d, 1)) if (set.has(new Date(d + 'T12:00:00Z').getUTCDay())) n++;
  return n;
}

function lerAnexo(a) {
  if (!a) return null;
  const buf = Buffer.from(String(a.base64 || ''), 'base64');
  if (!buf.length) throw new ErroNegocio('Arquivo vazio.');
  if (buf.length > ANEXO_MAX) throw new ErroNegocio('O arquivo passa de 3 MB. Envie uma foto menor ou um PDF mais leve.');
  const tipo = buf.subarray(0, 4).toString('hex').startsWith('25504446') ? 'application/pdf'
    : buf.subarray(0, 3).toString('hex') === 'ffd8ff' ? 'image/jpeg'
    : buf.subarray(0, 4).toString('hex') === '89504e47' ? 'image/png' : null;
  if (!tipo) throw new ErroNegocio('Anexe um PDF, JPG ou PNG.');
  const nome = String(a.nome || 'atestado').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
  return { buf, tipo, nome };
}

export async function criarAusencia(b, usuario) {
  const f = await one('SELECT id, dias_trabalho FROM funcionarios WHERE id = $1', [Number(b.funcionario_id)]);
  if (!f) throw new ErroNegocio('Funcionário não encontrado.', 404);
  if (!TIPOS_AUSENCIA[b.tipo]) throw new ErroNegocio('Tipo de ausência inválido.');
  const ini = b.data_inicio, fim = b.data_fim || b.data_inicio;
  if (!isData(ini) || !isData(fim)) throw new ErroNegocio('Informe as datas da ausência.');
  if (fim < ini) throw new ErroNegocio('A data final não pode ser antes da inicial.');
  if (diasAfetados(ini, fim, f.dias_trabalho) > 366) throw new ErroNegocio('Período longo demais.');
  const choque = await one(`SELECT tipo, data_inicio, data_fim FROM ausencias WHERE funcionario_id = $1 AND data_inicio <= $3 AND data_fim >= $2 LIMIT 1`, [f.id, ini, fim]);
  if (choque) throw new ErroNegocio(`Já existe ${TIPOS_AUSENCIA[choque.tipo].toLowerCase()} lançado em parte deste período (${choque.data_inicio.split('-').reverse().join('/')} a ${choque.data_fim.split('-').reverse().join('/')}).`, 409);
  const anexo = lerAnexo(b.anexo);
  const justificada = b.justificada === undefined ? ['atestado', 'ferias', 'licenca', 'folga'].includes(b.tipo) : !!b.justificada;
  const r = await one(`INSERT INTO ausencias (funcionario_id,tipo,data_inicio,data_fim,justificada,obs,anexo_nome,anexo_tipo,anexo_tamanho,anexo,criado_por_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [f.id, b.tipo, ini, fim, justificada ? 1 : 0, txt(b.obs), anexo?.nome ?? null, anexo?.tipo ?? null, anexo?.buf.length ?? null, anexo?.buf ?? null, usuario?.id ?? null]);
  return one(`SELECT ${COLS_AUS} FROM ausencias a LEFT JOIN usuarios u ON u.id = a.criado_por_id WHERE a.id = $1`, [r.id]);
}

export async function anexarAusencia(id, anexo) {
  const a = lerAnexo(anexo);
  if (!a) throw new ErroNegocio('Escolha o arquivo.');
  const r = await one('UPDATE ausencias SET anexo_nome=$1, anexo_tipo=$2, anexo_tamanho=$3, anexo=$4 WHERE id=$5 RETURNING id', [a.nome, a.tipo, a.buf.length, a.buf, id]);
  if (!r) throw new ErroNegocio('Ausência não encontrada.', 404);
}

export async function lerAnexoAusencia(id) {
  const r = await one('SELECT anexo, anexo_nome, anexo_tipo FROM ausencias WHERE id = $1', [id]);
  if (!r?.anexo) throw new ErroNegocio('Esta ausência não tem anexo.', 404);
  return { buf: Buffer.from(r.anexo), nome: r.anexo_nome, tipo: r.anexo_tipo };
}

export async function excluirAusencia(id) {
  const r = await one('DELETE FROM ausencias WHERE id = $1 RETURNING id', [id]);
  if (!r) throw new ErroNegocio('Ausência não encontrada.', 404);
}

export async function listarAusencias(mes) {
  if (!isMes(mes)) throw new ErroNegocio('Mês inválido.');
  const { de, ate } = intervaloMes(mes);
  const l = await query(`SELECT ${COLS_AUS}, f.nome AS funcionario_nome, f.dias_trabalho FROM ausencias a JOIN funcionarios f ON f.id = a.funcionario_id
    LEFT JOIN usuarios u ON u.id = a.criado_por_id WHERE a.data_inicio <= $2 AND a.data_fim >= $1 ORDER BY a.data_inicio DESC, a.id DESC`, [de, ate]);
  return l.map((a) => ({ ...a, dias_uteis: diasAfetados(a.data_inicio < de ? de : a.data_inicio, a.data_fim > ate ? ate : a.data_fim, a.dias_trabalho) }));
}

// Visão geral do mês: quem está fora hoje, aniversariantes, e o total de ausência por pessoa (dias e horas)
export async function resumo(mes) {
  if (!isMes(mes)) throw new ErroNegocio('Mês inválido.');
  const { de, ate } = intervaloMes(mes);
  const h = hoje();
  const funcs = (await query('SELECT * FROM funcionarios WHERE ativo = 1 ORDER BY lower(nome)')).map(comExtras);
  const aus = await query('SELECT funcionario_id, tipo, data_inicio, data_fim, justificada FROM ausencias WHERE data_inicio <= $2 AND data_fim >= $1', [de, ate]);
  const porPessoa = funcs.map((f) => {
    const t = { falta: 0, atestado: 0, ferias: 0, licenca: 0, folga: 0, atraso: 0 };
    let injustificados = 0;
    for (const a of aus.filter((x) => x.funcionario_id === f.id)) {
      if (a.tipo === 'atraso') { t.atraso++; continue; }
      const d = diasAfetados(a.data_inicio < de ? de : a.data_inicio, a.data_fim > ate ? ate : a.data_fim, f.dias_trabalho);
      t[a.tipo] += d;
      if (!a.justificada) injustificados += d;
    }
    const dias = t.falta + t.atestado + t.ferias + t.licenca + t.folga;
    return { id: f.id, nome: f.nome, ...t, dias, injustificados, horas: f.jornada_horas ? Math.round(dias * f.jornada_horas * 10) / 10 : null };
  });
  const fora = await query(`SELECT a.tipo, f.id AS funcionario_id, f.nome, a.data_fim FROM ausencias a JOIN funcionarios f ON f.id = a.funcionario_id WHERE a.data_inicio <= $1 AND a.data_fim >= $1 AND f.ativo = 1 ORDER BY f.nome`, [h]);
  const aniversarios = funcs.filter((f) => f.data_nascimento && f.data_nascimento.slice(5, 7) === mes.slice(5)).map((f) => ({ id: f.id, nome: f.nome, dia: Number(f.data_nascimento.slice(8)), idade: Number(mes.slice(0, 4)) - Number(f.data_nascimento.slice(0, 4)) })).sort((a, b) => a.dia - b.dia);
  const em30 = addDias(h, 30);
  const asoVencendo = funcs.filter((f) => f.aso_validade && f.aso_validade <= em30).map((f) => ({ id: f.id, nome: f.nome, validade: f.aso_validade, vencido: f.aso_validade < h }));
  return { mes, hoje: h, ativos: funcs.filter((f) => f.grupo !== 'gestao').length, gestao: funcs.filter((f) => f.grupo === 'gestao').length, fora_hoje: fora, aniversarios, aso_vencendo: asoVencendo, por_pessoa: porPessoa, fichas_incompletas: funcs.filter((f) => f.pendencias.length).map((f) => ({ id: f.id, nome: f.nome, faltam: f.pendencias })) };
}
