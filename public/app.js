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
const ico = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONES[n]}</svg>`;
const NIVEL = { leitor: 1, operador: 2, admin: 3 };
const PAPEL_NOME = { admin: 'Administrador', operador: 'Operador', leitor: 'Somente leitura' };
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
async function sair() { await api('/api/auth/logout', { method: 'POST' }); state.usuario = null; state.meta = null; telaLogin(); }
function trocarSenha() {
  const atual = prompt('Senha atual:'); if (atual === null) return;
  const nova = prompt('Nova senha (mínimo 8 caracteres):'); if (nova === null) return;
  acao(() => api('/api/auth/senha', { method: 'POST', body: { atual, nova } }), 'Senha alterada');
}
document.getElementById('sair').onclick = sair;
document.getElementById('senha').onclick = trocarSenha;

// ---------- roteamento ----------
const rotas = { painel, lancar, fechar, extratos, mensal, fluxo, cadastros, roadmap };
async function rota() {
  if (!state.usuario) {
    let e;
    try { e = await api('/api/auth/estado'); } catch (err) { $app.innerHTML = `<div class="card login"><h1>Caixa OnTrade</h1><p class="neg">${esc(err.message)}</p></div>`; document.body.classList.add('deslogado'); return; }
    if (!e.usuario) return telaLogin(e);
    state.usuario = e.usuario;
  }
  document.body.classList.remove('deslogado');
  document.getElementById('quem').innerHTML = `<b>${esc(state.usuario.nome)}</b><br><small>${PAPEL_NOME[state.usuario.papel]}</small>`;
  const nome = location.hash.slice(1) || 'painel';
  document.querySelectorAll('#menu a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + nome));
  if (!state.meta) {
    state.meta = await api('/api/meta');
    state.dia = state.dia || state.meta.hoje;
    state.mes = state.mes || state.meta.hoje.slice(0, 7);
  }
  try { await (rotas[nome] || painel)(); } catch (e) { $app.innerHTML = `<div class="card neg">Erro: ${esc(e.message)}</div>`; }
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
      ${dia.lancamentos.length ? `<div class="tbl"><table><thead><tr><th>Tipo</th><th>Conta</th><th>Categoria / pessoa</th><th>Descrição</th><th class="n">Valor</th><th></th></tr></thead><tbody>
      ${dia.lancamentos.map((l) => `<tr><td>${{ entrada: '<span class="pos">Entrada</span>', saida: '<span class="neg">Saída</span>', transferencia: 'Transf.' }[l.tipo]}</td><td>${esc(l.conta)}${l.conta_destino ? ' → ' + esc(l.conta_destino) : ''}<br><span class="tag ${l.modalidade}">${l.modalidade === 'com_nota' ? 'com nota' : 'sem nota'}</span> <small class="mut">${esc(l.empresa)}</small></td><td>${esc(l.categoria || '')}${l.pessoa ? '<br><small class="mut">' + esc(l.pessoa) + '</small>' : ''}${l.cliente ? '<br><small class="mut">cliente: ' + esc(l.cliente) + '</small>' : ''}</td><td>${esc(l.descricao || '')}</td><td class="n ${l.tipo === 'saida' ? 'neg' : l.tipo === 'entrada' ? 'pos' : ''}">${brl(l.valor)}</td><td class="n">${fechado || !pode('operador') ? '' : `<button class="mini sec" data-del="${l.id}">excluir</button>`}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="4">Entradas ${brl(dia.totais.entradas)} · Saídas ${brl(dia.totais.saidas)}</td><td class="n">${brl(dia.totais.entradas - dia.totais.saidas)}</td><td></td></tr></tfoot></table></div>` : '<p class="mut">Nada lançado neste dia.</p>'}
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
    acao(async () => { await api(`/api/dia/${state.dia}/fechar`, { method: 'POST', body: { contagens, obs: document.getElementById('obs').value } }); fechar(); }, 'Caixa fechado!');
  });
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
      <p class="legenda"><b>Administrador:</b> tudo, inclusive cadastros, usuários e reabrir dia. <b>Operador:</b> lança, exclui lançamentos e fecha o dia. <b>Somente leitura:</b> consulta e baixa Excel (ideal para o contador).</p>
      <div class="tbl"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Último acesso</th><th></th></tr></thead><tbody>
      ${usuarios.map((u) => `<tr style="${u.ativo ? '' : 'opacity:.5'}"><td>${esc(u.nome)}</td><td>${esc(u.email)}</td>
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

rota();
