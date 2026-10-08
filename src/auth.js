import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { query, one, tx } from './db.js';
import { ErroNegocio } from './services.js';

// Perfis. O nível vale para o FINANCEIRO: comercial (0, sem acesso) < leitor/sócio (1, só consulta)
// < operador (2, lança e fecha o dia) < admin (3, tudo).
export const PAPEIS = { comercial: 0, leitor: 1, socio: 1, operador: 2, admin: 3 };
const perfilValido = (p) => Object.hasOwn(PAPEIS, p);

// Áreas do site que cada perfil pode abrir. O servidor confere em cada rota; o menu só mostra o que o perfil acessa.
export const AREAS = {
  admin: ['painel', 'lancar', 'fechar', 'extratos', 'mensal', 'patrimonio', 'aovivo', 'comercial', 'societario', 'fluxo', 'cadastros', 'roadmap'],
  operador: ['painel', 'lancar', 'fechar', 'extratos', 'mensal', 'patrimonio', 'fluxo', 'cadastros', 'roadmap'],
  leitor: ['painel', 'lancar', 'fechar', 'extratos', 'mensal', 'patrimonio', 'fluxo', 'cadastros'],
  socio: ['painel', 'mensal', 'patrimonio', 'aovivo', 'societario', 'fluxo'],
  comercial: ['aovivo', 'comercial'],
};
const COOKIE = 'sid';
const DURACAO_MS = 7 * 24 * 3600 * 1000;

export function hashSenha(senha) {
  const sal = randomBytes(16);
  return `scrypt$${sal.toString('hex')}$${scryptSync(senha, sal, 64).toString('hex')}`;
}
function confere(senha, guardado) {
  const [alg, sal, hash] = guardado.split('$');
  if (alg !== 'scrypt') return false;
  const esperado = Buffer.from(hash, 'hex');
  const real = scryptSync(senha, Buffer.from(sal, 'hex'), 64);
  return esperado.length === real.length && timingSafeEqual(esperado, real);
}
const sha = (t) => createHash('sha256').update(t).digest('hex');

export function validarSenha(s) {
  if (typeof s !== 'string' || s.length < 8) throw new ErroNegocio('A senha precisa ter pelo menos 8 caracteres.');
}
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');

const COLS = 'id,nome,email,senha_hash,papel,ativo,criado_em,ultimo_acesso,(foto IS NOT NULL) AS tem_foto,foto_em';
export const totalUsuarios = async () => (await one('SELECT COUNT(*) AS n FROM usuarios')).n;

export async function criarUsuario({ nome, email, senha, papel }) {
  if (!nome?.trim()) throw new ErroNegocio('Informe o nome.');
  if (!emailOk(email)) throw new ErroNegocio('E-mail inválido.');
  if (!perfilValido(papel)) throw new ErroNegocio('Perfil inválido.');
  validarSenha(senha);
  try {
    return publico(await one('INSERT INTO usuarios (nome,email,senha_hash,papel) VALUES ($1,$2,$3,$4) RETURNING ' + COLS + '',
      [nome.trim(), email.trim().toLowerCase(), hashSenha(senha), papel]));
  } catch (e) {
    if (e.code === '23505') throw new ErroNegocio('Já existe um usuário com este e-mail.', 409);
    throw e;
  }
}
const publico = (u) => u && { id: u.id, nome: u.nome, email: u.email, papel: u.papel, ativo: !!u.ativo, ultimo_acesso: u.ultimo_acesso, areas: AREAS[u.papel] || [], tem_foto: !!u.tem_foto, foto_v: u.foto_em ? String(u.foto_em).replace(/\D/g, '') : '0' };
export const listarUsuarios = async () => (await query(`SELECT ${COLS} FROM usuarios ORDER BY nome`)).map(publico);

// Impede deixar o sistema sem nenhum administrador ativo.
async function garantirAdmin(idAfetado, novo) {
  const u = await one(`SELECT ${COLS} FROM usuarios WHERE id=$1`, [idAfetado]);
  if (!u) throw new ErroNegocio('Usuário não encontrado.', 404);
  const perde = u.papel === 'admin' && u.ativo && ((novo.papel && novo.papel !== 'admin') || novo.ativo === 0 || novo.ativo === false);
  if (perde) {
    const { n } = await one("SELECT COUNT(*) AS n FROM usuarios WHERE papel='admin' AND ativo=1 AND id<>$1", [idAfetado]);
    if (!n) throw new ErroNegocio('Precisa existir pelo menos um administrador ativo.', 409);
  }
}
export function atualizarUsuario(id, b) {
  return tx(async () => {
    await query('SELECT pg_advisory_xact_lock(724522)');
    await garantirAdmin(id, b);
    if (b.papel !== undefined && !perfilValido(b.papel)) throw new ErroNegocio('Perfil inválido.');
    if (b.nome !== undefined) await query('UPDATE usuarios SET nome=$1 WHERE id=$2', [String(b.nome).trim(), id]);
    if (b.papel !== undefined) await query('UPDATE usuarios SET papel=$1 WHERE id=$2', [b.papel, id]);
    if (b.ativo !== undefined) {
      await query('UPDATE usuarios SET ativo=$1 WHERE id=$2', [b.ativo ? 1 : 0, id]);
      if (!b.ativo) await query('DELETE FROM sessoes WHERE usuario_id=$1', [id]);
    }
    if (b.senha) {
      validarSenha(b.senha);
      await query('UPDATE usuarios SET senha_hash=$1 WHERE id=$2', [hashSenha(b.senha), id]);
      await query('DELETE FROM sessoes WHERE usuario_id=$1', [id]);
    }
    return publico(await one(`SELECT ${COLS} FROM usuarios WHERE id=$1`, [id]));
  });
}

// ---- tentativas de login (guardadas no banco: valem entre instâncias do servidor) ----
const JANELA = 15 * 60 * 1000, MAX = 8;

export async function login(email, senha, ip) {
  const chave = `${ip}|${String(email).toLowerCase()}`;
  const agora = Date.now();
  await query('DELETE FROM tentativas_login WHERE em < $1', [agora - JANELA]);
  const { n } = await one('SELECT COUNT(*) AS n FROM tentativas_login WHERE chave=$1 AND em>=$2', [chave, agora - JANELA]);
  if (n >= MAX) throw new ErroNegocio('Muitas tentativas. Aguarde alguns minutos.', 429);
  const u = await one(`SELECT ${COLS} FROM usuarios WHERE email=$1`, [String(email || '').trim().toLowerCase()]);
  // Faz o hash mesmo se o usuário não existir, para não revelar quais e-mails existem.
  const ok = u ? confere(String(senha || ''), u.senha_hash) : (confere('x', hashSenha('y')), false);
  if (!ok || !u.ativo) {
    await query('INSERT INTO tentativas_login (chave, em) VALUES ($1,$2)', [chave, agora]);
    throw new ErroNegocio('E-mail ou senha incorretos.', 401);
  }
  await query('DELETE FROM tentativas_login WHERE chave=$1', [chave]);
  const token = randomBytes(32).toString('hex');
  await query('DELETE FROM sessoes WHERE expira_em < $1', [agora]);
  await query('INSERT INTO sessoes (token_hash,usuario_id,expira_em) VALUES ($1,$2,$3)', [sha(token), u.id, agora + DURACAO_MS]);
  await query("UPDATE usuarios SET ultimo_acesso=(now() AT TIME ZONE 'America/Sao_Paulo') WHERE id=$1", [u.id]);
  return { token, usuario: publico(u) };
}

export const logout = async (token) => { if (token) await query('DELETE FROM sessoes WHERE token_hash=$1', [sha(token)]); };

export async function usuarioDoToken(token) {
  if (!token) return null;
  const u = await one(`SELECT u.id,u.nome,u.email,u.papel,u.ativo,u.criado_em,u.ultimo_acesso,(u.foto IS NOT NULL) AS tem_foto,u.foto_em FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id
    WHERE s.token_hash=$1 AND s.expira_em>$2 AND u.ativo=1`, [sha(token), Date.now()]);
  return publico(u) || null;
}

export async function trocarSenha(usuario, atual, nova) {
  const u = await one(`SELECT ${COLS} FROM usuarios WHERE id=$1`, [usuario.id]);
  if (!confere(String(atual || ''), u.senha_hash)) throw new ErroNegocio('Senha atual incorreta.', 401);
  validarSenha(nova);
  await query('UPDATE usuarios SET senha_hash=$1 WHERE id=$2', [hashSenha(nova), u.id]);
}

// ---- cookie / middleware ----
export function lerCookie(req) {
  const m = /(?:^|;\s*)sid=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  return m?.[1];
}
export function gravarCookie(req, res, token) {
  const seguro = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === '1';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? DURACAO_MS / 1000 : 0}${seguro ? '; Secure' : ''}`);
}

export const autenticar = async (req, _res, next) => {
  try { req.usuario = await usuarioDoToken(lerCookie(req)); next(); } catch (e) { next(e); }
};

// Qualquer pessoa logada (trocar a própria senha/foto, ver fotos da equipe).
export const logado = (req, res, next) => (req.usuario ? next() : res.status(401).json({ erro: 'Faça login para continuar.' }));
// Exige acesso a uma área específica do site (ex.: 'societario', 'comercial').
export const exigirArea = (area) => (req, res, next) => {
  if (!req.usuario) return res.status(401).json({ erro: 'Faça login para continuar.' });
  if (!(AREAS[req.usuario.papel] || []).includes(area)) return res.status(403).json({ erro: 'Seu perfil não tem acesso a esta área.' });
  next();
};

export const exigir = (papel = 'leitor') => (req, res, next) => {
  if (!req.usuario) return res.status(401).json({ erro: 'Faça login para continuar.' });
  if (PAPEIS[req.usuario.papel] < PAPEIS[papel]) return res.status(403).json({ erro: 'Seu perfil não tem permissão para esta ação.' });
  next();
};

// Primeiro acesso: cria o administrador uma única vez (com trava contra duas criações simultâneas).
export function criarPrimeiroAdmin(b) {
  return tx(async () => {
    await query('SELECT pg_advisory_xact_lock(724523)');
    if ((await totalUsuarios()) > 0) throw new ErroNegocio('O sistema já foi configurado.', 409);
    if (process.env.SETUP_TOKEN && b.codigo !== process.env.SETUP_TOKEN) throw new ErroNegocio('Código de instalação incorreto.', 403);
    return criarUsuario({ ...b, papel: 'admin' });
  });
}

// ---------- foto de perfil ----------
// O navegador recorta e reduz a imagem (256x256 JPEG). Aqui só validamos e guardamos.
const MAX_FOTO = 150 * 1024;
export async function salvarFoto(usuarioId, imagem) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(imagem || ''));
  if (!m) throw new ErroNegocio('Envie a foto em JPEG.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 500 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw new ErroNegocio('Arquivo de imagem inválido.');
  if (buf.length > MAX_FOTO) throw new ErroNegocio('Foto grande demais. Tente recortar de novo.', 413);
  await query("UPDATE usuarios SET foto=$1, foto_em=(now() AT TIME ZONE 'America/Sao_Paulo') WHERE id=$2", [m[1], usuarioId]);
}
export const removerFoto = (usuarioId) => query('UPDATE usuarios SET foto=NULL, foto_em=NULL WHERE id=$1', [usuarioId]);
export async function lerFoto(usuarioId) {
  const r = await one('SELECT foto FROM usuarios WHERE id=$1', [usuarioId]);
  return r?.foto ? Buffer.from(r.foto, 'base64') : null;
}
// Equipe (sem dados sensíveis): usada para mostrar quem fez cada lançamento.
export const equipe = async () => (await query(`SELECT ${COLS} FROM usuarios ORDER BY nome`)).map((u) => {
  const p = publico(u); return { id: p.id, nome: p.nome, papel: p.papel, ativo: p.ativo, tem_foto: p.tem_foto, foto_v: p.foto_v };
});
