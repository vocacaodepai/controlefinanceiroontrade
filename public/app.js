const $app = document.getElementById('app');
const state = { meta: null, mes: null, dia: null, tipo: 'saida', usuario: null, extrato: null };
// Ícones de linha (herdam a cor do texto). Sem emojis: visual mais limpo.
const ICONES = {
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
};
Object.assign(ICONES, {
  fechar: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  painel: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  lancar: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  extratos: '<path d="M3 22h18"/><path d="M6 18v-7"/><path d="M10 18v-7"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M12 2 20 7H4Z"/>',
  mensal: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  fluxo: '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h4a5 5 0 0 1 5 5v4"/>',
  cadastros: '<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
  roadmap: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  patrimonio: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
  comercial: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  aovivo: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  orcamentos: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/>',
  clientes: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  dp: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
  societario: '<path d="M21.2 15.9A10 10 0 1 1 8 2.8"/><path d="M22 12A10 10 0 0 0 12 2v10Z"/>',
});
const ico = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONES[n]}</svg>`;
// ---------- Avatar: rosto da pessoa sobre o uniforme da OnTrade ----------
// admin: terno e gravata · operador: polo · somente leitura: camisa social. A foto é o rosto; o resto é desenho.
let _av = 0;
function avatar(p, tam = 40, fotoUrl) {
  const n = ++_av;
  const papel = p?.papel || 'leitor';
  const foto = fotoUrl || (p?.tem_foto ? `/api/usuarios/${p.id}/foto?v=${p.foto_v}` : null);
  const inicial = esc((p?.nome || '?').trim().charAt(0).toUpperCase());
  const cracha = '<circle cx="69" cy="84" r="6.2" fill="#fff"/><image href="favicon.png" x="63.5" y="78.5" width="11" height="11"/>';
  const corpos = {
    admin: '<path d="M8 100C10 76 28 66 50 66s40 10 42 34Z" fill="#012d61"/><path d="M38 66l12 21 12-21Z" fill="#fff"/><path d="M47 69h6l1.5 8L50 96l-4.5-19Z" fill="#0c5aa6"/><path d="M38 66l12 21M62 66L50 87" stroke="#0a2146" stroke-width="1.3" fill="none"/>' + cracha,
    operador: '<path d="M8 100C10 76 28 66 50 66s40 10 42 34Z" fill="#0c5aa6"/><path d="M38 65l12 9 12-9-4-4-8 6-8-6Z" fill="#fff"/><path d="M50 74v18" stroke="#fff" stroke-width="1.4"/><circle cx="50" cy="80" r="1.3" fill="#fff"/><circle cx="50" cy="86" r="1.3" fill="#fff"/>' + cracha,
    leitor: '<path d="M8 100C10 76 28 66 50 66s40 10 42 34Z" fill="#f4f6f9" stroke="#c4cedb" stroke-width="1"/><path d="M38 65l12 10 12-10-4-4-8 6-8-6Z" fill="#fff" stroke="#c4cedb" stroke-width="1"/>' + cracha,
  };
  return `<svg class="avatar" width="${tam}" height="${tam}" viewBox="0 0 100 100" role="img" aria-label="${esc(p?.nome || '')}">
    <defs><clipPath id="ao${n}"><circle cx="50" cy="50" r="50"/></clipPath><clipPath id="ah${n}"><circle cx="50" cy="35" r="22"/></clipPath></defs>
    <g clip-path="url(#ao${n})"><rect width="100" height="100" fill="#e3eaf4"/>${corpos[papel] || corpos.leitor}
      <circle cx="50" cy="35" r="22" fill="#c9d3e0"/>
      ${foto ? `<image href="${foto}" x="28" y="13" width="44" height="44" preserveAspectRatio="xMidYMid slice" clip-path="url(#ah${n})"/>` : `<text x="50" y="44" text-anchor="middle" font-size="24" font-weight="600" fill="#012d61" font-family="system-ui,sans-serif">${inicial}</text>`}
      <circle cx="50" cy="35" r="22" fill="none" stroke="#fff" stroke-width="1.5"/></g></svg>`;
}
const equipePorId = (id) => state.meta?.equipe?.find((p) => p.id === id);
// Quem fez o lançamento: foto, nome e hora
function quemLancou(l) {
  const p = equipePorId(l.criado_por_id);
  const nome = p?.nome || String(l.criado_por || '—').replace(/ \(extrato\)$/, '');
  const via = /\(extrato\)$/.test(l.criado_por || '') ? ' · via extrato' : '';
  return `<div class="quem">${avatar(p || { nome, papel: 'leitor' }, 30)}<div><span>${esc(nome)}</span><small class="mut">${esc((l.criado_em || '').slice(11, 16))}${via}</small></div></div>`;
}

// Janela (pop-up) genérica
function modal(conteudo, largura = 480) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:${largura}px">${conteudo}</div>`;
  document.body.appendChild(fundo);
  const fechar = () => { fundo.remove(); document.removeEventListener('keydown', aoTeclar); };
  const aoTeclar = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', aoTeclar);
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo) fechar(); });
  return { el: fundo.querySelector('.modal'), fechar };
}

// Foto de perfil: escolher, enquadrar o rosto e ver como fica no uniforme antes de salvar
function abrirFoto() {
  const u = state.usuario;
  const m = modal(`<h2>Sua foto</h2>
    <p class="legenda">Escolha uma foto do rosto e ajuste o enquadramento. Ela aparece sobre o uniforme da OnTrade (${{ admin: 'terno', operador: 'polo', leitor: 'camisa social' }[u.papel]}).</p>
    <div class="foto-area"><div><canvas id="fc" width="280" height="280"></canvas>
      <input type="range" id="fz" min="1" max="3" step="0.01" value="1" disabled aria-label="Zoom"></div>
      <div class="foto-previa"><div id="fp">${avatar(u, 120)}</div><small class="mut">Como vai aparecer</small></div></div>
    <input type="file" id="ff" accept="image/*">
    <div class="modal-acoes"><button class="sec" id="fr" ${u.tem_foto ? '' : 'hidden'}>Remover foto</button><span style="flex:1"></span><button class="sec" id="fx">Cancelar</button><button id="fs" disabled>Salvar foto</button></div>`, 560);
  const P = 280, D = 240, off = (P - D) / 2;
  const cv = m.el.querySelector('#fc'), cx = cv.getContext('2d'), zoom = m.el.querySelector('#fz');
  let img = null, base = 1, z = 1, x = 0, y = 0, arrasto = null, quadro = 0;
  const tam = () => ({ w: img.width * base * z, h: img.height * base * z });
  const limitar = () => { const { w, h } = tam(); x = Math.min(off, Math.max(off + D - w, x)); y = Math.min(off, Math.max(off + D - h, y)); };
  const recorte = (lado) => { const o = document.createElement('canvas'); o.width = o.height = lado; const k = lado / D, { w, h } = tam(); o.getContext('2d').drawImage(img, (x - off) * k, (y - off) * k, w * k, h * k); return o.toDataURL('image/jpeg', 0.85); };
  const desenhar = () => {
    cx.clearRect(0, 0, P, P); cx.fillStyle = '#eef1f5'; cx.fillRect(0, 0, P, P);
    if (img) { const { w, h } = tam(); cx.drawImage(img, x, y, w, h); }
    cx.fillStyle = 'rgba(1,45,97,.55)'; cx.beginPath(); cx.rect(0, 0, P, P); cx.arc(P / 2, P / 2, D / 2, 0, Math.PI * 2, true); cx.fill('evenodd');
    cx.strokeStyle = '#fff'; cx.lineWidth = 2; cx.beginPath(); cx.arc(P / 2, P / 2, D / 2, 0, Math.PI * 2); cx.stroke();
    if (img && !quadro) quadro = requestAnimationFrame(() => { quadro = 0; m.el.querySelector('#fp').innerHTML = avatar(u, 120, recorte(160)); });
  };
  desenhar();
  m.el.querySelector('#ff').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const i = new Image();
    i.onload = () => { img = i; base = D / Math.min(i.width, i.height); z = 1; zoom.value = 1; zoom.disabled = false; const { w, h } = tam(); x = P / 2 - w / 2; y = P / 2 - h / 2; limitar(); m.el.querySelector('#fs').disabled = false; desenhar(); };
    i.onerror = () => toast('Não consegui abrir esta imagem.', true);
    i.src = URL.createObjectURL(f);
  };
  zoom.oninput = () => { if (!img) return; const a = tam(), fx = (P / 2 - x) / a.w, fy = (P / 2 - y) / a.h; z = +zoom.value; const b = tam(); x = P / 2 - fx * b.w; y = P / 2 - fy * b.h; limitar(); desenhar(); };
  cv.onpointerdown = (e) => { if (img) { arrasto = { px: e.clientX, py: e.clientY }; cv.setPointerCapture(e.pointerId); } };
  cv.onpointermove = (e) => { if (!arrasto) return; x += e.clientX - arrasto.px; y += e.clientY - arrasto.py; arrasto = { px: e.clientX, py: e.clientY }; limitar(); desenhar(); };
  cv.onpointerup = () => { arrasto = null; };
  const atualizar = async () => { state.usuario = (await api('/api/auth/estado')).usuario; state.meta = null; m.fechar(); await rota(); };
  m.el.querySelector('#fx').onclick = m.fechar;
  m.el.querySelector('#fs').onclick = () => acao(async () => { await api('/api/auth/foto', { method: 'POST', body: { imagem: recorte(256) } }); await atualizar(); }, 'Foto salva');
  m.el.querySelector('#fr').onclick = () => acao(async () => { await api('/api/auth/foto', { method: 'DELETE' }); await atualizar(); }, 'Foto removida');
}
const NIVEL = { comercial: 0, leitor: 1, socio: 1, operador: 2, admin: 3 };
const PAPEL_NOME = { admin: 'Administrador', operador: 'Operador', leitor: 'Somente leitura', socio: 'Sócio', comercial: 'Comercial' };
const temArea = (a) => !!state.usuario?.areas?.includes(a);
const pode = (papel) => !!state.usuario && NIVEL[state.usuario.papel] >= NIVEL[papel];

// ---------- util ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (c) => ((c ?? 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d) => d.split('-').reverse().join('/');
const cls = (c) => (c < 0 ? 'neg' : c > 0 ? 'pos' : 'mut');
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const nomeMes = (m) => `${MESES[+m.slice(5) - 1]} de ${m.slice(0, 4)}`;
const VINCULOS = { lt1: 'Registrado na LTON', ontrade: 'Registrado na OnTrade', japeri: 'Registrado em Japeri', informal: 'Sem registro', socio: 'Sócio(a)', a_verificar: 'A verificar' };
const TIPOS_CONTA = { banco: 'Banco', dinheiro: 'Dinheiro', intermediaria: 'Intermediária' };

// "1.234,56" -> 123456 centavos
function paraCentavos(txt) {
  const n = String(txt).trim().replace(/[R$\s.]/g, '').replace(',', '.');
  const v = Math.round(parseFloat(n) * 100);
  return Number.isFinite(v) ? v : NaN;
}

function toast(msg, erro = false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'on' + (erro ? ' erro' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 3200);
}

async function api(url, opts = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && state.usuario && !url.startsWith('/api/auth/')) { state.usuario = null; state.meta = null; telaLogin(); throw new Error('Sua sessão expirou. Entre novamente.'); }
  if (!r.ok) throw new Error(j.erro || 'Erro inesperado');
  return j;
}
const acao = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (e) { toast(e.message, true); } };

const opts = (lista, sel, vazio) =>
  (vazio ? `<option value="">${vazio}</option>` : '') + lista.map((o) => `<option value="${o.id}" ${String(o.id) === String(sel) ? 'selected' : ''}>${esc(o.nome)}</option>`).join('');

const barras = (dados, total) => {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return dados.length
    ? dados.map((d) => `<div class="barra"><span class="nome" title="${esc(d.nome)}">${esc(d.nome)}</span><span class="trilho"><span class="fill" style="display:block;width:${(d.valor / max) * 100}%"></span></span><span class="val">${brl(d.valor)}</span></div>`).join('')
    : '<p class="mut">Sem dados no período.</p>';
};

// ---------- LOGIN ----------
function telaLogin(e) {
  document.body.classList.add('deslogado');
  const primeiro = e?.precisaCriarAdmin;
  $app.innerHTML = `<form class="card login" id="lg">
    <img src="logo.png" alt="OnTrade" class="logo-login" onerror="this.remove()">
    <h1>Caixa OnTrade</h1>
    <p class="sub">${primeiro ? 'Primeiro acesso: crie o administrador (Elisa Maria ou responsável).' : 'Entre com seu e-mail e senha.'}</p>
    ${primeiro ? '<div><label>Nome</label><input name="nome" required autocomplete="name"></div>' : ''}
    <div><label>E-mail</label><input name="email" type="email" required autocomplete="username"></div>
    <div><label>Senha${primeiro ? ' (mínimo 8 caracteres)' : ''}</label><input name="senha" type="password" required minlength="${primeiro ? 8 : 1}" autocomplete="${primeiro ? 'new-password' : 'current-password'}"></div>
    ${primeiro && e.exigeCodigo ? '<div><label>Código de instalação</label><input name="codigo" required></div>' : ''}
    <button style="width:100%;margin-top:6px">${primeiro ? 'Criar administrador e entrar' : 'Entrar'}</button></form>`;
  document.getElementById('lg').onsubmit = (ev) => {
    ev.preventDefault();
    acao(async () => {
      const r = await api(primeiro ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) });
      state.usuario = r.usuario; state.meta = null; location.hash = '#painel'; await rota();
    });
  };
}
async function sair() { clearInterval(_fuTimer); state.fuIniciado = false; state.followups = null; sessionStorage.removeItem('fu_ate'); await api('/api/auth/logout', { method: 'POST' }); state.usuario = null; state.meta = null; telaLogin(); }
function trocarSenha() {
  const atual = prompt('Senha atual:'); if (atual === null) return;
  const nova = prompt('Nova senha (mínimo 8 caracteres):'); if (nova === null) return;
  acao(() => api('/api/auth/senha', { method: 'POST', body: { atual, nova } }), 'Senha alterada');
}
document.getElementById('sair').onclick = sair;
document.getElementById('senha').onclick = trocarSenha;
document.getElementById('foto').onclick = abrirFoto;

// ---------- roteamento ----------
const rotas = { painel, lancar, fechar, extratos, mensal, patrimonio, societario, dp, comercial, aovivo, orcamentos, clientes, fluxo, cadastros, roadmap };
// Menu lateral por área. Cada item só aparece se o perfil tem acesso E a página existe.
const MENU = [
  ['Financeiro', [['painel', 'Painel'], ['lancar', 'Lançar'], ['fechar', 'Fechar o dia'], ['extratos', 'Extratos'], ['mensal', 'Controle mensal'], ['patrimonio', 'Patrimônio']]],
  ['Comercial', [['comercial', 'Painel'], ['aovivo', 'Ao vivo'], ['orcamentos', 'Orçamentos', 'comercial'], ['clientes', 'Clientes', 'comercial']]],
  ['Sociedade', [['societario', 'Quadro societário']]],
  ['Pessoas', [['dp', 'Departamento de Pessoas']]],
  ['Sistema', [['fluxo', 'Mapa do fluxo'], ['cadastros', 'Cadastros'], ['roadmap', 'Roadmap']]],
];
const areaDaRota = (r) => MENU.flatMap(([, itens]) => itens).find(([n]) => n === r)?.[2] || r;
const rotasPermitidas = () => MENU.flatMap(([, itens]) => itens).filter(([n, , area]) => rotas[n] && temArea(area || n)).map(([n]) => n);
function renderMenu() {
  document.getElementById('nav').innerHTML = MENU.map(([grupo, itens]) => {
    const vis = itens.filter(([n, , area]) => rotas[n] && temArea(area || n));
    return vis.length ? `<div class="nav-grupo">${grupo}</div>` + vis.map(([n, r]) => `<a href="#${n}">${ico(n)}<span>${r}</span></a>`).join('') : '';
  }).join('');
}
async function rota() {
  if (!state.usuario) {
    let e;
    try { e = await api('/api/auth/estado'); } catch (err) { $app.innerHTML = `<div class="card login"><h1>Caixa OnTrade</h1><p class="neg">${esc(err.message)}</p></div>`; document.body.classList.add('deslogado'); return; }
    if (!e.usuario) return telaLogin(e);
    state.usuario = e.usuario;
  }
  document.body.classList.remove('deslogado');
  document.getElementById('quem').innerHTML = `<div class="quem">${avatar(state.usuario, 46)}<div><b>${esc(state.usuario.nome)}</b><small>${PAPEL_NOME[state.usuario.papel]}</small></div></div>`;
  renderMenu();
  if (!state.fuIniciado) { state.fuIniciado = true; iniciarFollowups(); } else if (state.followups) atualizarBadge(state.followups.length);
  const permitidas = rotasPermitidas();
  let nome = location.hash.slice(1) || permitidas[0] || 'painel';
  if (!permitidas.includes(nome)) { nome = permitidas[0]; if (!nome) { $app.innerHTML = '<div class="card">Seu perfil ainda não tem nenhuma área liberada. Fale com o administrador.</div>'; return; } history.replaceState(null, '', '#' + nome); }
  document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + nome));
  if (!state.meta) {
    if (pode('leitor')) state.meta = await api('/api/meta');
    else { const e = await api('/api/equipe'); state.meta = { equipe: e.equipe, hoje: e.hoje, contas: [], categorias: [], pessoas: [], empresas: [] }; }
    state.dia = state.dia || state.meta.hoje;
    state.mes = state.mes || state.meta.hoje.slice(0, 7);
  }
  if (nome !== 'aovivo') { clearInterval(state.timerVivo); document.body.classList.remove('modo-tv'); }
  try { await rotas[nome](); } catch (e) { $app.innerHTML = `<div class="card neg">Erro: ${esc(e.message)}</div>`; }
}
addEventListener('hashchange', () => { if (location.hash !== '#extratos') state.extrato = null; rota(); });
const recarregarMeta = async () => { state.meta = { ...(await api('/api/meta')), hoje: state.meta.hoje }; };

function seletorMes(onChange) {
  return `<div><label>Mês</label><input type="month" id="sel-mes" value="${state.mes}"></div>`;
}
function ligaMes(fn) {
  document.getElementById('sel-mes').onchange = (e) => { if (e.target.value) { state.mes = e.target.value; fn(); } };
}


// Cartão "Saldo por conta": saldo ao vivo (muda a cada lançamento) + aviso de caixa fechado do dia.
function cartaoSaldos(p) {
  const d = p.saldo_dia;
  const hora = d.atualizado_em.slice(11, 19);
  const fechado = d.fechado;
  const total = (k) => d.contas.reduce((a, c) => a + (c[k] ?? 0), 0);
  return `<div class="card" id="cartao-saldos">
    <div class="titulo-saldos"><h2>${d.ao_vivo ? 'Saldo por conta — agora' : `Saldo por conta — fim de ${dataBR(d.data)}`}</h2>
      <button class="mini sec" id="atualizar-saldos" title="Atualizar saldos">${ico('refresh')} Atualizar</button></div>
    <p class="legenda aviso-vivo">${d.ao_vivo
      ? `<b>Valores atualizados às ${hora}.</b> Cada lançamento do caixa já entra aqui; clique em <b>Atualizar</b> para ver o saldo real neste instante.`
      : `Saldo ao final de ${dataBR(d.data)}. Consultado às ${hora}.`}</p>
    <div class="tbl"><table>
      <thead><tr><th>Conta</th><th></th>${d.ao_vivo ? '<th class="n">Movimento de hoje</th>' : ''}<th class="n">${d.ao_vivo ? 'Saldo atual' : 'Saldo'}</th>${fechado ? `<th class="n">Fechado ${dataBR(fechado.data).slice(0, 5)}</th>` : ''}</tr></thead>
      <tbody>${d.contas.map((c) => `<tr><td>${esc(c.nome)}</td><td><span class="tag ${c.modalidade}">${c.modalidade === 'com_nota' ? 'com nota' : 'sem nota'}</span></td>
        ${d.ao_vivo ? `<td class="n ${cls(c.movimento)}">${c.movimento ? (c.movimento > 0 ? '+ ' : '− ') + brl(Math.abs(c.movimento)) : '—'}</td>` : ''}
        <td class="n ${c.saldo < 0 ? 'neg' : ''}"><b>${brl(c.saldo)}</b></td>${fechado ? `<td class="n">${brl(c.saldo_fechado)}</td>` : ''}</tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">Total</td>${d.ao_vivo ? `<td class="n ${cls(total('movimento'))}">${total('movimento') ? (total('movimento') > 0 ? '+ ' : '− ') + brl(Math.abs(total('movimento'))) : '—'}</td>` : ''}<td class="n">${brl(total('saldo'))}</td>${fechado ? `<td class="n">${brl(total('saldo_fechado'))}</td>` : ''}</tr></tfoot></table></div>
    ${fechado ? `<p class="aviso-fechado">${ico('lock')}<span><b>Saldo fechado do dia ${dataBR(fechado.data)}</b> — caixa fechado às ${esc((fechado.fechado_em || '').slice(11, 16))}${fechado.fechado_por ? ' por ' + esc(fechado.fechado_por) : ''}. A coluna "Fechado" é o saldo oficial.</span></p>` : ''}
  </div>`;
}

// Caixa x ativos: mostra que um mês de caixa negativo pode ser dinheiro parado em containers e estoque
function cartaoPatrimonio(p) {
  const t = p.patrimonio;
  if (!t || !temArea('patrimonio')) return '';
  if (!t.informado) return `<div class="card"><h2>Patrimônio em ativos</h2><p class="legenda">Os valores de containers e estoque ainda não foram informados. <a href="#patrimonio">Informar agora</a></p></div>`;
  const mk = (rotulo, valor, cor = '', sub = '') => `<div class="mk"><span>${rotulo}</span><b class="${cor}">${valor}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
  return `<div class="card">
    <div class="titulo-saldos"><h2>Caixa e patrimônio em ativos</h2>${temArea('patrimonio') ? '<a class="btn sec mini" href="#patrimonio">Ver e atualizar</a>' : ''}</div>
    <p class="legenda aviso-vivo">Valores de containers e estoque de <b>${nomeMes(t.mes_ref)}</b>${t.defasado ? ' (último mês informado)' : ''}. Atualizados no fechamento do mês, não no dia a dia.</p>
    <div class="mk-grade">
      ${mk('Containers', brl(t.total_container))}${mk('Estoque', brl(t.total_estoque))}
      ${mk('Posição total', brl(t.posicao_total), t.posicao_total < 0 ? 'neg' : '', 'saldo em contas + ativos')}
      ${t.resultado_economico === null ? mk('Resultado econômico', '—', '', 'falta o mês anterior para comparar') : mk('Resultado econômico', brl(t.resultado_economico), t.resultado_economico < 0 ? 'neg' : '', 'caixa do mês + variação dos ativos')}
    </div>
    ${t.resultado_economico !== null && p.resultado < 0 && t.resultado_economico >= 0 ? '<div class="aviso-fechado">' + ico('info') + '<span>O caixa fechou o mês negativo, mas os ativos cresceram: o resultado econômico estimado é positivo.</span></div>' : ''}
  </div>`;
}

// ---------- PAINEL ----------
async function painel() {
  const p = await api(`/api/painel/${state.mes}`);
  const pendentes = p.recorrencias.filter((r) => !r.lancada);
  const maxSerie = Math.max(...p.serie.flatMap((s) => [s.entradas, s.saidas]), 1);
  $app.innerHTML = `
    <h1>Painel</h1><p class="sub">Visão do mês: quanto entrou (com e sem nota), quanto saiu e quem pagou.</p>
    <div class="row">${seletorMes()}<a class="btn" href="/api/export/mes/${state.mes}">${ico('download')} Emitir controle mensal (Excel)</a></div>
    ${p.dias_abertos.length ? `<div class="aviso-box">${ico('info')}<span>${p.dias_abertos.length} dia(s) com lançamentos ainda <b>sem fechamento</b>: ${p.dias_abertos.map(dataBR).join(', ')}. <a href="#fechar">Fechar caixa</a></span></div>` : ''}
    <div class="grid">
      <div class="card kpi"><div class="l">Entradas COM nota</div><div class="v">${brl(p.entradas_com_nota)}</div></div>
      <div class="card kpi"><div class="l">Entradas SEM nota</div><div class="v">${brl(p.entradas_sem_nota)}</div></div>
      <div class="card kpi"><div class="l">Saídas</div><div class="v neg">${brl(p.saidas)}</div></div>
      <div class="card kpi"><div class="l">Resultado do mês</div><div class="v ${cls(p.resultado)}">${brl(p.resultado)}</div></div>
    </div>
    ${cartaoSaldos(p)}
    ${cartaoPatrimonio(p)}
    <div class="grid um">
      <div class="card"><h2>Entradas e saídas por dia</h2>
        ${p.serie.length ? `<div class="serie">${p.serie.map((s) => `<div class="col" title="${dataBR(s.data)}: +${brl(s.entradas)} / -${brl(s.saidas)}"><div class="e" style="height:${(s.entradas / maxSerie) * 100}%"></div><div class="s" style="height:${(s.saidas / maxSerie) * 100}%"></div></div>`).join('')}</div><p class="legenda"><span class="sw" style="background:var(--ver)"></span>entradas<span class="sw" style="background:var(--verm);margin-left:16px"></span>saídas</p>` : '<p class="mut">Nenhum lançamento neste mês ainda.</p>'}
      </div>
    </div>
    <div class="grid dois">
      <div class="card"><h2>Saídas por quem pagou</h2>${barras(p.saidas_por_pagador)}</div>
      <div class="card"><h2>Saídas por grupo</h2>${barras(p.saidas_por_grupo)}</div>
    </div>
    <div class="card"><h2>Saídas por categoria</h2>${barras(p.saidas_por_categoria)}</div>
    <div class="card"><h2>Pagamentos recorrentes de ${nomeMes(state.mes)}</h2>
      ${p.recorrencias.length ? `<table>${p.recorrencias.map((r) => `<tr><td>${esc(r.nome)}</td><td>dia ${dataBR(r.data_prevista).slice(0, 2)}</td><td class="n">${r.valor ? brl(r.valor) + (r.estimado ? ' ~' : '') : '—'}</td><td class="n">${r.lancada ? '<span class="tag ok">lançado</span>' : (pode('operador') ? `<button class="mini" data-lancar="${r.id}">Lançar</button>` : '<span class="mut">pendente</span>')}</td></tr>`).join('')}</table>` : '<p class="mut">Nenhuma recorrência cadastrada.</p>'}
      ${pendentes.length ? '<p class="legenda">O valor é estimado — ajuste-o ao lançar se necessário.</p>' : ''}
    </div>`;
  ligaMes(painel);
  document.getElementById('atualizar-saldos')?.addEventListener('click', async (ev) => { ev.target.disabled = true; try { await painel(); toast('Saldos atualizados'); } catch (e) { toast(e.message, true); } });
  $app.querySelectorAll('[data-lancar]').forEach((b) => (b.onclick = () => lancarRecorrencia(+b.dataset.lancar, p.recorrencias, painel)));
}

async function lancarRecorrencia(id, lista, volta) {
  const r = lista.find((x) => x.id === id);
  const v = prompt(`Valor real de "${r.nome}" (R$):`, r.valor ? (r.valor / 100).toFixed(2).replace('.', ',') : '');
  if (v === null) return;
  const valor = paraCentavos(v);
  if (!(valor > 0)) return toast('Valor inválido', true);
  await acao(async () => { await api(`/api/recorrencias/${id}/lancar`, { method: 'POST', body: { mes: state.mes, valor } }); await volta(); }, 'Lançado!');
}

// ---------- LANÇAR ----------
async function lancar() {
  const { contas, categorias, pessoas } = state.meta;
  const dia = await api(`/api/dia/${state.dia}`);
  const fechado = !!dia.fechado;
  const t = state.tipo;
  const cats = categorias.filter((c) => c.ativo && (t === 'entrada' ? c.tipo === 'entrada' : t === 'saida' ? c.tipo === 'saida' : false));
  $app.innerHTML = `
    <h1>Lançar</h1><p class="sub">Registre cada entrada, saída ou transferência do dia. Ex.: "Papelaria R$ 15 pago pela OnTrade no Bradesco".</p>
    <div class="row"><div><label>Dia</label><input type="date" id="dia" value="${state.dia}"></div>
      <div>${fechado ? '<span class="tag aviso">Dia fechado — um administrador pode reabrir em "Fechar o dia"</span>' : !pode('operador') ? '<span class="tag aviso">somente leitura</span>' : '<span class="tag ok">dia aberto</span>'}</div></div>
    <form class="card" id="f" ${fechado || !pode('operador') ? 'inert style="opacity:.5"' : ''}>
      <div class="seg" style="margin-bottom:14px">${['saida', 'entrada', 'transferencia'].map((x) => `<button type="button" data-tipo="${x}" class="${x} ${t === x ? 'on' : ''}">${{ saida: 'Saída', entrada: 'Entrada', transferencia: 'Transferência' }[x]}</button>`).join('')}</div>
      <div class="form">
        <div class="larg"><label>${t === 'entrada' ? 'Entrou em qual conta?' : t === 'saida' ? 'Saiu de qual conta? (quem pagou)' : 'Origem'}</label>
          <select name="conta_id" required>${contas.filter((c) => c.ativo).map((c) => `<option value="${c.id}">${esc(c.nome)} — ${esc(c.empresa)} (${c.modalidade === 'com_nota' ? 'com nota' : 'sem nota'})</option>`).join('')}</select><small class="saldo-conta" id="saldo-conta"></small></div>
        ${t === 'transferencia' ? `<div><label>Destino</label><select name="conta_destino_id" required>${contas.filter((c) => c.ativo).map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>` : `<div><label>Categoria</label><select name="categoria_id" required>${opts(cats, '', 'Selecione…')}</select></div>`}
        <div><label>Valor (R$)</label><input name="valor" inputmode="decimal" placeholder="0,00" required autofocus></div>
        ${t === 'entrada' ? '<div><label>Cliente</label><input name="cliente" placeholder="Nome do cliente"></div>' : ''}
        ${t === 'saida' ? `<div><label>Pessoa (se for pagamento a alguém)</label><select name="pessoa_id">${opts(pessoas.filter((p) => p.ativo), '', '— nenhuma —')}</select></div>` : ''}
        <div class="cheio"><label>Descrição</label><input name="descricao" placeholder="Ex.: papelaria, estacionamento, adiantamento…"></div>
        <div style="align-self:end"><button>Salvar lançamento</button></div>
      </div>
    </form>
    <div class="card"><h2>Lançamentos de ${dataBR(state.dia)}</h2>
      ${dia.lancamentos.length ? `<div class="tbl"><table><thead><tr><th>Tipo</th><th>Conta</th><th>Categoria / pessoa</th><th>Descrição</th><th>Lançado por</th><th class="n">Valor</th><th></th></tr></thead><tbody>
      ${dia.lancamentos.map((l) => `<tr><td>${{ entrada: '<span class="pos">Entrada</span>', saida: '<span class="neg">Saída</span>', transferencia: 'Transf.' }[l.tipo]}</td><td>${esc(l.conta)}${l.conta_destino ? ' → ' + esc(l.conta_destino) : ''}<br><span class="tag ${l.modalidade}">${l.modalidade === 'com_nota' ? 'com nota' : 'sem nota'}</span> <small class="mut">${esc(l.empresa)}</small></td><td>${esc(l.categoria || '')}${l.pessoa ? '<br><small class="mut">' + esc(l.pessoa) + '</small>' : ''}${l.cliente ? '<br><small class="mut">cliente: ' + esc(l.cliente) + '</small>' : ''}</td><td>${esc(l.descricao || '')}</td><td>${quemLancou(l)}</td><td class="n ${l.tipo === 'saida' ? 'neg' : l.tipo === 'entrada' ? 'pos' : ''}">${brl(l.valor)}</td><td class="n">${fechado || !pode('operador') ? '' : `<button class="mini sec" data-del="${l.id}">excluir</button>`}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="5">Entradas ${brl(dia.totais.entradas)} · Saídas ${brl(dia.totais.saidas)}</td><td class="n">${brl(dia.totais.entradas - dia.totais.saidas)}</td><td></td></tr></tfoot></table></div>` : '<p class="mut">Nada lançado neste dia.</p>'}
    </div>`;
  document.getElementById('dia').onchange = (e) => { if (e.target.value) { state.dia = e.target.value; lancar(); } };
  $app.querySelectorAll('[data-tipo]').forEach((b) => (b.onclick = () => { state.tipo = b.dataset.tipo; lancar(); }));
  $app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => confirm('Excluir este lançamento?') && acao(async () => { await api(`/api/lancamentos/${b.dataset.del}`, { method: 'DELETE' }); lancar(); }, 'Excluído')));
  // Saldo da conta escolhida (já com os lançamentos de hoje) e aviso se a saída passar do saldo.
  const f = document.getElementById('f');
  const mostrarSaldo = () => {
    const el = document.getElementById('saldo-conta');
    const c = dia.contas.find((x) => x.id === +f.conta_id.value);
    if (!el || !c) return;
    const v = paraCentavos(f.valor.value);
    const passa = t !== 'entrada' && v > 0 && v > c.saldo;
    el.className = 'saldo-conta' + (passa ? ' alerta' : '');
    el.innerHTML = `Saldo atual desta conta: <b>${brl(c.saldo)}</b>${passa ? ` — atenção: esta ${t === 'saida' ? 'saída' : 'transferência'} de ${brl(v)} é maior que o saldo` : ''}`;
  };
  f.conta_id.addEventListener('change', mostrarSaldo); f.valor.addEventListener('input', mostrarSaldo); mostrarSaldo();
  document.getElementById('f').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const valor = paraCentavos(f.valor);
    if (!(valor > 0)) return toast('Informe um valor válido', true);
    acao(async () => { await api('/api/lancamentos', { method: 'POST', body: { ...f, valor, tipo: t, data: state.dia } }); await lancar(); }, 'Lançamento salvo!');
  };
}

// ---------- FECHAR O DIA ----------
async function fechar() {
  const d = await api(`/api/dia/${state.dia}`);
  const fechado = !!d.fechado;
  $app.innerHTML = `
    <h1>Fechar o dia</h1><p class="sub">Confira o saldo de cada conta. Para dinheiro e bancos, informe o valor <b>contado/conferido</b> e o sistema mostra a diferença.</p>
    <div class="row"><div><label>Dia</label><input type="date" id="dia" value="${state.dia}"></div>
      <a class="btn sec" href="/api/export/dia/${state.dia}">${ico('download')} Excel do dia</a></div>
    ${fechado ? `<div class="aviso-box">${ico('lock')}<span>Dia fechado em ${esc(d.fechado.fechado_em)}${d.fechado.fechado_por ? ' por <b>' + esc(d.fechado.fechado_por) + '</b>' : ''}. ${d.fechado.obs ? esc(d.fechado.obs) : ''}</span></div>` : ''}
    <div class="card tbl"><table>
      <thead><tr><th>Conta</th><th class="n">Saldo anterior</th><th class="n">Entradas</th><th class="n">Saídas</th><th class="n">Transf.</th><th class="n">Saldo do sistema</th><th class="n">Contado</th><th class="n">Diferença</th></tr></thead>
      <tbody>${d.contas.map((c) => {
        const contado = fechado ? c.saldo_contado : null;
        const dif = contado != null ? contado - c.saldo : null;
        return `<tr><td>${esc(c.nome)} <span class="tag ${c.modalidade}">${c.modalidade === 'com_nota' ? 'com nota' : 'sem nota'}</span></td>
        <td class="n">${brl(c.saldo_anterior)}</td><td class="n pos">${brl(c.entradas)}</td><td class="n neg">${brl(c.saidas)}</td><td class="n">${brl(c.transf_entrada - c.transf_saida)}</td>
        <td class="n"><b>${brl(c.saldo)}</b></td>
        <td class="n">${fechado ? (contado != null ? brl(contado) : '—') : (pode('operador') ? `<input data-conta="${c.id}" inputmode="decimal" placeholder="opcional" style="width:120px;text-align:right">` : '—')}</td>
        <td class="n ${dif ? cls(dif) : ''}" data-dif="${c.id}">${dif != null ? brl(dif) : ''}</td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="n">${brl(d.totais.saldo_anterior)}</td><td class="n">${brl(d.totais.entradas)}</td><td class="n">${brl(d.totais.saidas)}</td><td></td><td class="n">${brl(d.totais.saldo)}</td><td></td><td></td></tr></tfoot></table></div>
    ${fechado ? (pode('admin') ? `<button class="perigo" id="reabrir">Reabrir dia</button>` : '<p class="legenda">Só o administrador pode reabrir um dia fechado.</p>') : !pode('operador') ? '' : `
      <div class="card"><div class="form"><div class="cheio"><label>Observações do fechamento</label><input id="obs" placeholder="Ex.: sobrou R$ 20 no caixa, aguardando comprovante…"></div></div><br><button id="fechar">${ico('lock')} Fechar caixa de ${dataBR(state.dia)}</button></div>`}`;
  document.getElementById('dia').onchange = (e) => { if (e.target.value) { state.dia = e.target.value; fechar(); } };
  $app.querySelectorAll('[data-conta]').forEach((i) => (i.oninput = () => {
    const c = d.contas.find((x) => x.id === +i.dataset.conta);
    const v = paraCentavos(i.value);
    const cel = $app.querySelector(`[data-dif="${c.id}"]`);
    cel.textContent = Number.isNaN(v) ? '' : brl(v - c.saldo);
    cel.className = 'n ' + (Number.isNaN(v) ? '' : cls(v - c.saldo));
  }));
  document.getElementById('reabrir')?.addEventListener('click', () => confirm('Reabrir o dia?') && acao(async () => { await api(`/api/dia/${state.dia}/fechar`, { method: 'DELETE' }); fechar(); }, 'Dia reaberto'));
  document.getElementById('fechar')?.addEventListener('click', () => {
    const contagens = {};
    $app.querySelectorAll('[data-conta]').forEach((i) => { if (i.value.trim()) contagens[i.dataset.conta] = paraCentavos(i.value); });
    checklistFechamento(d, contagens, document.getElementById('obs').value);
  });
}

// Pop-up de segurança: cada conta precisa ser conferida e a pessoa assume a responsabilidade antes de fechar.
function checklistFechamento(d, contagens, obs) {
  const contas = state.meta.contas.filter((c) => c.ativo);
  const saldoDe = (id) => d.contas.find((c) => c.id === id)?.saldo ?? 0;
  const grupos = [
    ['Extratos bancários do dia', contas.filter((c) => c.tipo === 'banco'), (c) => `Conferi o extrato de <b>${esc(c.nome)}</b>`],
    ['Dinheiro em caixa', contas.filter((c) => c.tipo === 'dinheiro'), (c) => `Fiz a contagem do dinheiro em <b>${esc(c.nome)}</b>`],
    ['Outros canais', contas.filter((c) => !['banco', 'dinheiro'].includes(c.tipo)), (c) => `Conferi o saldo em <b>${esc(c.nome)}</b>`],
  ].filter(([, lista]) => lista.length);
  const u = state.usuario;
  const m = modal(`<h2>Antes de fechar o dia ${dataBR(state.dia)}</h2>
    <p class="legenda">Confirme cada item. O fechamento só é liberado com tudo marcado.</p>
    ${grupos.map(([titulo, lista, texto]) => `<div class="check-grupo"><h3>${titulo}</h3>${lista.map((c) => `<label class="check-item"><input type="checkbox" data-c="${c.id}"><span>${texto(c)}</span><small class="mut">sistema: ${brl(saldoDe(c.id))}</small></label>`).join('')}</div>`).join('')}
    <label class="check-resp"><input type="checkbox" id="resp">
      <span class="quem">${avatar(u, 44)}<span><b>${esc(u.nome)}</b><small class="mut">${PAPEL_NOME[u.papel]}</small></span></span>
      <span class="resp-texto">Eu me responsabilizo pelos lançamentos feitos hoje.</span></label>
    <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="cx">Voltar</button><button id="cok" disabled>Fechar o dia</button></div>`, 560);
  const marcas = () => [...m.el.querySelectorAll('input[type=checkbox]')];
  const atualizar = () => { m.el.querySelector('#cok').disabled = !marcas().every((c) => c.checked); };
  marcas().forEach((c) => (c.onchange = atualizar));
  m.el.querySelector('#cx').onclick = m.fechar;
  m.el.querySelector('#cok').onclick = () => acao(async () => {
    const confirmacao = { contas: marcas().filter((c) => c.dataset.c).map((c) => +c.dataset.c), responsabilidade: m.el.querySelector('#resp').checked };
    await api(`/api/dia/${state.dia}/fechar`, { method: 'POST', body: { contagens, obs, confirmacao } });
    m.fechar(); await fechar();
  }, 'Caixa fechado');
}


// ---------- PATRIMÔNIO (containers e estoque) ----------
async function patrimonio() {
  const d = await api(`/api/patrimonio/${state.mes}`);
  const adm = pode('admin');
  const pos = d.posicao;
  $app.innerHTML = `
    <h1>Patrimônio em ativos</h1>
    <p class="sub">Quanto vale hoje o que está em containers (a caminho ou parados) e em estoque. Atualize no fechamento do mês: esses valores entram no painel e no relatório dos sócios.</p>
    <div class="row">${seletorMes()}</div>
    <div class="grid">
      <div class="card kpi"><div class="l">Containers</div><div class="v">${brl(pos.total_container)}</div></div>
      <div class="card kpi"><div class="l">Estoque</div><div class="v">${brl(pos.total_estoque)}</div></div>
      <div class="card kpi"><div class="l">Total em ativos</div><div class="v">${brl(pos.total)}</div></div>
    </div>
    ${pos.defasado ? `<div class="aviso-box">${ico('info')}<span>${nomeMes(state.mes)} ainda não tem valores lançados. Os totais acima são de <b>${nomeMes(pos.mes_ref)}</b>, o último mês informado.</span></div>` : ''}
    <div class="card"><h2>Itens de ${nomeMes(state.mes)}</h2>
      ${d.itens.length ? `<div class="tbl"><table><thead><tr><th>Item</th><th>Tipo</th><th>Situação</th><th>Chegada prevista</th><th class="n">Valor</th><th></th></tr></thead><tbody>
        ${d.itens.map((i) => `<tr><td>${esc(i.descricao)}${i.obs ? `<br><small class="mut">${esc(i.obs)}</small>` : ''}</td><td><span class="tag">${esc(d.tipos[i.tipo])}</span></td><td>${esc(d.situacoes[i.situacao])}</td><td>${i.previsao_chegada ? dataBR(i.previsao_chegada) : '—'}</td><td class="n">${brl(i.valor)}</td>
        <td class="n">${adm ? `<button class="mini sec" data-edit="${i.id}">editar</button> <button class="mini sec" data-del="${i.id}">excluir</button>` : ''}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4">Total</td><td class="n">${brl(d.itens.reduce((a, i) => a + i.valor, 0))}</td><td></td></tr></tfoot></table></div>`
        : `<p class="mut">Nenhum item lançado em ${nomeMes(state.mes)}.</p>${adm && pos.mes_ref ? `<button class="sec" id="copiar">Copiar os itens de ${nomeMes(d.mes_anterior)} e ajustar os valores</button>` : ''}`}
    </div>
    ${adm ? `<div class="card"><h2>Adicionar item</h2><form class="form" id="novo-item">
      <div><label>Tipo</label><select name="tipo">${Object.entries(d.tipos).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="larg"><label>Descrição</label><input name="descricao" required placeholder="Ex.: Container MSKU 481920 — painéis P3.9"></div>
      <div><label>Valor (R$)</label><input name="valor" inputmode="decimal" required placeholder="0,00"></div>
      <div><label>Situação</label><select name="situacao">${Object.entries(d.situacoes).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div><label>Chegada prevista</label><input name="previsao_chegada" type="date"></div>
      <div class="cheio"><label>Observação</label><input name="obs" placeholder="Opcional"></div>
      <div style="align-self:end"><button>Adicionar</button></div></form>
      <p class="legenda" style="margin-top:12px">Informe o valor pelo que custou ou pelo valor de venda esperado, sempre do mesmo jeito. Container vendido sai da lista no mês seguinte.</p></div>` : ''}`;
  ligaMes(patrimonio);
  const salvar = (id, corpo, ok) => acao(async () => { await api(id ? `/api/patrimonio/${id}` : '/api/patrimonio', { method: id ? 'PUT' : 'POST', body: corpo }); await patrimonio(); }, ok);
  document.getElementById('novo-item')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)); const valor = paraCentavos(f.valor);
    if (!(valor >= 0)) return toast('Informe um valor válido', true);
    salvar(null, { ...f, valor, mes: state.mes }, 'Item adicionado');
  });
  document.getElementById('copiar')?.addEventListener('click', () => acao(async () => { const r = await api('/api/patrimonio/copiar', { method: 'POST', body: { de: d.mes_anterior, para: state.mes } }); await patrimonio(); toast(`${r.copiados} item(ns) copiado(s). Ajuste os valores.`); }));
  $app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => confirm('Excluir este item?') && acao(async () => { await api(`/api/patrimonio/${b.dataset.del}`, { method: 'DELETE' }); await patrimonio(); }, 'Item excluído')));
  $app.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
    const i = d.itens.find((x) => x.id === +b.dataset.edit);
    const m = modal(`<h2>Editar item</h2><form class="form" id="ed" style="margin-top:14px">
      <div class="cheio"><label>Descrição</label><input name="descricao" value="${esc(i.descricao)}" required></div>
      <div><label>Valor (R$)</label><input name="valor" value="${(i.valor / 100).toFixed(2).replace('.', ',')}" inputmode="decimal" required></div>
      <div><label>Situação</label><select name="situacao">${Object.entries(d.situacoes).map(([k, v]) => `<option value="${k}" ${i.situacao === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label>Chegada prevista</label><input name="previsao_chegada" type="date" value="${i.previsao_chegada || ''}"></div>
      <div class="cheio"><label>Observação</label><input name="obs" value="${esc(i.obs || '')}"></div>
      <div class="modal-acoes cheio"><span style="flex:1"></span><button type="button" class="sec" id="x">Cancelar</button><button>Salvar</button></div></form>`, 520);
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#ed').onsubmit = (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); const valor = paraCentavos(f.valor); if (!(valor >= 0)) return toast('Valor inválido', true); m.fechar(); salvar(i.id, { ...f, valor, mes: i.mes, tipo: i.tipo }, 'Item atualizado'); };
  }));
}

// ---------- QUADRO SOCIETÁRIO e relatório mensal dos sócios ----------
async function societario() {
  const q = await api('/api/societario/quadro');
  const adm = pode('admin');
  const nota = (await api(`/api/societario/nota/${state.mes}`)).texto;
  const pct = (bp) => (bp == null ? 'a definir' : (bp / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '%');
  const ativos = q.socios.filter((s) => s.ativo);
  $app.innerHTML = `
    <h1>Quadro societário</h1>
    <p class="sub">Quem são os sócios, quanto cada um tem da empresa e o relatório mensal para enviar a eles.</p>
    ${q.soma_bp !== 10000 ? `<div class="aviso-box">${ico('info')}<span>As participações cadastradas somam <b>${pct(q.soma_bp)}</b>${q.sem_participacao.length ? ` e falta definir a participação de <b>${esc(q.sem_participacao.join(', '))}</b>` : ''}. O quadro precisa fechar 100%.</span></div>` : ''}
    <div class="card"><div class="titulo-saldos"><h2>Sócios</h2>${adm ? '<button class="mini sec" id="novo-socio">Adicionar sócio</button>' : ''}</div>
      <div class="tbl"><table><thead><tr><th>Sócio</th><th class="n">Participação</th><th class="n">Aporte</th><th>Entrada</th><th class="n">Valor de referência (100%)</th><th></th></tr></thead><tbody>
      ${q.socios.map((s) => `<tr style="${s.ativo ? '' : 'opacity:.5'}"><td>${esc(s.nome)}${s.obs ? `<br><small class="mut">${esc(s.obs)}</small>` : ''}</td><td class="n"><b>${pct(s.participacao_bp)}</b></td><td class="n">${s.aporte ? brl(s.aporte) : '—'}</td><td>${s.data_entrada ? dataBR(s.data_entrada) : '—'}</td><td class="n">${s.valor_implicito ? brl(s.valor_implicito) : '—'}</td>
        <td class="n">${adm ? `<button class="mini sec" data-socio="${s.id}">editar</button>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="n">${pct(q.soma_bp)}</td><td class="n">${brl(ativos.reduce((a, s) => a + s.aporte, 0))}</td><td colspan="3"></td></tr></tfoot></table></div>
      <p class="legenda" style="margin-top:10px">O valor de referência é o aporte dividido pela participação (ex.: R$ 2 milhões por 20% sugere R$ 10 milhões para 100%). É só uma referência da negociação, não uma avaliação atual da empresa.</p></div>

    <div class="card"><h2>Relatório mensal dos sócios (PDF)</h2>
      <p class="legenda">Gera o PDF com resumo do mês, caixa, saídas, evolução de 6 meses, patrimônio em containers e estoque, quadro societário, pontos de atenção e o comentário da administração. Para o relatório sair completo, feche o caixa de todos os dias do mês e atualize o <a href="#patrimonio">patrimônio</a>.</p>
      <div class="row">${seletorMes()}</div>
      ${adm ? `<div style="margin-bottom:14px"><label>Comentário da administração (aparece no PDF)</label><textarea id="nota" rows="3" placeholder="Ex.: Mês marcado pela compra de containers; o caixa fica apertado até a chegada e a venda.">${esc(nota)}</textarea><div style="margin-top:8px"><button class="mini sec" id="salvar-nota">Salvar comentário</button></div></div>` : nota ? `<p><b>Comentário da administração:</b> ${esc(nota)}</p>` : ''}
      <div class="row" style="margin-bottom:0"><a class="btn" href="/api/societario/relatorio/${state.mes}">${ico('download')} Gerar PDF — todos os sócios</a>
        ${ativos.map((s) => `<a class="btn sec" href="/api/societario/relatorio/${state.mes}?socio=${s.id}">${ico('download')} PDF para ${esc(s.nome)}</a>`).join('')}</div>
    </div>`;
  ligaMes(societario);
  document.getElementById('salvar-nota')?.addEventListener('click', () => acao(() => api(`/api/societario/nota/${state.mes}`, { method: 'PUT', body: { texto: document.getElementById('nota').value } }), 'Comentário salvo'));
  const formSocio = (s) => {
    const m = modal(`<h2>${s ? 'Editar sócio' : 'Novo sócio'}</h2><form class="form" id="fs" style="margin-top:14px">
      <div class="cheio"><label>Nome</label><input name="nome" value="${esc(s?.nome || '')}" required></div>
      <div><label>Participação (%)</label><input name="participacao" inputmode="decimal" value="${s?.participacao_bp == null ? '' : s.participacao_bp / 100}" placeholder="Ex.: 20"></div>
      <div><label>Aporte pago para entrar (R$)</label><input name="aporte" inputmode="decimal" value="${s?.aporte ? (s.aporte / 100).toFixed(2).replace('.', ',') : ''}" placeholder="0,00"></div>
      <div><label>Data de entrada</label><input name="data_entrada" type="date" value="${s?.data_entrada || ''}"></div>
      <div><label>CPF / CNPJ</label><input name="documento" value="${esc(s?.documento || '')}"></div>
      <div class="cheio"><label>Observação</label><input name="obs" value="${esc(s?.obs || '')}"></div>
      <label class="cheio" style="display:flex;gap:8px;align-items:center;color:var(--tx)"><input type="checkbox" name="ativo" ${s && !s.ativo ? '' : 'checked'}> Sócio ativo</label>
      <div class="modal-acoes cheio"><span style="flex:1"></span><button type="button" class="sec" id="x">Cancelar</button><button>Salvar</button></div></form>`, 520);
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#fs').onsubmit = (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target)); const aporte = f.aporte ? paraCentavos(f.aporte) : 0;
      if (Number.isNaN(aporte)) return toast('Aporte inválido', true);
      acao(async () => { await api(s ? `/api/societario/socios/${s.id}` : '/api/societario/socios', { method: s ? 'PUT' : 'POST', body: { ...f, aporte, ativo: f.ativo ? 1 : 0 } }); m.fechar(); await societario(); }, 'Sócio salvo');
    };
  };
  document.getElementById('novo-socio')?.addEventListener('click', () => formSocio(null));
  $app.querySelectorAll('[data-socio]').forEach((b) => (b.onclick = () => formSocio(q.socios.find((s) => s.id === +b.dataset.socio))));
}

// ---------- EXTRATOS (IA) ----------
const CONF = { alta: ['ok', 'alta'], media: ['aviso', 'média'], baixa: ['ruim', 'baixa'] };
const lerBase64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });

async function extratos() {
  if (state.extrato) return extratoDetalhe(state.extrato);
  const { extratos: lista, ia } = await api('/api/extratos');
  const contas = state.meta.contas.filter((c) => c.ativo);
  $app.innerHTML = `
    <h1>Extratos bancários</h1>
    <p class="sub">Envie o extrato do banco. O sistema lê, separa dia a dia e <b>sugere</b> categoria e pessoa de cada linha com IA. Nada vira lançamento até alguém conferir e confirmar.</p>
    ${ia ? '' : '<div class="aviso-box">A IA ainda não está configurada neste servidor: arquivos <b>OFX</b> e <b>CSV</b> funcionam (a classificação fica manual); <b>PDF e foto</b> precisam da IA.</div>'}
    ${pode('operador') ? `<form class="card" id="up"><div class="form">
      <div><label>De qual conta é o extrato?</label><select name="conta_id" required>${contas.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="larg"><label>Arquivo (PDF, OFX, CSV ou foto — até 3 MB)</label><input type="file" name="arq" accept=".pdf,.ofx,.csv,.txt,.png,.jpg,.jpeg,.webp" required></div>
      <div style="align-self:end"><button id="enviar">Enviar e analisar</button></div></div>
      <p class="legenda">Dica: prefira <b>OFX</b> (exportação do internet banking) — é exato e não usa IA. PDFs e fotos são lidos pela IA e precisam de conferência. Os dados do arquivo são enviados ao serviço de IA da Anthropic para leitura.</p></form>` : ''}
    <div class="card"><h2>Extratos enviados</h2>${lista.length ? `<div class="tbl"><table><thead><tr><th>Quando</th><th>Conta</th><th>Arquivo</th><th class="n">Linhas</th><th class="n">Pendentes</th><th class="n">Lançadas</th><th></th></tr></thead><tbody>
      ${lista.map((e) => `<tr><td>${esc(e.enviado_em)}<br><small class="mut">${esc(e.enviado_por || '')}</small></td><td>${esc(e.conta)}</td><td>${esc(e.arquivo_nome)} <span class="tag ${e.formato === 'ofx' || e.formato === 'csv' ? 'ok' : 'aviso'}">${esc(e.formato)}</span></td><td class="n">${e.total}</td><td class="n">${e.pendentes}</td><td class="n">${e.lancados}</td><td class="n"><button class="mini" data-abrir="${e.id}">${e.pendentes ? 'Conferir' : 'Ver'}</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Nenhum extrato enviado ainda.</p>'}</div>`;
  $app.querySelectorAll('[data-abrir]').forEach((b) => (b.onclick = () => { state.extrato = +b.dataset.abrir; extratos(); }));
  document.getElementById('up')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target, file = f.arq.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return toast('Arquivo maior que 3 MB. Divida o extrato por período.', true);
    const btn = document.getElementById('enviar'); btn.disabled = true; btn.textContent = 'Analisando… (pode levar um minuto)';
    try {
      const r = await api('/api/extratos', { method: 'POST', body: { conta_id: f.conta_id.value, nome: file.name, base64: await lerBase64(file) } });
      toast(`${r.novos} linha(s) lida(s)${r.duplicados ? `, ${r.duplicados} já importada(s) antes` : ''}.${r.observacao ? ' Aviso: ' + r.observacao : ''}`);
      state.extrato = r.id; extratos();
    } catch (e) { toast(e.message, true); btn.disabled = false; btn.textContent = 'Enviar e analisar'; }
  });
}

async function extratoDetalhe(id) {
  const e = await api(`/api/extratos/${id}`);
  const { categorias, pessoas } = state.meta;
  const podeEditar = pode('operador');
  const pend = e.movimentos.filter((m) => m.status === 'pendente');
  const optsCat = (m) => `<option value="">— escolher —</option>` + categorias.filter((c) => c.tipo === m.tipo && c.ativo).map((c) => `<option value="${c.id}" ${c.id === m.categoria_id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
  const soma = (t) => e.movimentos.filter((m) => m.tipo === t).reduce((a, m) => a + m.valor, 0);
  $app.innerHTML = `
    <p><a href="#extratos" id="voltar" class="voltar">${ico('arrow-left')} Todos os extratos</a></p>
    <h1>${esc(e.arquivo_nome)}</h1>
    <p class="sub">${esc(e.conta)} · enviado ${esc(e.enviado_em)} por ${esc(e.enviado_por || '—')} · entradas <b class="pos">${brl(soma('entrada'))}</b> · saídas <b class="neg">${brl(soma('saida'))}</b></p>
    <div class="aviso-box">Confira antes de confirmar: a IA sugere, <b>você decide</b>. Transferências entre contas próprias não são receita nem despesa — marque como "ignorar". Cada confirmação ensina o sistema para os próximos extratos.</div>
    ${podeEditar && pend.length ? `<div class="row"><button id="lancar-sel">Lançar selecionados</button><button class="sec" id="sel-alta">Selecionar confiança alta</button><button class="sec" id="sel-todos">Selecionar todos com categoria</button><span class="legenda" id="cont"></span></div>` : ''}
    <div class="card tbl"><table><thead><tr><th></th><th>Data</th><th>Descrição</th><th class="n">Valor</th><th>Categoria</th><th>Pessoa</th><th>Conf.</th><th></th></tr></thead><tbody>
    ${e.movimentos.map((m) => {
      const aberto = m.status === 'pendente' && podeEditar;
      return `<tr data-m="${m.id}" style="${m.status === 'ignorado' ? 'opacity:.45' : ''}">
        <td>${m.status === 'pendente' && podeEditar ? `<input type="checkbox" data-sel="${m.id}" style="width:auto">` : m.status === 'lancado' ? `<span style="color:var(--azul)">${ico('check')}</span>` : ''}</td>
        <td>${dataBR(m.data)}</td><td>${esc(m.descricao)}${m.motivo ? `<br><small class="mut">${esc(m.motivo)}</small>` : ''}</td>
        <td class="n ${m.tipo === 'entrada' ? 'pos' : 'neg'}">${m.tipo === 'entrada' ? '+' : '−'} ${brl(m.valor)}</td>
        <td>${aberto ? `<select data-cat="${m.id}">${optsCat(m)}</select>` : esc(m.categoria || '—')}</td>
        <td>${aberto ? `<select data-pes="${m.id}"><option value="">—</option>${pessoas.filter((p) => p.ativo).map((p) => `<option value="${p.id}" ${p.id === m.pessoa_id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select>` : esc(m.pessoa || '')}</td>
        <td>${m.status === 'pendente' ? `<span class="tag ${CONF[m.confianca][0]}" data-conf="${m.id}">${CONF[m.confianca][1]}</span>` : `<span class="mut">${m.status}</span>`}</td>
        <td class="n">${aberto ? `<button class="mini sec" data-ign="${m.id}">ignorar</button>` : m.status === 'ignorado' && podeEditar ? `<button class="mini sec" data-rest="${m.id}">restaurar</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>
    ${pode('admin') && !e.movimentos.some((m) => m.status === 'lancado') ? '<button class="perigo" id="excluir">Excluir este extrato</button>' : ''}`;
  document.getElementById('voltar').onclick = (ev) => { ev.preventDefault(); state.extrato = null; extratos(); };
  const recarrega = () => extratoDetalhe(id);
  const salvar = (mid, body) => acao(() => api(`/api/movimentos/${mid}`, { method: 'PUT', body }), null);
  $app.querySelectorAll('[data-cat]').forEach((s) => (s.onchange = async () => { await salvar(s.dataset.cat, { categoria_id: s.value || null }); const t = $app.querySelector(`[data-conf="${s.dataset.cat}"]`); if (t && s.value) { t.className = 'tag ok'; t.textContent = 'alta'; } }));
  $app.querySelectorAll('[data-pes]').forEach((s) => (s.onchange = () => salvar(s.dataset.pes, { pessoa_id: s.value || null })));
  $app.querySelectorAll('[data-ign]').forEach((b) => (b.onclick = async () => { await salvar(b.dataset.ign, { status: 'ignorado' }); recarrega(); }));
  $app.querySelectorAll('[data-rest]').forEach((b) => (b.onclick = async () => { await salvar(b.dataset.rest, { status: 'pendente' }); recarrega(); }));
  const marcados = () => [...$app.querySelectorAll('[data-sel]:checked')].map((c) => +c.dataset.sel);
  const cont = () => { const c = document.getElementById('cont'); if (c) c.textContent = `${marcados().length} selecionado(s)`; };
  $app.querySelectorAll('[data-sel]').forEach((c) => (c.onchange = cont));
  const marcar = (fn) => { $app.querySelectorAll('[data-sel]').forEach((c) => { const m = e.movimentos.find((x) => x.id === +c.dataset.sel); const sel = $app.querySelector(`[data-cat="${m.id}"]`); c.checked = fn(m) && !!sel?.value; }); cont(); };
  document.getElementById('sel-alta')?.addEventListener('click', () => marcar((m) => m.confianca === 'alta'));
  document.getElementById('sel-todos')?.addEventListener('click', () => marcar(() => true));
  document.getElementById('lancar-sel')?.addEventListener('click', () => {
    const ids = marcados();
    if (!ids.length) return toast('Selecione ao menos uma linha.', true);
    if (!confirm(`Lançar ${ids.length} movimento(s) no caixa, nas datas do extrato?`)) return;
    acao(async () => {
      const r = await api(`/api/extratos/${id}/lancar`, { method: 'POST', body: { ids } });
      toast(`${r.lancados} lançamento(s) criado(s).${r.falhas.length ? ' ' + r.falhas.length + ' não lançado(s): ' + r.falhas.map((f) => f.motivo).filter((v, i, a) => a.indexOf(v) === i).join(' ') : ''}`, r.falhas.length > 0);
      await recarrega();
    });
  });
  document.getElementById('excluir')?.addEventListener('click', () => confirm('Excluir este extrato e suas linhas pendentes?') && acao(async () => { await api(`/api/extratos/${id}`, { method: 'DELETE' }); state.extrato = null; await extratos(); }, 'Extrato excluído'));
  cont();
}

// ---------- MENSAL ----------
async function mensal() {
  const p = await api(`/api/painel/${state.mes}`);
  $app.innerHTML = `
    <h1>Controle mensal</h1><p class="sub">A Elisa Maria clica em <b>Emitir</b> e recebe a planilha completa do mês.</p>
    <div class="row">${seletorMes()}<a class="btn" href="/api/export/mes/${state.mes}">${ico('download')} Emitir controle mensal — ${nomeMes(state.mes)}</a></div>
    <div class="card"><h2>O que vai na planilha</h2>
      <ul><li><b>Resumo</b> — entradas com/sem nota, saídas por pagador (OnTrade × LTON), por grupo e por categoria, saldo final por conta</li>
      <li><b>Por conta</b> — movimento de cada banco / canal</li><li><b>Pessoas e folha</b> — quanto cada pessoa recebeu, de que tipo e quem pagou</li>
      <li><b>Fechamento diário</b> — saldo dia a dia e quais dias foram fechados</li><li><b>Lançamentos</b> — todos os registros, com filtro</li><li><b>Mapa do fluxo</b> — referência de como o dinheiro circula</li></ul>
      <p class="legenda"><b>Google Sheets:</b> salve o arquivo no Drive e abra com “Planilhas Google” — fórmulas e formatação são preservadas. (Envio automático ao Drive está no <a href="#roadmap">roadmap</a>.)</p></div>
    <div class="grid">
      <div class="card kpi"><div class="l">Lançamentos no mês</div><div class="v">${p.qtd_lancamentos}</div></div>
      <div class="card kpi"><div class="l">Dias fechados</div><div class="v">${p.dias_fechados}</div></div>
      <div class="card kpi"><div class="l">Resultado</div><div class="v ${cls(p.resultado)}">${brl(p.resultado)}</div></div>
    </div>
    ${p.dias_abertos.length ? `<div class="aviso-box">${ico('info')}<span>Dias com lançamentos ainda não fechados: ${p.dias_abertos.map(dataBR).join(', ')}. Recomenda-se fechar antes de emitir.</span></div>` : ''}`;
  ligaMes(mensal);
}

// ---------- FLUXO ----------
function fluxo() {
  const lista = (itens) => `<ul>${itens.map((i) => `<li>${i}</li>`).join('')}</ul>`;
  $app.innerHTML = `
    <h1>Mapa do fluxo</h1><p class="sub">Como o dinheiro entra, passa pela LTON e sai. Esta é a lógica que o sistema segue.</p>
    <div class="card"><div class="fluxo">
      <div class="col-fluxo">
        <div class="no"><h3>Cliente paga COM nota</h3>${lista(['Banco Safra', 'Banco Infinity', 'Banco Bradesco', 'Banco do Brasil'])}</div>
        <div class="no"><h3>Cliente paga SEM nota</h3>${lista(['DAE → direto ao fornecedor chinês', 'PagVeloz', 'LTON (empresa da Elisa Maria)', 'Dinheiro'])}</div>
      </div>
      <div class="seta">${ico('arrow-right')}</div>
      <div class="col-fluxo">
        <div class="no"><h3>OnTrade</h3>${lista(['Despesas operacionais (papelaria, estacionamento…)', 'Dantas (conta ou dinheiro) — checar registro'])}</div>
        <div class="no"><h3>LTON paga pela OnTrade</h3>${lista(['Pró-labore do Renato', 'Salários: Kátia, Fátima, João, Tayane', 'Comissão do Fabiano', 'Douglas e Andresa', 'Passagem e alimentação (em dinheiro) da Dona Kátia', 'Cartões iFood de todos', 'Recarga de celular, luz, gás, água, combustível', 'Tributos dos funcionários'])}</div>
      </div>
      <div class="seta">${ico('arrow-right')}</div>
      <div class="col-fluxo">
        <div class="no"><h3>Elisa Maria</h3><p style="margin:0;font-size:13px">Todo <b>dia 5</b>: ~R$ 16.800 da LTON para a conta pessoal (pagamento do empréstimo usado na OnTrade).</p></div>
        <div class="no"><h3>Registros</h3>${lista(['Carla e João → registrados na LTON', 'Dona Kátia → registrada na empresa de Japeri', 'Dantas → a confirmar'])}</div>
      </div>
    </div>
    <p class="legenda" style="margin-top:12px"><span class="tag com_nota">com nota</span> entra pelos bancos da OnTrade &nbsp; <span class="tag sem_nota">sem nota</span> entra por DAE, PagVeloz, LTON e dinheiro. No sistema cada conta pertence a uma empresa e tem a modalidade — assim o relatório separa automaticamente “quem pagou” e “com/sem nota”.</p></div>`;
}

// ---------- CADASTROS ----------
async function cadastros() {
  const adm = pode('admin');
  const usuarios = adm ? await api('/api/usuarios') : [];
  await recarregarMeta();
  const { contas, pessoas, categorias, empresas } = state.meta;
  const rec = await api(`/api/painel/${state.mes}`).then((p) => p.recorrencias);
  $app.innerHTML = `
    <h1>Cadastros</h1><p class="sub">Contas, pessoas e categorias. Os valores (salários, iFood…) entram aos poucos — comece pelos saldos iniciais das contas.</p>
    <div class="card"><h2>Contas e saldo inicial</h2><div class="tbl"><table><thead><tr><th>Conta</th><th>Empresa</th><th>Nota</th><th class="n">Saldo inicial (R$)</th></tr></thead><tbody>
      ${contas.map((c) => `<tr><td>${esc(c.nome)}${c.obs ? `<br><small class="mut">${esc(c.obs)}</small>` : ''}</td><td>${esc(c.empresa)}</td><td><span class="tag ${c.modalidade}">${c.modalidade === 'com_nota' ? 'com nota' : 'sem nota'}</span></td>
      <td class="n"><input ${adm ? '' : 'disabled'} data-saldo="${c.id}" value="${(c.saldo_inicial / 100).toFixed(2).replace('.', ',')}" style="width:130px;text-align:right"></td></tr>`).join('')}</tbody></table></div>
      ${adm ? '' : '<!--'}<details style="margin-top:12px"><summary>+ Nova conta</summary><form class="form" id="nova-conta" style="margin-top:10px">
        <div><label>Nome</label><input name="nome" required></div><div><label>Empresa</label><select name="empresa_id">${opts(empresas)}</select></div>
        <div><label>Tipo</label><select name="tipo">${Object.entries(TIPOS_CONTA).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div><label>Nota</label><select name="modalidade"><option value="com_nota">Com nota</option><option value="sem_nota">Sem nota</option></select></div>
        <div style="align-self:end"><button>Adicionar</button></div></form></details>${adm ? '' : '-->'}</div>
    <div class="card"><h2>Pessoas</h2><div class="tbl"><table><thead><tr><th>Nome</th><th>Função</th><th>Vínculo</th><th>Pagador padrão</th></tr></thead><tbody>
      ${pessoas.map((p) => `<tr><td>${esc(p.nome)}${p.obs ? `<br><small class="mut">${esc(p.obs)}</small>` : ''}</td><td>${esc(p.funcao || '')}</td>
      <td><select ${adm ? '' : 'disabled'} data-vinculo="${p.id}">${Object.entries(VINCULOS).map(([k, v]) => `<option value="${k}" ${p.vinculo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td><td>${esc(p.pagador_padrao || '')}</td></tr>`).join('')}</tbody></table></div>
      ${adm ? '' : '<!--'}<details style="margin-top:12px"><summary>+ Nova pessoa</summary><form class="form" id="nova-pessoa" style="margin-top:10px">
        <div><label>Nome</label><input name="nome" required></div><div><label>Função</label><input name="funcao"></div>
        <div><label>Vínculo</label><select name="vinculo">${Object.entries(VINCULOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div><label>Pagador padrão</label><input name="pagador_padrao" placeholder="LTON / OnTrade"></div><div style="align-self:end"><button>Adicionar</button></div></form></details>${adm ? '' : '-->'}</div>
    <div class="grid dois"><div class="card"><h2>Categorias</h2>
      ${['entrada', 'saida'].map((t) => `<p><b>${t === 'entrada' ? 'Entradas' : 'Saídas'}</b></p>` + [...new Set(categorias.filter((c) => c.tipo === t).map((c) => c.grupo))].map((g) => `<p style="margin:2px 0"><span class="mut">${esc(g)}:</span> ${categorias.filter((c) => c.tipo === t && c.grupo === g).map((c) => esc(c.nome)).join(' · ')}</p>`).join('')).join('')}
      ${adm ? '' : '<!--'}<details style="margin-top:12px"><summary>+ Nova categoria</summary><form class="form" id="nova-cat" style="margin-top:10px"><div><label>Nome</label><input name="nome" required></div>
        <div><label>Tipo</label><select name="tipo"><option value="saida">Saída</option><option value="entrada">Entrada</option></select></div><div><label>Grupo</label><input name="grupo" required placeholder="Ex.: Pessoal"></div><div style="align-self:end"><button>Adicionar</button></div></form></details>${adm ? '' : '-->'}</div>
      <div class="card"><h2>Recorrências</h2>${rec.map((r) => `<p><b>${esc(r.nome)}</b><br>Todo dia ${r.dia_mes} · ${r.valor ? brl(r.valor) + (r.estimado ? ' (aprox.)' : '') : 'valor a definir'} · ${esc(r.conta)}</p>`).join('') || '<p class="mut">Nenhuma.</p>'}
      <p class="legenda">Aparecem no Painel, onde um clique as transforma em lançamento no mês.</p></div></div>
    ${adm ? `<div class="card"><h2>Usuários e permissões</h2>
      <p class="legenda"><b>Administrador:</b> tudo, inclusive cadastros, usuários, quadro societário e reabrir dia. <b>Operador:</b> lança, exclui lançamentos e fecha o dia. <b>Somente leitura:</b> consulta o financeiro e baixa Excel (ideal para o contador). <b>Sócio:</b> consulta painel, controle mensal, patrimônio, quadro societário e o painel ao vivo, sem lançar nada. <b>Comercial:</b> só clientes, orçamentos e o painel ao vivo, sem acesso ao financeiro.</p>
      <div class="tbl"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Último acesso</th><th></th></tr></thead><tbody>
      ${usuarios.map((u) => `<tr style="${u.ativo ? '' : 'opacity:.5'}"><td><div class="quem">${avatar(u, 30)}<span>${esc(u.nome)}</span></div></td><td>${esc(u.email)}</td>
        <td><select data-papel="${u.id}">${Object.entries(PAPEL_NOME).map(([k, v]) => `<option value="${k}" ${u.papel === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td>${esc(u.ultimo_acesso || 'nunca')}</td>
        <td class="n"><button class="mini sec" data-resetsenha="${u.id}">nova senha</button> <button class="mini sec" data-ativo="${u.id}" data-val="${u.ativo ? 0 : 1}">${u.ativo ? 'desativar' : 'reativar'}</button></td></tr>`).join('')}</tbody></table></div>
      <details style="margin-top:12px"><summary>+ Novo usuário</summary><form class="form" id="novo-usuario" style="margin-top:10px">
        <div><label>Nome</label><input name="nome" required></div><div><label>E-mail</label><input name="email" type="email" required></div>
        <div><label>Senha inicial (mín. 8)</label><input name="senha" type="password" minlength="8" required autocomplete="new-password"></div>
        <div><label>Perfil</label><select name="papel">${Object.entries(PAPEL_NOME).map(([k, v]) => `<option value="${k}" ${k === 'operador' ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div style="align-self:end"><button>Criar usuário</button></div></form></details></div>` : ''}`;
  $app.querySelectorAll('[data-saldo]').forEach((i) => (i.onchange = () => {
    const v = paraCentavos(i.value);
    if (Number.isNaN(v)) return toast('Valor inválido', true);
    acao(() => api(`/api/contas/${i.dataset.saldo}`, { method: 'PUT', body: { saldo_inicial: v } }), 'Saldo inicial salvo');
  }));
  $app.querySelectorAll('[data-vinculo]').forEach((s) => (s.onchange = () => acao(() => api(`/api/pessoas/${s.dataset.vinculo}`, { method: 'PUT', body: { vinculo: s.value } }), 'Vínculo atualizado')));
  const novo = (id, tabela, ajusta = (x) => x) => document.getElementById(id).addEventListener('submit', (e) => {
    e.preventDefault();
    acao(async () => { await api(`/api/${tabela}`, { method: 'POST', body: ajusta(Object.fromEntries(new FormData(e.target))) }); await cadastros(); }, 'Adicionado!');
  });
  if (adm) {
    novo('nova-conta', 'contas'); novo('nova-pessoa', 'pessoas'); novo('nova-cat', 'categorias'); novo('novo-usuario', 'usuarios');
    const usr = (id, body, ok) => acao(async () => { await api(`/api/usuarios/${id}`, { method: 'PUT', body }); await cadastros(); }, ok);
    $app.querySelectorAll('[data-papel]').forEach((x) => (x.onchange = () => usr(x.dataset.papel, { papel: x.value }, 'Perfil atualizado')));
    $app.querySelectorAll('[data-ativo]').forEach((x) => (x.onclick = () => usr(x.dataset.ativo, { ativo: +x.dataset.val }, 'Usuário atualizado')));
    $app.querySelectorAll('[data-resetsenha]').forEach((x) => (x.onclick = () => { const n = prompt('Nova senha para este usuário (mín. 8 caracteres):'); if (n) usr(x.dataset.resetsenha, { senha: n }, 'Senha redefinida'); }));
  }
}

// ---------- ROADMAP ----------
function roadmap() {
  const item = (t, d) => `<li><b>${t}</b> — ${d}</li>`;
  $app.innerHTML = `
    <h1>Roadmap e sugestões</h1><p class="sub">O que já está no esqueleto e o que podemos construir em seguida.</p>
    <div class="card"><h2>Já disponível</h2><ul>
      ${item('Lançamentos', 'entrada, saída e transferência por conta, categoria e pessoa')}
      ${item('Com nota × sem nota', 'cada conta tem modalidade; relatórios separam automaticamente')}
      ${item('Quem pagou', 'OnTrade × LTON × outros em todos os relatórios')}
      ${item('Fechamento diário', 'saldo do sistema × contado, com trava do dia')}
      ${item('Excel diário e mensal', 'com fórmulas, abre direto no Google Sheets')}
      ${item('Recorrências', 'empréstimo da Elisa Maria (~R$ 16.800 dia 5) pronto para lançar')}</ul></div>
    <div class="card"><h2>Próximos passos sugeridos</h2><ul>
      ${item('Login e perfis', 'Elisa Maria (tudo), operador (só lançar), contador (só leitura)')}
      ${item('Google Drive automático', 'o botão “Emitir” já salvar o Google Sheets na pasta do Drive')}
      ${item('Folha por pessoa', 'valor mensal de cada salário, iFood, passagem e alimentação como recorrências')}
      ${item('Conciliação bancária', 'importar OFX/CSV de Safra, Bradesco, BB e Infinity e casar com os lançamentos')}
      ${item('Anexar comprovantes', 'foto do recibo / comprovante PIX em cada lançamento (celular)')}
      ${item('Lançamento pelo WhatsApp', 'mandar “papelaria 15 bradesco” e virar lançamento')}
      ${item('Contas a pagar e a receber', 'vencimentos de tributos, luz, gás, água e alertas')}
      ${item('Previsão de caixa', 'projetar 30/60/90 dias com folha + empréstimo + recorrências')}
      ${item('Controle do empréstimo', 'saldo devedor, parcelas pagas e restantes')}
      ${item('Metas e alertas', 'ex.: “LTON com saldo menor que a folha + empréstimo do mês”')}
      ${item('Regularização de vínculos', 'lista de quem está ou não registrado (Dantas, Fátima, Tayane…)')}
      ${item('Backup automático', 'cópia diária do banco no Drive')}</ul></div>
    <div class="card"><h2>Perguntas em aberto</h2><ul>
      <li>Kátia e Dona Kátia são a mesma pessoa?</li><li>O DAE gera saldo na OnTrade, ou é só um canal de pagamento ao fornecedor?</li>
      <li>O PagVeloz é conta da OnTrade ou da LTON?</li><li>As despesas em dinheiro saem de um caixa físico único ou de vários?</li>
      <li>O empréstimo tem prazo/saldo devedor para acompanhar?</li></ul></div>`;
}


// =====================================================================
// COMERCIAL: ao vivo, orçamentos, clientes e aviso de follow-up
// =====================================================================
const STATUS_ORC = { aberto: 'Em aberto', ganho: 'Ganho', perdido: 'Perdido', cancelado: 'Cancelado' };
const TAG_ORC = { aberto: '', ganho: 'ok', perdido: 'ruim', cancelado: 'aviso' };
const tagOrc = (s) => `<span class="tag ${TAG_ORC[s]}">${STATUS_ORC[s]}</span>`;
const brlInput = (c) => (c / 100).toFixed(2).replace('.', ',');
const hojeISO = () => state.meta?.hoje || new Date().toLocaleDateString('sv-SE');
const zap = (tel) => { const d = String(tel || '').replace(/\D/g, ''); return d.length >= 10 ? `https://wa.me/${d.startsWith('55') ? d : '55' + d}` : null; };
const contatoCli = (o) => [o.cliente_telefone && (zap(o.cliente_telefone) ? `<a href="${zap(o.cliente_telefone)}" target="_blank" rel="noopener">${esc(o.cliente_telefone)}</a>` : esc(o.cliente_telefone)), o.cliente_email && esc(o.cliente_email)].filter(Boolean).join(' · ') || '<span class="mut">sem contato</span>';
const variacao = (atual, ant) => (ant > 0 ? `<small class="${cls(atual - ant)}">${atual >= ant ? '+' : '−'}${Math.abs(Math.round(((atual - ant) / ant) * 100))}%</small>` : '<small class="mut">—</small>');

// ---- contato / encerramento (usados na lista e no pop-up) ----
function janelaContato(o, depois) {
  const m = modal(`<h2>Registrar contato</h2>
    <p class="legenda">${esc(o.cliente_nome)} · ${esc(o.produto)} · ${brl(o.valor)}<br>${contatoCli(o)}</p>
    <form class="form" id="fc" style="margin-top:14px">
      <div class="cheio"><label>O que foi conversado</label><textarea name="nota" rows="3" placeholder="Ex.: pediu mais prazo; vai falar com o sócio"></textarea></div>
      <div><label>Avisar de novo em (dias)</label><input name="adiar_dias" type="number" min="1" max="60" value="3"></div></form>
    <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar contato</button></div>`);
  m.el.querySelector('#x').onclick = m.fechar;
  m.el.querySelector('#ok').onclick = () => acao(async () => {
    await api(`/api/comercial/orcamentos/${o.id}/contato`, { method: 'POST', body: Object.fromEntries(new FormData(m.el.querySelector('#fc'))) });
    m.fechar(); await depois();
  }, 'Contato registrado');
}
function janelaEncerrar(o, depois) {
  const m = modal(`<h2>Encerrar orçamento</h2>
    <p class="legenda">${esc(o.cliente_nome)} · ${esc(o.produto)} · ${brl(o.valor)}</p>
    <form class="form" id="fe" style="margin-top:14px">
      <div><label>Resultado</label><select name="status"><option value="ganho">Ganho (vendeu)</option><option value="perdido">Perdido (comprou de outro / não fechou)</option><option value="cancelado">Cancelado</option></select></div>
      <div class="cheio" id="mot" hidden><label>Motivo</label><input name="motivo" placeholder="Ex.: preço, prazo de entrega, desistiu do projeto"></div></form>
    <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Confirmar</button></div>`);
  const sel = m.el.querySelector('[name=status]'), mot = m.el.querySelector('#mot');
  sel.onchange = () => { mot.hidden = sel.value === 'ganho'; };
  m.el.querySelector('#x').onclick = m.fechar;
  m.el.querySelector('#ok').onclick = () => acao(async () => {
    await api(`/api/comercial/orcamentos/${o.id}/status`, { method: 'POST', body: Object.fromEntries(new FormData(m.el.querySelector('#fe'))) });
    m.fechar(); await depois();
  }, 'Orçamento atualizado');
}

// ---- pop-up de follow-up (3 dias depois do orçamento) ----
let _fuTimer = null;
function atualizarBadge(n) {
  const a = document.querySelector('#nav a[href="#orcamentos"]'); if (!a) return;
  a.querySelector('.badge')?.remove();
  if (n > 0) a.insertAdjacentHTML('beforeend', `<span class="badge">${n}</span>`);
}
async function verificarFollowups(forcar = false) {
  if (!temArea('comercial') || document.querySelector('.modal-fundo')) return;
  const lista = await api('/api/comercial/followups').catch(() => null);
  if (!lista) return;
  state.followups = lista; atualizarBadge(lista.length);
  const silencio = Number(sessionStorage.getItem('fu_ate') || 0);
  if (lista.length && (forcar || Date.now() > silencio)) abrirFollowups(lista);
}
function abrirFollowups(lista) {
  const m = modal(`<h2>Hora de retomar contato</h2>
    <p class="legenda">${lista.length} orçamento(s) sem retorno há ${lista.length > 1 ? 'pelo menos ' : ''}3 dias. Ligue ou mande uma mensagem e registre aqui.</p>
    <div class="fu-lista">${lista.map((o) => `<div class="fu-item" data-id="${o.id}">
      <div><b>${esc(o.cliente_nome)}</b> <span class="mut">· ${esc(o.produto)} · ${brl(o.valor)}</span><br>
        <small class="mut">Orçamento de ${dataBR(o.data)} · aviso desde ${dataBR(o.followup_em)}${o.qtd_contatos ? ` · ${o.qtd_contatos} contato(s)` : ''}</small><br><small>${contatoCli(o)}</small></div>
      <div class="fu-acoes"><button class="mini" data-a="contato">Registrar contato</button><button class="mini sec" data-a="encerrar">Encerrar</button><button class="mini sec" data-a="adiar">Adiar 1 dia</button></div></div>`).join('')}</div>
    <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="depois">Lembrar mais tarde</button></div>`, 640);
  const refaz = async () => { m.fechar(); await verificarFollowups(true); if (location.hash === '#orcamentos') rota(); };
  m.el.querySelector('#depois').onclick = () => { sessionStorage.setItem('fu_ate', String(Date.now() + 30 * 60 * 1000)); m.fechar(); };
  m.el.querySelectorAll('.fu-item').forEach((el) => {
    const o = lista.find((x) => x.id === +el.dataset.id);
    el.querySelector('[data-a=contato]').onclick = () => { m.fechar(); janelaContato(o, refaz); };
    el.querySelector('[data-a=encerrar]').onclick = () => { m.fechar(); janelaEncerrar(o, refaz); };
    el.querySelector('[data-a=adiar]').onclick = () => acao(async () => { await api(`/api/comercial/orcamentos/${o.id}/adiar`, { method: 'POST', body: { dias: 1 } }); await refaz(); }, 'Aviso adiado para amanhã');
  });
}
function iniciarFollowups() {
  clearInterval(_fuTimer);
  if (!temArea('comercial')) return;
  verificarFollowups(); _fuTimer = setInterval(() => verificarFollowups(), 5 * 60 * 1000);
}

// ---- novo orçamento: "cliente já cadastrado?" -> ficha -> orçamento ----
async function novoOrcamento(depois, clientePre) {
  const produtos = await api('/api/comercial/produtos');
  const m = modal(`<h2>Novo orçamento</h2>
    <form id="fo" autocomplete="off">
      <div class="passo"><span class="num">1</span> Cliente</div>
      <div id="cli-escolhido" ${clientePre ? '' : 'hidden'} class="cli-sel"></div>
      <div id="cli-busca" ${clientePre ? 'hidden' : ''}>
        <label>O cliente já está cadastrado? Busque por nome, telefone ou e-mail</label>
        <input id="q" placeholder="Digite para buscar" autofocus><div id="res" class="busca-res"></div>
        <button type="button" class="sec mini" id="novo-cli" style="margin-top:8px">Não encontrei — cadastrar novo cliente</button></div>
      <div id="ficha" hidden class="form" style="margin-top:8px">
        <div class="larg"><label>Nome</label><input name="c_nome"></div><div><label>Telefone</label><input name="c_telefone" inputmode="tel"></div>
        <div><label>E-mail</label><input name="c_email" type="email"></div><div><label>Aniversário</label><input name="c_aniversario" type="date"></div>
        <div><label>Empresa</label><input name="c_empresa"></div></div>
      <div class="passo"><span class="num">2</span> Orçamento</div>
      <div class="form">
        <div><label>Tipo de produto</label><select name="produto_id">${produtos.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}<option value="">Outro (digitar)</option></select></div>
        <div id="outro" hidden><label>Qual produto?</label><input name="produto_nome" placeholder="Ex.: Painel P2.5"></div>
        <div><label>Valor do orçamento (R$)</label><input name="valor" inputmode="decimal" placeholder="0,00" required></div>
        <div><label>Nº do orçamento</label><input name="numero" placeholder="Opcional"></div>
        <div class="cheio"><label>Observação</label><input name="obs" placeholder="Opcional"></div></div>
      <p class="legenda" style="margin-top:10px">O sistema vai avisar para retomar o contato <b>3 dias</b> depois de hoje.</p>
      <div class="modal-acoes"><span style="flex:1"></span><button type="button" class="sec" id="x">Cancelar</button><button>Registrar orçamento</button></div></form>`, 620);
  let escolhido = clientePre || null;
  const f = m.el.querySelector('#fo');
  const mostraEscolhido = () => {
    const box = m.el.querySelector('#cli-escolhido');
    box.hidden = !escolhido; m.el.querySelector('#cli-busca').hidden = !!escolhido;
    if (escolhido) box.innerHTML = `<div><b>${esc(escolhido.nome)}</b> <span class="tag">cliente recorrente</span><br><small class="mut">${esc([escolhido.telefone, escolhido.email].filter(Boolean).join(' · ') || 'sem contato')} · ${escolhido.qtd_orcamentos || 0} orçamento(s) anterior(es)</small></div><button type="button" class="mini sec" id="trocar">Trocar</button>`;
    box.querySelector('#trocar')?.addEventListener('click', () => { escolhido = null; mostraEscolhido(); });
  };
  mostraEscolhido();
  const q = m.el.querySelector('#q'), res = m.el.querySelector('#res'); let t;
  q.oninput = () => { clearTimeout(t); t = setTimeout(async () => {
    if (q.value.trim().length < 2) { res.innerHTML = ''; return; }
    const l = await api('/api/comercial/clientes?q=' + encodeURIComponent(q.value.trim())).catch(() => []);
    res.innerHTML = l.length ? l.map((c) => `<button type="button" class="busca-item" data-id="${c.id}"><b>${esc(c.nome)}</b><small class="mut">${esc([c.telefone, c.email].filter(Boolean).join(' · ') || 'sem contato')} · ${c.qtd_orcamentos} orçamento(s)</small></button>`).join('')
      : '<p class="mut" style="margin:8px 0">Nenhum cliente encontrado. Cadastre um novo abaixo.</p>';
    res.querySelectorAll('.busca-item').forEach((b) => (b.onclick = () => { escolhido = l.find((c) => c.id === +b.dataset.id); mostraEscolhido(); }));
  }, 250); };
  m.el.querySelector('#novo-cli').onclick = () => { m.el.querySelector('#ficha').hidden = false; m.el.querySelector('#cli-busca').hidden = true; m.el.querySelector('[name=c_nome]').value = q.value.trim(); m.el.querySelector('[name=c_nome]').focus(); };
  const sel = f.produto_id; sel.onchange = () => { m.el.querySelector('#outro').hidden = sel.value !== ''; };
  m.el.querySelector('#x').onclick = m.fechar;
  f.onsubmit = (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f)); const valor = paraCentavos(v.valor);
    if (!(valor >= 0)) return toast('Informe o valor do orçamento', true);
    const novo = !m.el.querySelector('#ficha').hidden;
    if (!escolhido && !novo) return toast('Busque o cliente ou cadastre um novo', true);
    if (novo && !v.c_nome.trim()) return toast('Informe o nome do cliente', true);
    const corpo = { valor, numero: v.numero, obs: v.obs, produto_id: v.produto_id || null, produto_nome: v.produto_nome };
    if (escolhido) corpo.cliente_id = escolhido.id;
    else corpo.cliente = { nome: v.c_nome, telefone: v.c_telefone, email: v.c_email, aniversario: v.c_aniversario, empresa: v.c_empresa };
    acao(async () => { await api('/api/comercial/orcamentos', { method: 'POST', body: corpo }); m.fechar(); await depois(); }, 'Orçamento registrado — aviso em 3 dias');
  };
}

// ---- ficha do cliente ----
async function fichaCliente(id, depois) {
  const c = await api(`/api/comercial/clientes/${id}`);
  const m = modal(`<h2>${esc(c.nome)}</h2>
    <p class="legenda">${esc([c.empresa, c.telefone, c.email].filter(Boolean).join(' · ') || 'sem dados de contato')}${c.aniversario ? ` · aniversário ${dataBR(c.aniversario).slice(0, 5)}` : ''}<br>Cliente desde ${dataBR(c.criado_em.slice(0, 10))} · ${c.qtd_orcamentos} orçamento(s) · comprou ${brl(c.valor_comprado)}</p>
    <h3 style="margin:16px 0 6px;font-size:14px">Histórico de orçamentos</h3>
    ${c.orcamentos.length ? `<div class="tbl"><table><thead><tr><th>Data</th><th>Produto</th><th class="n">Valor</th><th>Situação</th></tr></thead><tbody>${c.orcamentos.map((o) => `<tr><td>${dataBR(o.data)}</td><td>${esc(o.produto)}</td><td class="n">${brl(o.valor)}</td><td>${tagOrc(o.status)}${o.motivo ? `<br><small class="mut">${esc(o.motivo)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Sem orçamentos.</p>'}
    ${c.contatos.length ? `<h3 style="margin:16px 0 6px;font-size:14px">Contatos registrados</h3>${c.contatos.map((t) => `<p style="margin:4px 0;font-size:13px"><span class="mut">${dataBR(t.criado_em.slice(0, 10))} · ${esc(t.usuario_nome || '')}</span> ${esc(t.nota || 'Contato feito')}</p>`).join('')}` : ''}
    <div class="modal-acoes"><button class="sec" id="ed">Editar ficha</button><span style="flex:1"></span><button class="sec" id="x">Fechar</button><button id="no">Novo orçamento</button></div>`, 620);
  m.el.querySelector('#x').onclick = m.fechar;
  m.el.querySelector('#no').onclick = () => { m.fechar(); novoOrcamento(depois, c); };
  m.el.querySelector('#ed').onclick = () => {
    m.fechar();
    const e = modal(`<h2>Editar ficha</h2><form class="form" id="fe" style="margin-top:14px">
      <div class="larg"><label>Nome</label><input name="nome" value="${esc(c.nome)}" required></div><div><label>Telefone</label><input name="telefone" value="${esc(c.telefone || '')}"></div>
      <div><label>E-mail</label><input name="email" type="email" value="${esc(c.email || '')}"></div><div><label>Aniversário</label><input name="aniversario" type="date" value="${esc(c.aniversario || '')}"></div>
      <div><label>Empresa</label><input name="empresa" value="${esc(c.empresa || '')}"></div><div class="cheio"><label>Observação</label><input name="obs" value="${esc(c.obs || '')}"></div></form>
      <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar</button></div>`, 560);
    e.el.querySelector('#x').onclick = e.fechar;
    e.el.querySelector('#ok').onclick = () => acao(async () => { await api(`/api/comercial/clientes/${c.id}`, { method: 'PUT', body: Object.fromEntries(new FormData(e.el.querySelector('#fe'))) }); e.fechar(); await depois(); }, 'Ficha salva');
  };
}

// ---- páginas ----
async function orcamentos() {
  const f = state.filtroOrc || (state.filtroOrc = { status: 'aberto', q: '' });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
  const lista = await api('/api/comercial/orcamentos?' + qs);
  const soma = lista.reduce((a, o) => a + o.valor, 0);
  $app.innerHTML = `<h1>Orçamentos</h1><p class="sub">Registre cada orçamento enviado. O sistema avisa para retomar o contato 3 dias depois.</p>
    <div class="row"><button id="novo">Novo orçamento</button>
      <div><label>Situação</label><select id="fs"><option value="">Todas</option>${Object.entries(STATUS_ORC).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label>Buscar</label><input id="fq" value="${esc(f.q)}" placeholder="Cliente ou nº"></div></div>
    <div class="card">${lista.length ? `<div class="tbl"><table><thead><tr><th>Data</th><th>Cliente</th><th>Produto</th><th class="n">Valor</th><th>Situação</th><th>Próximo aviso</th><th></th></tr></thead><tbody>
      ${lista.map((o) => `<tr><td>${dataBR(o.data)}</td><td><b>${esc(o.cliente_nome)}</b> ${o.cliente_tipo === 'recorrente' ? '<span class="tag">recorrente</span>' : ''}<br><small>${contatoCli(o)}</small></td>
        <td>${esc(o.produto)}${o.numero ? `<br><small class="mut">nº ${esc(o.numero)}</small>` : ''}</td><td class="n">${brl(o.valor)}</td>
        <td>${tagOrc(o.status)}${o.motivo ? `<br><small class="mut">${esc(o.motivo)}</small>` : ''}</td>
        <td>${o.status === 'aberto' ? `<span class="${o.followup_em <= hojeISO() ? 'neg' : ''}">${dataBR(o.followup_em)}</span>${o.qtd_contatos ? `<br><small class="mut">${o.qtd_contatos} contato(s)</small>` : ''}` : '<span class="mut">—</span>'}</td>
        <td class="n" style="white-space:nowrap">${o.status === 'aberto' ? `<button class="mini" data-c="${o.id}">Contato</button> <button class="mini sec" data-e="${o.id}">Encerrar</button>` : `<button class="mini sec" data-r="${o.id}">Reabrir</button>`}
          <button class="mini sec" data-ed="${o.id}">Editar</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">${lista.length} orçamento(s)</td><td class="n">${brl(soma)}</td><td colspan="3"></td></tr></tfoot></table></div>` : '<p class="mut">Nenhum orçamento com este filtro.</p>'}</div>`;
  const recarrega = async () => { await orcamentos(); verificarFollowups(); };
  document.getElementById('novo').onclick = () => novoOrcamento(recarrega);
  document.getElementById('fs').onchange = (e) => { f.status = e.target.value; orcamentos(); };
  let t; document.getElementById('fq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value; orcamentos().then(() => { const i = document.getElementById('fq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350); };
  const achar = (id) => lista.find((o) => o.id === +id);
  $app.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => janelaContato(achar(b.dataset.c), recarrega)));
  $app.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => janelaEncerrar(achar(b.dataset.e), recarrega)));
  $app.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => confirm('Reabrir este orçamento? O aviso volta em 3 dias.') && acao(async () => { await api(`/api/comercial/orcamentos/${b.dataset.r}/status`, { method: 'POST', body: { status: 'aberto' } }); await recarrega(); }, 'Orçamento reaberto')));
  $app.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => {
    const o = achar(b.dataset.ed);
    const m = modal(`<h2>Editar orçamento</h2><p class="legenda">${esc(o.cliente_nome)}</p><form class="form" id="fe" style="margin-top:14px">
      <div><label>Valor (R$)</label><input name="valor" value="${brlInput(o.valor)}" inputmode="decimal" required></div><div><label>Nº do orçamento</label><input name="numero" value="${esc(o.numero || '')}"></div>
      <div class="cheio"><label>Observação</label><input name="obs" value="${esc(o.obs || '')}"></div></form>
      <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar</button></div>`, 520);
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#ok').onclick = () => { const v = Object.fromEntries(new FormData(m.el.querySelector('#fe'))); const valor = paraCentavos(v.valor); if (!(valor >= 0)) return toast('Valor inválido', true); acao(async () => { await api(`/api/comercial/orcamentos/${o.id}`, { method: 'PUT', body: { ...v, valor } }); m.fechar(); await recarrega(); }, 'Orçamento salvo'); };
  }));
}

async function clientes() {
  const q = state.buscaCli || '';
  const lista = await api('/api/comercial/clientes' + (q ? '?q=' + encodeURIComponent(q) : ''));
  $app.innerHTML = `<h1>Clientes</h1><p class="sub">Ficha de cada cliente com o histórico de orçamentos. Quem já comprou aparece como recorrente nos próximos orçamentos.</p>
    <div class="row"><button id="novo">Novo orçamento</button><div><label>Buscar cliente</label><input id="fq" value="${esc(q)}" placeholder="Nome, telefone ou e-mail"></div></div>
    <div class="card">${lista.length ? `<div class="tbl"><table><thead><tr><th>Cliente</th><th>Contato</th><th class="n">Orçamentos</th><th class="n">Comprou</th><th>Último</th></tr></thead><tbody>
      ${lista.map((c) => `<tr class="clicavel" data-id="${c.id}"><td><b>${esc(c.nome)}</b>${c.empresa ? `<br><small class="mut">${esc(c.empresa)}</small>` : ''}</td><td><small>${esc([c.telefone, c.email].filter(Boolean).join(' · ') || '—')}</small></td>
        <td class="n">${c.qtd_orcamentos}</td><td class="n">${brl(c.valor_comprado)}</td><td>${c.ultimo_orcamento ? dataBR(c.ultimo_orcamento) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Nenhum cliente encontrado.</p>'}</div>`;
  const recarrega = () => clientes();
  document.getElementById('novo').onclick = () => novoOrcamento(recarrega);
  let t; document.getElementById('fq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { state.buscaCli = e.target.value; clientes().then(() => { const i = document.getElementById('fq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 350); };
  $app.querySelectorAll('tr.clicavel').forEach((tr) => (tr.onclick = () => fichaCliente(+tr.dataset.id, recarrega)));
}

// ---- painel ao vivo ----
function graficoSerie(serie) {
  const W = 720, H = 190, pl = 8, pb = 24, max = Math.max(...serie.flatMap((s) => [s.orcado, s.vendido]), 1), bw = (W - pl) / serie.length;
  const al = (v) => Math.max(1, ((H - pb - 8) * v) / max);
  return `<svg viewBox="0 0 ${W} ${H}" class="graf" role="img" aria-label="Orçado e vendido nos últimos 12 meses">
    ${serie.map((s, i) => { const x = pl + i * bw; return `<rect x="${x + bw * 0.14}" y="${H - pb - al(s.orcado)}" width="${bw * 0.34}" height="${al(s.orcado)}" rx="2" class="gb-orc"><title>${nomeMes(s.mes)} — orçado ${brl(s.orcado)}</title></rect>
      <rect x="${x + bw * 0.52}" y="${H - pb - al(s.vendido)}" width="${bw * 0.34}" height="${al(s.vendido)}" rx="2" class="gb-ven"><title>${nomeMes(s.mes)} — vendido ${brl(s.vendido)}</title></rect>
      <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" class="gt">${MESES[+s.mes.slice(5) - 1].slice(0, 3)}</text>`; }).join('')}</svg>
    <p class="legenda"><span class="leg orc"></span> Orçado <span class="leg ven" style="margin-left:14px"></span> Vendido (orçamentos ganhos)</p>`;
}
async function aovivo() {
  const d = await api('/api/aovivo');
  const m = d.mes_atual, h = d.dia, c = d.comparativos;
  const conv = m.qtd ? Math.round((m.qtd_ganho / m.qtd) * 100) + '%' : '—';
  const cmp = (rot, a, b) => `<tr><td>${rot}</td><td class="n"><b>${a.fmt}</b></td><td class="n">${b.fmt} ${b.v}</td></tr>`;
  const linha = (rot, campo, f = String) => `<tr><td>${rot}</td>${['mes_atual', 'mes_anterior_parcial', 'mes_anterior_total', 'mesmo_mes_ano_anterior'].map((k, i) => { const o = i === 0 ? m : c[k]; return `<td class="n ${i === 0 ? 'dest' : ''}">${f(o[campo])}${i === 1 ? ' ' + variacao(m[campo], o[campo]) : i === 3 ? ' ' + variacao(m[campo], o[campo]) : ''}</td>`; }).join('')}</tr>`;
  const linhaP = (rot, campo, f = String) => `<tr><td>${rot}</td>${[['semestre', 'semestre_anterior'], ['ano', 'ano_anterior']].map(([a, b]) => `<td class="n dest">${f(c[a][campo])}</td><td class="n">${f(c[b][campo])} ${variacao(c[a][campo], c[b][campo])}</td>`).join('')}</tr>`;
  const maxP = Math.max(...d.produtos.map((p) => p.valor_orcado), 1);
  $app.innerHTML = `<div class="topo-vivo"><div><h1>Ao vivo — comercial</h1><p class="sub">${nomeMes(d.mes)} · atualizado às ${d.atualizado_em.slice(11, 19)} (renova sozinho a cada 30 segundos)</p></div>
      <div class="row" style="margin:0"><button class="mini sec" id="att">${ico('refresh')} Atualizar</button><button class="mini sec" id="tv">Tela cheia</button></div></div>
    ${d.followups_pendentes && temArea('comercial') ? `<div class="aviso-box">${ico('info')}<span><b>${d.followups_pendentes} orçamento(s)</b> aguardando retorno do comercial. <a href="#orcamentos">Abrir orçamentos</a></span></div>` : ''}
    <div class="grid">
      <div class="card kpi"><div class="l">Hoje — orçamentos</div><div class="v">${h.qtd}</div><small class="mut">${brl(h.valor)} orçados</small></div>
      <div class="card kpi"><div class="l">Hoje — vendido</div><div class="v">${brl(h.valor_ganho)}</div><small class="mut">${h.qtd_ganho} venda(s)</small></div>
      <div class="card kpi"><div class="l">No mês — orçado</div><div class="v">${brl(m.valor)}</div><small class="mut">${m.qtd} orçamento(s)</small></div>
      <div class="card kpi"><div class="l">No mês — vendido</div><div class="v">${brl(m.valor_ganho)}</div><small class="mut">${m.qtd_ganho} venda(s) · conversão ${conv}</small></div>
      <div class="card kpi"><div class="l">Em aberto agora</div><div class="v">${brl(d.em_aberto.valor)}</div><small class="mut">${d.em_aberto.qtd} orçamento(s)</small></div>
    </div>
    <div class="grid2">
      <div class="card"><h2>Clientes do mês</h2>
        <div class="mk-grade"><div><div class="mut">Novos</div><div class="grande">${m.clientes_novos}</div></div><div><div class="mut">Recorrentes</div><div class="grande">${m.clientes_recorrentes}</div></div>
          <div><div class="mut">Orçamentos revisitados</div><div class="grande">${m.revisitados}</div></div></div>
        <p class="legenda" style="margin-top:10px">Revisitado = orçamento em que o comercial registrou um novo contato no mês.</p></div>
      <div class="card"><h2>Perdidos e cancelados no mês</h2>
        <div class="mk-grade"><div><div class="mut">Perdidos</div><div class="grande">${m.qtd_perdido}</div><small class="mut">${brl(m.valor_perdido)}</small></div><div><div class="mut">Cancelados</div><div class="grande">${m.qtd_cancelado}</div><small class="mut">${brl(m.valor_cancelado)}</small></div></div>
        ${d.motivos.length ? `<div style="margin-top:12px">${d.motivos.map((x) => `<p style="margin:4px 0;font-size:13px"><span class="tag ${x.status === 'perdido' ? 'ruim' : 'aviso'}">${STATUS_ORC[x.status]}</span> ${esc(x.motivo || 'sem motivo')} <span class="mut">— ${x.qtd}x · ${brl(x.valor)}</span></p>`).join('')}</div>` : '<p class="mut" style="margin-top:10px">Nenhum no mês.</p>'}</div></div>
    <div class="card"><h2>Produtos mais orçados no mês</h2>${d.produtos.length ? d.produtos.map((p) => `<div class="barra"><span class="nome" title="${esc(p.nome)}">${esc(p.nome)}</span><span class="trilho"><span class="fill" style="display:block;width:${(p.valor_orcado / maxP) * 100}%"></span></span><span class="val">${brl(p.valor_orcado)}</span><span class="val mut" style="width:90px">${p.qtd}x · ${p.qtd_ganho} vend.</span></div>`).join('') : '<p class="mut">Sem orçamentos no mês.</p>'}</div>
    <div class="card"><h2>Comparativo do mês</h2><div class="tbl"><table><thead><tr><th></th><th class="n">${nomeMes(d.mes)} (até hoje)</th><th class="n">Mês anterior (mesmo período)</th><th class="n">Mês anterior (inteiro)</th><th class="n">Mesmo mês, ano passado</th></tr></thead><tbody>
      ${linha('Orçamentos', 'qtd')}${linha('Valor orçado', 'valor', brl)}${linha('Vendas (qtd)', 'qtd_ganho')}${linha('Valor vendido', 'valor_ganho', brl)}${linha('Clientes novos', 'clientes_novos')}${linha('Clientes recorrentes', 'clientes_recorrentes')}${linha('Perdidos', 'qtd_perdido')}${linha('Cancelados', 'qtd_cancelado')}
      </tbody></table></div></div>
    <div class="card"><h2>Semestre e ano</h2><div class="tbl"><table><thead><tr><th></th><th class="n">Semestre atual</th><th class="n">Semestre anterior</th><th class="n">${c.ano.rotulo} (até hoje)</th><th class="n">${c.ano_anterior.rotulo} (inteiro)</th></tr></thead><tbody>
      ${linhaP('Orçamentos', 'qtd')}${linhaP('Valor orçado', 'valor', brl)}${linhaP('Valor vendido', 'valor_ganho', brl)}${linhaP('Clientes novos', 'clientes_novos')}
      </tbody></table></div><p class="legenda" style="margin-top:8px">O percentual compara a coluna anterior com o período atual (verde: acima; vermelho: abaixo).</p></div>
    <div class="card"><h2>Últimos 12 meses</h2>${graficoSerie(d.serie)}</div>
    <div class="card"><h2>Orçamentos de hoje</h2>${d.recentes.length ? `<div class="tbl"><table><tbody>${d.recentes.map((o) => `<tr><td>${esc(o.cliente_nome)} ${o.cliente_tipo === 'recorrente' ? '<span class="tag">recorrente</span>' : '<span class="tag com_nota">novo</span>'}</td><td>${esc(o.produto)}</td><td class="n">${brl(o.valor)}</td><td>${tagOrc(o.status)}</td><td class="mut">${esc(o.criado_por_nome || '')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Nenhum orçamento lançado hoje ainda.</p>'}</div>`;
  document.getElementById('att').onclick = () => aovivo();
  document.getElementById('tv').onclick = () => { document.body.classList.toggle('modo-tv'); document.documentElement.requestFullscreen?.().catch(() => {}); };
  clearInterval(state.timerVivo);
  state.timerVivo = setInterval(() => { if (location.hash === '#aovivo' && !document.querySelector('.modal-fundo') && !document.hidden) aovivo().catch(() => {}); else if (location.hash !== '#aovivo') clearInterval(state.timerVivo); }, 30000);
}

// =====================================================================
// DEPARTAMENTO DE PESSOAS: fichas dos funcionários e controle de ausências
// =====================================================================
const DIAS_SEM = [['1', 'Seg'], ['2', 'Ter'], ['3', 'Qua'], ['4', 'Qui'], ['5', 'Sex'], ['6', 'Sáb'], ['0', 'Dom']];
const campo = (rot, nome, v, tipo = 'text', extra = '') => `<div ${extra}><label>${rot}</label><input name="${nome}" type="${tipo}" value="${esc(v ?? '')}"></div>`;
const seletor = (rot, nome, lista, v) => `<div><label>${rot}</label><select name="${nome}">${Object.entries(lista).map(([k, t]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
const tagAus = (t) => `<span class="tag ${{ falta: 'ruim', atestado: 'aviso', ferias: 'ok' }[t] || ''}">${esc(state.dp.meta.tipos_ausencia[t])}</span>`;
const periodoAus = (a) => (a.data_inicio === a.data_fim ? dataBR(a.data_inicio) : `${dataBR(a.data_inicio)} a ${dataBR(a.data_fim)}`);
const linkAnexo = (a) => (a.anexo_nome ? `<a href="/api/dp/ausencias/${a.id}/anexo" target="_blank" rel="noopener">${esc(a.anexo_nome)}</a>` : '<span class="mut">sem anexo</span>');

async function dp() {
  state.dp = state.dp || { aba: 'equipe', todos: false };
  if (!state.dp.meta) state.dp.meta = await api('/api/dp/meta');
  const mesSel = state.mes;
  const [res, funcs, aus] = await Promise.all([api(`/api/dp/resumo/${mesSel}`), api(`/api/dp/funcionarios${state.dp.todos ? '?todos=1' : ''}`), api(`/api/dp/ausencias/${mesSel}`)]);
  const aba = state.dp.aba, M = state.dp.meta;
  const horario = (f) => (f.jornada_entrada ? `${f.jornada_entrada}–${f.jornada_saida}${f.jornada_horas ? ` · ${String(f.jornada_horas).replace('.', ',')} h/dia` : ''}` : '<span class="mut">não informado</span>');
  $app.innerHTML = `<h1>Departamento de Pessoas</h1>
    <p class="sub">Ficha de cada funcionário e controle de faltas, atestados e férias. Acesso só do administrador (dados pessoais e de saúde).</p>
    <div class="grid">
      <div class="card kpi"><div class="l">Funcionários ativos</div><div class="v">${res.ativos}</div></div>
      <div class="card kpi"><div class="l">Fora hoje</div><div class="v">${res.fora_hoje.length}</div><small class="mut">${esc(res.fora_hoje.map((x) => `${x.nome} (${M.tipos_ausencia[x.tipo].toLowerCase()})`).join(', ') || 'todos presentes')}</small></div>
      <div class="card kpi"><div class="l">Fichas incompletas</div><div class="v">${res.fichas_incompletas.length}</div><small class="mut">dados que ainda faltam</small></div>
      <div class="card kpi"><div class="l">Aniversariantes de ${MESES[+mesSel.slice(5) - 1].toLowerCase()}</div><div class="v">${res.aniversarios.length}</div><small class="mut">${esc(res.aniversarios.map((a) => `${a.nome} (${a.dia})`).join(', ') || '—')}</small></div>
    </div>
    ${res.aso_vencendo.length ? `<div class="aviso-box">${ico('info')}<span>Exame ocupacional (ASO) ${res.aso_vencendo.some((a) => a.vencido) ? 'vencido ou ' : ''}vencendo em até 30 dias: ${esc(res.aso_vencendo.map((a) => `${a.nome} (${dataBR(a.validade)})`).join(', '))}.</span></div>` : ''}
    <div class="abas"><button class="${aba === 'equipe' ? 'on' : 'sec'}" data-aba="equipe">Equipe</button><button class="${aba === 'ausencias' ? 'on' : 'sec'}" data-aba="ausencias">Faltas e atestados</button></div>
    ${aba === 'equipe' ? `<div class="row"><button id="novo">Novo funcionário</button><label class="chk"><input type="checkbox" id="todos" ${state.dp.todos ? 'checked' : ''}> mostrar desligados</label></div>
      <div class="card"><div class="tbl"><table><thead><tr><th>Funcionário</th><th>Vínculo</th><th>Contato</th><th>Horário</th><th>Admissão</th><th>Ficha</th></tr></thead><tbody>
      ${funcs.map((f) => `<tr class="clicavel" data-id="${f.id}"><td><b>${esc(f.nome)}</b>${f.ativo ? '' : ' <span class="tag">desligado</span>'}<br><small class="mut">${esc(f.cargo || '')}</small></td>
        <td>${esc(M.regimes[f.regime])}<br><small class="mut">${esc(M.vinculos[f.vinculo])}</small></td><td><small>${esc([f.telefone, f.email].filter(Boolean).join(' · ') || '—')}</small></td>
        <td><small>${horario(f)}</small></td><td>${f.data_admissao ? dataBR(f.data_admissao) : '<span class="mut">—</span>'}</td>
        <td>${f.pendencias.length ? `<span class="tag aviso" title="${esc(f.pendencias.join(', '))}">faltam ${f.pendencias.length}</span>` : '<span class="tag ok">completa</span>'}</td></tr>`).join('')}</tbody></table></div>
        <p class="legenda" style="margin-top:10px">Clique em um funcionário para abrir e preencher a ficha. As fichas foram criadas a partir de quem já estava cadastrado; a foto entra depois.</p></div>`
    : `<div class="row">${seletorMes()}<button id="nova-aus">Registrar ausência</button></div>
      <div class="card"><h2>Ausências em ${nomeMes(mesSel)}</h2>${aus.length ? `<div class="tbl"><table><thead><tr><th>Funcionário</th><th>Tipo</th><th>Período</th><th class="n">Dias úteis</th><th>Anexo</th><th></th></tr></thead><tbody>
        ${aus.map((a) => `<tr><td><b>${esc(a.funcionario_nome)}</b>${a.obs ? `<br><small class="mut">${esc(a.obs)}</small>` : ''}</td><td>${tagAus(a.tipo)} ${a.justificada ? '' : '<span class="tag ruim">injustificada</span>'}</td><td>${periodoAus(a)}</td>
          <td class="n">${a.dias_uteis}</td><td>${linkAnexo(a)}</td><td class="n"><button class="mini sec" data-del="${a.id}">excluir</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Nenhuma ausência neste mês.</p>'}</div>
      <div class="card"><h2>Resumo por pessoa — ${nomeMes(mesSel)}</h2><div class="tbl"><table><thead><tr><th>Funcionário</th><th class="n">Faltas</th><th class="n">Atestados</th><th class="n">Férias/licença</th><th class="n">Folgas</th><th class="n">Atrasos</th><th class="n">Dias fora</th><th class="n">Horas fora</th></tr></thead><tbody>
        ${res.por_pessoa.map((p) => `<tr><td>${esc(p.nome)}</td><td class="n">${p.falta || '—'}</td><td class="n">${p.atestado || '—'}</td><td class="n">${p.ferias + p.licenca || '—'}</td><td class="n">${p.folga || '—'}</td><td class="n">${p.atraso || '—'}</td><td class="n"><b>${p.dias || '—'}</b></td><td class="n">${p.horas ?? '<span class="mut">sem horário</span>'}</td></tr>`).join('')}</tbody></table></div>
        <p class="legenda" style="margin-top:8px">Só contam os dias em que a pessoa trabalharia (conforme os dias da semana da ficha). As horas usam a jornada diária informada na ficha.</p></div>`}`;
  const recarrega = () => dp();
  $app.querySelectorAll('[data-aba]').forEach((b) => (b.onclick = () => { state.dp.aba = b.dataset.aba; dp(); }));
  document.getElementById('novo')?.addEventListener('click', () => fichaFuncionario(null, recarrega));
  document.getElementById('todos')?.addEventListener('change', (e) => { state.dp.todos = e.target.checked; dp(); });
  $app.querySelectorAll('tr.clicavel').forEach((tr) => (tr.onclick = () => fichaFuncionario(+tr.dataset.id, recarrega)));
  if (aba === 'ausencias') {
    ligaMes(dp);
    document.getElementById('nova-aus').onclick = () => janelaAusencia(funcs.filter((f) => f.ativo), null, recarrega);
    $app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => confirm('Excluir esta ausência (e o anexo)?') && acao(async () => { await api(`/api/dp/ausencias/${b.dataset.del}`, { method: 'DELETE' }); await dp(); }, 'Ausência excluída')));
  }
}

function janelaAusencia(funcs, funcId, depois) {
  const M = state.dp.meta;
  const m = modal(`<h2>Registrar ausência</h2><form class="form" id="fa" style="margin-top:14px">
    <div class="larg"><label>Funcionário</label><select name="funcionario_id">${funcs.map((f) => `<option value="${f.id}" ${f.id === funcId ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></div>
    ${seletor('Tipo', 'tipo', M.tipos_ausencia, 'atestado')}
    ${campo('De', 'data_inicio', hojeISO(), 'date')}${campo('Até (deixe igual se for 1 dia)', 'data_fim', hojeISO(), 'date')}
    <div class="cheio"><label class="chk"><input type="checkbox" name="justificada" checked> Justificada (atestado, férias, acordo com a empresa)</label></div>
    <div class="cheio"><label>Observação</label><input name="obs" placeholder="Ex.: CID não informado, retorno dia 10"></div>
    <div class="cheio"><label>Anexar atestado (PDF, JPG ou PNG, até 3 MB)</label><input type="file" name="arq" accept="application/pdf,image/jpeg,image/png"></div></form>
    <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Registrar</button></div>`, 560);
  m.el.querySelector('#x').onclick = m.fechar;
  m.el.querySelector('#ok').onclick = () => acao(async () => {
    const f = m.el.querySelector('#fa'), v = Object.fromEntries(new FormData(f)), arq = f.arq.files[0];
    if (arq && arq.size > 3 * 1024 * 1024) throw new Error('O arquivo passa de 3 MB.');
    const corpo = { funcionario_id: +v.funcionario_id, tipo: v.tipo, data_inicio: v.data_inicio, data_fim: v.data_fim || v.data_inicio, justificada: f.justificada.checked, obs: v.obs };
    if (arq) corpo.anexo = { nome: arq.name, base64: await lerBase64(arq) };
    await api('/api/dp/ausencias', { method: 'POST', body: corpo });
    m.fechar(); await depois();
  }, 'Ausência registrada');
}

async function fichaFuncionario(id, depois) {
  const M = state.dp.meta;
  const f = id ? await api(`/api/dp/funcionarios/${id}`) : { regime: 'a_verificar', vinculo: 'a_verificar', dias_trabalho: '1,2,3,4,5', ausencias: [], pendencias: [], ativo: 1 };
  const dias = new Set(String(f.dias_trabalho).split(','));
  const sec = (t, conteudo) => `<fieldset class="ficha-sec"><legend>${t}</legend><div class="form">${conteudo}</div></fieldset>`;
  const m = modal(`<h2>${id ? esc(f.nome) : 'Novo funcionário'}</h2>
    ${f.pendencias.length ? `<p class="legenda">Falta preencher: ${esc(f.pendencias.join(', '))}.</p>` : ''}
    <form id="ff" autocomplete="off">
    ${sec('Dados pessoais', `${campo('Nome completo', 'nome', f.nome, 'text', 'class="larg"')}${campo('Apelido', 'apelido', f.apelido)}${campo('Nascimento', 'data_nascimento', f.data_nascimento, 'date')}
      ${seletor('Sexo', 'sexo', { '': '—', feminino: 'Feminino', masculino: 'Masculino', outro: 'Outro' }, f.sexo || '')}${seletor('Estado civil', 'estado_civil', { '': '—', solteiro: 'Solteiro(a)', casado: 'Casado(a)', uniao: 'União estável', divorciado: 'Divorciado(a)', viuvo: 'Viúvo(a)' }, f.estado_civil || '')}
      ${campo('Nacionalidade', 'nacionalidade', f.nacionalidade)}${campo('Naturalidade', 'naturalidade', f.naturalidade)}${campo('Escolaridade', 'escolaridade', f.escolaridade)}
      ${campo('Nome da mãe', 'nome_mae', f.nome_mae)}${campo('Nome do pai', 'nome_pai', f.nome_pai)}${campo('Dependentes', 'dependentes', f.dependentes, 'text', 'class="cheio"')}`)}
    ${sec('Documentos', `${campo('CPF', 'cpf', f.cpf)}${campo('RG', 'rg', f.rg)}${campo('Órgão emissor', 'rg_orgao', f.rg_orgao)}${campo('Título de eleitor', 'titulo_eleitor', f.titulo_eleitor)}${campo('CNH', 'cnh', f.cnh)}${campo('PIS/PASEP', 'pis', f.pis)}`)}
    ${sec('Carteira de trabalho (CTPS)', `${campo('Número', 'ctps_numero', f.ctps_numero)}${campo('Série', 'ctps_serie', f.ctps_serie)}${campo('UF', 'ctps_uf', f.ctps_uf)}${campo('Emissão', 'ctps_emissao', f.ctps_emissao, 'date')}`)}
    ${sec('Contato e endereço', `${campo('Telefone', 'telefone', f.telefone, 'tel')}${campo('E-mail', 'email', f.email, 'email')}${campo('CEP', 'cep', f.cep)}${campo('Endereço', 'endereco', f.endereco, 'text', 'class="larg"')}${campo('Número', 'numero', f.numero)}${campo('Complemento', 'complemento', f.complemento)}${campo('Bairro', 'bairro', f.bairro)}${campo('Cidade', 'cidade', f.cidade)}${campo('UF', 'uf', f.uf)}`)}
    ${sec('Emergência e saúde', `${campo('Contato de emergência', 'emergencia_nome', f.emergencia_nome)}${campo('Parentesco', 'emergencia_parentesco', f.emergencia_parentesco)}${campo('Telefone de emergência', 'emergencia_telefone', f.emergencia_telefone, 'tel')}
      ${campo('Plano de saúde', 'plano_saude', f.plano_saude)}${campo('Nº da carteirinha', 'plano_saude_numero', f.plano_saude_numero)}${seletor('Tipo sanguíneo', 'tipo_sanguineo', { '': '—', ...Object.fromEntries(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((t) => [t, t])) }, f.tipo_sanguineo || '')}
      ${campo('Alergias / observações de saúde', 'alergias', f.alergias, 'text', 'class="cheio"')}${campo('ASO admissional', 'aso_admissional', f.aso_admissional, 'date')}${campo('Validade do ASO', 'aso_validade', f.aso_validade, 'date')}`)}
    ${sec('Contrato e jornada', `${campo('Cargo / função', 'cargo', f.cargo)}${campo('Setor', 'setor', f.setor)}${seletor('Regime', 'regime', M.regimes, f.regime)}${seletor('Registrado em', 'vinculo', M.vinculos, f.vinculo)}
      ${campo('Admissão', 'data_admissao', f.data_admissao, 'date')}${campo('Desligamento', 'data_demissao', f.data_demissao, 'date')}${campo('Salário (R$)', 'salario', f.salario != null ? brlInput(f.salario) : '', 'text')}
      ${campo('Entrada', 'jornada_entrada', f.jornada_entrada, 'time')}${campo('Saída', 'jornada_saida', f.jornada_saida, 'time')}${campo('Intervalo (min)', 'jornada_intervalo_min', f.jornada_intervalo_min, 'number')}
      <div class="cheio"><label>Dias de trabalho</label><div class="dias">${DIAS_SEM.map(([v, n]) => `<label class="chk"><input type="checkbox" name="dia" value="${v}" ${dias.has(v) ? 'checked' : ''}> ${n}</label>`).join('')}</div></div>
      ${campo('Vale-transporte', 'vale_transporte', f.vale_transporte)}${campo('Tamanho do uniforme', 'tamanho_uniforme', f.tamanho_uniforme)}`)}
    ${sec('Pagamento', `${campo('Banco', 'banco', f.banco)}${campo('Agência', 'agencia', f.agencia)}${campo('Conta', 'conta', f.conta)}${campo('Chave PIX', 'pix', f.pix)}`)}
    ${sec('Observações', `${campo('Observações', 'obs', f.obs, 'text', 'class="cheio"')}<div class="cheio"><label class="chk"><input type="checkbox" name="ativo" ${f.ativo ? 'checked' : ''}> Funcionário ativo (desmarque ao desligar)</label></div>`)}</form>
    ${id ? `<h3 style="margin:16px 0 6px;font-size:14px">Ausências</h3>${f.ausencias.length ? `<div class="tbl"><table><tbody>${f.ausencias.map((a) => `<tr><td>${tagAus(a.tipo)}</td><td>${periodoAus(a)}</td><td class="n">${a.dias_uteis} dia(s)</td><td>${linkAnexo(a)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Nenhuma ausência registrada.</p>'}` : ''}
    <div class="modal-acoes">${id ? '<button class="sec" id="aus">Registrar ausência</button>' : ''}<span style="flex:1"></span><button class="sec" id="x">Fechar</button><button id="ok">Salvar ficha</button></div>`, 760);
  m.el.querySelector('#x').onclick = m.fechar;
  if (id) m.el.querySelector('#aus').onclick = () => { m.fechar(); janelaAusencia([f], f.id, depois); };
  m.el.querySelector('#ok').onclick = () => acao(async () => {
    const form = m.el.querySelector('#ff'), v = Object.fromEntries(new FormData(form));
    const corpo = { ...v, dias_trabalho: [...form.querySelectorAll('[name=dia]:checked')].map((c) => c.value), ativo: form.ativo.checked };
    delete corpo.dia;
    if (v.salario) { corpo.salario = paraCentavos(v.salario); if (!(corpo.salario >= 0)) throw new Error('Salário inválido'); } else corpo.salario = null;
    await api(id ? `/api/dp/funcionarios/${id}` : '/api/dp/funcionarios', { method: id ? 'PUT' : 'POST', body: corpo });
    m.fechar(); await depois();
  }, 'Ficha salva');
}

// ---- painel comercial: resumo de tudo o que o time comercial usa ----
async function comercial() {
  const d = await api('/api/comercial/painel');
  const m = d.mes_atual, h = d.dia;
  const conv = m.qtd ? Math.round((m.qtd_ganho / m.qtd) * 100) + '%' : '—';
  const linhaOrc = (o, acoes) => `<div class="fu-item" data-id="${o.id}"><div><b>${esc(o.cliente_nome)}</b> <span class="mut">· ${esc(o.produto)} · ${brl(o.valor)}</span><br>
    <small class="mut">Orçamento de ${dataBR(o.data)} · retorno ${o.followup_em <= d.hoje ? 'desde' : 'em'} ${dataBR(o.followup_em)}${o.qtd_contatos ? ` · ${o.qtd_contatos} contato(s)` : ''}</small><br><small>${contatoCli(o)}</small></div>
    ${acoes ? '<div class="fu-acoes"><button class="mini" data-a="contato">Registrar contato</button><button class="mini sec" data-a="encerrar">Encerrar</button></div>' : ''}</div>`;
  $app.innerHTML = `<div class="topo-vivo"><div><h1>Painel comercial</h1><p class="sub">Resumo do time comercial em ${nomeMes(d.mes)} · atualizado às ${d.atualizado_em.slice(11, 16)}</p></div>
      <div class="row" style="margin:0"><button id="novo">Novo orçamento</button><a href="#aovivo" class="mini sec" style="padding:9px 14px;border:1px solid var(--bd2);border-radius:8px;text-decoration:none">Ver ao vivo completo</a></div></div>
    <div class="grid">
      <div class="card kpi"><div class="l">Retornos pendentes</div><div class="v">${d.retornos.length}</div><small class="mut">orçamentos esperando contato</small></div>
      <div class="card kpi"><div class="l">Hoje — orçamentos</div><div class="v">${h.qtd}</div><small class="mut">${brl(h.valor)} orçados</small></div>
      <div class="card kpi"><div class="l">No mês — orçado</div><div class="v">${brl(m.valor)}</div><small class="mut">${m.qtd} orçamento(s)</small></div>
      <div class="card kpi"><div class="l">No mês — vendido</div><div class="v">${brl(m.valor_ganho)}</div><small class="mut">${m.qtd_ganho} venda(s) · conversão ${conv}</small></div>
      <div class="card kpi"><div class="l">Em aberto</div><div class="v">${brl(d.em_aberto.valor)}</div><small class="mut">${d.em_aberto.qtd} orçamento(s)</small></div>
    </div>
    <div class="card"><h2>Retornos pendentes</h2>${d.retornos.length ? `<div class="fu-lista" style="max-height:none">${d.retornos.map((o) => linhaOrc(o, true)).join('')}</div>` : '<p class="mut">Nenhum retorno pendente. Tudo em dia.</p>'}</div>
    <div class="grid2">
      <div class="card"><h2>Próximos retornos (7 dias)</h2>${d.proximos_retornos.length ? d.proximos_retornos.map((o) => `<p style="margin:7px 0;font-size:13.5px"><b>${dataBR(o.followup_em).slice(0, 5)}</b> · ${esc(o.cliente_nome)} <span class="mut">· ${esc(o.produto)} · ${brl(o.valor)}</span></p>`).join('') : '<p class="mut">Nada agendado para os próximos dias.</p>'}</div>
      <div class="card"><h2>Aniversários de clientes (30 dias)</h2>${d.aniversarios.length ? d.aniversarios.map((c) => `<p style="margin:7px 0;font-size:13.5px"><b>${dataBR(c.data).slice(0, 5)}</b> · ${esc(c.nome)} <span class="mut">${esc(c.telefone || '')}</span></p>`).join('') : '<p class="mut">Nenhum aniversário nos próximos 30 dias.</p>'}</div>
    </div>
    <div class="card"><h2>Orçamentos de hoje</h2>${d.orcamentos_hoje.length ? `<div class="tbl"><table><tbody>${d.orcamentos_hoje.map((o) => `<tr><td>${esc(o.cliente_nome)} ${o.cliente_tipo === 'recorrente' ? '<span class="tag">recorrente</span>' : '<span class="tag com_nota">novo</span>'}</td><td>${esc(o.produto)}</td><td class="n">${brl(o.valor)}</td><td>${tagOrc(o.status)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="mut">Nenhum orçamento lançado hoje ainda.</p>'}</div>`;
  const recarrega = async () => { await comercial(); verificarFollowups(); };
  document.getElementById('novo').onclick = () => novoOrcamento(recarrega);
  $app.querySelectorAll('.fu-item').forEach((el) => {
    const o = d.retornos.find((x) => x.id === +el.dataset.id); if (!o) return;
    el.querySelector('[data-a=contato]').onclick = () => janelaContato(o, recarrega);
    el.querySelector('[data-a=encerrar]').onclick = () => janelaEncerrar(o, recarrega);
  });
}

rota();
