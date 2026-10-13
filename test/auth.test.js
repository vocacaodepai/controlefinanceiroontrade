import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { app } = await import('../src/app.js');
const servidor = app.listen(0);
await new Promise((r) => (servidor.listening ? r() : servidor.once('listening', r)));
const base = `http://127.0.0.1:${servidor.address().port}`;
after(() => servidor.close());

async function chamar(metodo, url, body, cookie) {
  const r = await fetch(base + url, { method: metodo, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = r.headers.get('set-cookie');
  return { status: r.status, json: r.status === 204 ? null : await r.json().catch(() => null), cookie: set?.split(';')[0] };
}

let admin, operador, leitor;

test('sem login nada é acessível', async () => {
  assert.equal((await chamar('GET', '/api/meta')).status, 401);
  assert.equal((await chamar('GET', '/api/export/mes/2026-01')).status, 401);
  assert.equal((await chamar('POST', '/api/lancamentos', {})).status, 401);
  assert.equal((await chamar('GET', '/api/usuarios')).status, 401);
  const e = await chamar('GET', '/api/auth/estado');
  assert.equal(e.json.precisaCriarAdmin, true);
});

test('primeiro acesso cria o admin uma única vez', async () => {
  assert.equal((await chamar('POST', '/api/auth/setup', { nome: 'Elisa', email: 'e@x.com', senha: 'curta' })).status, 400);
  const r = await chamar('POST', '/api/auth/setup', { nome: 'Elisa', email: 'E@x.com', senha: 'senha-forte-1' });
  assert.equal(r.status, 201);
  admin = r.cookie;
  assert.match(admin, /^sid=[a-f0-9]{64}$/);
  assert.equal((await chamar('POST', '/api/auth/setup', { nome: 'Outro', email: 'o@x.com', senha: 'senha-forte-2' })).status, 409);
});

test('perfis: operador lança mas não configura; leitor só consulta', async () => {
  for (const [nome, email, papel] of [['Op', 'op@x.com', 'operador'], ['Contador', 'c@x.com', 'leitor']]) {
    assert.equal((await chamar('POST', '/api/usuarios', { nome, email, senha: 'senha-forte-3', papel }, admin)).status, 201);
  }
  operador = (await chamar('POST', '/api/auth/login', { email: 'op@x.com', senha: 'senha-forte-3' })).cookie;
  leitor = (await chamar('POST', '/api/auth/login', { email: 'c@x.com', senha: 'senha-forte-3' })).cookie;

  const lanc = { data: '2026-05-04', tipo: 'saida', valor: 1500, conta_id: 3, categoria_id: 9, criado_por: 'Fulano falso' };
  const ok = await chamar('POST', '/api/lancamentos', lanc, operador);
  assert.equal(ok.status, 201);
  assert.equal(ok.json.criado_por, 'Op', 'o autor vem do login, não do corpo da requisição');
  assert.equal((await chamar('POST', '/api/lancamentos', lanc, leitor)).status, 403);
  assert.equal((await chamar('GET', '/api/painel/2026-05', null, leitor)).status, 200);
  assert.equal((await chamar('GET', '/api/export/mes/2026-05', null, leitor)).status, 200);

  assert.equal((await chamar('PUT', '/api/contas/1', { saldo_inicial: 1 }, operador)).status, 403);
  assert.equal((await chamar('GET', '/api/usuarios', null, operador)).status, 403);
  assert.equal((await chamar('PUT', '/api/contas/1', { saldo_inicial: 1 }, admin)).status, 200);

  // fechar o dia exige o checklist completo (inclusive pela API)
  const semChecklist = await chamar('POST', '/api/dia/2026-05-04/fechar', {}, operador);
  assert.equal(semChecklist.status, 400);
  assert.match(semChecklist.json.erro, /Falta conferir/);
  const meta = (await chamar('GET', '/api/meta', null, admin)).json;
  const todas = meta.contas.filter((c) => c.ativo).map((c) => c.id);
  const incompleto = await chamar('POST', '/api/dia/2026-05-04/fechar', { confirmacao: { contas: todas.slice(1), responsabilidade: true } }, operador);
  assert.equal(incompleto.status, 400);
  const semTermo = await chamar('POST', '/api/dia/2026-05-04/fechar', { confirmacao: { contas: todas, responsabilidade: false } }, operador);
  assert.equal(semTermo.status, 400);
  assert.match(semTermo.json.erro, /responsabiliza/);
  const fechou = await chamar('POST', '/api/dia/2026-05-04/fechar', { confirmacao: { contas: todas, responsabilidade: true } }, operador);
  assert.equal(fechou.status, 200);
  assert.equal(fechou.json.fechado.fechado_por, 'Op');
  assert.equal((await chamar('DELETE', '/api/dia/2026-05-04/fechar', null, operador)).status, 403);
  assert.equal((await chamar('DELETE', '/api/dia/2026-05-04/fechar', null, admin)).status, 204);
});

test('login errado, bloqueio por tentativas e e-mail em minúsculas', async () => {
  assert.equal((await chamar('POST', '/api/auth/login', { email: 'e@x.com', senha: 'errada' })).status, 401);
  assert.equal((await chamar('POST', '/api/auth/login', { email: 'naoexiste@x.com', senha: 'qualquer' })).status, 401);
  assert.equal((await chamar('POST', '/api/auth/login', { email: 'E@X.com', senha: 'senha-forte-1' })).status, 200);
  let ultimo;
  for (let i = 0; i < 9; i++) ultimo = await chamar('POST', '/api/auth/login', { email: 'bloq@x.com', senha: 'x' });
  assert.equal(ultimo.status, 429);
});

test('desativar usuário derruba a sessão; não permite ficar sem admin', async () => {
  const lista = (await chamar('GET', '/api/usuarios', null, admin)).json;
  const op = lista.find((u) => u.email === 'op@x.com');
  await chamar('PUT', `/api/usuarios/${op.id}`, { ativo: 0 }, admin);
  assert.equal((await chamar('GET', '/api/meta', null, operador)).status, 401);
  assert.equal((await chamar('POST', '/api/auth/login', { email: 'op@x.com', senha: 'senha-forte-3' })).status, 401);
  const eu = lista.find((u) => u.email === 'e@x.com');
  assert.equal((await chamar('PUT', `/api/usuarios/${eu.id}`, { papel: 'leitor' }, admin)).status, 409);
  assert.equal((await chamar('PUT', `/api/usuarios/${eu.id}`, { ativo: 0 }, admin)).status, 409);
});

test('trocar senha e sair', async () => {
  assert.equal((await chamar('POST', '/api/auth/senha', { atual: 'errada', nova: 'nova-senha-1' }, admin)).status, 401);
  assert.equal((await chamar('POST', '/api/auth/senha', { atual: 'senha-forte-1', nova: 'nova-senha-1' }, admin)).status, 204);
  assert.equal((await chamar('POST', '/api/auth/login', { email: 'e@x.com', senha: 'senha-forte-1' })).status, 401);
  assert.equal((await chamar('POST', '/api/auth/logout', null, admin)).status, 204);
  assert.equal((await chamar('GET', '/api/meta', null, admin)).status, 401);
});

const JPEG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]).toString('base64');

test('o lançamento guarda quem o fez e a edição não troca o autor', async () => {
  admin = (await chamar('POST', '/api/auth/login', { email: 'e@x.com', senha: 'nova-senha-1' })).cookie; // a sessão anterior foi encerrada no teste de logout
  await chamar('POST', '/api/usuarios', { nome: 'Op2', email: 'op2@x.com', senha: 'senha-forte-4', papel: 'operador' }, admin);
  const op2 = (await chamar('POST', '/api/auth/login', { email: 'op2@x.com', senha: 'senha-forte-4' })).cookie;
  const lanc = { data: '2026-06-02', tipo: 'saida', valor: 900, conta_id: 3, categoria_id: 9 };
  const criado = await chamar('POST', '/api/lancamentos', lanc, op2);
  assert.equal(criado.status, 201);
  assert.equal(criado.json.criado_por, 'Op2');
  assert.match(criado.json.criado_em, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  const op2eu = (await chamar('GET', '/api/auth/estado', null, op2)).json.usuario;
  assert.equal(criado.json.criado_por_id, op2eu.id);

  // o administrador corrige o valor: o autor original permanece
  assert.equal((await chamar('PUT', `/api/lancamentos/${criado.json.id}`, { ...lanc, valor: 1000 }, admin)).status, 200);
  const apos = (await chamar('GET', '/api/lancamentos?de=2026-06-02&ate=2026-06-02', null, admin)).json.find((l) => l.id === criado.json.id);
  assert.equal(apos.valor, 1000);
  assert.equal(apos.criado_por, 'Op2');
  assert.equal(apos.criado_por_id, op2eu.id);

  const meta = (await chamar('GET', '/api/meta', null, admin)).json;
  assert.ok(meta.equipe.some((p) => p.id === op2eu.id && p.nome === 'Op2' && p.papel === 'operador'), 'meta traz a equipe para mostrar quem lançou');
  assert.ok(meta.equipe.every((p) => !('foto' in p) && !('email' in p)), 'a equipe não expõe e-mail nem a foto crua');
});

test('foto de perfil: valida o arquivo, serve só para quem está logado e muda a versão ao trocar', async () => {
  assert.equal((await chamar('POST', '/api/auth/foto', { imagem: JPEG })).status, 401);
  assert.equal((await chamar('POST', '/api/auth/foto', { imagem: 'data:text/html;base64,PGI+' }, admin)).status, 400);
  const falso = 'data:image/jpeg;base64,' + Buffer.alloc(2000, 1).toString('base64'); // não começa com bytes de JPEG
  assert.equal((await chamar('POST', '/api/auth/foto', { imagem: falso }, admin)).status, 400);
  const grande = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(160 * 1024, 1)]).toString('base64');
  assert.equal((await chamar('POST', '/api/auth/foto', { imagem: grande }, admin)).status, 413);

  const antes = (await chamar('GET', '/api/auth/estado', null, admin)).json.usuario;
  assert.equal(antes.tem_foto, false);
  assert.equal((await chamar('POST', '/api/auth/foto', { imagem: JPEG }, admin)).status, 204);
  const depois = (await chamar('GET', '/api/auth/estado', null, admin)).json.usuario;
  assert.equal(depois.tem_foto, true);
  assert.notEqual(depois.foto_v, antes.foto_v);

  const r = await fetch(`${base}/api/usuarios/${depois.id}/foto`, { headers: { cookie: admin } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.equal((await fetch(`${base}/api/usuarios/${depois.id}/foto`)).status, 401);
  assert.equal((await chamar('DELETE', '/api/auth/foto', null, admin)).status, 204);
  assert.equal((await fetch(`${base}/api/usuarios/${depois.id}/foto`, { headers: { cookie: admin } })).status, 404);
});

test('perfis sócio e comercial: cada um só acessa o que é da sua área', async () => {
  admin = (await chamar('POST', '/api/auth/login', { email: 'e@x.com', senha: 'nova-senha-1' })).cookie;
  for (const [nome, email, papel] of [['Sócio Teste', 'socio@x.com', 'socio'], ['Vendedor', 'vend@x.com', 'comercial']]) {
    assert.equal((await chamar('POST', '/api/usuarios', { nome, email, senha: 'senha-forte-5', papel }, admin)).status, 201, papel);
  }
  const socio = (await chamar('POST', '/api/auth/login', { email: 'socio@x.com', senha: 'senha-forte-5' })).cookie;
  const vend = (await chamar('POST', '/api/auth/login', { email: 'vend@x.com', senha: 'senha-forte-5' })).cookie;

  const eu = (await chamar('GET', '/api/auth/estado', null, socio)).json.usuario;
  assert.ok(eu.areas.includes('societario') && eu.areas.includes('painel') && !eu.areas.includes('lancar'));
  const ev = (await chamar('GET', '/api/auth/estado', null, vend)).json.usuario;
  assert.deepEqual(ev.areas, ['comercial'], 'o comercial não vê o Ao Vivo');

  // sócio: consulta o financeiro, mas não lança nem configura
  assert.equal((await chamar('GET', '/api/painel/2026-05', null, socio)).status, 200);
  assert.equal((await chamar('GET', '/api/export/mes/2026-05', null, socio)).status, 200);
  assert.equal((await chamar('POST', '/api/lancamentos', { data: '2026-05-05', tipo: 'saida', valor: 100, conta_id: 3, categoria_id: 9 }, socio)).status, 403);
  assert.equal((await chamar('PUT', '/api/contas/1', { saldo_inicial: 5 }, socio)).status, 403);
  assert.equal((await chamar('GET', '/api/usuarios', null, socio)).status, 403);

  // comercial: nada do financeiro, mas vê a equipe e cuida da própria conta
  for (const url of ['/api/meta', '/api/painel/2026-05', '/api/lancamentos', '/api/extratos', '/api/export/mes/2026-05']) {
    assert.equal((await chamar('GET', url, null, vend)).status, 403, url);
  }
  assert.equal((await chamar('POST', '/api/lancamentos', { data: '2026-05-05', tipo: 'saida', valor: 100, conta_id: 3, categoria_id: 9 }, vend)).status, 403);
  const eq = await chamar('GET', '/api/equipe', null, vend);
  assert.equal(eq.status, 200);
  assert.ok(eq.json.equipe.length >= 3 && eq.json.hoje);
  assert.equal((await chamar('POST', '/api/auth/senha', { atual: 'senha-forte-5', nova: 'senha-forte-6' }, vend)).status, 403, 'o comercial não troca a própria senha');
  assert.equal((await chamar('POST', '/api/auth/foto', { imagem: JPEG }, vend)).status, 204);

  assert.equal((await chamar('POST', '/api/usuarios', { nome: 'X', email: 'x@x.com', senha: 'senha-forte-5', papel: 'inventado' }, admin)).status, 400);
});

test('acesso por ID (sem e-mail): operadora comercial só enxerga a área comercial', async () => {
  // ID inválido, e sem e-mail nem ID
  assert.equal((await chamar('POST', '/api/usuarios', { nome: 'Júlia', login: 'Júlia Com', senha: 'senha-forte-7', papel: 'comercial' }, admin)).status, 400);
  assert.equal((await chamar('POST', '/api/usuarios', { nome: 'Júlia', senha: 'senha-forte-7', papel: 'comercial' }, admin)).status, 400);
  const criado = await chamar('POST', '/api/usuarios', { nome: 'Júlia', login: 'Comercial.Julia', senha: 'senha-forte-7', papel: 'comercial' }, admin);
  assert.equal(criado.status, 201);
  assert.equal(criado.json.login, 'comercial.julia', 'o ID é guardado em minúsculas');
  assert.equal(criado.json.email, null);
  assert.deepEqual(criado.json.areas, ['comercial']);
  assert.equal((await chamar('POST', '/api/usuarios', { nome: 'Outra', login: 'comercial.julia', senha: 'senha-forte-7', papel: 'comercial' }, admin)).status, 409, 'ID repetido');

  assert.equal((await chamar('POST', '/api/auth/login', { email: 'comercial.julia', senha: 'errada-errada' })).status, 401);
  const entrou = await chamar('POST', '/api/auth/login', { email: ' Comercial.Julia ', senha: 'senha-forte-7' });
  assert.equal(entrou.status, 200, 'entra com o ID, sem importar maiúsculas');
  const julia = entrou.cookie;
  assert.equal(entrou.json.usuario.nome, 'Júlia');

  // só o comercial: painel, orçamentos e clientes; nada de financeiro, marketing, pessoas ou sócios
  assert.equal((await chamar('GET', '/api/comercial/painel', null, julia)).status, 200);
  assert.equal((await chamar('GET', '/api/aovivo', null, julia)).status, 403, 'Ao Vivo não é do comercial');
  assert.equal((await chamar('GET', '/api/comercial/clientes', null, julia)).status, 200);
  for (const url of ['/api/meta', '/api/painel/2026-05', '/api/lancamentos', '/api/extratos', '/api/marketing/campanhas', '/api/dp/funcionarios', '/api/societario/quadro', '/api/patrimonio/2026-05', '/api/usuarios']) {
    assert.equal((await chamar('GET', url, null, julia)).status, 403, url);
  }
});

test('comercial: checklist obrigatório no cliente e no orçamento, sem trocar a senha, e histórico do dia para o admin', async () => {
  const julia = (await chamar('POST', '/api/auth/login', { email: 'comercial.julia', senha: 'senha-forte-7' })).cookie;
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const eu = (await chamar('GET', '/api/auth/estado', null, julia)).json.usuario;

  // não troca a senha (nem sabendo a atual)
  const troca = await chamar('POST', '/api/auth/senha', { atual: 'senha-forte-7', nova: 'outra-senha-9' }, julia);
  assert.equal(troca.status, 403);
  assert.match(troca.json.erro, /administração/);
  assert.equal((await chamar('POST', '/api/auth/login', { email: 'comercial.julia', senha: 'senha-forte-7' })).status, 200, 'a senha continua a mesma');

  // cliente: sem checklist -> recusa; com checklist incompleto -> recusa; completo -> cria
  const ficha = { nome: 'Marcos Andrade', telefone: '(21) 98877-6655', email: 'marcos@x.com', aniversario: '1985-11-23' };
  const CLI = { busca: true, contato: true, email_aniversario: true };
  assert.equal((await chamar('POST', '/api/comercial/clientes', ficha, julia)).status, 400);
  assert.equal((await chamar('POST', '/api/comercial/clientes', { ...ficha, checklist: { ...CLI, contato: false } }, julia)).status, 400);
  const cli = await chamar('POST', '/api/comercial/clientes', { ...ficha, checklist: CLI }, julia);
  assert.equal(cli.status, 201);

  // orçamento: mesma regra
  const orc = { cliente_id: cli.json.id, produto_nome: 'Painel P3.9', valor: 4500000, origem: 'instagram' };
  const ORC = { cliente: true, produto_valor: true, origem: true, enviado: true };
  const sem = await chamar('POST', '/api/comercial/orcamentos', orc, julia);
  assert.equal(sem.status, 400);
  assert.match(sem.json.erro, /checklist do orçamento/i);
  assert.equal((await chamar('POST', '/api/comercial/orcamentos', { ...orc, checklist: { ...ORC, enviado: false } }, julia)).status, 400);
  assert.equal((await chamar('POST', '/api/comercial/orcamentos', { ...orc, checklist: ORC }, julia)).status, 201);

  // histórico do dia, visto pelo admin: quem lançou e quando
  const hist = await chamar('GET', `/api/comercial/orcamentos?lancado_em=${hoje}&por=${eu.id}`, null, admin);
  assert.equal(hist.status, 200);
  assert.equal(hist.json.length, 1);
  assert.equal(hist.json[0].criado_por_nome, 'Júlia');
  assert.ok(hist.json[0].criado_em.startsWith(hoje));
  assert.equal((await chamar('GET', `/api/comercial/orcamentos?lancado_em=2000-01-01`, null, admin)).json.length, 0);
  assert.equal((await chamar('GET', `/api/comercial/orcamentos?lancado_em=data-ruim`, null, admin)).status, 400);

  const cadastrados = await chamar('GET', `/api/comercial/clientes?cadastrado_em=${hoje}&por=${eu.id}`, null, admin);
  assert.equal(cadastrados.json.length, 1);
  assert.equal(cadastrados.json[0].nome, 'Marcos Andrade');
  assert.equal(cadastrados.json[0].criado_por_nome, 'Júlia');
  assert.equal((await chamar('GET', `/api/comercial/clientes?cadastrado_em=2000-01-01`, null, admin)).json.length, 0);

  // o admin continua podendo redefinir a senha dela (nova senha em Cadastros)
  assert.equal((await chamar('PUT', `/api/usuarios/${eu.id}`, { senha: 'senha-nova-8' }, admin)).status, 200);
  assert.equal((await chamar('POST', '/api/auth/login', { email: 'comercial.julia', senha: 'senha-nova-8' })).status, 200);
});

test('acessos: admin vê quem está online, último login e última atividade; os demais não', async () => {
  const op = (await chamar('POST', '/api/auth/login', { email: 'op2@x.com', senha: 'senha-forte-4' })).cookie;
  assert.equal((await chamar('GET', '/api/acessos', null, op)).status, 403);
  // consulta automática não conta como atividade; ação real conta
  const antes = (await chamar('GET', '/api/acessos', null, admin)).json.find((u) => u.email === 'op2@x.com');
  assert.equal(antes.online, true, 'acabou de logar');
  assert.ok(antes.ultimo_login && antes.ultima_atividade);
  const r = await chamar('GET', '/api/acessos', null, admin);
  assert.equal(r.status, 200);
  const eu = r.json.find((u) => u.email === 'e@x.com');
  assert.equal(eu.online, true);
  assert.equal(eu.sessoes >= 1, true);
  assert.ok(r.json.every((u) => typeof u.ultimo_login !== 'undefined' && !('senha_hash' in u)));
});

test('comercial: com follow-up pendente não lança orçamento novo; depois de enviar, libera', async () => {
  const ck = (await chamar('POST', '/api/auth/login', { email: 'comercial.julia', senha: 'senha-nova-8' })).cookie;
  const op = (await chamar('GET', '/api/comercial/opcoes', null, ck)).json;
  const checklist = Object.fromEntries(Object.keys(op.checklist_orcamento).map((k) => [k, true]));
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const d3 = new Date(Date.now() - 3 * 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const corpo = (nome, data) => ({ origem: 'instagram', cliente: { nome, telefone: '(21) 97777-' + (1000 + Math.floor(Math.random() * 8999)), email: nome.replace(/\W/g, '') + '@x.com', aniversario: '1990-01-01' }, produto_nome: 'Painel P5', valor: 100000, checklist, data });
  const antigo = await chamar('POST', '/api/comercial/orcamentos', corpo('Cliente Antigo Fu', d3), ck);
  assert.equal(antigo.status, 201); // nada pendente ainda: o orçamento tem 0 dias de espera quando criado agora
  const pend = (await chamar('GET', '/api/comercial/followups', null, ck)).json;
  assert.ok(pend.some((o) => o.id === antigo.json.id), 'o orçamento de 3 dias atrás está pendente');
  const bloq = await chamar('POST', '/api/comercial/orcamentos', corpo('Cliente Novo Fu', hoje), ck);
  assert.equal(bloq.status, 409);
  assert.match(bloq.json.erro, /follow-ups pendentes/);
  assert.equal((await chamar('POST', `/api/comercial/orcamentos/${antigo.json.id}/followup-enviado`, { mensagem: 'Oi' }, ck)).status, 400);
  assert.equal((await chamar('POST', `/api/comercial/orcamentos/${antigo.json.id}/followup-enviado`, { mensagem: 'Oi', responsabilidade: true }, ck)).status, 200);
  assert.equal((await chamar('POST', '/api/comercial/orcamentos', corpo('Cliente Novo Fu', hoje), ck)).status, 201);
  const painel = (await chamar('GET', '/api/comercial/followup-painel', null, ck)).json;
  assert.equal(painel.enviados[0].usuario_nome, 'Júlia');
});

test('perfis financeiro e estoque: cada um só enxerga a sua área; estoque entra no administrativo', async () => {
  const fin = await chamar('POST', '/api/usuarios', { nome: 'Carla', login: 'financeiro.carla', senha: 'senha-fin-123', papel: 'financeiro' }, admin);
  const est = await chamar('POST', '/api/usuarios', { nome: 'João', login: 'estoque.joao', senha: 'senha-est-123', papel: 'estoque' }, admin);
  assert.equal(fin.status, 201); assert.equal(est.status, 201);
  const f = (await chamar('POST', '/api/auth/login', { email: 'financeiro.carla', senha: 'senha-fin-123' })).cookie;
  const e = (await chamar('POST', '/api/auth/login', { email: 'estoque.joao', senha: 'senha-est-123' })).cookie;
  // financeiro: painel, cobrança e lançar; nada de comercial, estoque, cadastros ou acessos
  assert.equal((await chamar('GET', '/api/meta', null, f)).status, 200);
  assert.equal((await chamar('GET', '/api/cobranca', null, f)).status, 200);
  for (const rota of ['/api/estoque', '/api/comercial/painel', '/api/acessos', '/api/usuarios', '/api/dp/meta', '/api/societario/quadro']) assert.equal((await chamar('GET', rota, null, f)).status, 403, rota);
  // estoque: só o estoque
  for (const rota of ['/api/meta', '/api/cobranca', '/api/comercial/painel', '/api/acessos', '/api/usuarios']) assert.ok([401, 403].includes((await chamar('GET', rota, null, e)).status), rota);
  assert.equal((await chamar('GET', '/api/estoque', null, e)).status, 200);
  // fluxo do estoque
  const item = await chamar('POST', '/api/estoque/itens', { nome: 'Painel P5 (gabinete)', unidade: 'un', minimo: 2 }, e);
  assert.equal(item.status, 201);
  assert.equal((await chamar('POST', '/api/estoque/itens', { nome: 'Painel P5 (gabinete)' }, e)).status, 409);
  const id = item.json.id;
  assert.equal((await chamar('POST', '/api/estoque/movimentos', { item_id: id, tipo: 'saida', quantidade: 1, referencia: 'x' }, e)).status, 409, 'saldo insuficiente');
  assert.equal((await chamar('POST', '/api/estoque/movimentos', { item_id: id, tipo: 'entrada', quantidade: 10, referencia: 'Fornecedor X' }, e)).status, 201);
  assert.equal((await chamar('POST', '/api/estoque/movimentos', { item_id: id, tipo: 'saida', quantidade: 3 }, e)).status, 400, 'saída exige destino');
  const s = await chamar('POST', '/api/estoque/movimentos', { item_id: id, tipo: 'saida', quantidade: 9, referencia: 'Cliente Maria', orcamento_numero: '2026-0573' }, e);
  assert.equal(s.status, 201); assert.equal(s.json.saldo, 1); assert.equal(s.json.abaixo_minimo, true);
  const lista = (await chamar('GET', '/api/estoque', null, admin)).json; // administração enxerga
  assert.equal(lista.movimentos.length, 2); assert.equal(lista.movimentos[0].usuario_nome, 'João');
  assert.equal((await chamar('DELETE', `/api/estoque/movimentos/${lista.movimentos[1].id}`, null, e)).status, 403, 'só admin exclui');
  assert.equal((await chamar('DELETE', `/api/estoque/movimentos/${lista.movimentos[1].id}`, null, admin)).status, 409, 'excluir a entrada deixaria saldo negativo');
});
