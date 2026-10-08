// PDF mensal dos sócios (pdfkit, sem navegador). Visão gerencial em regime de caixa.
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { SITUACOES } from './patrimonio.js';

const AZ = '#012d61', AZ2 = '#0c5aa6', TX = '#14202f', CIN = '#6a7585', LIN = '#d3d9e2', FUNDO = '#f3f6fa', VER = '#1b8a5a', VERM = '#c0392b';
const W = 595.28, H = 841.89, M = 42, CW = W - 2 * M;
const LOGO = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'logo.png');

const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');
const pct = (n, casas = 1) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const dataBR = (d) => (d || '').slice(0, 10).split('-').reverse().join('/');
const corVal = (c) => (c < 0 ? VERM : TX);
const variacao = (atual, base) => (base ? ((atual - base) / Math.abs(base)) * 100 : null);
const txtVar = (v) => (v === null ? '—' : `${v >= 0 ? '+' : '-'}${pct(Math.abs(v))}`);

function garantir(doc, h) { if (doc.y + h > H - 64) doc.addPage(); }

function secao(doc, titulo, sub, minimo = 70) {
  garantir(doc, minimo);
  doc.moveDown(0.9);
  doc.font('Helvetica-Bold').fontSize(12.5).fillColor(AZ).text(titulo, M, doc.y);
  const y = doc.y + 3;
  doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.8).strokeColor(LIN).stroke();
  doc.y = y + 7;
  if (sub) { doc.font('Helvetica').fontSize(8.5).fillColor(CIN).text(sub, M, doc.y, { width: CW }); doc.moveDown(0.4); }
  doc.fillColor(TX);
}

function paragrafo(doc, texto, opts = {}) {
  garantir(doc, 30);
  doc.font(opts.negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.tam || 9.5).fillColor(opts.cor || TX).text(texto, M, doc.y, { width: CW, lineGap: 2 });
  doc.moveDown(0.3);
}

function kpis(doc, itens) {
  garantir(doc, 78);
  const g = 8, w = (CW - g * (itens.length - 1)) / itens.length, y = doc.y;
  itens.forEach((k, i) => {
    const x = M + i * (w + g);
    doc.roundedRect(x, y, w, 66, 6).fillAndStroke(FUNDO, LIN);
    doc.font('Helvetica').fontSize(7.5).fillColor(CIN).text(k.rotulo.toUpperCase(), x + 9, y + 9, { width: w - 18, characterSpacing: 0.5 });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(k.cor || TX).text(k.valor, x + 9, y + 24, { width: w - 18 });
    if (k.sub) doc.font('Helvetica').fontSize(7.5).fillColor(CIN).text(k.sub, x + 9, y + 46, { width: w - 18 });
  });
  doc.y = y + 76; doc.fillColor(TX);
}

// colunas: [{ t: titulo, w: fração da largura, a: 'l'|'r', k: chave, f: formatador, cor: (linha) => cor }]
function tabela(doc, colunas, linhas, { total } = {}) {
  const alt = 19, somaW = colunas.reduce((a, c) => a + c.w, 0);
  const larg = colunas.map((c) => (c.w / somaW) * CW);
  const cab = () => {
    garantir(doc, alt * 2);
    const y = doc.y;
    doc.rect(M, y, CW, alt).fill(AZ);
    let x = M;
    colunas.forEach((c, i) => { doc.font('Helvetica-Bold').fontSize(8).fillColor('#fff').text(c.t, x + 6, y + 6, { width: larg[i] - 12, align: c.a === 'r' ? 'right' : 'left', lineBreak: false, ellipsis: true }); x += larg[i]; });
    doc.y = y + alt;
  };
  const linha = (l, i, negrito) => {
    if (doc.y + alt > H - 64) { doc.addPage(); cab(); }
    const y = doc.y;
    if (i % 2 === 1 && !negrito) doc.rect(M, y, CW, alt).fill(FUNDO);
    let x = M;
    colunas.forEach((c, j) => {
      const v = c.f ? c.f(l[c.k], l) : l[c.k];
      doc.font(negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(c.cor ? c.cor(l) : TX).text(String(v ?? ''), x + 6, y + 5.5, { width: larg[j] - 12, align: c.a === 'r' ? 'right' : 'left', lineBreak: false, ellipsis: true });
      x += larg[j];
    });
    doc.moveTo(M, y + alt).lineTo(M + CW, y + alt).lineWidth(0.4).strokeColor(LIN).stroke();
    doc.y = y + alt;
  };
  cab(); linhas.forEach((l, i) => linha(l, i, false));
  if (total) linha(total, 0, true);
  doc.moveDown(0.5); doc.fillColor(TX);
}

function barrasH(doc, itens, cor = AZ2) {
  if (!itens.length) return paragrafo(doc, 'Sem saídas registradas no período.', { cor: CIN });
  const max = Math.max(...itens.map((i) => i.valor), 1);
  itens.forEach((i) => {
    garantir(doc, 18);
    const y = doc.y;
    doc.font('Helvetica').fontSize(8.5).fillColor(TX).text(i.nome, M, y + 2, { width: 150, lineBreak: false, ellipsis: true });
    doc.roundedRect(M + 158, y + 3, CW - 158 - 100, 8, 3).fill('#e6ebf2');
    doc.roundedRect(M + 158, y + 3, Math.max(2, ((CW - 158 - 100) * i.valor) / max), 8, 3).fill(cor);
    doc.font('Helvetica').fontSize(8.5).fillColor(TX).text(brl(i.valor), M + CW - 92, y + 2, { width: 92, align: 'right', lineBreak: false });
    doc.y = y + 17;
  });
  doc.fillColor(TX);
}

function graficoMeses(doc, serie, rotulo) {
  garantir(doc, 160);
  const y0 = doc.y + 6, alt = 96, base = y0 + 22 + alt;
  const max = Math.max(...serie.flatMap((s) => [s.entradas, s.saidas]), 1);
  const gw = CW / serie.length;
  doc.moveTo(M, base).lineTo(M + CW, base).lineWidth(0.6).strokeColor(LIN).stroke();
  serie.forEach((s, i) => {
    const x = M + i * gw + gw * 0.18, bw = gw * 0.28;
    const he = (s.entradas / max) * alt, hs = (s.saidas / max) * alt;
    doc.rect(x, base - he, bw, he).fill(VER);
    doc.rect(x + bw + 3, base - hs, bw, hs).fill(VERM);
    doc.font('Helvetica').fontSize(8).fillColor(CIN).text(rotulo(s.mes), M + i * gw, base + 4, { width: gw, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8).fillColor(corVal(s.resultado)).text(brl(s.resultado), M + i * gw, base + 15, { width: gw, align: 'center', lineBreak: false });
  });
  doc.font('Helvetica').fontSize(7.5).fillColor(VER).text('Entradas', M, y0, { continued: true }).fillColor(CIN).text('   ', { continued: true }).fillColor(VERM).text('Saídas', { continued: false });
  doc.font('Helvetica').fontSize(7.5).fillColor(CIN).text('Valor sob cada mês: resultado de caixa', M + CW - 180, y0, { width: 180, align: 'right' });
  doc.y = base + 32; doc.fillColor(TX);
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesCurto = (m) => `${MESES_CURTOS[Number(m.slice(5)) - 1]}/${m.slice(2, 4)}`;

export function gerarPdf(d, saida) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: M, bottom: 56, left: M, right: M }, bufferPages: true, info: { Title: `Relatório mensal aos sócios — ${d.rotulo}`, Author: 'OnTrade', Subject: 'Relatório gerencial mensal' } });
  doc.pipe(saida);

  // ---- cabeçalho ----
  if (existsSync(LOGO)) doc.image(LOGO, M, M - 6, { height: 50 });
  doc.font('Helvetica-Bold').fontSize(17).fillColor(AZ).text('Relatório mensal aos sócios', M, M, { width: CW, align: 'right' });
  doc.font('Helvetica').fontSize(11).fillColor(AZ2).text(d.rotulo, M, M + 22, { width: CW, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor(CIN).text(`Gerado em ${dataBR(d.gerado_em)} às ${d.gerado_em.slice(11, 16)}${d.gerado_por ? ' por ' + d.gerado_por : ''}`, M, M + 38, { width: CW, align: 'right' });
  doc.y = M + 62;
  if (d.socio) {
    doc.roundedRect(M, doc.y, CW, 26, 5).fill(FUNDO);
    doc.font('Helvetica').fontSize(9.5).fillColor(TX).text(`Para: `, M + 10, doc.y + 8, { continued: true }).font('Helvetica-Bold').text(d.socio.nome, { continued: true }).font('Helvetica').text(d.socio.pct == null ? '' : `   |   participação: ${pct(d.socio.pct, 2)}`);
    doc.y += 32;
  }
  // situação dos dados
  const provisorio = d.parcial || d.dias_abertos.length;
  doc.roundedRect(M, doc.y, CW, 22, 5).fillAndStroke(provisorio ? '#fbf3e2' : '#e8f4ee', provisorio ? '#e8d3a0' : '#bfe0cf');
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(provisorio ? '#8a5d10' : VER).text(provisorio
    ? `Dados provisórios${d.parcial ? ' — mês em andamento' : ''}${d.dias_abertos.length ? ` — ${d.dias_abertos.length} dia(s) sem fechamento de caixa` : ''}`
    : `Dados fechados — ${d.dias_fechados} dia(s) com caixa fechado, nenhum dia pendente`, M + 10, doc.y + 7, { width: CW - 20 });
  doc.y += 30; doc.fillColor(TX);

  // ---- resumo executivo ----
  secao(doc, '1. Resumo do mês', 'Resultado em regime de caixa: o que entrou e saiu das contas no mês, conforme os lançamentos do sistema.');
  const a = d.atual, ant = d.anterior, pat = d.patrimonio;
  kpis(doc, [
    { rotulo: 'Entradas', valor: brl(a.entradas), sub: `vs mês anterior: ${txtVar(variacao(a.entradas, ant.entradas))}` },
    { rotulo: 'Saídas', valor: brl(a.saidas), sub: `vs mês anterior: ${txtVar(variacao(a.saidas, ant.saidas))}` },
    { rotulo: 'Resultado de caixa', valor: brl(a.resultado), cor: corVal(a.resultado), sub: `mês anterior: ${brl(ant.resultado)}` },
    { rotulo: 'Saldo em contas', valor: brl(d.saldo_total), cor: corVal(d.saldo_total), sub: pat.informado ? `+ ativos: ${brl(pat.total)}` : 'ativos não informados' },
  ]);
  tabela(doc, [
    { t: 'Comparativo', w: 3.2, k: 'n' },
    { t: d.rotulo, w: 2, a: 'r', k: 'a', f: brl, cor: (l) => corVal(l.a) },
    { t: 'Mês anterior', w: 2, a: 'r', k: 'b', f: brl },
    { t: 'Variação', w: 1.3, a: 'r', k: 'v' },
    { t: 'Mesmo mês, ano ant.', w: 2.2, a: 'r', k: 'c', f: brl },
  ], [['Entradas com nota', 'entradas_com_nota'], ['Entradas sem nota', 'entradas_sem_nota'], ['Total de entradas', 'entradas'], ['Total de saídas', 'saidas'], ['Resultado de caixa', 'resultado']].map(([n, k]) => ({
    n, a: a[k], b: ant[k], c: d.ano_anterior[k], v: txtVar(variacao(a[k], ant[k])),
  })));

  // ---- caixa ----
  secao(doc, '2. Posição de caixa no fim do período', 'Saldo de cada conta, separando o que é com nota (bancos) e sem nota.');
  tabela(doc, [
    { t: 'Conta', w: 4, k: 'nome' }, { t: 'Tipo', w: 1.6, k: 'modalidade', f: (v) => (v === 'com_nota' ? 'com nota' : v === 'sem_nota' ? 'sem nota' : '') },
    { t: 'Saldo', w: 2.4, a: 'r', k: 'saldo', f: brl, cor: (l) => corVal(l.saldo) },
  ], d.contas, { total: { nome: 'Total em contas', modalidade: '', saldo: d.saldo_total } });

  // ---- saídas ----
  secao(doc, '3. Para onde foi o dinheiro', 'Saídas do mês por grupo, por quem pagou e as maiores categorias.', 210);
  paragrafo(doc, 'Saídas por grupo', { negrito: true, cor: AZ, tam: 9 });
  barrasH(doc, d.saidas_por_grupo.slice(0, 8));
  paragrafo(doc, 'Saídas por quem pagou', { negrito: true, cor: AZ, tam: 9 });
  barrasH(doc, d.saidas_por_pagador, AZ);
  paragrafo(doc, 'Maiores categorias de saída', { negrito: true, cor: AZ, tam: 9 });
  barrasH(doc, d.saidas_por_categoria.slice(0, 8));

  // ---- evolução ----
  secao(doc, '4. Evolução dos últimos 6 meses', 'Entradas e saídas mês a mês, com o resultado de caixa sob cada mês.', 200);
  graficoMeses(doc, d.serie, mesCurto);

  // ---- patrimônio ----
  secao(doc, '5. Patrimônio em ativos: containers e estoque', 'Valores informados pela administração. Um mês de caixa negativo pode refletir dinheiro que virou ativo (containers a caminho, estoque).');
  if (!pat.informado) {
    paragrafo(doc, 'Ainda não há valores de containers e estoque informados para este período.', { cor: CIN });
  } else {
    if (pat.defasado) paragrafo(doc, `Atenção: valores de ${pat.mes_ref.split('-').reverse().join('/')} (último mês informado).`, { cor: '#8a5d10', tam: 8.5 });
    tabela(doc, [
      { t: 'Item', w: 4.2, k: 'descricao' }, { t: 'Tipo', w: 1.3, k: 'tipo', f: (v) => (v === 'container' ? 'Container' : v === 'estoque' ? 'Estoque' : '') },
      { t: 'Situação', w: 2.4, k: 'situacao', f: (v) => SITUACOES[v] || v }, { t: 'Valor', w: 2, a: 'r', k: 'valor', f: brl },
    ], pat.itens, { total: { descricao: 'Total em ativos', tipo: '', situacao: '', valor: pat.total } });
    kpis(doc, [
      { rotulo: 'Containers', valor: brl(pat.total_container) },
      { rotulo: 'Estoque', valor: brl(pat.total_estoque) },
      { rotulo: 'Variação dos ativos', valor: pat.variacao_ativos === null ? '—' : brl(pat.variacao_ativos), cor: pat.variacao_ativos === null ? TX : corVal(pat.variacao_ativos), sub: pat.variacao_ativos === null ? 'sem mês anterior informado' : `mês anterior: ${brl(pat.ativos_anterior)}` },
      { rotulo: 'Resultado econômico', valor: pat.resultado_economico === null ? '—' : brl(pat.resultado_economico), cor: pat.resultado_economico === null ? TX : corVal(pat.resultado_economico), sub: 'estimado: caixa + ativos' },
    ]);
    paragrafo(doc, `Posição total (saldo em contas + ativos): ${brl(pat.posicao_total)}.`, { negrito: true, tam: 9.5 });
    paragrafo(doc, 'Leitura gerencial, não contábil: não inclui contas a pagar, empréstimos nem depreciação, e o valor dos ativos depende da estimativa informada.', { cor: CIN, tam: 8 });
  }

  // ---- comercial ----
  if (d.comercial) comercialPdf(doc, d.comercial);

  // ---- quadro societário ----
  secao(doc, `${d.comercial ? '7' : '6'}. Quadro societário`);
  tabela(doc, [
    { t: 'Sócio', w: 3.4, k: 'nome' }, { t: 'Participação', w: 1.6, a: 'r', k: 'participacao_bp', f: (v) => (v == null ? 'a definir' : pct(v / 100, 2)) },
    { t: 'Aporte', w: 2, a: 'r', k: 'aporte', f: (v) => (v ? brl(v) : '—') }, { t: 'Entrada', w: 1.6, a: 'r', k: 'data_entrada', f: (v) => (v ? dataBR(v) : '—') },
  ], d.quadro.socios.filter((s) => s.ativo), { total: { nome: 'Total', participacao_bp: d.quadro.soma_bp, aporte: d.quadro.socios.filter((s) => s.ativo).reduce((x, s) => x + s.aporte, 0), data_entrada: '' } });
  const refs = d.quadro.socios.filter((s) => s.ativo && s.valor_implicito);
  refs.forEach((s) => paragrafo(doc, `Referência: o aporte de ${brl(s.aporte)} de ${s.nome} por ${pct(s.participacao_bp / 100, 2)} implica um valor de ${brl(s.valor_implicito)} para 100% da empresa na entrada. É apenas uma referência de negociação, não uma avaliação atual.`, { cor: CIN, tam: 8.5 }));
  if (d.movimentos_socios.length) {
    paragrafo(doc, 'Pró-labore e distribuições pagos no mês', { negrito: true, cor: AZ, tam: 9 });
    tabela(doc, [{ t: 'Pessoa', w: 3, k: 'pessoa' }, { t: 'Tipo', w: 3, k: 'categoria' }, { t: 'Valor', w: 2, a: 'r', k: 'total', f: brl }], d.movimentos_socios);
  }
  if (d.socio) {
    secao(doc, `Sua participação — ${d.socio.nome}`, 'Valores proporcionais à participação cadastrada. Informativo: não é distribuição de lucros nem avaliação da participação.');
    if (d.socio.pct == null) paragrafo(doc, 'A participação deste sócio ainda não foi cadastrada.', { cor: CIN });
    else kpis(doc, [
      { rotulo: 'Participação', valor: pct(d.socio.pct, 2) },
      { rotulo: 'Parte do resultado', valor: brl(d.socio.parte_resultado), cor: corVal(d.socio.parte_resultado) },
      { rotulo: 'Parte da posição', valor: brl(d.socio.parte_posicao), sub: 'contas + ativos' },
      { rotulo: 'Aporte', valor: d.socio.aporte ? brl(d.socio.aporte) : '—' },
    ]);
    if (d.socio.recebido.length) d.socio.recebido.forEach((r) => paragrafo(doc, `${r.categoria} recebido(a) no mês: ${brl(r.total)}`, { tam: 9 }));
  }

  // ---- pontos de atenção e observações ----
  secao(doc, 'Pontos de atenção e observações da administração');
  if (d.alertas.length) d.alertas.forEach((t) => paragrafo(doc, `•  ${t}`, { tam: 9 }));
  else paragrafo(doc, 'Nenhum ponto de atenção automático neste período.', { cor: CIN });
  if (d.nota) { doc.moveDown(0.4); paragrafo(doc, 'Comentário da administração', { negrito: true, cor: AZ, tam: 9 }); paragrafo(doc, d.nota, { tam: 9.5 }); }
  doc.moveDown(0.6);
  paragrafo(doc, 'Metodologia: relatório gerencial em regime de caixa, montado a partir dos lançamentos do sistema Caixa OnTrade e dos valores de ativos informados pela administração. Não substitui as demonstrações contábeis nem o parecer do contador.', { cor: CIN, tam: 7.5 });

  // ---- rodapé em todas as páginas ----
  const n = doc.bufferedPageRange().count;
  for (let i = 0; i < n; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // evita nova página ao escrever no rodapé
    doc.moveTo(M, H - 42).lineTo(M + CW, H - 42).lineWidth(0.5).strokeColor(LIN).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(CIN).text(`OnTrade — Importação e Exportação  |  Documento gerencial e confidencial${d.socio ? ' — ' + d.socio.nome : ''}`, M, H - 36, { width: CW - 80, lineBreak: false });
    doc.text(`Página ${i + 1} de ${n}`, M + CW - 80, H - 36, { width: 80, align: 'right', lineBreak: false });
  }
  doc.end();
}

// Seção opcional, preenchida quando o módulo comercial tem dados no mês
function comercialPdf(doc, c) {
  secao(doc, '6. Comercial', 'Orçamentos lançados pelo time comercial no mês.');
  kpis(doc, [
    { rotulo: 'Orçamentos', valor: String(c.qtd), sub: `valor orçado: ${brl(c.valor_orcado)}` },
    { rotulo: 'Vendido (ganhos)', valor: brl(c.valor_ganho), sub: `${c.qtd_ganho} orçamento(s)` },
    { rotulo: 'Conversão', valor: c.qtd ? pct((c.qtd_ganho / c.qtd) * 100) : '—', sub: `${c.qtd_perdido} perdido(s)/cancelado(s)` },
    { rotulo: 'Clientes', valor: `${c.clientes_novos} novos`, sub: `${c.clientes_recorrentes} recorrentes` },
  ]);
  if (c.produtos?.length) { paragrafo(doc, 'Produtos mais vendidos', { negrito: true, cor: AZ, tam: 9 }); barrasH(doc, c.produtos.slice(0, 6).map((p) => ({ nome: p.nome, valor: p.valor }))); }
}
