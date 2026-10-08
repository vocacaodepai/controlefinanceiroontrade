import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { iniciar } from './db.js';
import { seed } from './seed.js';
import * as S from './services.js';
import * as A from './auth.js';
import { excelDia, excelMes } from './export.js';
import * as X from './extratos.js';
import * as P from './patrimonio.js';
import * as SO from './societario.js';
import * as CO from './comercial.js';
import * as DP from './dp.js';
import { gerarPdf } from './relatorio.js';

export const app = express();
app.set('trust proxy', 1);
app.post('/api/extratos', express.json({ limit: '5mb' })); // upload em base64; as demais rotas ficam com limite pequeno
app.post('/api/dp/ausencias', express.json({ limit: '5mb' })); // atestado anexado em base64 (até 3 MB)
app.post('/api/dp/ausencias/:id/anexo', express.json({ limit: '5mb' }));
app.post('/api/auth/foto', express.json({ limit: '300kb' })); // foto de perfil já reduzida no navegador
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
app.post('/api/auth/senha', A.logado, h(async (req, res) => { await A.trocarSenha(req.usuario, req.body.atual, req.body.nova); res.status(204).end(); }));

app.post('/api/auth/foto', A.logado, h(async (req, res) => { await A.salvarFoto(req.usuario.id, req.body.imagem); res.status(204).end(); }));
app.delete('/api/auth/foto', A.logado, h(async (req, res) => { await A.removerFoto(req.usuario.id); res.status(204).end(); }));

const ler = A.exigir('leitor'), operar = A.exigir('operador'), admin = A.exigir('admin');

app.get('/api/usuarios/:id/foto', A.logado, h(async (req, res) => {
  const foto = await A.lerFoto(idNum(req.params.id));
  if (!foto) return res.status(404).end();
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400'); // a URL muda (?v=) quando a foto é trocada
  res.end(foto);
}));
app.get('/api/usuarios', admin, h(async (_, res) => res.json(await A.listarUsuarios())));
app.post('/api/usuarios', admin, h(async (req, res) => res.status(201).json(await A.criarUsuario(req.body))));
app.put('/api/usuarios/:id', admin, h(async (req, res) => res.json(await A.atualizarUsuario(Number(req.params.id), req.body))));

// ---------- dados (leitor consulta · operador lança e fecha · admin configura) ----------
// o nome de quem lançou/fechou vem sempre do usuário logado
const comAutor = (req) => ({ ...req.body, criado_por: req.usuario.nome, criado_por_id: req.usuario.id, fechado_por: req.usuario.nome, fechado_por_id: req.usuario.id });
const idNum = (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw new S.ErroNegocio('Identificador inválido.'); return n; };

// equipe (nomes, perfis e fotos) para qualquer pessoa logada: usada em "quem fez" e nos avatares
app.get('/api/equipe', A.logado, h(async (_, res) => res.json({ equipe: await A.equipe(), hoje: S.hoje() })));
app.get('/api/meta', ler, h(async (_, res) => res.json({ ...(await S.meta()), equipe: await A.equipe(), hoje: S.hoje() })));

app.get('/api/lancamentos', ler, h(async (req, res) => res.json(await S.listarLancamentos(req.query))));
app.post('/api/lancamentos', operar, h(async (req, res) => res.status(201).json(await S.criarLancamento(comAutor(req)))));
app.put('/api/lancamentos/:id', admin, h(async (req, res) => res.json(await S.atualizarLancamento(idNum(req.params.id), comAutor(req)))));
app.delete('/api/lancamentos/:id', operar, h(async (req, res) => { await S.excluirLancamento(idNum(req.params.id)); res.status(204).end(); }));

const data = (req) => { if (!S.isData(req.params.data)) throw new S.ErroNegocio('Data inválida.'); return req.params.data; };
const mes = (req) => { if (!S.isMes(req.params.mes)) throw new S.ErroNegocio('Mês inválido.'); return req.params.mes; };

app.get('/api/dia/:data', ler, h(async (req, res) => res.json(await S.resumoDia(data(req)))));
app.post('/api/dia/:data/fechar', operar, h(async (req, res) => {
  const confirmacao = await S.validarChecklist(req.body.confirmacao); // sem checklist completo não fecha, nem pela API
  res.json(await S.fecharDia(data(req), { ...comAutor(req), confirmacao }));
}));
app.delete('/api/dia/:data/fechar', admin, h(async (req, res) => { await S.reabrirDia(data(req)); res.status(204).end(); }));

app.get('/api/painel/:mes', ler, h(async (req, res) => {
  const painel = await S.painelMes(mes(req));
  res.json({ ...painel, patrimonio: await P.resumoPainel(req.params.mes, painel) }); // caixa x ativos (containers e estoque)
}));

// ---------- patrimônio em ativos (containers e estoque) ----------
const verPat = A.exigirArea('patrimonio'), verSoc = A.exigirArea('societario');
app.get('/api/patrimonio/:mes', verPat, h(async (req, res) => {
  const m = mes(req);
  res.json({ mes: m, itens: await P.itensDoMes(m), posicao: await P.posicao(m), mes_anterior: P.mesAnterior(m), tipos: P.TIPOS, situacoes: P.SITUACOES });
}));
app.post('/api/patrimonio', admin, h(async (req, res) => res.status(201).json(await P.salvarItem(null, req.body, req.usuario))));
app.put('/api/patrimonio/:id', admin, h(async (req, res) => res.json(await P.salvarItem(idNum(req.params.id), req.body, req.usuario))));
app.delete('/api/patrimonio/:id', admin, h(async (req, res) => { await P.excluirItem(idNum(req.params.id)); res.status(204).end(); }));
app.post('/api/patrimonio/copiar', admin, h(async (req, res) => res.json({ copiados: await P.copiarMes(req.body.de, req.body.para) })));

// ---------- quadro societário e relatório mensal dos sócios ----------
app.get('/api/societario/quadro', verSoc, h(async (_, res) => res.json(await SO.quadro())));
app.post('/api/societario/socios', admin, h(async (req, res) => res.status(201).json(await SO.salvarSocio(null, req.body))));
app.put('/api/societario/socios/:id', admin, h(async (req, res) => res.json(await SO.salvarSocio(idNum(req.params.id), req.body))));
app.get('/api/societario/nota/:mes', verSoc, h(async (req, res) => res.json({ texto: await SO.nota(mes(req)) })));
app.put('/api/societario/nota/:mes', admin, h(async (req, res) => { await SO.salvarNota(mes(req), req.body.texto, req.usuario); res.status(204).end(); }));
app.get('/api/societario/relatorio/:mes', verSoc, h(async (req, res) => {
  const d = await SO.dadosRelatorio(mes(req), req.query.socio ? idNum(req.query.socio) : null, req.usuario);
  const sufixo = d.socio ? '-' + d.socio.nome.normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() : '';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="relatorio-socios-${req.params.mes}${sufixo}.pdf"`);
  gerarPdf(d, res);
}));

// ---------- comercial: clientes, orçamentos, follow-up e painel ao vivo ----------
// 'aovivo' = ver os números (admin, sócio, comercial); 'comercial' = lançar e trabalhar orçamentos/clientes (admin, comercial)
const verVivo = A.exigirArea('aovivo'), trabCom = A.exigirArea('comercial');
app.get('/api/aovivo', verVivo, h(async (_, res) => res.json(await CO.aoVivo())));
app.get('/api/comercial/painel', trabCom, h(async (_, res) => res.json(await CO.painelComercial())));
app.get('/api/comercial/produtos', trabCom, h(async (_, res) => res.json(await CO.produtos())));
app.get('/api/comercial/clientes', trabCom, h(async (req, res) => res.json(await CO.buscarClientes(req.query.q))));
app.get('/api/comercial/clientes/:id', trabCom, h(async (req, res) => res.json(await CO.cliente(idNum(req.params.id)))));
app.post('/api/comercial/clientes', trabCom, h(async (req, res) => res.status(201).json(await CO.salvarCliente(null, req.body, req.usuario))));
app.put('/api/comercial/clientes/:id', trabCom, h(async (req, res) => res.json(await CO.salvarCliente(idNum(req.params.id), req.body, req.usuario))));
app.get('/api/comercial/orcamentos', trabCom, h(async (req, res) => res.json(await CO.listarOrcamentos(req.query))));
app.post('/api/comercial/orcamentos', trabCom, h(async (req, res) => res.status(201).json(await CO.criarOrcamento(req.body, req.usuario))));
app.put('/api/comercial/orcamentos/:id', trabCom, h(async (req, res) => res.json(await CO.editarOrcamento(idNum(req.params.id), req.body))));
app.post('/api/comercial/orcamentos/:id/status', trabCom, h(async (req, res) => res.json(await CO.mudarStatus(idNum(req.params.id), req.body, req.usuario))));
app.post('/api/comercial/orcamentos/:id/contato', trabCom, h(async (req, res) => res.json(await CO.registrarContato(idNum(req.params.id), req.body, req.usuario))));
app.post('/api/comercial/orcamentos/:id/adiar', trabCom, h(async (req, res) => res.json(await CO.adiar(idNum(req.params.id), req.body.dias))));
app.get('/api/comercial/followups', trabCom, h(async (_, res) => res.json(await CO.followupsPendentes())));

// ---------- Departamento de Pessoas (só administrador: dados pessoais e de saúde) ----------
const verDP = A.exigirArea('dp');
app.get('/api/dp/meta', verDP, h(async (_, res) => res.json({ regimes: DP.REGIMES, vinculos: DP.VINCULOS, tipos_ausencia: DP.TIPOS_AUSENCIA })));
app.get('/api/dp/funcionarios', verDP, h(async (req, res) => res.json(await DP.listar({ todos: req.query.todos === '1' }))));
app.post('/api/dp/funcionarios', verDP, h(async (req, res) => res.status(201).json(await DP.salvar(null, req.body))));
app.get('/api/dp/funcionarios/:id', verDP, h(async (req, res) => res.json(await DP.ficha(idNum(req.params.id)))));
app.put('/api/dp/funcionarios/:id', verDP, h(async (req, res) => res.json(await DP.salvar(idNum(req.params.id), req.body))));
app.get('/api/dp/resumo/:mes', verDP, h(async (req, res) => res.json(await DP.resumo(mes(req)))));
app.get('/api/dp/ausencias/:mes', verDP, h(async (req, res) => res.json(await DP.listarAusencias(mes(req)))));
app.post('/api/dp/ausencias', verDP, h(async (req, res) => res.status(201).json(await DP.criarAusencia(req.body, req.usuario))));
app.post('/api/dp/ausencias/:id/anexo', verDP, h(async (req, res) => { await DP.anexarAusencia(idNum(req.params.id), req.body.anexo); res.status(204).end(); }));
app.get('/api/dp/ausencias/:id/anexo', verDP, h(async (req, res) => {
  const a = await DP.lerAnexoAusencia(idNum(req.params.id));
  res.setHeader('Content-Type', a.tipo); res.setHeader('Content-Disposition', `inline; filename="${a.nome}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'private, no-store');
  res.end(a.buf);
}));
app.delete('/api/dp/ausencias/:id', verDP, h(async (req, res) => { await DP.excluirAusencia(idNum(req.params.id)); res.status(204).end(); }));

app.post('/api/recorrencias/:id/lancar', operar, h(async (req, res) => res.status(201).json(await S.lancarRecorrencia(idNum(req.params.id), { ...req.body, criado_por: req.usuario.nome, criado_por_id: req.usuario.id }))));

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
app.post('/api/extratos/:id/lancar', operar, h(async (req, res) => res.json(await X.lancarMovimentos(idNum(req.params.id), req.body.ids, req.usuario))));

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
