// Proposta comercial em PDF, no modelo Black Friday (Yang LED / On Trade).
// O comercial preenche o formulário; o PDF (2 páginas: proposta e ficha técnica) é montado aqui no navegador
// com html2canvas + jsPDF (public/vendor, carregados só na hora de emitir) e pode ir direto para o WhatsApp.
// O que foi preenchido fica salvo no orçamento, para reabrir e emitir de novo.

const EMPRESA = { nome: 'ON TRADE IMPORT E EXPORT LTDA', assinatura: 'On Trade Import e Export Ltda', cnpj: '51.584.730/0001-18', marca: 'Yang LED', instagram: '@yangledbrasil', telefone: '(21) 98031-3498', email: 'ontrade246@gmail.com' };
const VALIDADE = { data: '2026-11-27', txt: '27/11/2026' };

// Modelos de painel. O P5 Outdoor tem a ficha técnica completa do modelo enviado; os demais calculam
// dimensão, área, resolução e densidade, e o comercial informa brilho e proteção.
const MODELOS = {
  p5_out: {
    nome: 'P5 Outdoor', titulo: 'Painel LED P5 Outdoor', ficha: 'P5 Outdoor LED Display', pitch: 5, gab: [0.96, 0.96],
    gabDesc: 'Gabinete 0,96 m × 0,96 m em alumínio fundido, IP65', brilho: 'até 7.500', protecao: 'IP65',
    fotos: [['proposta/p5-modulo.jpg', 'Módulo P5 · 320 × 160 mm'], ['proposta/p5-gabinete.jpg', 'Gabinete · frente e traseira'], ['proposta/p5-tela.jpg', 'Tela LED montada (referência)']],
    modulo: [['Pixel pitch', '5 mm'], ['Tipo de LED', 'RGB 3 em 1'], ['Marca do LED', 'Huangguang'], ['Modelo', 'SMD1921'], ['Resolução', '64 × 32 pontos'], ['Tamanho', '320 × 160 mm'], ['CI de condução', 'IC2037']],
    gabinete: [['Tamanho', '0,96 × 0,96 m'], ['Quantidade', '{qtd} unidades'], ['Densidade', '40.000 pontos/m²'], ['Material', 'Alumínio fundido'], ['Peso', '27 kg/un.'], ['Manutenção', 'Traseira'], ['Consumo médio', '330 W/m²'], ['Consumo máximo', '550 W/m²']],
    tela: [['Brilho', '6.500 a 7.500 cd/m²'], ['Ângulo de visão', '160° H · 120° V'], ['Distância ideal', '5 a 100 m'], ['Atualização', '7.680 Hz'], ['Quadros', '≥ 60 Hz'], ['Vida útil (MTBF)', '≥ 10.000 h'], ['Tensão', 'AC 220/110 V ±10%'], ['Frequência da rede', '50/60 Hz'], ['Proteção', 'IP65'], ['Operação', '−20 °C a +50 °C'], ['Armazenagem', '−35 °C a +85 °C'], ['Sistema de controle', 'NovaStar']],
  },
  p39_out: { nome: 'P3.9 Outdoor', titulo: 'Painel LED P3.9 Outdoor', ficha: 'P3.9 Outdoor LED Display', pitch: 3.91, gab: [1, 0.5], gabDesc: 'Gabinete 0,50 m × 1,00 m', protecao: 'IP65' },
  p39_in: { nome: 'P3.9 Indoor', titulo: 'Painel LED P3.9 Indoor', ficha: 'P3.9 Indoor LED Display', pitch: 3.91, gab: [1, 0.5], gabDesc: 'Gabinete 0,50 m × 1,00 m' },
  p297_in: { nome: 'P2.97 Indoor', titulo: 'Painel LED P2.97 Indoor', ficha: 'P2.97 Indoor LED Display', pitch: 2.97, gab: [1, 0.5], gabDesc: 'Gabinete 0,50 m × 1,00 m' },
  p291_out: { nome: 'P2.91 Outdoor', titulo: 'Painel LED P2.91 Outdoor', ficha: 'P2.91 Outdoor LED Display', pitch: 2.91, gab: [1, 0.5], gabDesc: 'Gabinete 0,50 m × 1,00 m', protecao: 'IP65' },
  p19_in: { nome: 'P1.9 Indoor', titulo: 'Painel LED P1.9 Indoor', ficha: 'P1.9 Indoor LED Display', pitch: 1.9, gab: [1, 0.5], gabDesc: 'Gabinete 0,50 m × 1,00 m' },
};
// sugere o modelo pelo produto do orçamento
const modeloDoProduto = (p) => {
  const t = String(p || '').toLowerCase().replace(',', '.');
  if (/p\s?5\b/.test(t)) return 'p5_out';
  if (/p\s?2\.97/.test(t)) return 'p297_in';
  if (/p\s?2\.91/.test(t)) return 'p291_out';
  if (/p\s?1\.9/.test(t)) return 'p19_in';
  if (/p\s?3\.9/.test(t)) return /indoor/.test(t) ? 'p39_in' : 'p39_out';
  return 'p5_out';
};

const num = (v) => { const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const reais = (c) => 'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const metros = (m) => m.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inteiro = (n) => Math.round(n).toLocaleString('pt-BR');
const hojeBR = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const h = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// medidas do painel a partir de colunas × linhas de gabinetes
function medidas(d) {
  const M = MODELOS[d.modelo], [gw, gh] = M.gab, c = Math.max(1, Math.round(num(d.colunas))), l = Math.max(1, Math.round(num(d.linhas)));
  const pxW = Math.round((gw * 1000) / M.pitch), pxH = Math.round((gh * 1000) / M.pitch);
  return { c, l, qtd: c * l, larg: c * gw, alt: l * gh, area: c * gw * l * gh, resW: c * pxW, resH: l * pxH, densidade: Math.round((1000 / M.pitch) ** 2), gw, gh };
}
function contas(d) {
  const sub = d.itens.reduce((a, i) => a + (i.gratis ? 0 : Math.round(num(i.qtd) * i.unit)), 0);
  const desc = Math.round(d.desconto);
  const vista = Math.max(sub - desc, 0);
  const n = Math.max(1, Math.round(num(d.parcelas)));
  const parcela = Math.round((sub * (1 - num(d.desc_cartao) / 100)) / n);
  return { sub, desc, vista, n, parcela };
}

// itens sugeridos pela opção da promoção (preços já digitados são mantidos)
function itensPadrao(d, antigos = []) {
  const M = MODELOS[d.modelo], m = medidas(d), preco = (chave) => antigos.find((i) => i.chave === chave)?.unit || 0;
  const base = [
    { chave: 'gabinete', desc: `Gabinete Painel LED ${M.nome}`, det: M.gabDesc, qtd: m.qtd, unit: preco('gabinete') },
    { chave: 'controladora', desc: 'Controladora TB60', det: 'Sistema de controle NovaStar', qtd: 1, unit: preco('controladora') },
  ];
  if (d.promocao === 'bf_completo') return [...base,
    { chave: 'firestick', desc: 'Fire Stick', det: 'Incluso na Black Friday', qtd: 1, unit: 0, gratis: true },
    { chave: 'estrutura', desc: 'Estrutura', det: 'Incluso na Black Friday', qtd: 1, unit: 0, gratis: true },
    { chave: 'instalacao', desc: 'Instalação e configuração', det: 'Montagem, ligação e configuração do painel', qtd: 1, unit: 0, gratis: true },
    { chave: 'frete', desc: 'Frete', det: 'Entrega no estado do Rio de Janeiro', qtd: 1, unit: 0, gratis: true }];
  return [...base,
    { chave: 'instalacao', desc: 'Instalação e configuração', det: 'Montagem, ligação e configuração do painel', qtd: 1, unit: preco('instalacao') },
    { chave: 'frete', desc: 'Frete', det: 'Entrega no estado do Rio de Janeiro', qtd: 1, unit: preco('frete') }];
}

// ------------------------------------------------------------------ páginas do PDF (794 × 1123 px = A4)
const CSS = `
.pp-pg{width:794px;height:1123px;background:#141416;position:relative;overflow:hidden;font-family:Inter,Arial,sans-serif;color:#1d1d1f;box-sizing:border-box}
.pp-pg *{box-sizing:border-box}
.pp-faixa{position:absolute;color:#f08a24;font:600 11.5px Poppins,Arial,sans-serif;letter-spacing:2.6px;white-space:nowrap;display:flex;justify-content:space-around;align-items:center}
.pp-faixa.h{left:0;width:794px;height:34px}.pp-faixa.top{top:0}.pp-faixa.bot{bottom:0}
.pp-faixa.v{width:1055px;height:34px;top:34px;transform-origin:0 0}
.pp-faixa.v.esq{left:0;transform:translateY(1055px) rotate(-90deg)}
.pp-faixa.v.dir{left:794px;transform:rotate(90deg)}
.pp-faixa i{font-style:normal;color:#f2efe9;font-size:9px}
.pp-folha{position:absolute;left:34px;top:34px;width:726px;height:1055px;background:#fff;padding:9px}
.pp-borda{border:1px solid #ef8a2b;height:100%;padding:28px 30px 0;position:relative}
.pp-top{display:flex;justify-content:space-between;align-items:flex-start}
.pp-emp{display:flex;align-items:center;gap:14px}.pp-emp img{width:62px;height:auto}
.pp-emp b{display:block;font:700 15px Poppins,Arial,sans-serif;color:#111}.pp-emp small{font-size:10.5px;color:#555}
.pp-tit{text-align:right}.pp-tit .k{font:600 10.5px Poppins,Arial,sans-serif;letter-spacing:2.4px;color:#ef8a2b}
.pp-tit h1{margin:2px 0 1px;font:700 21px Poppins,Arial,sans-serif;color:#111;letter-spacing:-.2px}.pp-tit small{font-size:10.5px;color:#555}
.pp-barra{margin-top:20px;background:#141416;border-left:6px solid #ef8a2b;border-radius:4px;display:flex;justify-content:space-between;align-items:center;padding:15px 18px}
.pp-barra b{font:600 12.5px Poppins,Arial,sans-serif;letter-spacing:1.6px;color:#ef8a2b}.pp-barra span{color:#fff;font-size:10.5px}.pp-barra span em{font-style:normal;color:#ef8a2b;font-weight:600}
.pp-cp{display:flex;margin-top:22px;gap:20px}.pp-cp>div{flex:1}.pp-cp>div+div{flex:1.35}
.pp-lbl{font:600 9.5px Poppins,Arial,sans-serif;letter-spacing:2px;color:#ef8a2b}
.pp-cp b{display:block;font:600 14.5px Poppins,Arial,sans-serif;color:#111;margin-top:3px}.pp-cp small{font-size:10.5px;color:#555}
.pp-tab{width:100%;border-collapse:collapse;margin-top:18px}
.pp-tab th{background:#fdf0e3;color:#ef8a2b;font:600 9.5px Poppins,Arial,sans-serif;letter-spacing:1.6px;padding:12px 8px;text-align:left;border-bottom:2px solid #ef8a2b}
.pp-tab th.n,.pp-tab td.n{text-align:right}.pp-tab th.c,.pp-tab td.c{text-align:center}
.pp-tab td{padding:9px 8px;font-size:12px;vertical-align:top;border-bottom:1px solid #f0e6dc}
.pp-tab tr:nth-child(even) td{background:#fffaf5}
.pp-tab td b{display:block;font-weight:600;font-size:12.5px;color:#111}.pp-tab td small{font-size:10.5px;color:#666}
.pp-num{width:21px;height:21px;border-radius:50%;background:linear-gradient(135deg,#f39a2e,#e0482a);color:#fff;font:600 9px Poppins,Arial,sans-serif;display:flex;align-items:center;justify-content:center}
.pp-gratis{display:inline-block;background:#fde6d2;color:#d0621c;border-radius:12px;padding:3px 10px;font-size:10.5px;font-weight:600}
.pp-fim{display:flex;gap:30px;margin-top:16px}.pp-fim>div{width:50%;min-width:0}
.pp-pg.compacto .pp-tab td{padding:6px 8px}.pp-pg.compacto .pp-tab td small{font-size:10px}.pp-pg.compacto .pp-cp{margin-top:16px}.pp-pg.compacto .pp-barra{margin-top:16px;padding:12px 18px}.pp-pg.compacto .pp-fim{margin-top:12px}.pp-pg.compacto .pp-cond li{margin:5px 0}.pp-pg.compacto .pp-bf{margin-top:10px;padding:12px 16px}.pp-pg.compacto .pp-vista{margin-top:8px;padding:11px 18px}.pp-pg.compacto .pp-acordo{margin-top:12px;padding-top:10px}.pp-pg.compacto .pp-ass{margin-top:26px}.pp-fim>div{flex:1}
.pp-cond{margin:8px 0 0;padding:0;list-style:none}.pp-cond li{font-size:11.5px;margin:7px 0;padding-left:16px;position:relative;color:#222}
.pp-cond li:before{content:'';position:absolute;left:0;top:6px;width:6px;height:6px;border-radius:50%;background:#ef8a2b}
.pp-bf{margin-top:14px;background:#141416;border-left:6px solid #ef8a2b;border-radius:4px;padding:16px 18px;color:#fff;font-size:11.5px;line-height:1.5}
.pp-bf .pp-lbl{display:block;margin-bottom:6px;font-size:10.5px}.pp-bf em{font-style:normal;color:#ef8a2b;font-weight:600}
.pp-lin{display:flex;justify-content:space-between;padding:9px 12px;font-size:12px}
.pp-lin.desc{background:#fdf0e3;color:#d0621c;border-radius:4px}.pp-lin.desc b{color:#d0621c}
.pp-vista{margin-top:12px;border-radius:5px;background:linear-gradient(120deg,#f39a2e,#e0482a);color:#fff;padding:14px 18px}
.pp-vista small{font:600 9.5px Poppins,Arial,sans-serif;letter-spacing:2px;opacity:.9}.pp-vista b{display:block;font:700 26px Poppins,Arial,sans-serif;margin-top:2px}
.pp-cart{margin-top:10px;background:#fff6ee;border:1px solid #f6dcc4;border-radius:5px;padding:12px 6px;text-align:center;font-size:10.5px;color:#555;white-space:nowrap}
.pp-cart b{font:600 13.5px Poppins,Arial,sans-serif;color:#d0621c;margin:0 4px}
.pp-acordo{margin-top:16px;border-top:1px solid #eee;padding-top:14px}.pp-acordo p{font-size:11px;color:#555;margin:6px 0 0}
.pp-ass{display:flex;gap:56px;margin-top:34px}.pp-ass>div{flex:1;border-top:1px solid #c9a27f;padding-top:8px;font-size:10.5px;color:#555}.pp-ass b{display:block;color:#111;font-size:11px}
.pp-rod{position:absolute;left:30px;right:30px;bottom:20px;border-top:1px solid #eee;padding-top:12px;display:flex;justify-content:space-between;font-size:10.5px;color:#555}
.pp-rod span:first-child b{color:#ef8a2b;font-weight:600}.pp-rod .d{display:flex;gap:28px}
.pp-h2{display:flex;justify-content:space-between;align-items:flex-end;margin-top:28px;border-bottom:2px solid #ef8a2b;padding-bottom:8px}
.pp-h2 b{font:700 17px Poppins,Arial,sans-serif}.pp-h2 span{color:#ef8a2b;font-size:11.5px;font-weight:600}
.pp-res{display:flex;gap:10px;margin-top:20px}.pp-res>div{flex:1;background:#fdf3e9;border-top:3px solid #ef8a2b;border-radius:3px;padding:10px 11px}
.pp-res b{display:block;font:600 13px Poppins,Arial,sans-serif;color:#111;margin-top:3px;white-space:nowrap}.pp-res b small{font:400 10px Inter,Arial;color:#777}
.pp-fotos{display:flex;gap:16px;margin-top:20px}.pp-fotos>div{flex:1}
.pp-fotos .im{height:150px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff}.pp-fotos img{max-width:100%;max-height:150px}
.pp-fotos span{display:block;background:#fdf0e3;color:#a14a14;font-size:10.5px;padding:9px 11px;margin-top:0}
.pp-specs{display:flex;gap:14px;margin-top:24px;align-items:flex-start}.pp-specs>div{flex:1}.pp-specs>div:nth-child(2){flex:1.1}.pp-specs>div:last-child{flex:1.2}
.pp-specs h3{margin:0;background:linear-gradient(120deg,#f39a2e,#e0482a);color:#fff;font:600 10.5px Poppins,Arial,sans-serif;letter-spacing:2px;padding:9px 11px;border-radius:4px 4px 0 0}
.pp-specs table{width:100%;border-collapse:collapse}.pp-specs td{font-size:10.5px;padding:9px 5px;border-bottom:1px solid #f0e6dc}
.pp-specs tr:nth-child(even) td{background:#fffaf5}.pp-specs td:last-child{text-align:right;font-weight:600;color:#111;white-space:nowrap}.pp-specs td:first-child{padding-right:2px}
`;
function moldura(conteudo, extra = '') {
  const txt = Array.from({ length: 5 }, () => '<span>BLACK FRIDAY</span>').join('<i>●</i>');
  const txtV = Array.from({ length: 7 }, () => '<span>BLACK FRIDAY</span>').join('<i>●</i>');
  return `<div class="pp-pg ${extra}"><div class="pp-faixa h top">${txt}</div><div class="pp-faixa h bot">${txt}</div>
    <div class="pp-faixa v esq">${txtV}</div><div class="pp-faixa v dir">${txtV}</div>
    <div class="pp-folha"><div class="pp-borda">${conteudo}
      <div class="pp-rod"><span><b>${EMPRESA.marca}</b> · On Trade</span><span class="d"><span>${EMPRESA.instagram}</span><span>${EMPRESA.telefone}</span><span>${EMPRESA.email}</span></span></div>
    </div></div></div>`;
}
const cabecalho = (k, titulo, sub) => `<div class="pp-top"><div class="pp-emp"><img src="proposta/logo-yangled.png" alt=""><div><b>${EMPRESA.nome}</b><small>CNPJ ${EMPRESA.cnpj}</small></div></div>
  <div class="pp-tit"><div class="k">${k}</div><h1>${h(titulo)}</h1><small>${h(sub)}</small></div></div>`;

function paginaProposta(d) {
  const M = MODELOS[d.modelo], m = medidas(d), c = contas(d), cliente = [d.tratamento, d.cliente].filter(Boolean).join(' ');
  const freteGratis = d.itens.some((i) => i.chave === 'frete' && i.gratis);
  // "Desconto especial de R$ X, com Fire Stick, estrutura, instalação e frete grátis no RJ"
  const CURTO = { firestick: 'Fire Stick', estrutura: 'estrutura', instalacao: 'instalação' };
  const gratis = d.itens.filter((i) => i.gratis && i.chave !== 'frete').map((i) => CURTO[i.chave] || i.desc.toLowerCase());
  if (freteGratis) gratis.push('frete');
  const listaGratis = gratis.length > 1 ? `${gratis.slice(0, -1).join(', ')} e ${gratis.at(-1)}` : gratis[0] || '';
  const gratisTxt = listaGratis ? `${listaGratis} grátis${freteGratis ? ' no RJ' : ''}` : '';
  const bfTxt = c.desc > 0 ? `Desconto especial de <em>${reais(c.desc)}</em>${gratisTxt ? `, com ${gratisTxt}` : ''}` : (gratisTxt ? gratisTxt.charAt(0).toUpperCase() + gratisTxt.slice(1) : '');
  return moldura(`${cabecalho('PROPOSTA COMERCIAL', d.titulo || M.titulo, `Emitida em ${d.emitida}`)}
    <div class="pp-barra"><b>BLACK FRIDAY · CONDIÇÃO ESPECIAL</b><span>Proposta válida até o fim da Black Friday, <em>${VALIDADE.txt}</em></span></div>
    <div class="pp-cp"><div><div class="pp-lbl">CLIENTE</div><b>${h(cliente)}</b></div>
      <div><div class="pp-lbl">PROJETO</div><b>Painel de LED ${m.c} × ${m.l}</b><small>Medida real ${metros(m.larg)} m × ${metros(m.alt)} m · ${m.qtd} gabinetes de ${metros(m.gw)} m × ${metros(m.gh)} m</small></div></div>
    <table class="pp-tab"><thead><tr><th style="width:36px"></th><th>DESCRIÇÃO</th><th class="c" style="width:60px">QTD.</th><th class="n" style="width:130px">VALOR UNITÁRIO</th><th class="n" style="width:120px">TOTAL</th></tr></thead><tbody>
      ${d.itens.map((i, k) => `<tr><td><div class="pp-num">${String(k + 1).padStart(2, '0')}</div></td><td><b>${h(i.desc)}</b>${i.det ? `<small>${h(i.det)}</small>` : ''}</td>
        <td class="c">${h(i.qtd)}</td><td class="n">${i.gratis ? '—' : reais(i.unit)}</td><td class="n">${i.gratis ? '<span class="pp-gratis">Grátis</span>' : reais(Math.round(num(i.qtd) * i.unit))}</td></tr>`).join('')}
    </tbody></table>
    <div class="pp-fim"><div><div class="pp-lbl">CONDIÇÕES</div><ul class="pp-cond">
        ${d.garantia ? `<li>${h(d.garantia).replace(/^(Garantia de [^ ]+ [^ ]+)/, '<b>$1</b>')}</li>` : ''}${freteGratis ? '<li>Frete grátis para o estado do Rio de Janeiro.</li>' : ''}${d.condicao_extra ? `<li>${h(d.condicao_extra)}</li>` : ''}<li>Proposta válida até ${VALIDADE.txt}.</li></ul>
        ${bfTxt ? `<div class="pp-bf"><span class="pp-lbl">CONDIÇÃO BLACK FRIDAY</span>${bfTxt}, exclusivos para fechamento até <em>${VALIDADE.txt}</em>. Depois dessa data, os valores voltam à tabela normal.</div>` : ''}</div>
      <div><div class="pp-lin"><span>Subtotal</span><span>${reais(c.sub)}</span></div>
        ${c.desc > 0 ? `<div class="pp-lin desc"><span>Desconto Black Friday</span><b>− ${reais(c.desc)}</b></div>` : ''}
        <div class="pp-vista"><small>INVESTIMENTO À VISTA</small><b>${reais(c.vista)}</b></div>
        ${c.n > 1 ? `<div class="pp-cart">Ou no cartão em até<b>${c.n}x de ${reais(c.parcela)}</b>${num(d.desc_cartao) > 0 ? 'sem juros' : ''}</div>` : ''}</div></div>
    <div class="pp-acordo"><div class="pp-lbl">DE ACORDO</div><p>Ao assinar, o cliente confirma os itens, valores e condições descritos nesta proposta.</p>
      <div class="pp-ass"><div><b>${h(cliente)}</b>Cliente · Data ___/___/______</div><div><b>${EMPRESA.assinatura}</b>${EMPRESA.marca}</div></div></div>`, d.itens.length > 4 ? 'compacto' : '');
}

function paginaFicha(d) {
  const M = MODELOS[d.modelo], m = medidas(d), cliente = [d.tratamento, d.cliente].filter(Boolean).join(' ');
  const pitchTxt = `${String(M.pitch).replace('.', ',')} mm`;
  const res = [['DIMENSÃO', `${metros(m.larg)} × ${metros(m.alt)} m`], ['ÁREA', `${metros(m.area)} m²`], ['RESOLUÇÃO', `${m.resW} × ${m.resH} <small>px</small>`], ['PITCH', pitchTxt],
    ...(d.brilho ? [['BRILHO', `${h(d.brilho)} <small>cd/m²</small>`]] : []), ...(d.protecao ? [['PROTEÇÃO', h(d.protecao)]] : [])];
  const fotos = d.fotos?.length ? d.fotos : (M.fotos || []);
  const qtdTxt = (t) => t.replace('{qtd}', m.qtd);
  const blocos = M.modulo ? [['MÓDULO', M.modulo], ['GABINETE', M.gabinete], ['TELA', M.tela]] : [
    ['GABINETE', [['Tamanho', `${metros(m.gw)} × ${metros(m.gh)} m`], ['Quantidade', `${m.qtd} unidades`], ['Densidade', `${inteiro(m.densidade)} pontos/m²`]]],
    ['TELA', [['Pixel pitch', pitchTxt], ['Resolução', `${m.resW} × ${m.resH} px`], ...(d.brilho ? [['Brilho', `${d.brilho} cd/m²`]] : []), ...(d.protecao ? [['Proteção', d.protecao]] : [])]],
  ];
  return moldura(`${cabecalho('FICHA TÉCNICA', M.ficha, `Proposta para ${cliente}`)}
    <div class="pp-h2"><b>Resumo do painel</b><span>Configuração ${m.c} × ${m.l} gabinetes</span></div>
    <div class="pp-res">${res.map(([k, v]) => `<div><div class="pp-lbl">${k}</div><b>${v}</b></div>`).join('')}</div>
    ${fotos.length ? `<div class="pp-fotos">${fotos.map(([src, leg]) => `<div><div class="im"><img src="${src}" alt=""></div><span>${h(leg)}</span></div>`).join('')}</div>` : ''}
    <div class="pp-specs">${blocos.map(([t, linhas]) => `<div><h3>${t}</h3><table>${linhas.map(([k, v]) => `<tr><td>${h(k)}</td><td>${h(qtdTxt(v))}</td></tr>`).join('')}</table></div>`).join('')}</div>`);
}

// ------------------------------------------------------------------ PDF
const carregar = (src) => new Promise((ok, erro) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => erro(new Error('Não foi possível carregar ' + src)); document.head.appendChild(s); });
async function prepararEstilo() {
  if (!document.getElementById('pp-css')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600;700&display=swap'; document.head.appendChild(l);
    const s = document.createElement('style'); s.id = 'pp-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  await Promise.race([Promise.all(['700 20px Poppins', '600 12px Poppins', '400 12px Inter', '600 12px Inter'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 3000))]);
}
async function gerarPDF(d) {
  await prepararEstilo();
  await Promise.all([carregar('vendor/jspdf.umd.min.js'), carregar('vendor/html2canvas.min.js')]);
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;left:-12000px;top:0;width:794px';
  caixa.innerHTML = paginaProposta(d) + paginaFicha(d);
  document.body.appendChild(caixa);
  try {
    await Promise.all([...caixa.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
    const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const paginas = [...caixa.querySelectorAll('.pp-pg')];
    for (let k = 0; k < paginas.length; k++) {
      const cv = await window.html2canvas(paginas[k], { scale: 2, backgroundColor: '#141416', useCORS: true, logging: false });
      if (k) pdf.addPage();
      pdf.addImage(cv.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 595.28, 841.89);
    }
    return pdf.output('blob');
  } finally { caixa.remove(); }
}

// ------------------------------------------------------------------ formulário
export async function abrir(o, U) {
  const { modal, api, toast, acao, zap, primeiroNome, esc } = U;
  const salvo = await api(`/api/comercial/orcamentos/${o.id}/proposta`).catch(() => null);
  const d = salvo?.dados ? { ...salvo.dados, emitida: hojeBR() } : {
    tratamento: 'Sr.', cliente: o.cliente_nome, telefone: o.cliente_telefone || '', modelo: modeloDoProduto(o.produto), colunas: 10, linhas: 5,
    promocao: 'bf_completo', titulo: '', desconto: 0, desc_vista: 20, parcelas: 12, desc_cartao: 5,
    garantia: 'Garantia de 1 ano contra defeitos de fabricação.', condicao_extra: '', brilho: '', protecao: '', emitida: hojeBR(),
  };
  if (!d.itens) { const M = MODELOS[d.modelo]; d.titulo ||= M.titulo; d.brilho ||= M.brilho || ''; d.protecao ||= M.protecao || ''; d.itens = itensPadrao(d); }
  d.fotos = [];
  const linhaItem = (i, k) => `<tr data-k="${k}"><td><input data-f="desc" value="${esc(i.desc)}"><input data-f="det" value="${esc(i.det || '')}" placeholder="Detalhe (opcional)" style="margin-top:4px;font-size:12.5px"></td>
    <td><input data-f="qtd" value="${esc(i.qtd)}" inputmode="decimal" style="width:64px"></td>
    <td><input data-f="unit" value="${i.unit ? (i.unit / 100).toFixed(2).replace('.', ',') : ''}" inputmode="decimal" placeholder="0,00" style="width:110px" ${i.gratis ? 'disabled' : ''}></td>
    <td style="text-align:center"><input type="checkbox" data-f="gratis" ${i.gratis ? 'checked' : ''} title="Grátis"></td><td><button type="button" class="mini sec" data-rm="${k}" title="Remover">×</button></td></tr>`;
  const m = modal(`<h2>Proposta Black Friday (PDF)</h2><p class="legenda">${esc(o.cliente_nome)} · orçamento ${esc(o.numero || '—')} · ${esc(o.produto)}${salvo ? ` · última emitida por ${esc(salvo.usuario_nome || '—')} em ${new Date(salvo.criado_em).toLocaleDateString('pt-BR')}` : ''}</p>
    <form class="form" id="pp" autocomplete="off" novalidate style="margin-top:12px">
      <div><label>Tratamento</label><select name="tratamento">${['Sr.', 'Sra.', ''].map((t) => `<option value="${t}" ${d.tratamento === t ? 'selected' : ''}>${t || 'Sem tratamento'}</option>`).join('')}</select></div>
      <div><label>Cliente</label><input name="cliente" value="${esc(d.cliente)}"></div>
      <div><label>WhatsApp do cliente</label><input name="telefone" value="${esc(d.telefone)}"></div>
      <div><label>Modelo do painel</label><select name="modelo">${Object.entries(MODELOS).map(([k, M]) => `<option value="${k}" ${d.modelo === k ? 'selected' : ''}>${M.nome}</option>`).join('')}</select></div>
      <div><label>Gabinetes na largura</label><input name="colunas" value="${esc(d.colunas)}" inputmode="numeric"></div>
      <div><label>Gabinetes na altura</label><input name="linhas" value="${esc(d.linhas)}" inputmode="numeric"></div>
      <div class="cheio"><small class="mut" id="med"></small></div>
      <div class="cheio"><label>Título da proposta</label><input name="titulo" value="${esc(d.titulo)}"></div>
      <div class="cheio"><label>Opção da Black Friday</label><select name="promocao"><option value="bf_completo" ${d.promocao === 'bf_completo' ? 'selected' : ''}>Opção 1: Painel Completo (Fire Stick, estrutura, instalação e frete grátis)</option><option value="bf_painel" ${d.promocao === 'bf_painel' ? 'selected' : ''}>Opção 2: Só o Painel (apenas o desconto)</option></select></div>
    </form>
    <h3 style="margin:16px 0 6px;font-size:14px">Itens</h3>
    <div class="tbl"><table id="itens"><thead><tr><th>Descrição</th><th>Qtd.</th><th>Valor unitário (R$)</th><th>Grátis</th><th></th></tr></thead><tbody></tbody></table></div>
    <button type="button" class="mini sec" id="add" style="margin-top:6px">Adicionar item</button>
    <form class="form" id="pp2" autocomplete="off" novalidate style="margin-top:14px">
      <div><label>Desconto à vista (%)</label><input name="desc_vista" value="${esc(d.desc_vista)}" inputmode="decimal"></div>
      <div><label>Desconto à vista (R$)</label><input name="desconto" value="${d.desconto ? (d.desconto / 100).toFixed(2).replace('.', ',') : ''}" inputmode="decimal"></div>
      <div><label>Cartão: parcelas</label><input name="parcelas" value="${esc(d.parcelas)}" inputmode="numeric"></div>
      <div><label>Desconto no cartão (%)</label><input name="desc_cartao" value="${esc(d.desc_cartao)}" inputmode="decimal"></div>
      <div class="cheio"><div id="tot" class="aviso-box" style="justify-content:space-between"></div></div>
      <div class="cheio"><label>Garantia</label><input name="garantia" value="${esc(d.garantia)}"></div>
      <div class="cheio"><label>Outra condição (opcional)</label><input name="condicao_extra" value="${esc(d.condicao_extra)}" placeholder="Ex.: entrada de 50% e restante na entrega"></div>
      <div id="extra-ficha" class="cheio" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><label>Brilho (cd/m²)</label><input name="brilho" value="${esc(d.brilho)}" placeholder="Ex.: até 5.500"></div><div><label>Proteção</label><input name="protecao" value="${esc(d.protecao)}" placeholder="Ex.: IP65"></div>
        <div class="cheio" style="grid-column:1/-1"><label>Fotos da ficha técnica (até 3, opcional)</label><input type="file" name="fotos" accept="image/*" multiple></div></div>
    </form>
    <div class="modal-acoes"><button class="sec" id="x">Fechar</button><span style="flex:1"></span><button class="sec" id="ver">Pré-visualizar</button><button id="ok">Emitir PDF</button></div>`, 860);
  const f1 = m.el.querySelector('#pp'), f2 = m.el.querySelector('#pp2'), tb = m.el.querySelector('#itens tbody');
  const val = (f, n) => f.querySelector(`[name=${n}]`).value;
  const desenhaItens = () => { tb.innerHTML = d.itens.map(linhaItem).join(''); };
  // lê o formulário para "d" e atualiza medidas e totais
  const ler = () => {
    for (const n of ['tratamento', 'cliente', 'telefone', 'modelo', 'colunas', 'linhas', 'titulo', 'promocao']) d[n] = val(f1, n);
    for (const n of ['desc_vista', 'parcelas', 'desc_cartao', 'garantia', 'condicao_extra', 'brilho', 'protecao']) d[n] = val(f2, n);
    tb.querySelectorAll('tr').forEach((tr) => {
      const i = d.itens[+tr.dataset.k], g = (k) => tr.querySelector(`[data-f=${k}]`);
      i.desc = g('desc').value; i.det = g('det').value; i.qtd = g('qtd').value; i.gratis = g('gratis').checked; i.unit = i.gratis ? 0 : Math.round(num(g('unit').value) * 100);
      g('unit').disabled = i.gratis;
    });
    d.desconto = Math.round(num(val(f2, 'desconto')) * 100);
  };
  const resumo = () => {
    const M = MODELOS[d.modelo], md = medidas(d), c = contas(d);
    m.el.querySelector('#med').textContent = `Medida real ${metros(md.larg)} m × ${metros(md.alt)} m · ${md.qtd} gabinetes de ${metros(md.gw)} × ${metros(md.gh)} m · ${metros(md.area)} m² · ${md.resW} × ${md.resH} px`;
    m.el.querySelector('#tot').innerHTML = `<span>Subtotal <b>${reais(c.sub)}</b></span><span>À vista <b>${reais(c.vista)}</b></span><span>Cartão <b>${c.n}x de ${reais(c.parcela)}</b></span>`;
    m.el.querySelector('#extra-ficha').style.display = M.modulo ? 'none' : 'grid';
  };
  const descontoPorPct = () => { const c = contas({ ...d, desconto: 0 }); f2.querySelector('[name=desconto]').value = ((Math.round(c.sub * num(d.desc_vista) / 100)) / 100).toFixed(2).replace('.', ','); };
  const atualizar = (e) => {
    ler();
    const n = e?.target?.name;
    if (n === 'modelo') { const M = MODELOS[d.modelo]; d.titulo = M.titulo; f1.querySelector('[name=titulo]').value = d.titulo; d.brilho = M.brilho || ''; d.protecao = M.protecao || ''; f2.querySelector('[name=brilho]').value = d.brilho; f2.querySelector('[name=protecao]').value = d.protecao; }
    if (['modelo', 'promocao'].includes(n)) { d.itens = itensPadrao(d, d.itens); desenhaItens(); }
    if (['colunas', 'linhas'].includes(n)) { const g = d.itens.find((i) => i.chave === 'gabinete'); if (g) { g.qtd = medidas(d).qtd; desenhaItens(); } }
    if (n === 'desconto') { const sub = contas({ ...d, desconto: 0 }).sub; f2.querySelector('[name=desc_vista]').value = sub ? String(Math.round((d.desconto / sub) * 1000) / 10).replace('.', ',') : ''; }
    else if (!(e?.target?.dataset?.f === 'det' || e?.target?.dataset?.f === 'desc')) descontoPorPct();
    ler(); resumo();
  };
  desenhaItens(); if (!d.desconto) descontoPorPct(); ler(); resumo();
  m.el.addEventListener('input', (e) => { if (e.target.type !== 'file') atualizar(e); });
  m.el.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') atualizar(e); });
  m.el.querySelector('#add').onclick = () => { ler(); d.itens.push({ chave: 'extra' + Date.now(), desc: '', det: '', qtd: 1, unit: 0 }); desenhaItens(); };
  tb.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; ler(); d.itens.splice(+b.dataset.rm, 1); desenhaItens(); atualizar(); });
  f2.querySelector('[name=fotos]').onchange = async (e) => {
    const arqs = [...e.target.files].slice(0, 3);
    d.fotos = await Promise.all(arqs.map((a) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok([r.result, a.name.replace(/\.[^.]+$/, '')]); r.readAsDataURL(a); })));
  };
  m.el.querySelector('#x').onclick = m.fechar;
  const validar = () => {
    ler();
    if (!d.cliente.trim()) return toast('Informe o nome do cliente', true), false;
    if (!d.itens.length || d.itens.some((i) => !i.desc.trim())) return toast('Todo item precisa de descrição', true), false;
    if (contas(d).sub <= 0) return toast('Informe o valor dos itens', true), false;
    return true;
  };
  m.el.querySelector('#ver').onclick = async () => {
    if (!validar()) return;
    await prepararEstilo();
    const v = U.modal(`<h2>Pré-visualização</h2><div style="overflow:auto;max-height:70vh;margin-top:10px;background:#555;padding:12px"><div style="transform:scale(.62);transform-origin:0 0;width:794px;height:${2 * 1123 * 0.62 + 20}px">${paginaProposta(d)}<div style="height:16px"></div>${paginaFicha(d)}</div></div>
      <div class="modal-acoes"><span style="flex:1"></span><button id="vx">Voltar</button></div>`, 560);
    v.el.querySelector('#vx').onclick = v.fechar;
  };
  m.el.querySelector('#ok').onclick = () => {
    if (!validar()) return;
    acao(async () => {
      const blob = await gerarPDF(d);
      const { fotos, ...semFotos } = d;
      await api(`/api/comercial/orcamentos/${o.id}/proposta`, { method: 'POST', body: { dados: semFotos, total_vista: contas(d).vista } });
      m.fechar();
      prontoParaEnviar(o, d, blob, U);
    }, 'Proposta emitida');
  };
}

function prontoParaEnviar(o, d, blob, U) {
  const { modal, toast, zap, primeiroNome } = U;
  const c = contas(d);
  const nome = `Proposta Black Friday - ${d.cliente} - ${o.numero || o.id}.pdf`.replace(/[\\/:*?"<>|]/g, '');
  const arquivo = new File([blob], nome, { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const texto = `Olá, ${primeiroNome(d.cliente)}! Segue a sua proposta da Black Friday da OnTrade para ${d.titulo}: ${reais(c.vista)} à vista${c.n > 1 ? ` ou ${c.n}x de ${reais(c.parcela)} no cartão` : ''}. A condição vale até ${VALIDADE.txt}. Qualquer dúvida, estou à disposição.`;
  const podeCompartilhar = !!(navigator.canShare && navigator.canShare({ files: [arquivo] }));
  const w = modal(`<h2>Proposta Pronta</h2><p class="legenda">${U.esc(nome)} · ${(blob.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB</p>
    <label style="margin-top:12px">Mensagem para o cliente</label><textarea id="tx" rows="4" style="width:100%">${U.esc(texto)}</textarea>
    <p class="legenda" style="margin-top:8px">${podeCompartilhar ? 'No celular, "Enviar pelo WhatsApp" abre o compartilhamento já com o PDF anexado: escolha o WhatsApp e a conversa do cliente.' : 'No computador, o PDF é baixado e a conversa do cliente abre no WhatsApp com a mensagem pronta: é só arrastar o PDF baixado para a conversa.'}</p>
    <div class="modal-acoes"><button class="sec" id="fc">Fechar</button><span style="flex:1"></span><a class="btn sec" id="dl" href="${url}" download="${U.esc(nome)}">Baixar PDF</a><button id="zp">Enviar pelo WhatsApp</button></div>`, 560);
  w.el.querySelector('#fc').onclick = () => { w.fechar(); setTimeout(() => URL.revokeObjectURL(url), 60000); };
  w.el.querySelector('#zp').onclick = async () => {
    const msg = w.el.querySelector('#tx').value;
    if (podeCompartilhar) {
      try { await navigator.share({ files: [arquivo], text: msg, title: nome }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    w.el.querySelector('#dl').click();
    const z = zap(d.telefone || o.cliente_telefone);
    if (!z) return toast('Cliente sem WhatsApp cadastrado: o PDF foi baixado.', true);
    window.open(`${z}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    toast('PDF baixado: arraste para a conversa do WhatsApp');
  };
}

// usado nos testes
export const _interno = { medidas, contas, itensPadrao, paginaProposta, paginaFicha, MODELOS };
