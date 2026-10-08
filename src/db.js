import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const path = process.env.DB_PATH || 'data/caixa.db';
if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

export const db = new DatabaseSync(path);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// Valores sempre em centavos (inteiros). Datas em 'YYYY-MM-DD'.
db.exec(`
CREATE TABLE IF NOT EXISTS empresas (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, obs TEXT
);

CREATE TABLE IF NOT EXISTS contas (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('banco','dinheiro','intermediaria','pessoal')),
  modalidade TEXT NOT NULL CHECK (modalidade IN ('com_nota','sem_nota')),
  saldo_inicial INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  obs TEXT
);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
  grupo TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pessoas (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  funcao TEXT,
  vinculo TEXT NOT NULL DEFAULT 'a_verificar'
    CHECK (vinculo IN ('lt1','ontrade','japeri','informal','socio','a_verificar')),
  pagador_padrao TEXT,
  obs TEXT,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS lancamentos (
  id INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida','transferencia')),
  valor INTEGER NOT NULL CHECK (valor > 0),
  conta_id INTEGER NOT NULL REFERENCES contas(id),
  conta_destino_id INTEGER REFERENCES contas(id),
  categoria_id INTEGER REFERENCES categorias(id),
  pessoa_id INTEGER REFERENCES pessoas(id),
  cliente TEXT,
  descricao TEXT,
  criado_por TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_lanc_data ON lancamentos(data);

CREATE TABLE IF NOT EXISTS recorrencias (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  dia_mes INTEGER NOT NULL CHECK (dia_mes BETWEEN 1 AND 31),
  valor INTEGER,
  estimado INTEGER NOT NULL DEFAULT 1,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida','transferencia')),
  conta_id INTEGER NOT NULL REFERENCES contas(id),
  conta_destino_id INTEGER REFERENCES contas(id),
  categoria_id INTEGER REFERENCES categorias(id),
  pessoa_id INTEGER REFERENCES pessoas(id),
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS fechamentos (
  data TEXT PRIMARY KEY,
  obs TEXT,
  fechado_por TEXT,
  fechado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS fechamento_contas (
  data TEXT NOT NULL REFERENCES fechamentos(data) ON DELETE CASCADE,
  conta_id INTEGER NOT NULL REFERENCES contas(id),
  saldo_sistema INTEGER NOT NULL,
  saldo_contado INTEGER,
  PRIMARY KEY (data, conta_id)
);

CREATE TABLE IF NOT EXISTS recorrencia_lancada (
  recorrencia_id INTEGER NOT NULL REFERENCES recorrencias(id) ON DELETE CASCADE,
  mes TEXT NOT NULL,
  lancamento_id INTEGER NOT NULL REFERENCES lancamentos(id) ON DELETE CASCADE,
  PRIMARY KEY (recorrencia_id, mes)
);
`);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL CHECK (papel IN ('admin','operador','leitor')),
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  ultimo_acesso TEXT
);
CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em INTEGER NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);
