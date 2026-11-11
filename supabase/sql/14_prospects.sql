-- =====================================================================
-- 14_prospects.sql
-- Buscador (menu Negócio): marcas pra abordar com UGC e negócios que
-- podem virar clientes de bio link, portfólio e site.
-- A busca na web (claude-ia, modo "buscador") e o "Adicionar" do painel
-- gravam aqui; o status acompanha a abordagem.
-- Pode rodar de novo sem problema.
-- =====================================================================
create table if not exists public.prospects (
  id           uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('marca', 'cliente')),
  nome         text not null,
  instagram    text not null default '',     -- só o usuário, sem @
  site         text not null default '',
  cidade       text not null default '',
  nicho        text not null default '',
  sinal        text not null default '',     -- ex: "sem site", "usa Linktree", "procura creators"
  porque       text not null default '',
  mensagem     text not null default '',
  contato      text not null default '',
  fonte        text not null default '',
  status       text not null default 'novo', -- novo / abordado / respondeu / fechou / descartado
  notas        text not null default '',
  abordado_em  date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists prospects_ig_unico on public.prospects (tipo, lower(instagram)) where instagram <> '';

alter table public.prospects enable row level security;
drop policy if exists painel_autenticado on public.prospects;
create policy painel_autenticado on public.prospects for all to authenticated using (true) with check (true);
revoke all on public.prospects from anon;
grant select, insert, update, delete on public.prospects to authenticated;
