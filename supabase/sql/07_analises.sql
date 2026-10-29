-- =====================================================================
-- 07_analises.sql: base da aba "Análises" do painel.
--   - ig_followers_daily: 1 foto por dia do total de seguidores. Com ela
--     dá pra calcular "novos seguidores" mesmo sem a permissão de insights.
--   - ig_analytics_cache: guarda o último cálculo de cada período por
--     30 minutos (a função ig-analytics faz muitas chamadas ao Instagram).
--   - pg_cron: tira a foto diária às 00:00 de Brasília (03:00 UTC).
-- Antes de rodar, troque SEU_PROJETO e SEU_SCHED_SECRET (igual ao 04).
-- =====================================================================
create table if not exists public.ig_followers_daily (
  dia         date primary key,
  seguidores  int not null,
  seguindo    int,
  posts       int,
  updated_at  timestamptz not null default now()
);

create table if not exists public.ig_analytics_cache (
  periodo     text primary key,       -- 7 / 30 / 90 / tudo
  payload     jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.ig_followers_daily enable row level security;
alter table public.ig_analytics_cache enable row level security;

-- O painel pode ler o histórico de seguidores. O cache: só as funções.
drop policy if exists painel_le on public.ig_followers_daily;
create policy painel_le on public.ig_followers_daily
  for select to authenticated using (true);
revoke all on public.ig_followers_daily, public.ig_analytics_cache from anon;
revoke all on public.ig_analytics_cache from authenticated;
grant select on public.ig_followers_daily to authenticated;

select cron.unschedule('ig-analytics-diario')
where exists (select 1 from cron.job where jobname = 'ig-analytics-diario');

select cron.schedule(
  'ig-analytics-diario',
  '0 3 * * *',
  $$
  select net.http_post(
    url     := 'https://SEU_PROJETO.supabase.co/functions/v1/ig-analytics',
    headers := '{"Content-Type": "application/json", "x-sched-key": "SEU_SCHED_SECRET"}'::jsonb,
    body    := '{"periodo": "30", "atualizar": true}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
