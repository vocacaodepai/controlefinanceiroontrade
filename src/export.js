import ExcelJS from 'exceljs';
import { MESES, painelMes, resumoDia, listarLancamentos, intervaloMes, saldos, addDias } from './services.js';
import { query } from './db.js';

const BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const AZUL = 'FF012D61';
const CINZA = 'FFEEF1F5';
const brl = (c) => (c ?? 0) / 100;
const fmtData = (d) => d.split('-').reverse().join('/');

function titulo(ws, texto, sub, colunas) {
  ws.mergeCells(1, 1, 1, colunas);
  ws.getCell('A1').value = texto;
  ws.getCell('A1').font = { size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, colunas);
  ws.getCell('A2').value = sub;
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF555555' } };
}

function cabecalho(row) {
  row.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } };
    c.border = { bottom: { style: 'thin' } };
  });
}

function tabela(ws, linhaInicial, colunas, linhas, { totalCols = [] } = {}) {
  cabecalho(ws.getRow(linhaInicial));
  colunas.forEach((c, i) => { ws.getRow(linhaInicial).getCell(i + 1).value = c.titulo; });
  cabecalho(ws.getRow(linhaInicial));
  linhas.forEach((l, i) => {
    const r = ws.getRow(linhaInicial + 1 + i);
    colunas.forEach((c, j) => {
      const cell = r.getCell(j + 1);
      cell.value = l[c.chave];
      if (c.moeda) cell.numFmt = BRL;
    });
  });
  const fim = linhaInicial + linhas.length;
  if (totalCols.length && linhas.length) {
    const t = ws.getRow(fim + 1);
    t.getCell(1).value = 'TOTAL';
    for (const j of totalCols) {
      const letra = ws.getColumn(j).letter;
      t.getCell(j).value = { formula: `SUM(${letra}${linhaInicial + 1}:${letra}${fim})` };
      t.getCell(j).numFmt = BRL;
    }
    t.font = { bold: true };
    t.eachCell((c) => { c.border = { top: { style: 'thin' } }; });
  }
  return fim + (totalCols.length && linhas.length ? 2 : 1);
}

function larguras(ws, ls) { ls.forEach((w, i) => { ws.getColumn(i + 1).width = w; }); }

const linhaLanc = (l) => ({
  data: fmtData(l.data),
  tipo: l.tipo === 'entrada' ? 'Entrada' : l.tipo === 'saida' ? 'Saída' : 'Transferência',
  nota: l.modalidade === 'com_nota' ? 'Com nota' : 'Sem nota',
  conta: l.conta + (l.conta_destino ? ` → ${l.conta_destino}` : ''),
  empresa: l.empresa,
  categoria: l.categoria || '—',
  pessoa: l.pessoa || '',
  cliente: l.cliente || '',
  descricao: l.descricao || '',
  valor: brl(l.valor) * (l.tipo === 'saida' ? -1 : 1),
  autor: l.criado_por || '',
  quando: l.criado_em ? `${fmtData(l.criado_em.slice(0, 10))} ${l.criado_em.slice(11, 16)}` : '',
});
const COLS_LANC = [
  { titulo: 'Data', chave: 'data' }, { titulo: 'Tipo', chave: 'tipo' }, { titulo: 'Nota', chave: 'nota' },
  { titulo: 'Conta', chave: 'conta' }, { titulo: 'Pagadora / Recebedora', chave: 'empresa' },
  { titulo: 'Categoria', chave: 'categoria' }, { titulo: 'Pessoa', chave: 'pessoa' },
  { titulo: 'Cliente', chave: 'cliente' }, { titulo: 'Descrição', chave: 'descricao' },
  { titulo: 'Valor', chave: 'valor', moeda: true },
  { titulo: 'Lançado por', chave: 'autor' }, { titulo: 'Lançado em', chave: 'quando' },
];
const LARG_LANC = [12, 14, 10, 30, 22, 24, 16, 22, 40, 16, 24, 17];

function novoLivro() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Controle Financeiro OnTrade';
  wb.created = new Date();
  return wb;
}

// ------------------------------------------------------------------ diário
export async function excelDia(data) {
  const r = await resumoDia(data);
  const wb = novoLivro();
  const ws = wb.addWorksheet('Caixa do dia', { views: [{ state: 'frozen', ySplit: 3 }] });
  titulo(ws, `Fechamento de caixa — ${fmtData(data)}`, r.fechado ? `Dia FECHADO em ${r.fechado.fechado_em}${r.fechado.fechado_por ? ' por ' + r.fechado.fechado_por : ''}` : 'Dia ainda ABERTO (prévia)', 10);

  let linha = tabela(ws, 4, [
    { titulo: 'Conta', chave: 'conta' }, { titulo: 'Nota', chave: 'nota' },
    { titulo: 'Saldo anterior', chave: 'ant', moeda: true }, { titulo: 'Entradas', chave: 'ent', moeda: true },
    { titulo: 'Saídas', chave: 'sai', moeda: true }, { titulo: 'Transf. líq.', chave: 'tr', moeda: true },
    { titulo: 'Saldo do sistema', chave: 'sis', moeda: true }, { titulo: 'Saldo contado', chave: 'cont', moeda: true },
    { titulo: 'Diferença', chave: 'dif', moeda: true },
  ], r.contas.map((c, i) => ({
    conta: c.nome, nota: c.modalidade === 'com_nota' ? 'Com nota' : 'Sem nota',
    ant: brl(c.saldo_anterior), ent: brl(c.entradas), sai: brl(c.saidas), tr: brl(c.transf_entrada - c.transf_saida),
    sis: { formula: `C${5 + i}+D${5 + i}-E${5 + i}+F${5 + i}`, result: brl(c.saldo) },
    cont: c.saldo_contado == null ? null : brl(c.saldo_contado),
    dif: c.saldo_contado == null ? null : { formula: `H${5 + i}-G${5 + i}`, result: brl(c.saldo_contado - c.saldo) },
  })), { totalCols: [3, 4, 5, 6, 7] });

  linha += 1;
  ws.getCell(linha, 1).value = 'Lançamentos do dia';
  ws.getCell(linha, 1).font = { bold: true, size: 12 };
  tabela(ws, linha + 1, COLS_LANC, r.lancamentos.map(linhaLanc));
  larguras(ws, [30, 12, 16, 16, 16, 16, 18, 18, 16, 16, 24, 17]);
  ws.getColumn(9).width = 40;
  return wb;
}

// ------------------------------------------------------------------ mensal
export async function excelMes(mes) {
  const p = await painelMes(mes);
  const [ano, m] = mes.split('-').map(Number);
  const nome = `${MESES[m - 1]} de ${ano}`;
  const wb = novoLivro();

  // 1. Resumo
  const ws = wb.addWorksheet('Resumo');
  titulo(ws, `Controle mensal — ${nome}`, `Período ${fmtData(p.de)} a ${fmtData(p.ate)} · ${p.qtd_lancamentos} lançamentos · ${p.dias_fechados} dia(s) com caixa fechado`, 4);
  const kv = [
    ['Entradas COM nota', brl(p.entradas_com_nota)],
    ['Entradas SEM nota', brl(p.entradas_sem_nota)],
    ['TOTAL DE ENTRADAS', { formula: 'B4+B5' }],
    ['TOTAL DE SAÍDAS', brl(p.saidas)],
    ['RESULTADO DO MÊS', { formula: 'B6-B7' }],
  ];
  kv.forEach(([k, v], i) => {
    ws.getCell(4 + i, 1).value = k;
    ws.getCell(4 + i, 2).value = v;
    ws.getCell(4 + i, 2).numFmt = BRL;
    if (i >= 2) { ws.getRow(4 + i).font = { bold: true }; }
  });
  let linha = 10;
  const bloco = (t, dados) => {
    ws.getCell(linha, 1).value = t; ws.getCell(linha, 1).font = { bold: true, size: 12 };
    linha = tabela(ws, linha + 1, [{ titulo: 'Item', chave: 'nome' }, { titulo: 'Valor', chave: 'valor', moeda: true }],
      dados.map((d) => ({ nome: d.nome, valor: brl(d.valor) })), { totalCols: [2] }) + 1;
  };
  bloco('Saídas por quem pagou (OnTrade x LTON x outros)', p.saidas_por_pagador);
  bloco('Saídas por grupo', p.saidas_por_grupo);
  bloco('Saídas por categoria', p.saidas_por_categoria);
  ws.getCell(linha, 1).value = 'Saldo final por conta'; ws.getCell(linha, 1).font = { bold: true, size: 12 };
  linha = tabela(ws, linha + 1, [{ titulo: 'Conta', chave: 'nome' }, { titulo: 'Nota', chave: 'nota' }, { titulo: 'Saldo', chave: 'saldo', moeda: true }],
    p.saldos.map((s) => ({ nome: s.nome, nota: s.modalidade === 'com_nota' ? 'Com nota' : 'Sem nota', saldo: brl(s.saldo) })), { totalCols: [3] });
  larguras(ws, [46, 20, 18, 4]);

  // 2. Entradas x Saídas por conta
  const wc = wb.addWorksheet('Por conta');
  titulo(wc, `Movimento por conta — ${nome}`, 'Entradas e saídas do mês em cada banco / canal', 5);
  tabela(wc, 4, [
    { titulo: 'Conta', chave: 'conta' }, { titulo: 'Nota', chave: 'nota' },
    { titulo: 'Entradas', chave: 'e', moeda: true }, { titulo: 'Saídas', chave: 's', moeda: true }, { titulo: 'Líquido', chave: 'l', moeda: true },
  ], p.por_conta.map((c, i) => ({
    conta: c.conta, nota: c.modalidade === 'com_nota' ? 'Com nota' : 'Sem nota',
    e: brl(c.entradas), s: brl(c.saidas), l: { formula: `C${5 + i}-D${5 + i}`, result: brl(c.entradas - c.saidas) },
  })), { totalCols: [3, 4, 5] });
  larguras(wc, [32, 12, 18, 18, 18]);

  // 3. Pessoas / folha
  const wp = wb.addWorksheet('Pessoas e folha');
  titulo(wp, `Pagamentos por pessoa — ${nome}`, 'Tudo o que foi pago a cada pessoa no mês, por categoria e por quem pagou', 6);
  const pag = await query(`
    SELECT p.nome AS pessoa, p.vinculo, cat.nome AS categoria, e.nome AS pagador, SUM(l.valor) AS total
    FROM lancamentos l JOIN pessoas p ON p.id = l.pessoa_id JOIN categorias cat ON cat.id = l.categoria_id
    JOIN contas c ON c.id = l.conta_id JOIN empresas e ON e.id = c.empresa_id
    WHERE l.tipo = 'saida' AND l.data BETWEEN $1 AND $2
    GROUP BY p.id, p.nome, p.vinculo, cat.id, cat.nome, e.id, e.nome ORDER BY p.nome, cat.nome`, [p.de, p.ate]);
  tabela(wp, 4, [
    { titulo: 'Pessoa', chave: 'pessoa' }, { titulo: 'Vínculo', chave: 'vinculo' }, { titulo: 'Categoria', chave: 'categoria' },
    { titulo: 'Pago por', chave: 'pagador' }, { titulo: 'Total', chave: 'total', moeda: true },
  ], pag.map((x) => ({ ...x, total: brl(x.total) })), { totalCols: [5] });
  larguras(wp, [20, 14, 26, 22, 18]);

  // 4. Fechamento diário
  const wf = wb.addWorksheet('Fechamento diário');
  titulo(wf, `Caixa dia a dia — ${nome}`, 'Entradas, saídas e saldo total ao fim de cada dia (SIM = caixa fechado)', 6);
  const linhasDia = [];
  const fechSet = new Set((await query('SELECT data FROM fechamentos WHERE data BETWEEN $1 AND $2', [p.de, p.ate])).map((x) => x.data));
  const { ultimo } = intervaloMes(mes);
  let saldoAnt = (await saldos(addDias(p.de, -1))).reduce((a, s) => a + s.saldo, 0);
  const serie = Object.fromEntries(p.serie.map((s) => [s.data, s]));
  for (let d = 1; d <= ultimo; d++) {
    const data = `${mes}-${String(d).padStart(2, '0')}`;
    const s = serie[data] ?? { entradas: 0, saidas: 0 };
    const row = 5 + d - 1;
    linhasDia.push({
      data: fmtData(data), ant: brl(saldoAnt), e: brl(s.entradas), s: brl(s.saidas),
      saldo: { formula: `B${row}+C${row}-D${row}`, result: brl(saldoAnt + s.entradas - s.saidas) },
      fechado: fechSet.has(data) ? 'SIM' : (serie[data] ? 'NÃO' : '—'),
    });
    saldoAnt = saldoAnt + s.entradas - s.saidas;
  }
  tabela(wf, 4, [
    { titulo: 'Dia', chave: 'data' }, { titulo: 'Saldo anterior', chave: 'ant', moeda: true }, { titulo: 'Entradas', chave: 'e', moeda: true },
    { titulo: 'Saídas', chave: 's', moeda: true }, { titulo: 'Saldo final', chave: 'saldo', moeda: true }, { titulo: 'Fechado?', chave: 'fechado' },
  ], linhasDia, { totalCols: [3, 4] });
  larguras(wf, [12, 18, 18, 18, 18, 12]);

  // 5. Lançamentos
  const wl = wb.addWorksheet('Lançamentos', { views: [{ state: 'frozen', ySplit: 4 }] });
  titulo(wl, `Todos os lançamentos — ${nome}`, 'Saídas aparecem negativas. Use o filtro da planilha para analisar.', COLS_LANC.length);
  const lancs = (await listarLancamentos({ de: p.de, ate: p.ate })).reverse();
  tabela(wl, 4, COLS_LANC, lancs.map(linhaLanc));
  wl.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLS_LANC.length } };
  larguras(wl, LARG_LANC);

  // 6. Mapa do fluxo
  const wm = wb.addWorksheet('Mapa do fluxo');
  titulo(wm, 'Como o dinheiro circula', 'Referência permanente — acompanha todo relatório mensal', 2);
  const mapa = [
    ['COM NOTA → entra por', 'Banco Safra, Banco Infinity, Banco Bradesco, Banco do Brasil (contas da OnTrade)'],
    ['SEM NOTA → entra por', 'DAE (direto ao fornecedor), PagVeloz, LTON e Dinheiro'],
    ['Cliente paga sem nota na LTON', 'A LTON usa esse dinheiro para pagar a folha e despesas da OnTrade'],
    ['Pago pela LTON', 'Pró-labore, salários, comissão, prestadores, cartões iFood, recarga de celular, luz, gás, água, combustível, tributos de funcionários, passagem/alimentação em dinheiro'],
    ['Pago pela OnTrade', 'Dantas (conta ou dinheiro) e despesas operacionais'],
    ['Registrados na LTON', 'Carla e João'],
    ['Registrada em Japeri', 'Dona Kátia (salário na empresa de Japeri)'],
    ['Dia 5 de cada mês', 'LTON → conta pessoal da Elisa Maria: ~R$ 16.800 (empréstimo usado na OnTrade)'],
  ];
  mapa.forEach(([k, v], i) => { wm.getCell(4 + i, 1).value = k; wm.getCell(4 + i, 1).font = { bold: true }; wm.getCell(4 + i, 2).value = v; wm.getCell(4 + i, 2).alignment = { wrapText: true, vertical: 'top' }; });
  larguras(wm, [34, 90]);

  return wb;
}
