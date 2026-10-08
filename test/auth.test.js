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

  assert.equal((await chamar('POST', '/api/dia/2026-05-04/fechar', {}, operador)).status, 200);
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
