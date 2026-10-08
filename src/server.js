import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { seed } from './seed.js';
import * as S from './services.js';
import { excelDia, excelMes } from './export.js';

seed();

const app = express();
app.use(express.json());
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

app.get('/api/meta', h((_, res) => res.json({ ...S.meta(), hoje: hoje() })));

app.get('/api/lancamentos', h((req, res) => res.json(S.listarLancamentos(req.query))));
app.post('/api/lancamentos', h((req, res) => res.status(201).json(S.criarLancamento(req.body))));
app.put('/api/lancamentos/:id', h((req, res) => res.json(S.atualizarLancamento(Number(req.params.id), req.body))));
app.delete('/api/lancamentos/:id', h((req, res) => { S.excluirLancamento(Number(req.params.id)); res.status(204).end(); }));

app.get('/api/dia/:data', h((req, res) => {
  if (!S.isData(req.params.data)) throw new S.ErroNegocio('Data inválida.');
  res.json(S.resumoDia(req.params.data));
}));
app.post('/api/dia/:data/fechar', h((req, res) => res.json(S.fecharDia(req.params.data, req.body))));
app.delete('/api/dia/:data/fechar', h((req, res) => { S.reabrirDia(req.params.data); res.status(204).end(); }));

app.get('/api/painel/:mes', h((req, res) => {
  if (!S.isMes(req.params.mes)) throw new S.ErroNegocio('Mês inválido.');
  res.json(S.painelMes(req.params.mes));
}));

app.post('/api/recorrencias/:id/lancar', h((req, res) => res.status(201).json(S.lancarRecorrencia(Number(req.params.id), req.body))));

for (const t of ['contas', 'categorias', 'pessoas', 'recorrencias']) {
  app.post(`/api/${t}`, h((req, res) => res.status(201).json(S.salvarCadastro(t, null, req.body))));
  app.put(`/api/${t}/:id`, h((req, res) => res.json(S.salvarCadastro(t, Number(req.params.id), req.body))));
}

async function enviarXlsx(res, wb, nome) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  await wb.xlsx.write(res);
  res.end();
}
app.get('/api/export/dia/:data', h(async (req, res) => {
  if (!S.isData(req.params.data)) throw new S.ErroNegocio('Data inválida.');
  await enviarXlsx(res, await excelDia(req.params.data), `caixa-${req.params.data}.xlsx`);
}));
app.get('/api/export/mes/:mes', h(async (req, res) => {
  if (!S.isMes(req.params.mes)) throw new S.ErroNegocio('Mês inválido.');
  await enviarXlsx(res, await excelMes(req.params.mes), `controle-mensal-${req.params.mes}.xlsx`);
}));

const porta = process.env.PORT || 3000;
app.listen(porta, () => console.log(`Controle Financeiro OnTrade em http://localhost:${porta}`));
