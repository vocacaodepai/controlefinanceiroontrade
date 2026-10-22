# Controle Financeiro OnTrade / LTON

Esqueleto de um sistema (estilo SaaS) para o **caixa diário e mensal** da OnTrade e da LTON.

- Lançamentos diários de **entrada, saída e transferência**, por conta, categoria e pessoa
- Separação automática **com nota × sem nota** e **quem pagou** (OnTrade × LTON)
- **Fechamento de caixa diário** (saldo do sistema × contado) com trava do dia
- **Excel diário e mensal** (abre direto no Google Sheets) — botão “Emitir controle mensal”
- Painel com saldos, entradas/saídas por dia, por grupo e por categoria
- Recorrências (já vem o empréstimo da Elisa Maria: ~R$ 16.800 todo dia 5)
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
   - `ANTHROPIC_API_KEY` — chave da API da Anthropic (extratos em PDF/foto e sugestões da IA).
3. Faça um novo deploy (Deployments → Redeploy) e abra o site para criar o administrador.

## Extratos bancários com IA

Tela **Extratos (IA)**: envie o extrato de uma conta e o sistema separa os lançamentos dia a dia e sugere categoria, pessoa e cliente. **Nada vira lançamento sem conferência**: a pessoa revisa, corrige e clica em "Lançar selecionados" (entram nas datas do extrato, na conta escolhida; dia já fechado é recusado).

| Formato | Como é lido |
|---|---|
| OFX, CSV | Direto, sem IA (exato) |
| PDF, foto (PNG/JPG/WebP) | IA (Claude) — precisa de `ANTHROPIC_API_KEY` |

- A classificação usa primeiro **regras aprendidas** (cada confirmação vira uma regra para os próximos extratos) e depois a IA. Sem `ANTHROPIC_API_KEY` o sistema funciona, com classificação manual.
- Reenviar o mesmo extrato não duplica linhas. Limite de 3 MB por arquivo (divida por período).
- Variáveis: `ANTHROPIC_API_KEY` (obrigatória para PDF/foto e sugestões) e `ANTHROPIC_MODEL` (padrão `claude-opus-5-5`; um modelo menor reduz custo e tempo).
- Privacidade: o conteúdo dos extratos enviados à IA vai para o serviço da Anthropic.

## Login e perfis

No primeiro acesso o sistema pede para criar o **administrador**; depois disso essa tela some. Em servidor público, defina `SETUP_TOKEN=um-codigo` para que só quem souber o código consiga criar o primeiro admin.

| Perfil | Pode |
|---|---|
| Administrador (Elisa Maria) | Tudo: cadastros, usuários, editar lançamento, reabrir dia |
| Operador | Lançar, excluir lançamento, fechar o dia, lançar recorrências |
| Somente leitura (contador) | Consultar painel/relatórios e baixar Excel |

Segurança: senhas com scrypt, sessão em cookie HttpOnly/SameSite (Secure atrás de HTTPS), bloqueio após 8 tentativas erradas, o autor de cada lançamento vem do usuário logado (não dá para lançar "em nome de" outra pessoa), desativar usuário derruba as sessões e o sistema nunca fica sem administrador.

## Como o dinheiro foi modelado

| Conceito | No sistema |
|---|---|
| Com nota | Contas `Banco Safra`, `Infinity`, `Bradesco`, `Banco do Brasil` (empresa OnTrade) |
| Sem nota | `DAE`, `PagVeloz`, `LTON`, `Dinheiro (caixa físico)` |
| Quem pagou | Empresa dona da conta usada na saída (ex.: saída da conta LTON = “paga pela LTON”) |
| Folha | Pessoas + categorias (Salário, Pró-labore, Comissão, Cartão iFood, Passagem…) |
| Empréstimo | Recorrência dia 5, saída da LTON, categoria “Empréstimo Elisa Maria” |

Valores são guardados em centavos (bigint). Salários, iFood etc. **não** vêm preenchidos — entram aos poucos como lançamentos/recorrências.

## Estrutura

```
src/schema.sql   tabelas (PostgreSQL)
src/db.js        conexão (Supabase/pg ou PGlite local)
src/seed.js      contas, categorias, pessoas e recorrência iniciais
src/services.js  regras de negócio (saldos, fechamento, painel)
src/export.js    geração dos Excel (exceljs)
src/extratos.js  importação de extratos (OFX/CSV/PDF/foto), IA e regras aprendidas
src/app.js       API REST (Express)
src/server.js    inicia o servidor local
api/index.js     entrada da Vercel
public/          interface (HTML/CSS/JS puro)
test/            testes das regras
```

## Pontos a confirmar (marcados nos cadastros)

- O DAE gera saldo para a OnTrade ou é só canal de pagamento ao fornecedor?
- PagVeloz é conta da OnTrade ou da LTON?
- Dantas, Fátima, Tayane, Fabiano, Douglas e Andresa: quais são registrados?

## Logo

Coloque o arquivo da logo em `public/logo.png`: ela aparece no menu, no login e como ícone da aba. Sem o arquivo, o site mostra o nome em texto.

## Comercial (CRM, orçamentos e painel ao vivo)

- **Orçamentos**: o comercial registra cada orçamento (cliente, produto, valor). Pergunta "cliente já cadastrado?" antes de criar a ficha; cliente com orçamento anterior entra como *recorrente*.
- **Follow-up em cadência**: o comercial segue a régua de mercado, com toques 3, 7, 14 e 21 dias após o orçamento (canal e resultado de cada contato são registrados, e a mensagem de WhatsApp muda a cada etapa). Depois do 4º toque sem resposta o orçamento entra em "Cadência Concluída" para decidir entre encerrar ou retomar. O orçamento só sai do follow-up quando é encerrado (ganho, perdido ou cancelado).
- **Follow-up obrigatório (só no comercial; a administração não recebe pop-up, apenas o contador e a página Follow-up)**: ao entrar, a pessoa do comercial vê, um de cada vez, os follow-ups pendentes dos orçamentos que ela lançou, cada um com a mensagem pronta (nome do cliente e dela), botões Copiar e Abrir WhatsApp e a confirmação "enviei e me responsabilizo". O pop-up lista quem ainda falta e o contador mostra quantos restam; não há "adiar" nem "lembrar mais tarde" (o servidor também recusa adiar para o comercial). Sem concluir todos (enviar ou encerrar o orçamento) não dá para fechar o pop-up nem lançar orçamento novo (o servidor também bloqueia). A página Follow-up (comercial e administração) mostra o que foi enviado (orçamento, cliente, quem enviou, quando) e o que está agendado.
- **Datas**: todo campo de data ou mês tem, logo abaixo, atalhos para navegar pelos anos: setas de ano anterior e próximo, lista de anos (digitar o ano pula direto) e "Hoje" ou "Este mês". Respeita o mínimo e o máximo do campo e mantém mês e dia ao trocar o ano.
- **Celular**: no iPhone (e telas até 820 px) o dashboard vira um aplicativo: barra no topo (logo, aparência e perfil), menu embaixo com uma aba por categoria (Financeiro, Comercial, Marketing, Estoque, Sociedade, Pessoas, Sistema) que abre os itens numa bandeja acima da barra (categoria com um item só vai direto à tela), campos e botões grandes para o toque, janelas que sobem de baixo e tabelas com rolagem lateral. Dá para adicionar à tela de início (manifesto e meta tags). No computador nada muda.
- **Campanhas ligadas aos orçamentos**: quando o comercial marca a origem (Instagram, Facebook, Google anúncio, TikTok, YouTube ou outdoor) e existe campanha ativa daquele canal cobrindo a data, o orçamento é ligado à campanha sozinho (Instagram e Facebook valem para qualquer campanha da Meta; havendo mais de uma, vale a do mesmo canal e a mais recente). Campanha criada depois puxa os orçamentos do período que ficaram sem campanha. O botão Retorno em Marketing mostra, desde o início da campanha, investido, orçamentos, vendido, já recebido (pagamentos registrados no financeiro), custo por orçamento, custo por venda e retorno.
- **Patrimônio em ativos**: a tela abre na visão geral (tudo o que a empresa tem hoje: containers, estoque, carros e outros). Cada item tem um mês de entrada e fica no total até a baixa (vendido ou baixado); o filtro mostra o que entrou em cada mês ou o que já teve baixa. O painel e o PDF dos sócios usam a posição do mês (o que tinha entrado e ainda não tinha baixa até lá).
- **Perfis de acesso**: administrador (tudo, inclusive Estoque), operador, financeiro (só o painel financeiro: lançar, fechar o dia, extratos, controle mensal, patrimônio e orçamentos aprovados), comercial, marketing, sócio, leitor e estoque (só a página Estoque: itens, entradas e saídas, saldo e alerta de estoque mínimo; toda saída exige o destino e o saldo nunca fica negativo).
- **Acessos (admin)**: menu Sistema > Acessos mostra quem está online (atividade nos últimos 5 minutos), o último login e a última atividade de cada usuário. Avisos e atualizações automáticas não contam como atividade.
- **Cobrança (financeiro)**: ao marcar um orçamento como ganho ele sai do follow-up e vira "Orçamento Aprovado" na área do financeiro (admin e operador, menu Financeiro). Régua de cobrança nos dias 1, 3, 7 e 14 após a aprovação; depois disso, "Levar à gestão". O recebimento (total ou parcial) lança a entrada no caixa e quita o orçamento. O comercial não cobra, apenas acompanha a situação.
- **Atualização automática**: a cada 15 minutos todas as telas, de todos os perfis, recarregam sozinhas (dados novos e a versão mais recente do sistema), sem aviso e sem precisar de F5. Só espera quando há pop-up aberto, fila obrigatória de follow-up, campo em foco ou algo digitado nos últimos 10 minutos; ao voltar de segundo plano no celular, atualiza na hora se já passou o prazo.
- **Ao vivo** (admin e sócio; botão de olho no topo esconde todos os números com desfoque e lembra a escolha neste aparelho): dia, mês, produtos, novos x recorrentes, revisitados, perdidos/cancelados com motivo, comparativos com o mês anterior, mesmo mês do ano passado, semestre e ano; atualiza sozinho a cada 15 minutos (e tem botão Atualizar) e tem modo tela cheia.
- O resumo comercial do mês entra no PDF dos sócios.

## Funcionários — Departamento de Pessoas (só administrador)

- Ficha do funcionário: dados pessoais, documentos, CTPS, endereço, contato de emergência, plano de saúde, tipo sanguíneo, ASO, contrato, jornada, dias de trabalho e dados de pagamento. A ficha aponta o que ainda falta preencher.
- Faltas e atestados: tipos falta, atestado, férias, licença, folga e atraso; anexo de PDF/JPG/PNG de até 3 MB; só contam os dias em que a pessoa trabalharia; horas fora calculadas pela jornada.
- Dados pessoais e de saúde são sensíveis (LGPD): só o perfil admin acessa a área.

## Marketing e origem dos orçamentos

- Todo orçamento exige a **origem** (Instagram, Facebook, Google, anúncio na rua, indicação, etc.) e, quando veio de anúncio, pode ser ligado à campanha.
- A ficha do cliente (nome, telefone com DDD, e-mail e aniversário) e os dados do orçamento são **obrigatórios**: o formulário marca com asterisco e destaca o que falta; o servidor também confere.
- **Marketing > Painel** (admin, sócio e perfil Marketing): investimento, leads, custo por lead, orçamentos e vendas por campanha, semana a semana e origem de todos os orçamentos. Os números diários dos anúncios são lançados à mão; Meta Ads e Google Ads entram numa próxima etapa.
- Novo perfil **Marketing**: acessa só o painel de marketing.

## Acesso por e-mail ou ID

- Na tela de entrada vale **e-mail ou ID**. O ID é um nome curto em minúsculas (ex.: `comercial.julia`); quem tem ID não precisa de e-mail.
- Em Cadastros > Novo usuário, informe e-mail, ID ou os dois.
- Perfil **Comercial**: vê só Painel, Orçamentos e Clientes (o servidor bloqueia o resto, inclusive o Ao Vivo). Não troca a própria senha: o administrador redefine em Cadastros.
- O **número do orçamento** é automático e obrigatório (`2026-0572`, `2026-0573`...; só em 2026 a contagem segue de 0572, porque o ano já estava adiantado; a partir de 2027 todo ano recomeça em `0001`); ninguém digita nem altera.
- Cada orçamento e cada cliente novo passam por um **checklist de conferência** (o servidor também exige). O administrador vê o histórico do dia, com quem lançou e a hora, em Orçamentos e em Clientes.
