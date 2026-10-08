import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { seed } from './seed.js';
import * as S from './services.js';
import { excelDia, excelMes } from './export.js';
import * as A from './auth.js';

seed();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use((_, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Cache-Control', 'no-store'); next(); });
app.use(express.static(join(dirname(fileURLToPath(import.meta.url)), '..', 'public')));

const h = (fn) => (req, res) => {
  try { Promise.resolve(fn(req, res)).catch((e) => erro(res, e)); } catch (e) { erro(res, e); }
};
function erro(res, e) {
  if (e instanceof S.ErroNegocio) return res.status(e.status).json({ erro: e.message });
  if (String(e.message).includes('UNIQUE')) return res.status(409).json({ erro: 'Já existe um registro com esse nome.' });
  console.error(e);
  res.status(500).json({ erro: 'Erro interno.' });
}
const hoje = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD no fuso local

// ---------- autenticação ----------
const ip = (req) => req.ip || req.socket.remoteAddress || '';
app.use('/api', A.autenticar);

app.get('/api/auth/estado', h((req, res) => res.json({ usuario: req.usuario, precisaCriarAdmin: A.totalUsuarios() === 0, exigeCodigo: !!process.env.SETUP_TOKEN })));
app.post('/api/auth/setup', h((req, res) => {
  if (A.totalUsuarios() > 0) throw new S.ErroNegocio('O sistema já foi configurado.', 409);
  if (process.env.SETUP_TOKEN && req.body.codigo !== process.env.SETUP_TOKEN) throw new S.ErroNegocio('Código de instalação incorreto.', 403);
  A.criarUsuario({ ...req.body, papel: 'admin' });
  const { token, usuario } = A.login(req.body.email, req.body.senha, ip(req));
  A.gravarCookie(req, res, token);
  res.status(201).json({ usuario });
}));
app.post('/api/auth/login', h((req, res) => {
  const { token, usuario } = A.login(req.body.email, req.body.senha, ip(req));
  A.gravarCookie(req, res, token);
  res.json({ usuario });
}));
app.post('/api/auth/logout', h((req, res) => { A.logout(A.lerCookie(req)); A.gravarCookie(req, res, ''); res.status(204).end(); }));
app.post('/api/auth/senha', A.exigir('leitor'), h((req, res) => { A.trocarSenha(req.usuario, req.body.atual, req.body.nova); res.status(204).end(); }));

app.get('/api/usuarios', A.exigir('admin'), h((_, res) => res.json(A.listarUsuarios())));
app.post('/api/usuarios', A.exigir('admin'), h((req, res) => res.status(201).json(A.criarUsuario(req.body))));
app.put('/api/usuarios/:id', A.exigir('admin'), h((req, res) => res.json(A.atualizarUsuario(Number(req.params.id), req.body))));

// ---------- dados (leitor consulta · operador lança e fecha · admin configura) ----------
const ler = A.exigir('leitor'), operar = A.exigir('operador'), admin = A.exigir('admin');
// o nome de quem lançou/fechou vem sempre do usuário logado
const comAutor = (req) => ({ ...req.body, criado_por: req.usuario.nome, fechado_por: req.usuario.nome });

app.get('/api/meta', ler, h((_, res) => res.json({ ...S.meta(), hoje: hoje() })));

app.get('/api/lancamentos', ler, h((req, res) => res.json(S.listarLancamentos(req.query))));
app.post('/api/lancamentos', operar, h((req, res) => res.status(201).json(S.criarLancamento(comAutor(req)))));
app.put('/api/lancamentos/:id', admin, h((req, res) => res.json(S.atualizarLancamento(Number(req.params.id), comAutor(req)))));
app.delete('/api/lancamentos/:id', operar, h((req, res) => { S.excluirLancamento(Number(req.params.id)); res.status(204).end(); }));

app.get('/api/dia/:data', ler, h((req, res) => {
  if (!S.isData(req.params.data)) throw new S.ErroNegocio('Data inválida.');
  res.json(S.resumoDia(req.params.data));
}));
app.post('/api/dia/:data/fechar', operar, h((req, res) => res.json(S.fecharDia(req.params.data, comAutor(req)))));
app.delete('/api/dia/:data/fechar', admin, h((req, res) => { S.reabrirDia(req.params.data); res.status(204).end(); }));

app.get('/api/painel/:mes', ler, h((req, res) => {
  if (!S.isMes(req.params.mes)) throw new S.ErroNegocio('Mês inválido.');
  res.json(S.painelMes(req.params.mes));
}));

app.post('/api/recorrencias/:id/lancar', operar, h((req, res) => res.status(201).json(S.lancarRecorrencia(Number(req.params.id), req.body))));

for (const t of ['contas', 'categorias', 'pessoas', 'recorrencias']) {
  app.post(`/api/${t}`, admin, h((req, res) => res.status(201).json(S.salvarCadastro(t, null, req.body))));
  app.put(`/api/${t}/:id`, admin, h((req, res) => res.json(S.salvarCadastro(t, Number(req.params.id), req.body))));
}

async function enviarXlsx(res, wb, nome) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  await wb.xlsx.write(res);
  res.end();
}
app.get('/api/export/dia/:data', ler, h(async (req, res) => {
  if (!S.isData(req.params.data)) throw new S.ErroNegocio('Data inválida.');
  await enviarXlsx(res, await excelDia(req.params.data), `caixa-${req.params.data}.xlsx`);
}));
app.get('/api/export/mes/:mes', ler, h(async (req, res) => {
  if (!S.isMes(req.params.mes)) throw new S.ErroNegocio('Mês inválido.');
  await enviarXlsx(res, await excelMes(req.params.mes), `controle-mensal-${req.params.mes}.xlsx`);
}));

const porta = process.env.PORT || 3000;
export const servidor = app.listen(porta, () => console.log(`Controle Financeiro OnTrade em http://localhost:${porta}`));
