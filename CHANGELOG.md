# Grão — Changelog das novas funcionalidades

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
