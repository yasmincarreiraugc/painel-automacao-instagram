-- =====================================================================
-- 05_retencao.sql: apaga dados pessoais antigos (LGPD).
-- A Política de Privacidade promete guardar os dados por até 12 meses
-- depois da última interação. Este job cumpre isso todo dia às 04:00 (UTC).
-- Se mudar o prazo aqui, mude também na página frontend/privacidade/.
-- =====================================================================
select cron.unschedule('ig-retencao-12-meses')
where exists (select 1 from cron.job where jobname = 'ig-retencao-12-meses');

select cron.schedule(
  'ig-retencao-12-meses',
  '0 4 * * *',
  $$
  delete from public.ig_leads      where updated_at < now() - interval '12 months';
  delete from public.ig_deliveries where ts         < now() - interval '12 months';
  delete from public.ig_bot_sends  where ts         < now() - interval '12 months';
  delete from public.ig_scheduled  where created_at < now() - interval '12 months';
  delete from public.ig_send_queue where created_at < now() - interval '12 months';
  $$
);
