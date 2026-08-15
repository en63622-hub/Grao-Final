# Grão — Changelog das novas funcionalidades

## 🆕 Fase 7 — Simplificação de Dashboard e Devedores

Sem migração de banco nesta rodada — só limpeza de interface e código morto.

- **Dashboard**: removido por completo o card "Renda comprometida no
  futuro" e o modal de detalhe por parcelamento que abria a partir dele.
  Removidos também, do `FinanceContext.jsx`, os cálculos que só existiam
  para alimentar essa funcionalidade (`committedFuture`,
  `installmentCommitment`) e um segundo recurso que dependia deles e nunca
  chegou a ser usado em nenhuma tela (`incomeCommitment` / renda mensal /
  `updateMonthlyIncome`) — removidos juntos para não deixar código morto
  referenciando algo que não existe mais.
- **Devedores**: os 4 cards de métricas do topo (Total emprestado, Total a
  receber, Nº de devedores, Atrasados) foram substituídos por um único
  card central e destacado, "Total Atual Emprestado" — o valor que ainda
  falta receber agora (soma do saldo em aberto de todos os devedores), no
  mesmo estilo do hero card "Saldo total" do Dashboard para ficar visual e
  harmonicamente integrado à tela. A lista de devedores, os badges de
  status (Em dia/Atrasado/Quitado) por pessoa e todos os fluxos de
  empréstimo/pagamento continuam intactos.

---

## 🆕 Fase 6 — Etapa 2/3 (ajustes finais): PDF do Extrato por seleção + correção de RLS

**⚠️ Rode de novo:** `supabase/migration_010_terceiros_ocultos.sql` no SQL
Editor do Supabase — mesmo que já tenha rodado a versão anterior. Ela
continua idempotente e agora também corrige a permissão da tabela
`hidden_third_parties` (ver item 2 abaixo).

Correções desta rodada:
- **PDF do Extrato com Itens Selecionados**: o modal "Gerar PDF do
  Extrato" (`Statement.jsx`) ganhou a opção **"Itens selecionados"**,
  igual à da Fatura — exporta exclusivamente as transações marcadas via
  seleção múltipla na tela. Se houver itens selecionados ao abrir o
  modal, essa opção já vem marcada automaticamente como sugestão.
- **`permission denied for table hidden_third_parties`**: o erro
  acontecia porque, no Postgres/Supabase, habilitar RLS não basta por si
  só — as roles de banco (`authenticated`) também precisam do `GRANT`
  explícito na tabela; sem ele, a query é barrada antes mesmo de avaliar
  as policies. A migração 010 foi atualizada para consolidar as policies
  em uma única `FOR ALL` (`auth.uid() = user_id` em `USING`/`WITH CHECK`)
  e adicionar `GRANT ALL ON hidden_third_parties TO authenticated`. O
  `schema.sql` (para instalações novas) foi atualizado da mesma forma.

---

## 🆕 Fase 6 — Etapa 2/3: filtros por categoria, gestão de terceiros e PDF por seleção

**⚠️ Rode primeiro:** `supabase/migration_010_terceiros_ocultos.sql` no SQL
Editor do Supabase (idempotente, roda independente das anteriores). Ela cria
a tabela `hidden_third_parties`, usada apenas para lembrar quais nomes de
terceiros o usuário pediu para tirar da lista de sugestões — sem tocar em
nenhuma transação já lançada.

Itens finalizados nesta etapa:
- **Busca por Categoria e Subcategoria**: o campo de busca do Extrato
  (`Statement.jsx`) e da Fatura (`CreditCard.jsx`) agora também casa pelo
  nome da Categoria e da Subcategoria do lançamento (ex: digitar
  "Alimentação" ou "Supermercado" traz todas as movimentações associadas),
  continuando a aceitar busca por descrição e por valor como antes.
- **Gerenciamento e Exclusão de Terceiros**: novo botão "Gerenciar" ao lado
  do seletor de terceiros no Extrato, abrindo um modal com a lista completa
  de nomes já usados. Cada nome pode ser "Excluído" (sai da lista de
  sugestões do filtro "Lançamentos de Terceiros") ou "Restaurado" depois,
  sem nunca apagar as transações antigas já registradas com aquele nome.
- **PDF da Fatura com Itens Selecionados**: o modal "Gerar PDF da Fatura"
  agora sempre oferece "Fatura completa" (todos os lançamentos do
  ciclo/mês selecionado) e "Itens selecionados" (exclusivamente os itens
  marcados via seleção múltipla na tela), além de "Filtros atuais" quando
  há uma busca ativa. Se o usuário já tiver itens marcados ao abrir o
  modal, a opção "Itens selecionados" é sugerida automaticamente.

---

## 🆕 Fase 6 — Etapa 1/3: correção de erros críticos de schema e fluxo financeiro

**⚠️ Rode primeiro:** `supabase/migration_009_correcoes_schema.sql` no SQL
Editor do Supabase. Ela é idempotente e auto-suficiente — cobre tudo que as
migrações 007/008 já faziam (então funciona mesmo que elas nunca tenham
sido rodadas nesse banco), então roda ela sozinha resolve tudo.

Causa raiz encontrada: o banco de dados em uso não tinha as migrações
007/008 aplicadas, então várias colunas novas (`debtor_id`,
`debtor_transaction_id`, `invoice_payment_id`, etc.) não existiam. Vários
`insert` em `transactions` no código não verificavam erro nenhum — então,
quando faltava uma coluna, o saldo já tinha sido debitado/creditado mas o
lançamento **sumia silenciosamente do Extrato**, sem nenhum aviso.

Correções desta etapa:
- **Erro de schema no recebimento de empréstimo** (`Could not find the
  'debtor_transaction_id' column...`): coluna garantida na migração 009;
  além disso, o código agora é resiliente — se uma coluna nova ainda não
  existir, o lançamento é salvo mesmo assim (sem aquele vínculo específico)
  em vez de falhar ou sumir. Aplicado a todos os `insert` em `transactions`
  e ao `insert` de `debtor_transactions.credit_purchase_id`.
- **Constraint única bloqueando metas simultâneas**
  (`uq_goal_user_period_active_idx`): removida na migração 009 (por nome
  exato, mais uma varredura automática que remove qualquer índice único
  remanescente na tabela `goals` envolvendo a coluna `period`, cobrindo
  nomes de versões antigas do schema que a gente não tinha mapeado).
- **Pagamento parcial de fatura sumindo do Extrato**: bug de código — o
  insert da transação em `payInvoice` não checava erro. Agora usa o
  mesmo insert resiliente e sempre grava a saída no Extrato com
  `description: 'Pagamento de fatura'`, tanto em quitação parcial quanto
  total.

---

## 🆕 Fase 5.5 — Pesquisa por valor, PDF filtrado e integridade de estornos

**⚠️ Rode primeiro:** `supabase/migration_008_integridade_estornos.sql` no SQL
Editor do Supabase (idempotente, roda depois da 007). Ela liga cada
transação de pagamento de fatura à sua linha em `invoice_payments`, e cada
transação de recebimento de dívida à sua linha em `debtor_transactions` —
sem esses vínculos, estornar esses lançamentos pelo Extrato devolvia o
dinheiro para o saldo, mas não corrigia o indicador "Pago até agora" da
fatura nem o saldo devedor da pessoa em Devedores.

Itens finalizados nesta sessão:
- **Pesquisa por valor**: o campo de busca do Extrato e da Fatura agora
  também casa pelo valor da compra (ex: `59` ou `59,43`), além do nome.
- **Data e hora por item na Fatura**: cada parcela mostra sua data/hora
  exata de lançamento (ex: `07/08/2026 às 19:11`), mantendo o agrupamento
  por linha do tempo.
- **PDF da Fatura**: nova funcionalidade de exportação, com "Filtros
  atuais" (respeita a busca aplicada na tela) ou "Fatura completa".
- **PDF do Extrato com filtros**: passa a oferecer "Filtros atuais" (busca,
  tags, forma de pagamento, Próprio/Terceiros, datas), além de "Mês atual"
  e "Intervalo de datas".
- **Integridade total de estornos**:
  - Estornar um pagamento de fatura agora remove a linha correspondente em
    `invoice_payments`, corrigindo o "Pago até agora" da fatura.
  - Estornar um "Recebimento Empréstimo" agora restaura o saldo devedor da
    pessoa em Devedores ao valor exato de antes desse recebimento, e remove
    a linha correspondente do histórico do devedor.
- **Ajuste de rótulo**: "Minha" → "Meu" no seletor Próprio/Terceiros do
  modal de lançamento.

---

## 🆕 Fase 5.4 — Auditoria e finalização (sessão atual)

**⚠️ Rode primeiro:** `supabase/migration_007_ajustes_finais.sql` no SQL Editor
do Supabase (idempotente). Ela corrige um problema crítico deixado da sessão
anterior — a tabela `goals` nunca ganhou as colunas `description`/`active` que o
código já usava, e `transactions.payment_method` não aceitava `'credito'` nem
`null` — então metas, compras no crédito e aumento de limite podiam estar
falhando contra o banco. Veja os comentários no topo do arquivo de migração
para o detalhe de cada alteração.

Itens do checklist finalizados nesta sessão:
- **Devedores**: cards do topo compactados; botão renomeado para "+ Registrar
  Empréstimo"; avaliação por estrelas removida da interface; nova opção de
  origem "Cartão de Crédito" (vira uma compra de 1x no seu cartão); sincronização
  bidirecional Extrato/Fatura × Devedores (estornar um lado reflete no outro,
  com bloqueio claro quando a dívida já está quitada).
- **Início**: botão solto "+ Lançamento" removido (só resta o "+" central do
  menu inferior).
- **Fatura**: compras agrupadas em linha do tempo por data (Hoje/Ontem/etc.);
  edição do nome/descrição da compra, refletindo também no Extrato.
- **Lançamentos**: opção "Minha" vs "Para terceiros" (com nome do terceiro) no
  modal de novo lançamento; filtro correspondente no Extrato, com busca por
  nome do terceiro.
- **Seleção múltipla**: botão "Selecionar tudo" na barra flutuante do Extrato e
  da Fatura.
- **Extrato**: exportação em PDF (mês atual ou intervalo de datas escolhido);
  contador de lançamentos do mês (desconsiderando estornados).
- **Metas**: período totalmente livre em dias (os botões Semanal/Mensal viraram
  atalhos que só preenchem o número); correção de contagem duplicada — o
  pagamento da fatura deixou de ser somado de novo em Relatórios/Metas (a
  compra no crédito já é contada no momento da compra).

---

Este pacote contém **apenas os arquivos alterados ou criados** em cima do seu `.zip`
atual. Basta sobrescrever esses arquivos no seu projeto, mantendo a mesma estrutura
de pastas, e rodar a migração SQL indicada abaixo.

## ⚠️ Passo obrigatório: rodar a migração no Supabase

Como seu banco já existe, rode no **SQL Editor do Supabase**:

```
supabase/migration_002_estorno_devedores_metas.sql
```

Ele adiciona (de forma idempotente, pode rodar mais de uma vez sem problema):
- `credit_purchases.canceled` / `canceled_at`
- `transactions.canceled` / `canceled_at` / `credit_purchase_id` (+ FK e índice)

O `supabase/schema.sql` também foi atualizado (para quem for subir um banco novo do
zero), mas se seu banco já existe, **use a migração**, não rode o schema completo de novo.

> Observação: compras no crédito lançadas **antes** da migração não terão
> `credit_purchase_id` preenchido no extrato, então o botão "Estornar" do extrato não
> vai funcionar para elas (mas o estorno pela aba **Fatura** continua funcionando
> normalmente para qualquer compra, antiga ou nova). Há um UPDATE opcional comentado
> no final do arquivo de migração para linkar compras antigas por valor/data, se quiser.

---

## 1. Devedores — busca, alerta de prazo e acúmulo de dívida

**Arquivos:** `src/pages/Debtors.jsx`, `src/context/FinanceContext.jsx`, `src/lib/dateUtils.js`

- Campo de busca por nome no topo da lista de devedores.
- Nova função `daysUntil()` em `dateUtils.js`.
- Badge visual na lista e no modal de detalhes:
  - **"Atrasado"** (vermelho) se a previsão de pagamento já passou.
  - **"⏰ Vence em Xd" / "Vence hoje"** (âmbar) se faltam 0–7 dias.
- Botão **"+ Somar novo valor à dívida"** no modal de detalhes do devedor, para
  quando o cliente faz um novo fiado/serviço antes de quitar o anterior. Usa a nova
  função `increaseDebt()` no `FinanceContext`, que soma o valor tanto ao
  `original_value` quanto ao `current_value` e registra no histórico.
- Pequeno ajuste interno: a lista agora seleciona o devedor por `id` (não por objeto
  "congelado"), então o modal reflete o valor atualizado assim que você soma um novo
  valor ou registra um pagamento, sem precisar fechar e reabrir.

## 2. Estorno de compras (extrato e fatura)

**Arquivos:** `src/context/FinanceContext.jsx`, `src/pages/Dashboard.jsx`,
`src/pages/CreditCard.jsx`, `supabase/schema.sql`, `supabase/migration_002_*.sql`

- Novo botão **"Estornar"** em cada gasto do extrato (Dashboard) e em cada compra
  listada na fatura (CreditCard).
- Débito / Dinheiro / VA → `cancelTransaction()` devolve o valor para o saldo de
  origem e marca a transação como `canceled` (ela continua no extrato, mas riscada e
  com a etiqueta "Estornado", sem contar mais no saldo).
- Crédito → `cancelCreditPurchase()` apaga as parcelas restantes da compra (o que
  automaticamente reduz o valor da(s) fatura(s) afetada(s), já que o total da fatura
  é somado a partir das parcelas existentes) e marca a compra e a transação vinculada
  como canceladas. O limite de crédito disponível é recalculado automaticamente.
- Transações de crédito agora guardam `credit_purchase_id`, o vínculo necessário para
  o extrato saber qual compra estornar.

## 3. Metas semanais/mensais com ciclo de 30/7 dias

**Arquivos:** `src/pages/Reports.jsx`, `src/lib/dateUtils.js`

- Nova função `cycleRange(referenceStart, days)` em `dateUtils.js`: calcula uma janela
  rolante de N dias, reiniciando automaticamente a cada N dias a partir da data em que
  a meta foi criada — em vez de usar o mês/semana do calendário civil como antes.
- Meta **Mensal** → ciclo de 30 dias. Meta **Semanal** → ciclo de 7 dias.
- O card de meta agora mostra "ciclo de N dias" e a data em que o ciclo atual termina.
- Passa a usar a meta mais recente cadastrada por período (`created_at` mais recente),
  já que o usuário pode redefinir a meta mais de uma vez ao longo do tempo.
- Transações estornadas (`canceled`) deixam de contar nos totais de gastos e nas
  metas.

## 4. Relatório expandido por categoria

**Arquivo:** `src/pages/Reports.jsx`

- Cada linha de categoria (Urgente / Necessário / Fútil) agora é clicável e abre um
  modal (`CategoryDetailModal`) listando todos os lançamentos daquele mês que compõem
  aquela categoria, com data, forma de pagamento e valor.

## 5. Status de fatura estilo Nubank

**Arquivo:** `src/pages/CreditCard.jsx`

- Reaproveita a função já existente `getInvoiceMonthForPurchase()` para descobrir qual
  é a fatura "aberta atual" (a que receberia uma compra feita hoje, considerando o dia
  de fechamento configurado).
- Fatura cujo mês de vencimento é igual ao da fatura aberta atual → badge
  **"Fatura Aberta Atual"**.
- Faturas anteriores a essa → badge **"Fatura Fechada"**.
- Compras feitas após o fechamento do mês já eram automaticamente jogadas para a
  fatura seguinte pela lógica existente de `addCreditPurchase` — esse comportamento
  não mudou, só a exibição do status ficou mais clara.

---

## Onde colar cada arquivo

```
supabase/schema.sql                                  → supabase/schema.sql
supabase/migration_002_estorno_devedores_metas.sql    → supabase/ (novo arquivo — rode no SQL Editor)
src/lib/dateUtils.js                                  → src/lib/dateUtils.js
src/context/FinanceContext.jsx                        → src/context/FinanceContext.jsx
src/pages/Debtors.jsx                                 → src/pages/Debtors.jsx
src/pages/Dashboard.jsx                                → src/pages/Dashboard.jsx
src/pages/CreditCard.jsx                               → src/pages/CreditCard.jsx
src/pages/Reports.jsx                                  → src/pages/Reports.jsx
```

Nenhum outro arquivo do projeto foi tocado (Chat, chatParser, Login, AuthContext,
BottomNav, Modal, AddBalanceModal, index.css, etc. seguem exatamente como estavam).
