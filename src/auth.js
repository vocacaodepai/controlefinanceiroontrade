import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { db } from './db.js';
import { ErroNegocio } from './services.js';

// Papéis: leitor (só consulta e baixa Excel) < operador (lança e fecha o dia) < admin (tudo).
export const PAPEIS = { leitor: 1, operador: 2, admin: 3 };
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

export const totalUsuarios = () => db.prepare('SELECT COUNT(*) n FROM usuarios').get().n;

export function criarUsuario({ nome, email, senha, papel }) {
  if (!nome?.trim()) throw new ErroNegocio('Informe o nome.');
  if (!emailOk(email)) throw new ErroNegocio('E-mail inválido.');
  if (!PAPEIS[papel]) throw new ErroNegocio('Perfil inválido.');
  validarSenha(senha);
  try {
    const r = db.prepare('INSERT INTO usuarios (nome,email,senha_hash,papel) VALUES (?,?,?,?)')
      .run(nome.trim(), email.trim().toLowerCase(), hashSenha(senha), papel);
    return publico(db.prepare('SELECT * FROM usuarios WHERE id=?').get(r.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ErroNegocio('Já existe um usuário com este e-mail.', 409);
    throw e;
  }
}
const publico = (u) => u && { id: u.id, nome: u.nome, email: u.email, papel: u.papel, ativo: !!u.ativo, ultimo_acesso: u.ultimo_acesso };
export const listarUsuarios = () => db.prepare('SELECT * FROM usuarios ORDER BY nome').all().map(publico);

// Impede deixar o sistema sem nenhum administrador ativo.
function garantirAdmin(idAfetado, novo) {
  const u = db.prepare('SELECT * FROM usuarios WHERE id=?').get(idAfetado);
  if (!u) throw new ErroNegocio('Usuário não encontrado.', 404);
  const perde = u.papel === 'admin' && u.ativo && ((novo.papel && novo.papel !== 'admin') || novo.ativo === 0 || novo.ativo === false);
  if (perde) {
    const outros = db.prepare("SELECT COUNT(*) n FROM usuarios WHERE papel='admin' AND ativo=1 AND id<>?").get(idAfetado).n;
    if (!outros) throw new ErroNegocio('Precisa existir pelo menos um administrador ativo.', 409);
  }
}
export function atualizarUsuario(id, b) {
  garantirAdmin(id, b);
  if (b.papel !== undefined && !PAPEIS[b.papel]) throw new ErroNegocio('Perfil inválido.');
  if (b.nome !== undefined) db.prepare('UPDATE usuarios SET nome=? WHERE id=?').run(String(b.nome).trim(), id);
  if (b.papel !== undefined) db.prepare('UPDATE usuarios SET papel=? WHERE id=?').run(b.papel, id);
  if (b.ativo !== undefined) {
    db.prepare('UPDATE usuarios SET ativo=? WHERE id=?').run(b.ativo ? 1 : 0, id);
    if (!b.ativo) db.prepare('DELETE FROM sessoes WHERE usuario_id=?').run(id);
  }
  if (b.senha) {
    validarSenha(b.senha);
    db.prepare('UPDATE usuarios SET senha_hash=? WHERE id=?').run(hashSenha(b.senha), id);
    db.prepare('DELETE FROM sessoes WHERE usuario_id=?').run(id);
  }
  return publico(db.prepare('SELECT * FROM usuarios WHERE id=?').get(id));
}

// ---- tentativas de login (limite simples em memória) ----
const falhas = new Map();
const JANELA = 15 * 60 * 1000, MAX = 8;
function bloqueado(chave) {
  const f = (falhas.get(chave) || []).filter((t) => Date.now() - t < JANELA);
  falhas.set(chave, f);
  return f.length >= MAX;
}

export function login(email, senha, ip) {
  const chave = `${ip}|${String(email).toLowerCase()}`;
  if (bloqueado(chave)) throw new ErroNegocio('Muitas tentativas. Aguarde alguns minutos.', 429);
  const u = db.prepare('SELECT * FROM usuarios WHERE email=?').get(String(email || '').trim().toLowerCase());
  // Faz o hash mesmo se o usuário não existir, para não revelar quais e-mails existem.
  const ok = u ? confere(String(senha || ''), u.senha_hash) : (confere('x', hashSenha('y')), false);
  if (!ok || !u.ativo) {
    falhas.get(chave).push(Date.now());
    throw new ErroNegocio('E-mail ou senha incorretos.', 401);
  }
  falhas.delete(chave);
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(Date.now());
  db.prepare('INSERT INTO sessoes (token_hash,usuario_id,expira_em) VALUES (?,?,?)').run(sha(token), u.id, Date.now() + DURACAO_MS);
  db.prepare("UPDATE usuarios SET ultimo_acesso=datetime('now','localtime') WHERE id=?").run(u.id);
  return { token, usuario: publico(u) };
}

export const logout = (token) => token && db.prepare('DELETE FROM sessoes WHERE token_hash=?').run(sha(token));

export function usuarioDoToken(token) {
  if (!token) return null;
  const u = db.prepare(`SELECT u.* FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id
    WHERE s.token_hash=? AND s.expira_em>? AND u.ativo=1`).get(sha(token), Date.now());
  return publico(u) || null;
}

export function trocarSenha(usuario, atual, nova) {
  const u = db.prepare('SELECT * FROM usuarios WHERE id=?').get(usuario.id);
  if (!confere(String(atual || ''), u.senha_hash)) throw new ErroNegocio('Senha atual incorreta.', 401);
  validarSenha(nova);
  db.prepare('UPDATE usuarios SET senha_hash=? WHERE id=?').run(hashSenha(nova), u.id);
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

export const autenticar = (req, _res, next) => { req.usuario = usuarioDoToken(lerCookie(req)); next(); };

export const exigir = (papel = 'leitor') => (req, res, next) => {
  if (!req.usuario) return res.status(401).json({ erro: 'Faça login para continuar.' });
  if (PAPEIS[req.usuario.papel] < PAPEIS[papel]) return res.status(403).json({ erro: 'Seu perfil não tem permissão para esta ação.' });
  next();
};
