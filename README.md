# Controle Financeiro OnTrade / LT1

Esqueleto de um sistema (estilo SaaS) para o **caixa diário e mensal** da OnTrade e da LT1.

- Lançamentos diários de **entrada, saída e transferência**, por conta, categoria e pessoa
- Separação automática **com nota × sem nota** e **quem pagou** (OnTrade × LT1)
- **Fechamento de caixa diário** (saldo do sistema × contado) com trava do dia
- **Excel diário e mensal** (abre direto no Google Sheets) — botão “Emitir controle mensal”
- Painel com saldos, entradas/saídas por dia, por grupo e por categoria
- Recorrências (já vem o empréstimo da Dona Elisa: ~R$ 16.800 todo dia 5)
- Mapa visual do fluxo do dinheiro e roadmap de sugestões dentro do app

## Rodar

```bash
npm install
npm start            # http://localhost:3000
npm run demo         # (opcional) cria lançamentos FICTÍCIOS do mês para visualizar
npm run reset        # apaga o banco e volta ao esqueleto limpo
npm test
```

Requer Node ≥ 22. Sem configuração o sistema usa um Postgres embutido (PGlite) em `data/pg`; com `DATABASE_URL` usa o Postgres do Supabase.

## Publicar (Vercel + Supabase)

1. **Supabase:** as tabelas estão em `src/schema.sql` (já aplicadas no projeto; o sistema também as cria sozinho se faltarem). RLS fica ligado sem políticas: só o servidor acessa os dados.
2. **Vercel → Settings → Environment Variables** (Production e Preview):
   - `DATABASE_URL` — string de conexão **Transaction pooler** do Supabase (Project Settings → Database). Contém a senha do banco: cole só no painel da Vercel, nunca no chat nem no código.
   - `SETUP_TOKEN` — código secreto exigido para criar o primeiro administrador.
3. Faça um novo deploy (Deployments → Redeploy) e abra o site para criar o administrador.

## Login e perfis

No primeiro acesso o sistema pede para criar o **administrador**; depois disso essa tela some. Em servidor público, defina `SETUP_TOKEN=um-codigo` para que só quem souber o código consiga criar o primeiro admin.

| Perfil | Pode |
|---|---|
| Administrador (Dona Elisa) | Tudo: cadastros, usuários, editar lançamento, reabrir dia |
| Operador | Lançar, excluir lançamento, fechar o dia, lançar recorrências |
| Somente leitura (contador) | Consultar painel/relatórios e baixar Excel |

Segurança: senhas com scrypt, sessão em cookie HttpOnly/SameSite (Secure atrás de HTTPS), bloqueio após 8 tentativas erradas, o autor de cada lançamento vem do usuário logado (não dá para lançar "em nome de" outra pessoa), desativar usuário derruba as sessões e o sistema nunca fica sem administrador.

## Como o dinheiro foi modelado

| Conceito | No sistema |
|---|---|
| Com nota | Contas `Banco Safra`, `Infinity`, `Bradesco`, `Banco do Brasil` (empresa OnTrade) |
| Sem nota | `DAE`, `PagVeloz`, `LT1`, `Dinheiro (caixa físico)` |
| Quem pagou | Empresa dona da conta usada na saída (ex.: saída da conta LT1 = “paga pela LT1”) |
| Folha | Pessoas + categorias (Salário, Pró-labore, Comissão, Cartão iFood, Passagem…) |
| Empréstimo | Recorrência dia 5, saída da LT1, categoria “Empréstimo Dona Elisa” |

Valores são guardados em centavos (bigint). Salários, iFood etc. **não** vêm preenchidos — entram aos poucos como lançamentos/recorrências.

## Estrutura

```
src/schema.sql   tabelas (PostgreSQL)
src/db.js        conexão (Supabase/pg ou PGlite local)
src/seed.js      contas, categorias, pessoas e recorrência iniciais
src/services.js  regras de negócio (saldos, fechamento, painel)
src/export.js    geração dos Excel (exceljs)
src/app.js       API REST (Express)
src/server.js    inicia o servidor local
api/index.js     entrada da Vercel
public/          interface (HTML/CSS/JS puro)
test/            testes das regras
```

## Pontos a confirmar (marcados nos cadastros)

- Kátia e Dona Kátia são a mesma pessoa? (hoje está como uma só, vínculo Japeri)
- O DAE gera saldo para a OnTrade ou é só canal de pagamento ao fornecedor?
- PagVeloz é conta da OnTrade ou da LT1?
- Seu Dantas, Fátima, Tayane, Fabiano, Douglas e Andresa: quais são registrados?
