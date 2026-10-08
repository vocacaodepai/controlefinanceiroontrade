import { db, tx } from './db.js';

// Estrutura inicial baseada no desenho do fluxo informado pelo Renato.
// Valores (salários, iFood etc.) ficam vazios de propósito: serão preenchidos aos poucos.
export function seed() {
  const n = db.prepare('SELECT COUNT(*) AS n FROM empresas').get().n;
  if (n > 0) return false;

  tx(() => {
    const emp = (nome, obs) => db.prepare('INSERT INTO empresas (nome, obs) VALUES (?,?)').run(nome, obs ?? null).lastInsertRowid;
    const ontrade = emp('OnTrade', 'Empresa principal. Recebe com nota (bancos).');
    const lt1 = emp('LT1', 'Empresa da Dona Elisa. Recebe dos clientes OnTrade que pagam sem nota e paga a folha/despesas.');
    const dae = emp('DAE / Fornecedor', 'Pagamento direto ao fornecedor chinês.');

    const conta = (nome, empresa, tipo, modalidade, obs) =>
      db.prepare('INSERT INTO contas (nome, empresa_id, tipo, modalidade, obs) VALUES (?,?,?,?,?)')
        .run(nome, empresa, tipo, modalidade, obs ?? null).lastInsertRowid;

    // COM NOTA
    conta('Banco Safra', ontrade, 'banco', 'com_nota');
    conta('Banco Infinity', ontrade, 'banco', 'com_nota');
    conta('Banco Bradesco', ontrade, 'banco', 'com_nota');
    conta('Banco do Brasil', ontrade, 'banco', 'com_nota');
    // SEM NOTA
    conta('DAE (direto ao fornecedor)', dae, 'intermediaria', 'sem_nota', 'Cliente paga direto ao chinês. Confirmar se o Caixa enxerga esse saldo.');
    conta('PagVeloz', ontrade, 'intermediaria', 'sem_nota', 'Confirmar titularidade da conta.');
    conta('LT1', lt1, 'banco', 'sem_nota', 'Recebe dos clientes sem nota e paga a folha/contas.');
    conta('Dinheiro (caixa físico)', ontrade, 'dinheiro', 'sem_nota');

    const cat = (nome, tipo, grupo) =>
      db.prepare('INSERT INTO categorias (nome, tipo, grupo) VALUES (?,?,?)').run(nome, tipo, grupo).lastInsertRowid;

    cat('Recebimento de cliente', 'entrada', 'Receitas');
    cat('Outras entradas', 'entrada', 'Receitas');

    cat('Pró-labore', 'saida', 'Pessoal');
    cat('Salário', 'saida', 'Pessoal');
    cat('Comissão', 'saida', 'Pessoal');
    cat('Pagamento de prestador', 'saida', 'Pessoal');
    cat('Cartão iFood', 'saida', 'Benefícios');
    cat('Passagem', 'saida', 'Benefícios');
    cat('Alimentação', 'saida', 'Benefícios');
    cat('Recarga de celular', 'saida', 'Contas');
    cat('Luz', 'saida', 'Contas');
    cat('Gás', 'saida', 'Contas');
    cat('Água', 'saida', 'Contas');
    cat('Combustível', 'saida', 'Contas');
    cat('Tributos de funcionários', 'saida', 'Tributos');
    const emprestimo = cat('Empréstimo Dona Elisa', 'saida', 'Financeiro');
    cat('Papelaria', 'saida', 'Operacional');
    cat('Estacionamento', 'saida', 'Operacional');
    cat('Outras despesas', 'saida', 'Operacional');

    const pessoa = (nome, funcao, vinculo, pagador, obs) =>
      db.prepare('INSERT INTO pessoas (nome, funcao, vinculo, pagador_padrao, obs) VALUES (?,?,?,?,?)')
        .run(nome, funcao, vinculo, pagador, obs ?? null).lastInsertRowid;

    pessoa('Renato', 'Sócio', 'socio', 'LT1', 'Pró-labore pago pela LT1.');
    pessoa('Kátia', 'Funcionária', 'japeri', 'LT1', 'Registrada na empresa de Japeri (salário lá). Recebe da LT1 o complemento, passagem e alimentação em dinheiro. CONFIRMAR se "Kátia" e "Dona Kátia" são a mesma pessoa.');
    pessoa('Fátima', 'Funcionária', 'a_verificar', 'LT1');
    pessoa('João', 'Funcionário', 'lt1', 'LT1', 'Registrado na LT1. Cartão iFood pago pela LT1.');
    pessoa('Tayane', 'Funcionária', 'a_verificar', 'LT1');
    pessoa('Carla', 'Funcionária', 'lt1', 'LT1', 'Registrada na LT1. Cartão iFood pago pela LT1.');
    pessoa('Fabiano', 'Comissionado', 'a_verificar', 'LT1', 'Recebe comissão.');
    pessoa('Douglas', 'Prestador', 'a_verificar', 'LT1');
    pessoa('Andresa', 'Prestadora', 'a_verificar', 'LT1');
    pessoa('Seu Dantas', 'Funcionário', 'a_verificar', 'OnTrade', 'Recebe pela OnTrade ou em dinheiro. CHECAR se está registrado.');
    pessoa('Dona Elisa', 'Sócia / credora', 'socio', 'LT1', 'Recebe o pagamento do empréstimo na conta pessoal.');

    const idConta = (n) => db.prepare('SELECT id FROM contas WHERE nome = ?').get(n).id;
    const idPessoa = (n) => db.prepare('SELECT id FROM pessoas WHERE nome = ?').get(n).id;

    // Empréstimo da Dona Elisa: ~R$ 16.800 todo dia 5, da LT1 para a conta pessoal.
    db.prepare(`INSERT INTO recorrencias
      (nome, dia_mes, valor, estimado, tipo, conta_id, categoria_id, pessoa_id, descricao)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      'Empréstimo Dona Elisa (LT1 → conta pessoal)', 5, 1680000, 1, 'saida',
      idConta('LT1'), emprestimo, idPessoa('Dona Elisa'),
      'Pagamento do empréstimo usado na OnTrade, enviado da LT1 para a conta pessoal da Dona Elisa. Valor aproximado.');
  });
  return true;
}
