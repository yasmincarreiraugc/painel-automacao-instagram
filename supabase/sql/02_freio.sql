-- =====================================================================
-- 02_freio.sql
-- O FREIO DE ENVIO (token bucket / balde de fichas).
--
-- AVISO IMPORTANTE: SEM ESTAS FUNÇÕES, O FREIO FALHA FECHADO E NENHUMA
-- DM POR COMENTÁRIO SAI (tudo vai pra fila e a fila nunca anda).
-- Este é o passo que não pode faltar.
--
-- Como funciona:
--   take_send_slot('private_reply')  -> true se pode enviar agora.
--   record_send_result('private_reply', ok, hard) -> alimenta o disjuntor.
--
-- Tetos padrão (tabela ig_send_budget): 6/minuto, 60/hora, 180/dia.
-- O teto real do Instagram pra respostas privadas gira em torno de
-- 200 a 300 por dia, então ficamos BEM abaixo de propósito.
-- Pra mudar os tetos:
--   update ig_send_budget set cap_day = 150 where id = 'private_reply';
-- =====================================================================

create or replace function public.take_send_slot(p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  b ig_send_budget%rowtype;
  v_now timestamptz := now();
begin
  -- Trava a linha (atômico): dois envios ao mesmo tempo não furam o teto.
  select * into b from ig_send_budget where id = p_key for update;
  if not found then
    return false;  -- sem linha de contador: falha fechado (não envia)
  end if;

  -- Disjuntor ligado? Então não envia.
  if b.paused_until is not null and b.paused_until > v_now then
    return false;
  end if;

  -- Zera as janelas que já viraram.
  if v_now - b.min_start  >= interval '1 minute' then b.min_count  := 0; b.min_start  := v_now; end if;
  if v_now - b.hour_start >= interval '1 hour'   then b.hour_count := 0; b.hour_start := v_now; end if;
  if v_now - b.day_start  >= interval '1 day'    then b.day_count  := 0; b.day_start  := v_now; end if;

  -- Bateu algum teto? Grava as janelas zeradas e recusa.
  if b.min_count >= b.cap_minute or b.hour_count >= b.cap_hour or b.day_count >= b.cap_day then
    update ig_send_budget set
      min_count = b.min_count, min_start = b.min_start,
      hour_count = b.hour_count, hour_start = b.hour_start,
      day_count = b.day_count, day_start = b.day_start,
      updated_at = v_now
    where id = p_key;
    return false;
  end if;

  -- Pega a ficha.
  update ig_send_budget set
    min_count = b.min_count + 1, min_start = b.min_start,
    hour_count = b.hour_count + 1, hour_start = b.hour_start,
    day_count = b.day_count + 1, day_start = b.day_start,
    updated_at = v_now
  where id = p_key;
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- record_send_result: registra o resultado do envio.
--   Sucesso: zera o contador de falhas.
--   Falha "dura" (bloqueio / limite do Instagram): soma 3 pontos.
--   Falha comum: soma 1 ponto.
--   Chegou a 9 pontos (3 falhas duras seguidas, ou 9 comuns): pausa
--   os envios por 3 horas.
-- ---------------------------------------------------------------------
create or replace function public.record_send_result(p_key text, p_ok boolean, p_hard boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_streak int;
begin
  if p_ok then
    update ig_send_budget set err_streak = 0, updated_at = now() where id = p_key;
    return;
  end if;

  update ig_send_budget
     set err_streak = err_streak + (case when p_hard then 3 else 1 end),
         updated_at = now()
   where id = p_key
  returning err_streak into v_streak;

  if v_streak is not null and v_streak >= 9 then
    update ig_send_budget
       set paused_until = now() + interval '3 hours',
           err_streak = 0
     where id = p_key;
  end if;
end;
$$;

-- Só as Edge Functions (service_role) podem chamar o freio.
revoke all on function public.take_send_slot(text) from public, anon, authenticated;
revoke all on function public.record_send_result(text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.take_send_slot(text) to service_role;
grant execute on function public.record_send_result(text, boolean, boolean) to service_role;
