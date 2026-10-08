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
