-- =========================================================
-- MIGRAÇÃO 002 — Estorno de compras
-- Execute este script no SQL Editor do Supabase do projeto Grão
-- (banco já existente — script idempotente, pode rodar mais de uma vez)
-- =========================================================

-- ---------- credit_purchases: flag de compra estornada ----------
alter table public.credit_purchases
  add column if not exists canceled boolean not null default false,
  add column if not exists canceled_at timestamptz;

-- ---------- transactions: flag de estorno + vínculo com a compra no crédito ----------
alter table public.transactions
  add column if not exists canceled boolean not null default false,
  add column if not exists canceled_at timestamptz,
  add column if not exists credit_purchase_id uuid;

-- FK só é criada se ainda não existir
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_credit_purchase_id_fkey'
  ) then
    alter table public.transactions
      add constraint transactions_credit_purchase_id_fkey
      foreign key (credit_purchase_id) references public.credit_purchases(id) on delete set null;
  end if;
end $$;

create index if not exists idx_transactions_credit_purchase on public.transactions(credit_purchase_id);

-- Observação: compras no crédito lançadas ANTES desta migração não terão
-- credit_purchase_id preenchido (ficam null) e por isso não poderão ser
-- estornadas diretamente pelo extrato — o estorno continua disponível
-- normalmente pela aba Fatura para essas compras antigas, bastando rodar
-- o UPDATE abaixo (opcional) para linká-las por descrição/valor/data caso
-- deseje habilitar o estorno pelo extrato também para lançamentos antigos:
--
-- update public.transactions t
-- set credit_purchase_id = cp.id
-- from public.credit_purchases cp
-- where t.credit_purchase_id is null
--   and t.payment_method = 'credito'
--   and t.kind = 'gasto'
--   and t.user_id = cp.user_id
--   and t.amount = cp.total_value
--   and t.occurred_at::date = cp.purchase_date;
