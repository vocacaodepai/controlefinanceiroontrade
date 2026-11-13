// Catálogo digital de fornecedor: o folder fotografado foi recortado produto a produto e remontado em páginas A4.
// Duas versões: "interna" (com a página do fornecedor e os contatos dele) e "cliente" (sem nome, contatos, site,
// endereço ou fotos da fábrica do fornecedor, com o contato da On Trade). As páginas são HTML; o PDF sai com
// html2canvas + jsPDF (public/vendor), como a proposta.

const VENDEDOR = { nome: 'On Trade Import e Export', telefone: '(21) 98031-3498', email: 'ontrade246@gmail.com' };
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => String(v).replace('.', ',');

const CSS = `
.ct-pg{width:794px;height:1123px;background:#fff;position:relative;overflow:hidden;font-family:Inter,Arial,sans-serif;color:#1d1d1f;box-sizing:border-box}
.ct-pg *{box-sizing:border-box}
.ct-pg h1,.ct-pg h2,.ct-pg h3{font-family:Poppins,Inter,Arial,sans-serif;margin:0;color:inherit}
.ct-sec{grid-column:1/-1;display:flex;align-items:center;gap:12px;margin-top:6px;font-family:Poppins,Inter,sans-serif;font-size:16px;font-weight:600}.ct-sec:after{content:'';flex:1;height:1px;background:#d2d2d7}
.ct-cab{display:flex;align-items:flex-end;justify-content:space-between;padding:38px 48px 14px;border-bottom:2px solid #1d1d1f;margin:0 0 0}
.ct-cab h2{font-size:21px;letter-spacing:.2px}.ct-cab span{font-size:11px;color:#6e6e73;letter-spacing:.6px;text-transform:uppercase}
.ct-grade{display:grid;grid-template-columns:repeat(3,1fr);gap:16px 18px;padding:22px 48px 0}
.ct-it .im{height:150px;border-radius:6px;overflow:hidden;background:#f2f2f2}
.ct-it .im img{width:100%;height:100%;object-fit:cover;display:block}
.ct-it b{display:block;font-size:13px;margin-top:7px;font-weight:600}
.ct-it small{display:block;font-size:10.5px;color:#6e6e73;margin-top:1px}
.ct-it .md{display:inline-block;font-size:10.5px;font-weight:600;color:#7a4b00;background:#fdf1dc;border-radius:4px;padding:1px 6px;margin-top:4px}
.ct-it .dv{display:block;font-size:9.5px;color:#b3261e;margin-top:3px}
.ct-rod{position:absolute;left:48px;right:48px;bottom:26px;display:flex;justify-content:space-between;font-size:10px;color:#86868b;border-top:1px solid #e5e5ea;padding-top:9px}
.ct-capa{background:#0f1210;color:#fff}
.ct-capa .bg{position:absolute;inset:0;background-size:cover;background-position:center 30%}
.ct-capa .vel{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,12,10,.15) 0%,rgba(10,12,10,.25) 45%,rgba(10,12,10,.92) 72%,#0b0d0b 100%)}
.ct-capa .tx{position:absolute;left:56px;right:56px;bottom:120px}
.ct-capa .eti{font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#f0b354}
.ct-capa h1{font-size:62px;line-height:1.02;margin-top:12px;font-weight:700}
.ct-capa p{font-size:16px;line-height:1.5;color:#d2d2d7;margin:16px 0 0;max-width:600px}
.ct-capa .num{display:flex;gap:28px;margin-top:28px}.ct-capa .num div{font-size:11px;color:#a1a1a6;text-transform:uppercase;letter-spacing:.8px}.ct-capa .num b{display:block;font-size:24px;color:#fff;font-family:Poppins,Inter,sans-serif;letter-spacing:0}
.ct-capa .pe{position:absolute;left:56px;right:56px;bottom:40px;font-size:11.5px;color:#a1a1a6;border-top:1px solid rgba(255,255,255,.18);padding-top:14px;display:flex;justify-content:space-between}
.ct-capa .uso{position:absolute;top:36px;right:40px;font-size:10.5px;letter-spacing:1px;text-transform:uppercase;background:#b3261e;color:#fff;padding:5px 10px;border-radius:4px}
.ct-ap .foto{height:430px;background-size:cover;background-position:center}
.ct-ap .cx{padding:30px 48px 0;display:grid;grid-template-columns:1.1fr 1fr;gap:34px}
.ct-ap h2{font-size:24px}.ct-ap p{font-size:13px;line-height:1.6;color:#3a3a3c;margin:10px 0 0}
.ct-ap h3{font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#7a4b00;margin:22px 0 8px}
.ct-ap ol,.ct-ap ul{margin:0;padding-left:18px;font-size:12.5px;line-height:1.75;color:#1d1d1f}
.ct-ap .nota{font-size:11px;color:#6e6e73;margin-top:16px;border-left:3px solid #f0b354;padding:4px 0 4px 10px}
.ct-ap .mov{height:250px;border-radius:8px;background-size:cover;background-position:center;margin-top:4px}
.ct-sb .cx{padding:26px 48px 0}
.ct-sb p{font-size:12.2px;line-height:1.6;color:#3a3a3c;margin:0 0 9px}
.ct-sb .fat{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:4px 0 16px}
.ct-sb .fat div{background:#f5f5f7;border-radius:6px;padding:8px 9px;font-size:9.5px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px}.ct-sb .fat b{display:block;font-size:12.5px;color:#1d1d1f;text-transform:none;letter-spacing:0;margin-top:2px}
.ct-sb .fab{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:6px 0 16px}.ct-sb .fab div{font-size:10px;color:#6e6e73}.ct-sb .fab .im{height:110px;border-radius:6px;background-size:cover;background-position:center;margin-bottom:5px}
.ct-sb .ctt{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ct-sb .ctt div{border:1px solid #e5e5ea;border-radius:8px;padding:10px 12px;font-size:11.5px;line-height:1.5}
.ct-sb .pend{margin-top:14px;background:#fff4f2;border:1px solid #f3c4bd;border-radius:8px;padding:10px 14px;font-size:11px;line-height:1.55}.ct-sb .pend b{color:#b3261e}
.ct-banner{grid-column:1/-1;margin-top:8px;border-radius:10px;background-size:cover;background-position:center 35%;position:relative;overflow:hidden;color:#fff}
.ct-banner>div{position:absolute;left:0;right:0;bottom:0;padding:60px 30px 26px;background:linear-gradient(180deg,rgba(10,12,10,0),rgba(10,12,10,.88) 45%)}
.ct-banner h2{font-size:28px}.ct-banner p{font-size:13.5px;line-height:1.55;color:#e5e5ea;margin:8px 0 0}.ct-banner .ctt{color:#fff;font-weight:600}
.ct-fim{background:#0f1210;color:#fff}.ct-fim .bg{position:absolute;inset:0;background-size:cover;background-position:center}
.ct-fim .vel{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,12,10,0) 40%,rgba(10,12,10,.9) 75%)}
.ct-fim .tx{position:absolute;left:56px;right:56px;bottom:70px}.ct-fim h2{font-size:34px}.ct-fim p{font-size:14px;color:#d2d2d7;line-height:1.6;margin:10px 0 0}
`;

function prepararEstilo() {
  if (!document.getElementById('ct-css')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600;700&display=swap'; document.head.appendChild(l);
    const s = document.createElement('style'); s.id = 'ct-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  return Promise.race([Promise.all(['700 20px Poppins', '400 12px Inter', '600 12px Inter'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 3000))]);
}

// ---------------------------------------------------------------- dados → páginas
export function medidaTxt(it, modo) {
  if (!it.medida || (modo === 'cliente' && it.duvida)) return modo === 'cliente' ? 'Medida sob consulta' : '';
  return `${it.medida.rotulo} ${num(it.medida.m)} m`;
}
export function nomeItem(it, modo) {
  if (!it.nome_orig && modo === 'cliente') return 'Modelo Sob Consulta';
  return it.nome;
}
// tudo que pode identificar o fornecedor fica fora da versão do cliente
export function paraCliente(c) {
  const herois = Object.fromEntries(Object.entries(c.herois || {}).filter(([, v]) => !v.interno));
  return { ...c, herois, sobre: null, pendencias: [], titulo_orig: '', fornecedor_id: null };
}

export function paginas(c, modo, url) {
  const C = modo === 'cliente' ? paraCliente(c) : c;
  const img = (n) => url(`h/${C.herois[n]?.img}`);
  const porId = Object.fromEntries(C.itens.map((i) => [i.id, i]));
  const out = [];
  let pg = 0;
  const rod = (txt) => `<div class="ct-rod"><span>${h(txt)}</span><span>${++pg}</span></div>`;
  const rodTxt = modo === 'cliente' ? `${VENDEDOR.nome} · ${VENDEDOR.telefone} · ${VENDEDOR.email}` : 'Uso interno · não enviar ao cliente';
  out.push(`<div class="ct-pg ct-capa"><div class="bg" style="background-image:url('${img('trex-arte')}')"></div><div class="vel"></div>
    ${modo === 'interna' ? '<div class="uso">Uso interno</div>' : ''}
    <div class="tx"><div class="eti">Catálogo de Produtos</div><h1>Animatrônicos<br>em Tamanho Real</h1><p>${h(C.subtitulo)}</p>
      <div class="num"><div><b>${C.itens.length}</b>modelos</div><div><b>${C.secoes.filter((s) => s.itens.length).length}</b>linhas</div><div><b>Sob medida</b>tamanho e movimentos</div></div></div>
    <div class="pe"><span>${modo === 'cliente' ? h(VENDEDOR.nome) : 'Fornecedor: ' + h(c.sobre?.empresa || '')}</span><span>${modo === 'cliente' ? `${h(VENDEDOR.telefone)} · ${h(VENDEDOR.email)}` : 'Versão interna'}</span></div>${(pg++, '')}</div>`);
  if (C.sobre) {
    const S = C.sobre;
    out.push(`<div class="ct-pg ct-sb"><div class="ct-cab"><h2>${h(S.titulo)}</h2><span>Uso interno</span></div><div class="cx">
      <p style="font-size:14px;color:#1d1d1f;font-weight:600;margin-bottom:12px">${h(S.empresa)}</p>
      <div class="fat">${S.fatos.map(([k, v]) => `<div>${h(k)}<b>${h(v)}</b></div>`).join('')}</div>
      ${S.paragrafos.map((p) => `<p>${h(p)}</p>`).join('')}
      <div class="fab">${S.fotos.filter(([k]) => C.herois[k]).map(([k, leg]) => `<div><div class="im" style="background-image:url('${img(k)}')"></div>${h(leg)}</div>`).join('')}</div>
      <div class="ctt">${S.contatos.map(([n, cg, tel, em]) => `<div><b>${h(n)}</b><br>${h(cg)}<br>${h(tel)}<br>${h(em)}</div>`).join('')}</div>
      <p style="margin-top:10px;font-size:11.5px">${h(S.site)} · ${h(S.endereco)}</p>
      ${C.pendencias?.length ? `<div class="pend"><b>A conferir</b><br>${C.pendencias.map(h).join('<br>')}</div>` : ''}
    </div>${rod(rodTxt)}</div>`);
  }
  out.push(`<div class="ct-pg ct-ap"><div class="foto" style="background-image:url('${img('trex-ohio')}')"></div><div class="cx">
    <div><h2>Animatrônicos Realistas</h2><p>${h(C.intro)}</p><h3>Linhas de Produto</h3><ul>${C.linhas.map((l) => `<li>${h(l)}</li>`).join('')}</ul><div class="nota">${h(C.medidas_nota)}</div></div>
    <div><div class="mov" style="background-image:url('${img('movimentos')}')"></div><h3>Movimentos</h3><ol>${C.movimentos.map((m) => `<li>${h(m)}</li>`).join('')}</ol></div>
  </div>${rod(rodTxt)}</div>`);
  // as seções correm em sequência: uma seção nova começa na mesma página se couber, para não sobrar página quase vazia
  const ALT = 940, LINHA = 214, TIT = 46;
  const blocos = [];
  for (const s of C.secoes) {
    const its = s.itens.map((id) => porId[id]).filter(Boolean);
    if (!its.length) continue;
    blocos.push({ sec: s });
    for (let k = 0; k < its.length; k += 3) blocos.push({ sec: s, linha: its.slice(k, k + 3) });
  }
  const cards = (linha) => linha.map((it) => {
    const md = medidaTxt(it, modo), nome = nomeItem(it, modo);
    return `<div class="ct-it"><div class="im"><img src="${url('i/' + it.img)}" alt=""></div><b>${h(nome)}</b>${it.nome_orig && it.nome_orig !== nome ? `<small>${h(it.nome_orig)}</small>` : ''}${md ? `<span class="md">${h(md)}</span>` : ''}${modo === 'interna' && it.duvida ? `<span class="dv">A conferir: ${h(it.duvida)}</span>` : ''}</div>`;
  }).join('');
  let atual = null;
  const fecha = () => { if (atual) out.push(`<div class="ct-pg"><div class="ct-cab"><h2>${h(atual.titulo)}</h2><span>${atual.cont ? 'continuação' : ''}</span></div><div class="ct-grade">${atual.html}</div>${rod(rodTxt)}</div>`); atual = null; };
  for (let k = 0; k < blocos.length; k++) {
    const b = blocos[k];
    if (!b.linha) {
      // título de seção: só entra se couber junto com pelo menos uma linha de produtos
      if (atual && atual.usado + TIT + LINHA > ALT) fecha();
      if (!atual) { atual = { titulo: b.sec.titulo, html: '', usado: 0 }; continue; }
      atual.html += `<div class="ct-sec">${h(b.sec.titulo)}</div>`; atual.usado += TIT; continue;
    }
    if (atual && atual.usado + LINHA > ALT) fecha();
    if (!atual) atual = { titulo: b.sec.titulo, html: '', usado: 0, cont: true };
    atual.html += cards(b.linha); atual.usado += LINHA;
  }
  // fechamento: se a última página de produtos tiver espaço, ele entra nela; senão vira uma página própria
  const contato = modo === 'cliente' ? `${h(VENDEDOR.nome)} · ${h(VENDEDOR.telefone)} · ${h(VENDEDOR.email)}` : h(c.sobre?.contatos?.map((x) => `${x[0]}: ${x[2]}`).join(' · ') || '');
  const temFim = !!C.herois['braquio-penang'];
  let fimDentro = false;
  if (temFim && atual && ALT - atual.usado >= 420) {
    atual.html += `<div class="ct-banner" style="height:${ALT - atual.usado - 24}px;background-image:url('${img('braquio-penang')}')"><div><h2>Projetos Sob Medida</h2><p>Espécie, tamanho, cores e movimentos definidos para o seu espaço. Fale com a gente para montar o seu projeto.</p><p class="ctt">${contato}</p></div></div>`;
    fimDentro = true;
  }
  fecha();
  if (temFim && !fimDentro) {
    out.push(`<div class="ct-pg ct-fim"><div class="bg" style="background-image:url('${img('braquio-penang')}')"></div><div class="vel"></div>
      <div class="tx"><h2>Projetos Sob Medida</h2><p>Espécie, tamanho, cores e movimentos definidos para o seu espaço. Fale com a gente para montar o seu projeto.</p>
      <p style="margin-top:18px;font-size:13px;color:#fff">${contato}</p></div></div>`);
  }
  return out;
}

// ---------------------------------------------------------------- PDF
const carregar = (src) => new Promise((ok, erro) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => erro(new Error('Não foi possível carregar ' + src)); document.head.appendChild(s); });
export async function gerarPDF(c, modo, url, progresso = () => {}) {
  await prepararEstilo();
  await Promise.all([carregar('vendor/jspdf.umd.min.js'), carregar('vendor/html2canvas.min.js')]);
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;left:-12000px;top:0;width:794px';
  caixa.innerHTML = paginas(c, modo, url).join('');
  document.body.appendChild(caixa);
  try {
    // fundos em CSS (background-image) não avisam quando carregam: pré-carrega tudo antes de fotografar a página
    const srcs = new Set([...caixa.querySelectorAll('img')].map((i) => i.src));
    caixa.querySelectorAll('[style*="background-image"]').forEach((e) => { const m = e.style.backgroundImage.match(/url\("?(.*?)"?\)/); if (m) srcs.add(m[1]); });
    await Promise.all([...srcs].map((s) => new Promise((r) => { const i = new Image(); i.onload = r; i.onerror = r; i.src = s; })));
    const pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pgs = [...caixa.querySelectorAll('.ct-pg')];
    for (let k = 0; k < pgs.length; k++) {
      progresso(k + 1, pgs.length);
      const cv = await window.html2canvas(pgs[k], { scale: 1.6, backgroundColor: '#ffffff', useCORS: true, logging: false });
      if (k) pdf.addPage();
      pdf.addImage(cv.toDataURL('image/jpeg', 0.84), 'JPEG', 0, 0, 595.28, 841.89);
    }
    return pdf.output('blob');
  } finally { caixa.remove(); }
}

// ---------------------------------------------------------------- tela
export async function abrir(f, U) {
  const { api, modal, toast } = U;
  const esc = h;
  const id = f.catalogo;
  const c = await api(`/api/fornecedores/catalogo/${id}`);
  const url = (p) => `/api/fornecedores/catalogo/${id}/${p}`;
  await prepararEstilo();
  let modo = 'interna', aba = 'paginas', secao = '', q = '';
  const m = modal(`<div class="ct-top"><div><h2>Catálogo Digital</h2><p class="legenda">${esc(f.nome)} · ${c.itens.length} modelos · ${c.paginas_recebidas} fotos do folder${c.completo ? '' : ' · folder ainda parcial'}</p></div>
      <div class="ct-ctl"><div class="seg" id="ct-modo"><button data-m="interna">Interna</button><button data-m="cliente">Cliente</button></div>
      <div class="seg" id="ct-aba"><button data-a="paginas">Páginas</button><button data-a="produtos">Produtos</button></div></div></div>
    <div id="ct-aviso"></div><div id="ct-corpo" class="ct-corpo"></div>
    <div class="modal-acoes"><button class="sec" id="ct-pdf-i">Baixar PDF Interno</button><span style="flex:1"></span><button class="sec" id="ct-x">Fechar</button><button id="ct-pdf-c">Baixar PDF Para Cliente</button></div>`, 1120);
  const corpo = m.el.querySelector('#ct-corpo');
  const desenhar = () => {
    m.el.querySelectorAll('#ct-modo [data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === modo));
    m.el.querySelectorAll('#ct-aba [data-a]').forEach((b) => b.classList.toggle('on', b.dataset.a === aba));
    m.el.querySelector('#ct-aviso').innerHTML = modo === 'cliente'
      ? '<p class="ct-faixa ok">Versão do cliente: sem nome, contatos, site, endereço ou fotos da fábrica do fornecedor. O rodapé leva o contato da On Trade.</p>'
      : '<p class="ct-faixa">Versão interna: inclui a página do fornecedor, contatos e itens a conferir. Não enviar ao cliente.</p>';
    if (aba === 'paginas') {
      const pgs = paginas(c, modo, url);
      const larg = Math.min(794, corpo.clientWidth - 24 || 794), s = larg / 794;
      corpo.innerHTML = `<div class="ct-pags">${pgs.map((p) => `<div class="ct-moldura" style="width:${794 * s}px;height:${1123 * s}px"><div style="transform:scale(${s});transform-origin:0 0;width:794px">${p}</div></div>`).join('')}</div>`;
      corpo.querySelectorAll('.ct-pg img').forEach((i) => (i.loading = 'lazy'));
      return;
    }
    const termo = q.trim().toLowerCase();
    const vis = c.itens.filter((it) => (!secao || it.secao === secao) && (!termo || `${it.nome} ${it.nome_orig}`.toLowerCase().includes(termo)));
    corpo.innerHTML = `<div class="ct-filtro"><div class="chips">${[['', `Todas (${c.itens.length})`], ...c.secoes.map((s) => [s.id, `${s.titulo} (${s.itens.length})`])].map(([k, r]) => `<button class="chip ${secao === k ? 'on' : ''}" data-s="${k}">${esc(r)}</button>`).join('')}</div>
        <input id="ct-q" type="search" placeholder="Buscar modelo: T-rex, mamute, baleia..." value="${esc(q)}" autocomplete="off"></div>
      <p class="legenda">${vis.length} modelo${vis.length === 1 ? '' : 's'} · clique para ampliar</p>
      <div class="ct-lista">${vis.map((it, k) => `<button class="ct-card" data-k="${k}"><img loading="lazy" src="${url('i/' + it.img)}" alt=""><b>${esc(nomeItem(it, modo))}</b><span>${esc(medidaTxt(it, modo))}${modo === 'interna' && it.duvida ? ' · a conferir' : ''}</span></button>`).join('')}</div>`;
    corpo.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { secao = b.dataset.s; desenhar(); }));
    let tm; corpo.querySelector('#ct-q').oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { q = e.target.value; desenhar(); const i = corpo.querySelector('#ct-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
    corpo.querySelectorAll('.ct-card').forEach((b) => (b.onclick = () => ampliar(vis, +b.dataset.k)));
  };
  const ampliar = (lista, i) => {
    const v = modal('<div class="fc-visor ct-visor"><img alt=""><p class="ct-nome"></p><p class="legenda"></p><div class="modal-acoes"><button class="sec" id="ant">Anterior</button><span style="flex:1"></span><button class="sec" id="prox">Próxima</button><button id="vx">Fechar</button></div></div>', 980);
    const mostra = () => {
      const it = lista[i];
      v.el.querySelector('img').src = url('i/' + it.img);
      const md = medidaTxt(it, modo);
      v.el.querySelector('.ct-nome').textContent = `${nomeItem(it, modo)}${md ? ' · ' + md : ''}`;
      v.el.querySelector('.legenda').textContent = [c.secoes.find((s) => s.id === it.secao)?.titulo, it.nome_orig && it.nome_orig !== it.nome ? `Nome no folder: ${it.nome_orig}` : '', modo === 'interna' && it.duvida ? `A conferir: ${it.duvida}` : '', `${i + 1} de ${lista.length}`].filter(Boolean).join(' · ');
    };
    v.el.querySelector('#ant').onclick = () => { i = (i - 1 + lista.length) % lista.length; mostra(); };
    v.el.querySelector('#prox').onclick = () => { i = (i + 1) % lista.length; mostra(); };
    v.el.querySelector('#vx').onclick = v.fechar;
    const tecla = (e) => { if (!document.body.contains(v.el)) return document.removeEventListener('keydown', tecla); if (e.key === 'ArrowLeft') v.el.querySelector('#ant').click(); if (e.key === 'ArrowRight') v.el.querySelector('#prox').click(); };
    document.addEventListener('keydown', tecla);
    mostra();
  };
  const baixar = async (qual, botao) => {
    const rot = botao.textContent;
    botao.disabled = true;
    try {
      const blob = await gerarPDF(c, qual, url, (k, n) => { botao.textContent = `Gerando ${k} de ${n}...`; });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = qual === 'cliente' ? 'Catalogo de Animatronicos.pdf' : `Catalogo ${f.nome} (interno).pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      toast(qual === 'cliente' ? 'PDF do cliente baixado (sem dados do fornecedor)' : 'PDF interno baixado');
    } catch (e) { toast(e.message || 'Não foi possível gerar o PDF', 'erro'); } finally { botao.disabled = false; botao.textContent = rot; }
  };
  m.el.querySelectorAll('#ct-modo [data-m]').forEach((b) => (b.onclick = () => { modo = b.dataset.m; desenhar(); }));
  m.el.querySelectorAll('#ct-aba [data-a]').forEach((b) => (b.onclick = () => { aba = b.dataset.a; desenhar(); }));
  m.el.querySelector('#ct-x').onclick = m.fechar;
  m.el.querySelector('#ct-pdf-c').onclick = (e) => baixar('cliente', e.currentTarget);
  m.el.querySelector('#ct-pdf-i').onclick = (e) => baixar('interna', e.currentTarget);
  desenhar();
}
