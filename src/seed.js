import { query, one, tx } from './db.js';

// Estrutura inicial baseada no desenho do fluxo informado pelo Renato.
// Valores (salários, iFood etc.) ficam vazios de propósito: serão preenchidos aos poucos.
export async function seed() {
  const { n } = await one('SELECT COUNT(*) AS n FROM empresas');
  if (n > 0) return false;

  await tx(async () => {
    const ins = async (sql, p) => (await one(sql + ' RETURNING id', p)).id;
    const emp = (nome, obs) => ins('INSERT INTO empresas (nome, obs) VALUES ($1,$2)', [nome, obs ?? null]);
    const ontrade = await emp('OnTrade', 'Empresa principal. Recebe com nota (bancos).');
    const lt1 = await emp('LTON', 'Empresa da Dona Elisa. Recebe dos clientes OnTrade que pagam sem nota e paga a folha/despesas.');
    const dae = await emp('DAE / Fornecedor', 'Pagamento direto ao fornecedor chinês.');

    const conta = (nome, empresa, tipo, modalidade, obs) =>
      ins('INSERT INTO contas (nome, empresa_id, tipo, modalidade, obs) VALUES ($1,$2,$3,$4,$5)', [nome, empresa, tipo, modalidade, obs ?? null]);

    // COM NOTA
    await conta('Banco Safra', ontrade, 'banco', 'com_nota');
    await conta('Banco Infinity', ontrade, 'banco', 'com_nota');
    await conta('Banco Bradesco', ontrade, 'banco', 'com_nota');
    await conta('Banco do Brasil', ontrade, 'banco', 'com_nota');
    // SEM NOTA
    await conta('DAE (direto ao fornecedor)', dae, 'intermediaria', 'sem_nota', 'Cliente paga direto ao chinês. Confirmar se o Caixa enxerga esse saldo.');
    await conta('PagVeloz', ontrade, 'intermediaria', 'sem_nota', 'Confirmar titularidade da conta.');
    await conta('LTON', lt1, 'banco', 'sem_nota', 'Recebe dos clientes sem nota e paga a folha/contas.');
    await conta('Dinheiro (caixa físico)', ontrade, 'dinheiro', 'sem_nota');

    const cat = (nome, tipo, grupo) =>
      ins('INSERT INTO categorias (nome, tipo, grupo) VALUES ($1,$2,$3)', [nome, tipo, grupo]);

    await cat('Recebimento de cliente', 'entrada', 'Receitas');
    await cat('Outras entradas', 'entrada', 'Receitas');

    await cat('Pró-labore', 'saida', 'Pessoal');
    await cat('Salário', 'saida', 'Pessoal');
    await cat('Comissão', 'saida', 'Pessoal');
    await cat('Pagamento de prestador', 'saida', 'Pessoal');
    await cat('Cartão iFood', 'saida', 'Benefícios');
    await cat('Passagem', 'saida', 'Benefícios');
    await cat('Alimentação', 'saida', 'Benefícios');
    await cat('Recarga de celular', 'saida', 'Contas');
    await cat('Luz', 'saida', 'Contas');
    await cat('Gás', 'saida', 'Contas');
    await cat('Água', 'saida', 'Contas');
    await cat('Combustível', 'saida', 'Contas');
    await cat('Tributos de funcionários', 'saida', 'Tributos');
    const emprestimo = await cat('Empréstimo Dona Elisa', 'saida', 'Financeiro');
    await cat('Papelaria', 'saida', 'Operacional');
    await cat('Estacionamento', 'saida', 'Operacional');
    await cat('Outras despesas', 'saida', 'Operacional');

    const pessoa = (nome, funcao, vinculo, pagador, obs) =>
      ins('INSERT INTO pessoas (nome, funcao, vinculo, pagador_padrao, obs) VALUES ($1,$2,$3,$4,$5)', [nome, funcao, vinculo, pagador, obs ?? null]);

    await pessoa('Renato', 'Sócio', 'socio', 'LTON', 'Pró-labore pago pela LTON.');
    await pessoa('Kátia', 'Funcionária', 'japeri', 'LTON', 'Registrada na empresa de Japeri (salário lá). Recebe da LTON o complemento, passagem e alimentação em dinheiro. CONFIRMAR se "Kátia" e "Dona Kátia" são a mesma pessoa.');
    await pessoa('Fátima', 'Funcionária', 'a_verificar', 'LTON');
    await pessoa('João', 'Funcionário', 'lt1', 'LTON', 'Registrado na LTON. Cartão iFood pago pela LTON.');
    await pessoa('Tayane', 'Funcionária', 'a_verificar', 'LTON');
    await pessoa('Carla', 'Funcionária', 'lt1', 'LTON', 'Registrada na LTON. Cartão iFood pago pela LTON.');
    await pessoa('Fabiano', 'Comissionado', 'a_verificar', 'LTON', 'Recebe comissão.');
    await pessoa('Douglas', 'Prestador', 'a_verificar', 'LTON');
    await pessoa('Andresa', 'Prestadora', 'a_verificar', 'LTON');
    await pessoa('Seu Dantas', 'Funcionário', 'a_verificar', 'OnTrade', 'Recebe pela OnTrade ou em dinheiro. CHECAR se está registrado.');
    await pessoa('Dona Elisa', 'Sócia / credora', 'socio', 'LTON', 'Recebe o pagamento do empréstimo na conta pessoal.');

    const idConta = async (n) => (await one('SELECT id FROM contas WHERE nome = $1', [n])).id;
    const idPessoa = async (n) => (await one('SELECT id FROM pessoas WHERE nome = $1', [n])).id;

    // Empréstimo da Dona Elisa: ~R$ 16.800 todo dia 5, da LTON para a conta pessoal.
    await query(`INSERT INTO recorrencias
      (nome, dia_mes, valor, estimado, tipo, conta_id, categoria_id, pessoa_id, descricao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [
      'Empréstimo Dona Elisa (LTON → conta pessoal)', 5, 1680000, 1, 'saida',
      await idConta('LTON'), emprestimo, await idPessoa('Dona Elisa'),
      'Pagamento do empréstimo usado na OnTrade, enviado da LTON para a conta pessoal da Dona Elisa. Valor aproximado.']);
  });
  return true;
}
