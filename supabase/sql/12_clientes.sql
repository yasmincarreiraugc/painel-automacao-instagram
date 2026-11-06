-- =====================================================================
-- 12_clientes.sql
--   - clientes: clientes do serviço de bio links, portfólios e sites
--     (menu Clientes). Mesmo jeito das campanhas, com entrada (sinal).
-- Pode rodar de novo sem problema.
-- =====================================================================
create table if not exists public.clientes (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  servico          text not null default 'bio_link',  -- bio_link / portfolio / site / outro
  ramo             text not null default '',          -- ex: Confeitaria, Criadora de conteúdo
  origem           text not null default 'instagram', -- instagram / indicacao / whatsapp / outro
  valor            numeric(12,2) not null default 0,
  entrada          numeric(12,2) not null default 0,  -- sinal já recebido
  data_entrada     date,
  status           text not null default 'producao',  -- orcamento / producao / entregue / finalizado
  prazo_entrega    date,
  pago             boolean not null default false,    -- pagamento completo recebido
  data_pagamento   date,
  entregaveis      text not null default '',
  link             text not null default '',          -- endereço do trabalho no ar
  contato          text not null default '',
  notas            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.clientes enable row level security;
drop policy if exists painel_autenticado on public.clientes;
create policy painel_autenticado on public.clientes for all to authenticated using (true) with check (true);
revoke all on public.clientes from anon;
grant select, insert, update, delete on public.clientes to authenticated;
