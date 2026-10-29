-- =====================================================================
-- 11_carrosseis.sql: carrosséis criados no editor (Estagiário > Criar posts).
-- Cada carrossel guarda os slides em JSON (textos, layout, cores e fotos
-- já reduzidas pelo painel). Pode rodar de novo sem problema.
-- =====================================================================
create table if not exists public.carrosseis (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null default 'Carrossel sem nome',
  slides      jsonb not null default '[]'::jsonb,
  opcoes      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.carrosseis enable row level security;
drop policy if exists painel_autenticado on public.carrosseis;
create policy painel_autenticado on public.carrosseis
  for all to authenticated using (true) with check (true);
revoke all on public.carrosseis from anon;
grant select, insert, update, delete on public.carrosseis to authenticated;
