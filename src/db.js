// Camada de banco. Em produção usa PostgreSQL (Supabase) via DATABASE_URL;
// sem DATABASE_URL usa PGlite (Postgres embutido) em data/pg — zero configuração para desenvolver e testar.
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(join(aqui, 'schema.sql'), 'utf8');
const als = new AsyncLocalStorage(); // transação corrente (se houver)

const URL_PG = process.env.DATABASE_URL;
export const modo = URL_PG ? 'postgres' : 'pglite';

// Tipos: bigint/numeric -> Number; date -> 'YYYY-MM-DD'; timestamp -> 'YYYY-MM-DD HH:MM:SS'
const num = (v) => (v === null ? null : Number(v));
const txt = (v) => v;
const ts = (v) => (v === null ? null : String(v).slice(0, 19).replace('T', ' '));

let driver;
if (modo === 'postgres') {
  const pg = (await import('pg')).default;
  pg.types.setTypeParser(20, num); pg.types.setTypeParser(1700, num);
  pg.types.setTypeParser(1082, txt); pg.types.setTypeParser(1114, ts);
  const local = /localhost|127\.0\.0\.1/.test(URL_PG);
  const pool = new pg.Pool({
    connectionString: URL_PG,
    max: Number(process.env.PG_POOL_MAX || 3),
    ssl: local ? false : { rejectUnauthorized: false },
    idleTimeoutMillis: 10000,
  });
  driver = {
    query: async (c, sql, p) => (await (c || pool).query(sql, p)).rows,
    exec: async (c, sql) => { await (c || pool).query(sql); },
    tx: async (fn) => {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const r = await als.run(c, () => fn());
        await c.query('COMMIT');
        return r;
      } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
    },
  };
} else if (process.env.VERCEL) {
  // Na Vercel não existe disco gravável: sem DATABASE_URL o sistema não pode funcionar.
  const falta = async () => { const e = new Error('Banco de dados não configurado: defina a variável DATABASE_URL na Vercel (Settings → Environment Variables).'); e.status = 503; throw e; };
  driver = { query: falta, exec: falta, tx: falta };
} else {
  const { PGlite } = await import('@electric-sql/pglite');
  const caminho = process.env.DB_PATH || 'data/pg';
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const lite = new PGlite(caminho === ':memory:' ? undefined : caminho);
  const parsers = { 20: num, 1700: num, 1082: txt, 1114: ts }; // no PGlite os conversores valem por consulta
  driver = {
    query: async (c, sql, p) => (await (c || lite).query(sql, p, { parsers })).rows,
    exec: async (c, sql) => { await (c || lite).exec(sql); },
    tx: (fn) => lite.transaction((t) => als.run(t, () => fn())),
  };
}

export const query = (sql, params = []) => driver.query(als.getStore(), sql, params);
export const one = async (sql, params = []) => (await query(sql, params))[0];
export const tx = (fn) => (als.getStore() ? fn() : driver.tx(fn)); // transação aninhada reaproveita a atual

// Cria tabelas (idempotente) e dados iniciais. Protegido por trava para cold starts simultâneos.
let pronto;
export function iniciar(seed) {
  pronto ??= tx(async () => {
    if (modo === 'postgres') await query('SELECT pg_advisory_xact_lock(724519)');
    await driver.exec(als.getStore(), SCHEMA);
    await seed();
  }).catch((e) => { pronto = undefined; throw e; });
  return pronto;
}
