// Fornecedores (Feira de Cantão, outubro de 2026): cartões, catálogos e folhetos lançados pelo Renato.
// Os dados ficam em src/data/fornecedores.json (texto original do cartão, tradução em português e as cores do cartão)
// e as fotos em src/data/fornecedores/{f,t}/. Tudo é servido só para quem tem a área "fornecedores".
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = join(dirname(fileURLToPath(import.meta.url)), 'data');
let cache;
export function listar() {
  cache ??= JSON.parse(readFileSync(join(BASE, 'fornecedores.json'), 'utf8'));
  return cache;
}

// foto pelo caminho do cadastro ("f/arquivo.jpg" ou "t/arquivo.jpg"); só nomes simples, sem subir de pasta
const NOME_OK = /^[ft]\/[A-Za-z0-9._-]+\.jpg$/;
export function caminhoFoto(pasta, arquivo) {
  const rel = `${pasta}/${arquivo}`;
  if (!NOME_OK.test(rel) || arquivo.includes('..')) return null;
  const p = join(BASE, 'fornecedores', rel);
  return existsSync(p) ? p : null;
}

// Catálogos digitalizados (folders fotografados e recortados produto a produto): src/data/catalogos/<id>/
// catalogo.json + i/ (produtos) + h/ (fotos grandes). A versão para cliente é montada no navegador sem os dados do fornecedor.
const CAT_OK = /^[a-z0-9-]+$/;
const catCache = new Map();
export function catalogo(id) {
  if (!CAT_OK.test(String(id))) return null;
  if (!catCache.has(id)) {
    const p = join(BASE, 'catalogos', id, 'catalogo.json');
    catCache.set(id, existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  }
  return catCache.get(id);
}
const ARQ_OK = /^[A-Za-z0-9._-]+\.jpg$/;
export function caminhoCatalogo(id, pasta, arquivo) {
  if (!CAT_OK.test(String(id)) || !['i', 'h'].includes(pasta) || !ARQ_OK.test(String(arquivo)) || arquivo.includes('..')) return null;
  const p = join(BASE, 'catalogos', id, pasta, arquivo);
  return existsSync(p) ? p : null;
}
