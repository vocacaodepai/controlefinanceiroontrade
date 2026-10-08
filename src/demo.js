// Popula o banco com lançamentos FICTÍCIOS só para visualizar o sistema.
// Uso: npm run demo   (depois, `npm run reset` apaga tudo e volta ao esqueleto limpo)
import { seed } from './seed.js';
import { db } from './db.js';
import * as S from './services.js';

seed();
const id = (t, n) => db.prepare(`SELECT id FROM ${t} WHERE nome = ?`).get(n).id;
const hoje = new Date().toLocaleDateString('sv-SE');
const mes = hoje.slice(0, 7);
const dia = (d) => `${mes}-${String(d).padStart(2, '0')}`;
const dMax = Number(hoje.slice(8));

const L = (d, tipo, valor, conta, categoria, extra = {}) => {
  if (d > dMax) return;
  S.criarLancamento({ data: dia(d), tipo, valor: valor * 100, conta_id: id('contas', conta), categoria_id: categoria ? id('categorias', categoria) : null, ...extra, pessoa_id: extra.pessoa ? id('pessoas', extra.pessoa) : null });
};

L(1, 'entrada', 8500, 'Banco Safra', 'Recebimento de cliente', { cliente: 'Cliente A (demo)' });
L(1, 'entrada', 4200, 'Banco Bradesco', 'Recebimento de cliente', { cliente: 'Cliente B (demo)' });
L(2, 'entrada', 6000, 'LT1', 'Recebimento de cliente', { cliente: 'Cliente C (demo)', descricao: 'Pagou sem nota' });
L(2, 'entrada', 3000, 'PagVeloz', 'Recebimento de cliente', { cliente: 'Cliente D (demo)' });
L(3, 'entrada', 1800, 'Dinheiro (caixa físico)', 'Recebimento de cliente', { cliente: 'Cliente E (demo)' });
L(3, 'saida', 15, 'Banco Bradesco', 'Papelaria', { descricao: 'Papelaria (exemplo do Renato)' });
L(4, 'saida', 15, 'Banco Infinity', 'Estacionamento');
L(5, 'saida', 16800, 'LT1', 'Empréstimo Dona Elisa', { pessoa: 'Dona Elisa', descricao: 'Parcela do empréstimo (demo)' });
L(5, 'saida', 250, 'LT1', 'Recarga de celular', { descricao: 'Recargas (demo)' });
L(6, 'saida', 400, 'LT1', 'Combustível');
L(6, 'saida', 120, 'Dinheiro (caixa físico)', 'Passagem', { pessoa: 'Kátia' });
L(7, 'saida', 80, 'Dinheiro (caixa físico)', 'Alimentação', { pessoa: 'Kátia' });
L(7, 'entrada', 5000, 'DAE (direto ao fornecedor)', 'Recebimento de cliente', { cliente: 'Cliente F (demo)' });
L(8, 'saida', 600, 'LT1', 'Cartão iFood', { pessoa: 'João' });
L(8, 'saida', 600, 'LT1', 'Cartão iFood', { pessoa: 'Carla' });
L(8, 'saida', 310, 'LT1', 'Luz');
console.log(`Dados fictícios criados em ${mes}.`);
