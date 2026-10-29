-- =====================================================================
-- 10_permuta_ia.sql
--   - campanhas: pagamento em dinheiro, permuta ou os dois; nicho.
--   - quadros: quadros fixos de conteúdo + os posts de cada um + análise.
--   - em_alta: trends, pautas e achados que o Claude pesquisa.
--   - estrategia_chat: a conversa com o Claude na página Estratégia.
--   (A análise geral e o plano de 30 dias ficam em painel_config.)
-- Pode rodar de novo sem problema.
-- =====================================================================
alter table public.campanhas add column if not exists tipo_pagamento text not null default 'dinheiro';  -- dinheiro / permuta / misto
alter table public.campanhas add column if not exists permuta text not null default '';                 -- o que veio de permuta
alter table public.campanhas add column if not exists nicho text not null default '';

create table if not exists public.quadros (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  descricao    text not null default '',
  media_ids    text[] not null default '{}',   -- posts do Instagram que são desse quadro
  analise      jsonb,                          -- última análise do Claude
  analisado_em timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.em_alta (
  id         bigint generated always as identity primary key,
  lote       timestamptz not null,             -- quando a pesquisa foi feita
  tema       text not null,                    -- ugc / autocuidado / rotina / reforma / mae / fitness
  tipo       text not null,                    -- achado / trend / pauta
  titulo     text not null,
  descricao  text not null default '',
  ideia      text not null default '',         -- como virar roteiro
  fonte      text not null default ''
);
create index if not exists em_alta_lote on public.em_alta (lote desc);

create table if not exists public.estrategia_chat (
  id          bigint generated always as identity primary key,
  papel       text not null,                   -- voce / claude
  texto       text not null,
  created_at  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['quadros', 'em_alta', 'estrategia_chat'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists painel_autenticado on public.%I', t);
    execute format('create policy painel_autenticado on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
