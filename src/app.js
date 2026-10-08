import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { iniciar } from './db.js';
import { seed } from './seed.js';
import * as S from './services.js';
import * as A from './auth.js';
import { excelDia, excelMes } from './export.js';
import * as X from './extratos.js';

export const app = express();
app.set('trust proxy', 1);
app.post('/api/extratos', express.json({ limit: '5mb' })); // upload em base64; as demais rotas ficam com limite pequeno
app.use(express.json({ limit: '100kb' }));
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
// Em desenvolvimento o Express serve a interface; na Vercel quem serve a pasta public/ é a própria Vercel.
app.use(express.static(join(dirname(fileURLToPath(import.meta.url)), '..', 'public')));

// Garante tabelas + dados iniciais antes de atender qualquer chamada da API.
app.use('/api', async (_req, _res, next) => { try { await iniciar(seed); next(); } catch (e) { next(e); } });

const h = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

// ---------- autenticação ----------
const ip = (req) => req.ip || req.socket.remoteAddress || '';
app.use('/api', A.autenticar);

app.get('/api/auth/estado', h(async (req, res) => res.json({ usuario: req.usuario, precisaCriarAdmin: (await A.totalUsuarios()) === 0, exigeCodigo: !!process.env.SETUP_TOKEN })));
app.post('/api/auth/setup', h(async (req, res) => {
  await A.criarPrimeiroAdmin(req.body);
  const { token, usuario } = await A.login(req.body.email, req.body.senha, ip(req));
  A.gravarCookie(req, res, token);
  res.status(201).json({ usuario });
}));
app.post('/api/auth/login', h(async (req, res) => {
  const { token, usuario } = await A.login(req.body.email, req.body.senha, ip(req));
  A.gravarCookie(req, res, token);
  res.json({ usuario });
}));
app.post('/api/auth/logout', h(async (req, res) => { await A.logout(A.lerCookie(req)); A.gravarCookie(req, res, ''); res.status(204).end(); }));
app.post('/api/auth/senha', A.exigir('leitor'), h(async (req, res) => { await A.trocarSenha(req.usuario, req.body.atual, req.body.nova); res.status(204).end(); }));

const ler = A.exigir('leitor'), operar = A.exigir('operador'), admin = A.exigir('admin');

app.get('/api/usuarios', admin, h(async (_, res) => res.json(await A.listarUsuarios())));
app.post('/api/usuarios', admin, h(async (req, res) => res.status(201).json(await A.criarUsuario(req.body))));
app.put('/api/usuarios/:id', admin, h(async (req, res) => res.json(await A.atualizarUsuario(Number(req.params.id), req.body))));

// ---------- dados (leitor consulta · operador lança e fecha · admin configura) ----------
// o nome de quem lançou/fechou vem sempre do usuário logado
const comAutor = (req) => ({ ...req.body, criado_por: req.usuario.nome, fechado_por: req.usuario.nome });
const idNum = (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw new S.ErroNegocio('Identificador inválido.'); return n; };

app.get('/api/meta', ler, h(async (_, res) => res.json({ ...(await S.meta()), hoje: S.hoje() })));

app.get('/api/lancamentos', ler, h(async (req, res) => res.json(await S.listarLancamentos(req.query))));
app.post('/api/lancamentos', operar, h(async (req, res) => res.status(201).json(await S.criarLancamento(comAutor(req)))));
app.put('/api/lancamentos/:id', admin, h(async (req, res) => res.json(await S.atualizarLancamento(idNum(req.params.id), comAutor(req)))));
app.delete('/api/lancamentos/:id', operar, h(async (req, res) => { await S.excluirLancamento(idNum(req.params.id)); res.status(204).end(); }));

const data = (req) => { if (!S.isData(req.params.data)) throw new S.ErroNegocio('Data inválida.'); return req.params.data; };
const mes = (req) => { if (!S.isMes(req.params.mes)) throw new S.ErroNegocio('Mês inválido.'); return req.params.mes; };

app.get('/api/dia/:data', ler, h(async (req, res) => res.json(await S.resumoDia(data(req)))));
app.post('/api/dia/:data/fechar', operar, h(async (req, res) => res.json(await S.fecharDia(data(req), comAutor(req)))));
app.delete('/api/dia/:data/fechar', admin, h(async (req, res) => { await S.reabrirDia(data(req)); res.status(204).end(); }));

app.get('/api/painel/:mes', ler, h(async (req, res) => res.json(await S.painelMes(mes(req)))));

app.post('/api/recorrencias/:id/lancar', operar, h(async (req, res) => res.status(201).json(await S.lancarRecorrencia(idNum(req.params.id), { ...req.body, criado_por: req.usuario.nome }))));

for (const t of ['contas', 'categorias', 'pessoas', 'recorrencias']) {
  app.post(`/api/${t}`, admin, h(async (req, res) => res.status(201).json(await S.salvarCadastro(t, null, req.body))));
  app.put(`/api/${t}/:id`, admin, h(async (req, res) => res.json(await S.salvarCadastro(t, idNum(req.params.id), req.body))));
}

// ---------- extratos bancários (IA) ----------
app.get('/api/extratos', ler, h(async (_, res) => res.json({ extratos: await X.listarExtratos(), ia: X.iaDisponivel() })));
app.post('/api/extratos', operar, h(async (req, res) => res.status(201).json(await X.importarExtrato({ ...req.body, usuario: req.usuario.nome }))));
app.get('/api/extratos/:id', ler, h(async (req, res) => res.json(await X.detalheExtrato(idNum(req.params.id)))));
app.delete('/api/extratos/:id', admin, h(async (req, res) => { await X.excluirExtrato(idNum(req.params.id)); res.status(204).end(); }));
app.put('/api/movimentos/:id', operar, h(async (req, res) => res.json(await X.editarMovimento(idNum(req.params.id), req.body))));
app.post('/api/extratos/:id/lancar', operar, h(async (req, res) => res.json(await X.lancarMovimentos(idNum(req.params.id), req.body.ids, req.usuario.nome))));

async function enviarXlsx(res, wb, nome) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  await wb.xlsx.write(res);
  res.end();
}
app.get('/api/export/dia/:data', ler, h(async (req, res) => enviarXlsx(res, await excelDia(data(req)), `caixa-${req.params.data}.xlsx`)));
app.get('/api/export/mes/:mes', ler, h(async (req, res) => enviarXlsx(res, await excelMes(mes(req)), `controle-mensal-${req.params.mes}.xlsx`)));

app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// eslint-disable-next-line no-unused-vars
app.use((e, _req, res, _next) => {
  if (e.status === 503) return res.status(503).json({ erro: e.message });
  if (e instanceof S.ErroNegocio) return res.status(e.status).json({ erro: e.message });
  if (e.type === 'entity.too.large') return res.status(413).json({ erro: 'Arquivo grande demais. Divida o extrato por período.' });
  if (e.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Requisição inválida.' });
  if (e.code === '23505') return res.status(409).json({ erro: 'Já existe um registro com esse nome.' });
  if (['23503', '23514', '22P02', '22007', '22008'].includes(e.code)) return res.status(400).json({ erro: 'Dados inválidos para esta operação.' });
  console.error(e);
  res.status(500).json({ erro: 'Erro interno.' });
});

export default app;
