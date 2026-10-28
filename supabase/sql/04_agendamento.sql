-- =====================================================================
-- 04_agendamento.sql
-- Agenda os "robôs" com pg_cron:
--   ig-scheduler      a cada 1 minuto (esvazia a fila e manda passos com atraso)
--   ig-token-refresh  1x por semana (renova o token do Instagram)
--
-- ANTES DE RODAR, troque os dois placeholders:
--   SEU_PROJETO      -> o id do seu projeto (está na URL do Supabase:
--                       https://SEU_PROJETO.supabase.co)
--   SEU_SCHED_SECRET -> a mesma senha que você colocou no segredo
--                       SCHED_SECRET das Edge Functions.
--
-- pg_net é a extensão que deixa o Postgres chamar uma URL (net.http_post).
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove agendamentos antigos com o mesmo nome (pra poder rodar de novo).
do $$
begin
  perform cron.unschedule('ig-scheduler')     where exists (select 1 from cron.job where jobname = 'ig-scheduler');
  perform cron.unschedule('ig-token-refresh') where exists (select 1 from cron.job where jobname = 'ig-token-refresh');
end $$;

-- A cada 1 minuto.
select cron.schedule(
  'ig-scheduler',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://SEU_PROJETO.supabase.co/functions/v1/ig-scheduler',
    headers := '{"Content-Type": "application/json", "x-sched-key": "SEU_SCHED_SECRET"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Toda segunda-feira às 06:00 (UTC).
select cron.schedule(
  'ig-token-refresh',
  '0 6 * * 1',
  $$
  select net.http_post(
    url     := 'https://SEU_PROJETO.supabase.co/functions/v1/ig-token-refresh',
    headers := '{"Content-Type": "application/json", "x-sched-key": "SEU_SCHED_SECRET"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Pra conferir: select * from cron.job;
-- Pra ver as últimas execuções: select * from cron.job_run_details order by start_time desc limit 20;
