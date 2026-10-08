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

Requer Node ≥ 22.13 (usa o SQLite embutido). O banco fica em `data/caixa.db` (`DB_PATH` para mudar).

## Como o dinheiro foi modelado

| Conceito | No sistema |
|---|---|
| Com nota | Contas `Banco Safra`, `Infinity`, `Bradesco`, `Banco do Brasil` (empresa OnTrade) |
| Sem nota | `DAE`, `PagVeloz`, `LT1`, `Dinheiro (caixa físico)` |
| Quem pagou | Empresa dona da conta usada na saída (ex.: saída da conta LT1 = “paga pela LT1”) |
| Folha | Pessoas + categorias (Salário, Pró-labore, Comissão, Cartão iFood, Passagem…) |
| Empréstimo | Recorrência dia 5, saída da LT1, categoria “Empréstimo Dona Elisa” |

Valores são guardados em centavos. Salários, iFood etc. **não** vêm preenchidos — entram aos poucos como lançamentos/recorrências.

## Estrutura

```
src/db.js        schema SQLite
src/seed.js      contas, categorias, pessoas e recorrência iniciais
src/services.js  regras de negócio (saldos, fechamento, painel)
src/export.js    geração dos Excel (exceljs)
src/server.js    API REST + arquivos estáticos
public/          interface (HTML/CSS/JS puro)
test/            testes das regras
```

## Pontos a confirmar (marcados nos cadastros)

- Kátia e Dona Kátia são a mesma pessoa? (hoje está como uma só, vínculo Japeri)
- O DAE gera saldo para a OnTrade ou é só canal de pagamento ao fornecedor?
- PagVeloz é conta da OnTrade ou da LT1?
- Seu Dantas, Fátima, Tayane, Fabiano, Douglas e Andresa: quais são registrados?
