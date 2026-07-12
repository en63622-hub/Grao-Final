# Grão — Finanças Pessoais (PWA)

Web app multiusuário de finanças pessoais. React + Tailwind + Supabase (Auth + Postgres). Lançamento de gastos por chat usando **Regex puro** (sem IA paga).

## 1. Configurar o Supabase

1. Crie um projeto em https://supabase.com.
2. Vá em **SQL Editor** → cole e execute todo o conteúdo de `supabase/schema.sql`.
   - Isso cria as tabelas, ativa **RLS** (Row Level Security) em todas elas com policies que restringem cada linha ao `auth.uid()`, e cria um trigger que inicializa `balances` e `credit_card_settings` para cada novo usuário automaticamente.
3. Em **Authentication → Providers**, deixe o login por E-mail/Senha habilitado (padrão).
4. Em **Project Settings → API**, copie a `Project URL` e a `anon public key`.

## 2. Configurar o frontend

```bash
cp .env.example .env
# edite .env com sua URL e ANON KEY do Supabase
npm install
npm run dev
```

Acesse `http://localhost:5173`.

## 3. Build de produção

```bash
npm run build
npm run preview
```

## Estrutura

```
supabase/schema.sql        → tabelas + RLS + trigger
src/lib/supabaseClient.js  → cliente Supabase
src/lib/dateUtils.js       → cálculo de ciclo de fatura (fechamento/vencimento), formatação
src/lib/chatParser.js      → parser Regex do chat (valor, forma de pagamento, descrição)
src/context/AuthContext    → sessão/login/cadastro
src/context/FinanceContext → toda a lógica de negócio (saldos, cartão, devedores, metas)
src/pages/Dashboard.jsx    → saldos, adicionar saldo, depósito, extrato com busca/filtro
src/pages/CreditCard.jsx   → config de fatura, timeline de meses, compras, pagamento
src/pages/Chat.jsx         → lançamento via texto livre + fallback de campos faltantes
src/pages/Debtors.jsx      → central de devedores, juros, amortização, histórico
src/pages/Reports.jsx      → metas, relatório por tag (Urgente/Necessário/Fútil), alerta preditivo
```

## Regras de negócio implementadas

- **Saldo Total** = Débito + Dinheiro (limite de crédito nunca entra na soma).
- **Depositar**: transfere Dinheiro → Débito instantaneamente.
- **Virada de mês automática**: o saldo é um valor corrente único por usuário — não há "zeragem" mensal, então a continuidade histórica é natural. Os relatórios agrupam por mês a partir do campo `occurred_at` das transações.
- **Fatura do cartão**: compra após o dia de fechamento cai na fatura seguinte (`getInvoiceMonthForPurchase` em `dateUtils.js`). O limite é reduzido no ato pelo valor total da compra (`credit_limit_total - Σparcelas + Σpago`).
- **Parcelamento**: sem limite máximo de parcelas; valor dividido e ajustado na última parcela para bater centavos.
- **Pagamento de fatura**: total, parcial ou antecipado, debitando de Dinheiro ou Débito.
- **Chat com Regex**: `parseChatMessage` extrai valor/forma de pagamento/descrição; campos faltantes disparam perguntas de fallback sequenciais.
- **Devedores**: juros percentuais aplicáveis sob demanda, amortização parcial, histórico completo por pessoa, saldo do pagamento somado à carteira escolhida.
- **Metas e alerta preditivo**: cruza % da meta consumida com % de gastos "Fúteis" no período.
- **Multiusuário seguro**: toda tabela tem RLS com `auth.uid() = user_id` em SELECT/INSERT/UPDATE/DELETE; o frontend sempre passa `.eq('user_id', user.id)` como reforço extra.
