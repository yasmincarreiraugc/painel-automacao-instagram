-- =====================================================================
-- 06_interacoes.sql: dados pra aba "Interações" do painel.
--   - ig_leads ganha contador de interações e a data da última.
--   - ig_registra_interacao(): o webhook chama a cada comentário,
--     toque em botão ou resposta da pessoa.
--   - ig_leads_painel: a "planilha" que o painel lê (lead + nome da
--     automação + quantas mensagens o robô mandou pra pessoa).
-- Pode rodar de novo sem problema.
-- =====================================================================
alter table public.ig_leads add column if not exists interacoes       int not null default 0;
alter table public.ig_leads add column if not exists ultima_interacao timestamptz;

-- Leads que já existiam: conta pelo menos 1 interação.
update public.ig_leads
   set interacoes = greatest(interacoes, 1),
       ultima_interacao = coalesce(ultima_interacao, updated_at)
 where interacoes = 0 or ultima_interacao is null;

-- Soma 1 interação (cria o lead se ainda não existir).
create or replace function public.ig_registra_interacao(p_user text, p_username text default null)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ig_leads (ig_user_id, username, interacoes, ultima_interacao)
  values (p_user, nullif(p_username, ''), 1, now())
  on conflict (ig_user_id) do update
    set interacoes       = ig_leads.interacoes + 1,
        ultima_interacao = now(),
        username         = coalesce(excluded.username, ig_leads.username);
$$;
revoke execute on function public.ig_registra_interacao(text, text) from public, anon, authenticated;
grant execute on function public.ig_registra_interacao(text, text) to service_role;

-- Visão da planilha. security_invoker: respeita o RLS de quem lê.
create or replace view public.ig_leads_painel
with (security_invoker = true) as
select
  l.*,
  a.nome                        as automacao_nome,
  coalesce(d.enviadas, 0)::int  as mensagens_enviadas,
  d.ultimo_envio
from public.ig_leads l
left join public.ig_automations a on a.id = l.automation_id
left join lateral (
  select count(*) filter (where status = 'ok') as enviadas, max(ts) as ultimo_envio
    from public.ig_deliveries
   where ig_user_id = l.ig_user_id
) d on true;

revoke all on public.ig_leads_painel from anon;
grant select on public.ig_leads_painel to authenticated;
