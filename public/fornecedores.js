// Fornecedores da Feira de Cantão (outubro de 2026): cada cartão vira um cartão digital com as cores do original,
// com o texto como impresso (Original) ou em português (Traduzido), filtros e a ficha completa com fotos.

const foto = (src) => `/api/fornecedores/foto/${src}`;
const lista = (v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => String(x).trim()).filter(Boolean);
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const LS = 'fornIdioma';
const lerIdioma = () => { try { return localStorage.getItem(LS) || 'pt'; } catch { return 'pt'; } };
const salvarIdioma = (v) => { try { localStorage.setItem(LS, v); } catch { /* sem armazenamento */ } };

// números que dá para abrir no WhatsApp (celular chinês de 11 dígitos começando com 1 ganha o +86)
function numeroZap(t) {
  const s = String(t || '');
  if (/s[oó] qr/i.test(s)) return null;
  let d = s.replace(/[^\d+]/g, '');
  if (!d) return null;
  const mais = d.startsWith('+'); d = d.replace(/\+/g, '');
  if (!mais && d.length === 11 && d.startsWith('1')) d = '86' + d;
  return d.length >= 10 ? d : null;
}
const siteUrl = (s) => { const m = String(s).match(/((?:https?:\/\/)?[\w.-]+\.[a-z]{2,}(?:\/[^\s(]*)?)/i); if (!m) return null; return /^https?:/i.test(m[1]) ? m[1].replace(/^htp:/, 'http:') : 'https://' + m[1]; };
const emailOk = (s) => (String(s).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [])[0];

// texto conforme o idioma escolhido (traduzido cai no original quando não houver tradução)
function textos(f, idioma) {
  const pt = f.pt || {}, og = f.orig || {}, T = idioma === 'pt';
  const pessoas = (f.pessoas || []).map((p, i) => ({ ...p, cargo: T ? (pt.cargos?.[i] || p.cargo) : (og.cargos?.[i] || p.cargo) }));
  return {
    empresa: T ? (pt.empresa || f.empresa_en || f.nome) : (f.empresa_en || f.empresa_cn || f.nome),
    empresa2: T ? (pt.empresa_cn || '') : (f.empresa_en && f.empresa_cn ? f.empresa_cn : ''),
    resumo: T ? pt.resumo || '' : '',
    pessoas,
    produtos: T ? lista(pt.produtos).length ? lista(pt.produtos) : lista(f.produtos) : lista(og.produtos).length ? lista(og.produtos) : lista(f.produtos),
    carro: T ? (pt.carro_chefe || f.carro_chefe) : (og.carro_chefe || f.carro_chefe),
    endereco: T ? (lista(pt.endereco).length ? lista(pt.endereco) : lista(f.endereco)) : (lista(og.endereco).length ? lista(og.endereco) : lista(f.endereco)),
    certificacoes: T ? lista(pt.certificacoes).length ? lista(pt.certificacoes) : lista(f.certificacoes) : lista(f.certificacoes),
    moq: T ? lista(pt.moq).length ? lista(pt.moq) : lista(f.moq) : lista(f.moq),
    fundacao: T ? lista(pt.fundacao).length ? lista(pt.fundacao) : lista(f.fundacao) : lista(f.fundacao),
    fabrica: T ? lista(pt.fabrica).length ? lista(pt.fabrica) : lista(f.fabrica) : lista(f.fabrica),
    outros: T ? lista(pt.outros).length ? lista(pt.outros) : lista(f.outros) : lista(f.outros),
    incertezas: T ? lista(pt.incertezas).length ? lista(pt.incertezas) : lista(f.incertezas) : lista(f.incertezas),
  };
}

// ------------------------------------------------------------------ cartão digital
const ICO = {
  tel: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  zap: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/>',
  wechat: '<path d="M9 4C5 4 2 6.7 2 10c0 1.9 1 3.5 2.5 4.6L4 17l2.6-1.3c.8.2 1.6.3 2.4.3"/><path d="M15 9c3.9 0 7 2.6 7 5.8 0 1.7-.9 3.2-2.3 4.2l.4 2-2.3-1.1c-.9.3-1.8.4-2.8.4-3.9 0-7-2.6-7-5.5S11.1 9 15 9z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  web: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
};
const ic = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICO[n]}</svg>`;
function contatosDo(f) {
  const c = [];
  for (const t of lista(f.telefones).slice(0, 2)) c.push(['tel', t]);
  const zaps = lista(f.whatsapp).filter((w) => !/s[oó] qr/i.test(w));
  if (zaps.length) c.push(['zap', zaps[0]]); else if (lista(f.whatsapp).length) c.push(['zap', 'QR code no cartão']);
  const wc = lista(f.wechat).filter((w) => !/s[oó] qr/i.test(w));
  if (wc.length) c.push(['wechat', wc[0]]); else if (lista(f.wechat).length) c.push(['wechat', 'QR code no cartão']);
  for (const e of lista(f.email).slice(0, 1)) c.push(['mail', e]);
  for (const s of lista(f.site).slice(0, 1)) c.push(['web', s]);
  return c;
}
function cartao(f, idioma, esc, grande = false) {
  const d = f.design || {}, t = textos(f, idioma), p = t.pessoas[0];
  const estilo = `--fc-fundo:${d.fundo || '#ffffff'};--fc-texto:${d.texto || '#1d2430'};--fc-dest:${d.destaque || '#0c5aa6'};--fc-sec:${d.secundaria || d.destaque || '#0c5aa6'}`;
  const logo = d.logo_texto || f.marca || f.nome;
  return `<div class="fc-card ${grande ? 'grande' : ''} fc-${d.estilo === 'escuro' ? 'escuro' : 'claro'} fc-faixa-${d.faixa || 'nenhuma'} ${d.alinhamento === 'centro' ? 'fc-centro' : ''} ${d.fonte === 'serif' ? 'fc-serif' : ''}" style="${esc(estilo)}" data-f="${esc(f.id)}">
    <div class="fc-barra"></div>
    <div class="fc-corpo">
      <div class="fc-logo">${esc(logo)}</div>
      <div class="fc-emp">${esc(t.empresa)}${t.empresa2 ? `<small>${esc(t.empresa2)}</small>` : ''}</div>
      ${p ? `<div class="fc-pessoa"><b>${esc(p.pessoa)}</b>${p.cargo ? `<span>${esc(p.cargo)}</span>` : ''}${t.pessoas.length > 1 ? `<span class="fc-mais">+${t.pessoas.length - 1} contato${t.pessoas.length > 2 ? 's' : ''}</span>` : ''}</div>` : ''}
      <ul class="fc-cont">${contatosDo(f).slice(0, grande ? 6 : 4).map(([k, v]) => `<li>${ic(k)}<span>${esc(v)}</span></li>`).join('')}</ul>
    </div>
    <div class="fc-rod"><span>${ic('pin')}${esc([f.cidade, f.provincia].filter(Boolean).join(', ') || '—')}</span><span class="fc-setor">${esc(f.setor)}</span></div>
  </div>`;
}

// ------------------------------------------------------------------ página
export async function pagina($app, U) {
  const { api, esc, modal, toast, state } = U;
  const todos = await api('/api/fornecedores');
  const F = state.filtroForn || (state.filtroForn = { q: '', setor: '', local: '', material: '', contato: '', ordem: 'nome' });
  let idioma = lerIdioma();
  const setores = [...new Set(todos.map((f) => f.setor))].sort((a, b) => (a === 'Ramo não identificado') - (b === 'Ramo não identificado') || a.localeCompare(b));
  const locais = [...new Set(todos.map((f) => f.provincia).filter(Boolean))].sort();
  const conta = (pred) => todos.filter(pred).length;
  const busca = (f) => semAcento([f.nome, f.marca, f.empresa_en, f.empresa_cn, f.setor, f.cidade, f.provincia, f.pt?.empresa, f.pt?.resumo, ...lista(f.produtos), ...lista(f.pt?.produtos), ...(f.pessoas || []).map((p) => p.pessoa), ...lista(f.email), ...lista(f.site)].join(' '));
  const temZap = (f) => lista(f.whatsapp).some((w) => numeroZap(w));
  const desenhar = () => {
    const termos = semAcento(F.q).split(/\s+/).filter(Boolean);
    let vis = todos.filter((f) => (!F.setor || f.setor === F.setor) && (!F.local || f.provincia === F.local) && (!F.material || (f.material || '').includes(F.material))
      && (!F.contato || (F.contato === 'zap' ? temZap(f) : F.contato === 'email' ? lista(f.email).length : F.contato === 'wechat' ? lista(f.wechat).length : lista(f.incertezas).length))
      && termos.every((t) => busca(f).includes(t)));
    vis = vis.sort(F.ordem === 'setor' ? (a, b) => a.setor.localeCompare(b.setor) || a.nome.localeCompare(b.nome) : F.ordem === 'cidade' ? (a, b) => (a.cidade || '~').localeCompare(b.cidade || '~') || a.nome.localeCompare(b.nome) : (a, b) => a.nome.localeCompare(b.nome));
    const opt = (v, atual, rot) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(rot)}</option>`;
    $app.innerHTML = `<div class="fc-cab"><div><h1>Fornecedores</h1><p class="sub">Feira de Cantão · outubro de 2026 · cartões, catálogos e folhetos trazidos pelos sócios. ${todos.length} fornecedores em ${setores.length} ramos.</p></div>
        <div class="seg fc-idioma" role="group" aria-label="Idioma"><button data-id="orig" class="${idioma === 'orig' ? 'on' : ''}">Original</button><button data-id="pt" class="${idioma === 'pt' ? 'on' : ''}">Traduzido</button></div></div>
      <div class="card"><div class="busca-estoque"><input id="fq" type="search" value="${esc(F.q)}" placeholder="Buscar: empresa, produto, pessoa, cidade, e-mail..." autocomplete="off"></div>
        <div class="row" style="margin:12px 0 0">
          <div><label>Ramo</label><select id="fs"><option value="">Todos (${todos.length})</option>${setores.map((s) => opt(s, F.setor, `${s} (${conta((f) => f.setor === s)})`)).join('')}</select></div>
          <div><label>Província</label><select id="fl"><option value="">Todas</option>${locais.map((l) => opt(l, F.local, `${l} (${conta((f) => f.provincia === l)})`)).join('')}</select></div>
          <div><label>Material</label><select id="fm"><option value="">Todos</option>${['Cartão', 'Catálogo', 'Folheto'].map((m) => opt(m, F.material, `${m} (${conta((f) => (f.material || '').includes(m))})`)).join('')}</select></div>
          <div><label>Contato</label><select id="fc"><option value="">Qualquer</option>${opt('zap', F.contato, `Com WhatsApp (${conta(temZap)})`)}${opt('email', F.contato, `Com e-mail (${conta((f) => lista(f.email).length)})`)}${opt('wechat', F.contato, `Com WeChat (${conta((f) => lista(f.wechat).length)})`)}${opt('incerto', F.contato, `Dados a conferir (${conta((f) => lista(f.incertezas).length)})`)}</select></div>
          <div><label>Ordenar</label><select id="fo">${opt('nome', F.ordem, 'Nome')}${opt('setor', F.ordem, 'Ramo')}${opt('cidade', F.ordem, 'Cidade')}</select></div>
          ${F.q || F.setor || F.local || F.material || F.contato ? '<button class="sec" id="limpa">Limpar Filtros</button>' : ''}
        </div></div>
      <p class="legenda" style="margin:4px 2px 12px">${vis.length} de ${todos.length} fornecedores · clique num cartão para ver a ficha completa e as fotos</p>
      ${vis.length ? `<div class="fc-grade">${vis.map((f) => cartao(f, idioma, esc)).join('')}</div>` : '<div class="card"><p class="mut">Nenhum fornecedor com esses filtros.</p></div>'}`;
    const liga = (id, k) => { document.getElementById(id).onchange = (e) => { F[k] = e.target.value; desenhar(); }; };
    liga('fs', 'setor'); liga('fl', 'local'); liga('fm', 'material'); liga('fc', 'contato'); liga('fo', 'ordem');
    document.getElementById('limpa')?.addEventListener('click', () => { Object.assign(F, { q: '', setor: '', local: '', material: '', contato: '' }); desenhar(); });
    let tm; document.getElementById('fq').oninput = (e) => { clearTimeout(tm); tm = setTimeout(() => { F.q = e.target.value; desenhar(); const i = document.getElementById('fq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
    $app.querySelectorAll('.fc-idioma [data-id]').forEach((b) => (b.onclick = () => { idioma = b.dataset.id; salvarIdioma(idioma); desenhar(); }));
    $app.querySelectorAll('.fc-grade .fc-card').forEach((c) => (c.onclick = () => ficha(todos.find((f) => f.id === c.dataset.f))));
  };

  // ficha completa: cartão grande, dados, contatos clicáveis e fotos
  const ficha = (f) => {
    let lang = idioma;
    const m = modal('<div id="fc-ficha"></div>', 900);
    const corpo = m.el.querySelector('#fc-ficha');
    const bloco = (titulo, itens) => (itens.length ? `<div class="fc-bloco"><h3>${titulo}</h3><ul>${itens.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');
    const render = () => {
      const t = textos(f, lang);
      const zaps = [...new Set([...lista(f.whatsapp), ...(f.pessoas || []).flatMap((p) => lista(p.whatsapp))].map(numeroZap).filter(Boolean))];
      const emails = [...new Set(lista(f.email).map(emailOk).filter(Boolean))], sites = [...new Set(lista(f.site).map(siteUrl).filter(Boolean))];
      corpo.innerHTML = `<div class="fc-ficha-top"><h2>${esc(f.nome)}</h2><div class="seg fc-idioma"><button data-l="orig" class="${lang === 'orig' ? 'on' : ''}">Original</button><button data-l="pt" class="${lang === 'pt' ? 'on' : ''}">Traduzido</button></div></div>
        <div class="fc-ficha-grid"><div>${cartao(f, lang, esc, true)}
          <div class="fc-acoes">${zaps.map((z) => `<a class="btn" href="https://wa.me/${z}" target="_blank" rel="noopener">WhatsApp +${esc(z)}</a>`).join('')}${emails.map((e) => `<a class="btn sec" href="mailto:${esc(e)}">${esc(e)}</a>`).join('')}${sites.map((s) => `<a class="btn sec" href="${esc(s)}" target="_blank" rel="noopener">Site</a>`).join('')}</div></div>
          <div>${t.resumo ? `<p class="fc-resumo">${esc(t.resumo)}</p>` : ''}
            <div class="fc-dados">
              <div><span>Empresa</span><b>${esc(t.empresa)}</b>${t.empresa2 ? `<small>${esc(t.empresa2)}</small>` : ''}</div>
              ${f.marca ? `<div><span>Marca</span><b>${esc(f.marca)}</b></div>` : ''}
              <div><span>Ramo</span><b>${esc(f.setor)}</b></div>
              <div><span>Local</span><b>${esc([f.cidade, f.provincia].filter(Boolean).join(', ') || '—')}</b></div>
              ${lista(f.estande).length ? `<div><span>Estande na feira</span><b>${esc(lista(f.estande).join(' · '))}</b></div>` : ''}
              <div><span>Material</span><b>${esc(f.material || '—')}</b></div>
            </div>
            ${t.pessoas.length ? `<div class="fc-bloco"><h3>${lang === 'pt' ? 'Contatos' : 'Contatos (como no cartão)'}</h3>${t.pessoas.map((p) => `<div class="fc-pes"><b>${esc(p.pessoa)}</b>${p.cargo ? ` <span class="mut">· ${esc(p.cargo)}</span>` : ''}<br><small>${[...lista(p.telefones), p.email, p.whatsapp && `WhatsApp: ${p.whatsapp}`, p.wechat && `WeChat: ${p.wechat}`].filter(Boolean).map(esc).join(' · ')}</small></div>`).join('')}</div>` : ''}
            ${t.carro ? `<div class="fc-bloco"><h3>Carro-chefe</h3><p>${esc(t.carro)}</p></div>` : ''}
            ${bloco('Produtos', t.produtos)}${bloco('Endereço', t.endereco)}${bloco('Certificações', t.certificacoes)}${bloco('Pedido mínimo (MOQ)', t.moq)}${bloco('Fundação', t.fundacao)}${bloco('Fábrica', t.fabrica)}${bloco('Observações', t.outros)}
            ${t.incertezas.length ? `<div class="fc-bloco fc-conferir"><h3>A conferir</h3><ul>${t.incertezas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
          </div></div>
        ${(f.fotos || []).length ? `<div class="fc-bloco"><h3>Fotos (${f.fotos.length})</h3><div class="fc-fotos">${f.fotos.map((ph, i) => `<button class="fc-foto" data-i="${i}" title="${esc(ph.tipo)}"><img loading="lazy" src="${foto(ph.src)}" alt=""><span>${esc(ph.tipo)}</span></button>`).join('')}</div></div>` : ''}
        <div class="modal-acoes"><span style="flex:1"></span><button id="fx">Fechar</button></div>`;
      corpo.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => { lang = b.dataset.l; render(); }));
      corpo.querySelector('#fx').onclick = m.fechar;
      corpo.querySelectorAll('.fc-foto').forEach((b) => (b.onclick = () => verFoto(f, +b.dataset.i)));
    };
    render();
  };
  // foto em tamanho grande, com anterior/próxima
  const verFoto = (f, i) => {
    const v = modal('<div class="fc-visor"><img alt=""><p class="legenda"></p><div class="modal-acoes"><button class="sec" id="ant">Anterior</button><a class="btn sec" id="abre" target="_blank" rel="noopener">Tamanho Real</a><span style="flex:1"></span><button class="sec" id="prox">Próxima</button><button id="vx">Fechar</button></div></div>', 980);
    const mostra = () => { const ph = f.fotos[i]; v.el.querySelector('img').src = foto(ph.src); v.el.querySelector('.legenda').textContent = `${f.nome} · ${ph.tipo} · ${i + 1} de ${f.fotos.length}`; v.el.querySelector('#abre').href = foto(ph.src); };
    v.el.querySelector('#ant').onclick = () => { i = (i - 1 + f.fotos.length) % f.fotos.length; mostra(); };
    v.el.querySelector('#prox').onclick = () => { i = (i + 1) % f.fotos.length; mostra(); };
    v.el.querySelector('#vx').onclick = v.fechar;
    mostra();
  };
  desenhar();
}

export const _interno = { numeroZap, textos, siteUrl };
