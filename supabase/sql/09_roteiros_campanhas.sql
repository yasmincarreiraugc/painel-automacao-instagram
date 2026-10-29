-- =====================================================================
-- 09_roteiros_campanhas.sql
--   - campanhas: marca, origem, valor, prazo e pagamento (menu Campanhas).
--   - roteiros: ideias e roteiros de vídeo, ligados ou não a uma campanha.
--   - painel_config: ajustes do painel (ex: a meta de seguidores do Início).
-- Pode rodar de novo sem problema.
-- =====================================================================
create table if not exists public.campanhas (
  id               uuid primary key default gen_random_uuid(),
  marca            text not null,
  origem           text not null default 'outro',     -- instagram / indicacao / agencia / plataforma / email / outro
  valor            numeric(12,2) not null default 0,
  status           text not null default 'ativa',     -- negociando / ativa / entregue / finalizada
  prazo_entrega    date,
  pago             boolean not null default false,
  data_pagamento   date,
  entregaveis      text not null default '',
  notas            text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.roteiros (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null,
  campanha_id    uuid references public.campanhas(id) on delete set null,
  status         text not null default 'ideia',       -- ideia / escrevendo / pronto / gravado / postado
  formato        text not null default 'reels',       -- reels / tiktok / ugc / stories / carrossel
  gancho         text not null default '',
  texto          text not null default '',
  cta            text not null default '',
  data_gravacao  date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.painel_config (
  chave       text primary key,
  valor       jsonb not null,
  updated_at  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['campanhas', 'roteiros', 'painel_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists painel_autenticado on public.%I', t);
    execute format('create policy painel_autenticado on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
