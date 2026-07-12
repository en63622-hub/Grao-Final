-- =========================================================
-- FINANÇAS PESSOAIS — SCHEMA SUPABASE (Postgres) + RLS
-- Execute este script inteiro no SQL Editor do Supabase
-- =========================================================

-- ---------- EXTENSÕES ----------
create extension if not exists "uuid-ossp";

-- ---------- 1. SALDOS (saldo corrente único por usuário; a virada de mês
--               é automática pois não zeramos nada — apenas lançamos
--               transações datadas, e o saldo é sempre o acumulado) ----------
create table if not exists public.balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  debito numeric(14,2) not null default 0,
  dinheiro numeric(14,2) not null default 0,
  va numeric(14,2) not null default 0,
  credit_limit_total numeric(14,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------- 2. CONFIGURAÇÃO DO CARTÃO DE CRÉDITO ----------
create table if not exists public.credit_card_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  closing_day int not null default 25 check (closing_day between 1 and 28),
  due_day int not null default 5 check (due_day between 1 and 28),
  updated_at timestamptz not null default now()
);

-- ---------- 3. TRANSAÇÕES (extrato geral: gastos em débito/dinheiro/va,
--               entradas de saldo, transferências dinheiro->débito) ----------
create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('gasto','entrada','transferencia')),
  payment_method text check (payment_method in ('debito','dinheiro','va')),
  amount numeric(14,2) not null,
  description text not null default '',
  observacao text default '',
  tag text check (tag in ('urgente','necessario','futil')),
  origem text not null default 'manual', -- 'manual' | 'chat'
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  credit_purchase_id uuid, -- FK adicionada após a criação de credit_purchases (ver abaixo)
  canceled boolean not null default false,
  canceled_at timestamptz
);

create index if not exists idx_transactions_user on public.transactions(user_id, occurred_at desc);

-- ---------- 4. COMPRAS NO CRÉDITO ----------
create table if not exists public.credit_purchases (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  total_value numeric(14,2) not null,
  installments_count int not null default 1 check (installments_count >= 1),
  installment_value numeric(14,2) not null,
  tag text check (tag in ('urgente','necessario','futil')),
  purchase_date date not null default current_date,
  created_at timestamptz not null default now(),
  canceled boolean not null default false,
  canceled_at timestamptz
);

create index if not exists idx_credit_purchases_user on public.credit_purchases(user_id, purchase_date desc);

-- FK de transactions.credit_purchase_id -> credit_purchases.id (agora que a tabela existe)
alter table public.transactions
  add constraint transactions_credit_purchase_id_fkey
  foreign key (credit_purchase_id) references public.credit_purchases(id) on delete set null;

-- ---------- 5. PARCELAS (uma linha por parcela, associada a um mês de fatura) ----------
create table if not exists public.credit_installments (
  id uuid primary key default uuid_generate_v4(),
  purchase_id uuid not null references public.credit_purchases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  installment_number int not null,
  invoice_month date not null, -- sempre dia 01 do mês da fatura (mês de vencimento)
  value numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_credit_installments_user_month on public.credit_installments(user_id, invoice_month);

-- ---------- 6. PAGAMENTOS DE FATURA (ledger de pagamentos parciais/totais/antecipados) ----------
create table if not exists public.invoice_payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_month date not null,
  amount numeric(14,2) not null,
  payment_source text not null check (payment_source in ('dinheiro','debito')),
  paid_at timestamptz not null default now()
);

create index if not exists idx_invoice_payments_user_month on public.invoice_payments(user_id, invoice_month);

-- ---------- 7. DEVEDORES ----------
create table if not exists public.debtors (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  original_value numeric(14,2) not null,
  current_value numeric(14,2) not null,
  has_interest boolean not null default false,
  interest_rate numeric(6,3) default 0, -- percentual (ex: 2.5 = 2,5%)
  loan_date date not null default current_date,
  expected_payment_date date,
  observation text default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_debtors_user on public.debtors(user_id);

-- ---------- 8. HISTÓRICO DE TRANSAÇÕES DO DEVEDOR ----------
create table if not exists public.debtor_transactions (
  id uuid primary key default uuid_generate_v4(),
  debtor_id uuid not null references public.debtors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('emprestimo','pagamento','juros')),
  amount numeric(14,2) not null,
  destination_wallet text check (destination_wallet in ('debito','dinheiro','va')),
  note text default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_debtor_tx_debtor on public.debtor_transactions(debtor_id, created_at desc);

-- ---------- 9. METAS ----------
create table if not exists public.goals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null check (period in ('mensal','semanal')),
  amount numeric(14,2) not null,
  reference_start date not null, -- dia 01 do mês (mensal) ou segunda-feira (semanal)
  created_at timestamptz not null default now()
);

create unique index if not exists uq_goal_user_period_ref on public.goals(user_id, period, reference_start);

-- =========================================================
-- ROW LEVEL SECURITY — todas as tabelas restritas a auth.uid()
-- =========================================================

alter table public.balances enable row level security;
alter table public.credit_card_settings enable row level security;
alter table public.transactions enable row level security;
alter table public.credit_purchases enable row level security;
alter table public.credit_installments enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.debtors enable row level security;
alter table public.debtor_transactions enable row level security;
alter table public.goals enable row level security;

-- BALANCES
create policy "balances_select_own" on public.balances for select using (auth.uid() = user_id);
create policy "balances_insert_own" on public.balances for insert with check (auth.uid() = user_id);
create policy "balances_update_own" on public.balances for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "balances_delete_own" on public.balances for delete using (auth.uid() = user_id);

-- CREDIT CARD SETTINGS
create policy "ccs_select_own" on public.credit_card_settings for select using (auth.uid() = user_id);
create policy "ccs_insert_own" on public.credit_card_settings for insert with check (auth.uid() = user_id);
create policy "ccs_update_own" on public.credit_card_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ccs_delete_own" on public.credit_card_settings for delete using (auth.uid() = user_id);

-- TRANSACTIONS
create policy "tx_select_own" on public.transactions for select using (auth.uid() = user_id);
create policy "tx_insert_own" on public.transactions for insert with check (auth.uid() = user_id);
create policy "tx_update_own" on public.transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tx_delete_own" on public.transactions for delete using (auth.uid() = user_id);

-- CREDIT PURCHASES
create policy "cp_select_own" on public.credit_purchases for select using (auth.uid() = user_id);
create policy "cp_insert_own" on public.credit_purchases for insert with check (auth.uid() = user_id);
create policy "cp_update_own" on public.credit_purchases for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cp_delete_own" on public.credit_purchases for delete using (auth.uid() = user_id);

-- CREDIT INSTALLMENTS
create policy "ci_select_own" on public.credit_installments for select using (auth.uid() = user_id);
create policy "ci_insert_own" on public.credit_installments for insert with check (auth.uid() = user_id);
create policy "ci_update_own" on public.credit_installments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ci_delete_own" on public.credit_installments for delete using (auth.uid() = user_id);

-- INVOICE PAYMENTS
create policy "ip_select_own" on public.invoice_payments for select using (auth.uid() = user_id);
create policy "ip_insert_own" on public.invoice_payments for insert with check (auth.uid() = user_id);
create policy "ip_update_own" on public.invoice_payments for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ip_delete_own" on public.invoice_payments for delete using (auth.uid() = user_id);

-- DEBTORS
create policy "debtors_select_own" on public.debtors for select using (auth.uid() = user_id);
create policy "debtors_insert_own" on public.debtors for insert with check (auth.uid() = user_id);
create policy "debtors_update_own" on public.debtors for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "debtors_delete_own" on public.debtors for delete using (auth.uid() = user_id);

-- DEBTOR TRANSACTIONS
create policy "dtx_select_own" on public.debtor_transactions for select using (auth.uid() = user_id);
create policy "dtx_insert_own" on public.debtor_transactions for insert with check (auth.uid() = user_id);
create policy "dtx_update_own" on public.debtor_transactions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dtx_delete_own" on public.debtor_transactions for delete using (auth.uid() = user_id);

-- GOALS
create policy "goals_select_own" on public.goals for select using (auth.uid() = user_id);
create policy "goals_insert_own" on public.goals for insert with check (auth.uid() = user_id);
create policy "goals_update_own" on public.goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals_delete_own" on public.goals for delete using (auth.uid() = user_id);

-- =========================================================
-- TRIGGER: cria linhas default (balances + credit_card_settings)
-- automaticamente quando um novo usuário se cadastra
-- =========================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.balances (user_id) values (new.id) on conflict do nothing;
  insert into public.credit_card_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
