// Popula o banco LOCAL com lançamentos FICTÍCIOS só para visualizar o sistema.
// Uso: npm run demo   (depois, `npm run reset` apaga tudo e volta ao esqueleto limpo)
import { iniciar, one, modo } from './db.js';
import { seed } from './seed.js';
import * as S from './services.js';

if (modo === 'postgres') {
  console.error('Recusado: o demo só roda no banco local. Há uma DATABASE_URL definida (banco real).');
  process.exit(1);
}
await iniciar(seed);
const id = async (t, n) => (await one(`SELECT id FROM ${t} WHERE nome = $1`, [n])).id;
const hoje = S.hoje();
const mes = hoje.slice(0, 7);
const dia = (d) => `${mes}-${String(d).padStart(2, '0')}`;
const dMax = Number(hoje.slice(8));

const L = async (d, tipo, valor, conta, categoria, extra = {}) => {
  if (d > dMax) return;
  await S.criarLancamento({
    data: dia(d), tipo, valor: valor * 100, conta_id: await id('contas', conta),
    categoria_id: categoria ? await id('categorias', categoria) : null,
    cliente: extra.cliente, descricao: extra.descricao,
    pessoa_id: extra.pessoa ? await id('pessoas', extra.pessoa) : null, criado_por: 'demo',
  });
};

await L(1, 'entrada', 8500, 'Banco Safra', 'Recebimento de cliente', { cliente: 'Cliente A (demo)' });
await L(1, 'entrada', 4200, 'Banco Bradesco', 'Recebimento de cliente', { cliente: 'Cliente B (demo)' });
await L(2, 'entrada', 6000, 'LTON', 'Recebimento de cliente', { cliente: 'Cliente C (demo)', descricao: 'Pagou sem nota' });
await L(2, 'entrada', 3000, 'PagVeloz', 'Recebimento de cliente', { cliente: 'Cliente D (demo)' });
await L(3, 'entrada', 1800, 'Dinheiro (caixa físico)', 'Recebimento de cliente', { cliente: 'Cliente E (demo)' });
await L(3, 'saida', 15, 'Banco Bradesco', 'Papelaria', { descricao: 'Papelaria (exemplo do Renato)' });
await L(4, 'saida', 15, 'Banco Infinity', 'Estacionamento');
await L(5, 'saida', 16800, 'LTON', 'Empréstimo Elisa Maria', { pessoa: 'Elisa Maria', descricao: 'Parcela do empréstimo (demo)' });
await L(5, 'saida', 250, 'LTON', 'Recarga de celular', { descricao: 'Recargas (demo)' });
await L(6, 'saida', 400, 'LTON', 'Combustível');
await L(6, 'saida', 120, 'Dinheiro (caixa físico)', 'Passagem', { pessoa: 'Kátia' });
await L(7, 'saida', 80, 'Dinheiro (caixa físico)', 'Alimentação', { pessoa: 'Kátia' });
await L(7, 'entrada', 5000, 'DAE (direto ao fornecedor)', 'Recebimento de cliente', { cliente: 'Cliente F (demo)' });
await L(8, 'saida', 600, 'LTON', 'Cartão iFood', { pessoa: 'João' });
await L(8, 'saida', 600, 'LTON', 'Cartão iFood', { pessoa: 'Carla' });
await L(8, 'saida', 310, 'LTON', 'Luz');
console.log(`Dados fictícios criados em ${mes}.`);
process.exit(0);
