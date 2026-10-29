-- =====================================================================
-- 08_agenda_e_site.sql
--   - tarefas: a agenda do menu "Calendário".
--   - site_eventos: visitas, vídeos assistidos e cliques do site do
--     portfólio (anônimo: sem IP, sem nome, sem cookie). Quem grava é a
--     função site-track; o painel só lê.
--   - site_resumo(dias): os números da página "Portfólio" num JSON só.
-- Pode rodar de novo sem problema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Agenda
-- ---------------------------------------------------------------------
create table if not exists public.tarefas (
  id          uuid primary key default gen_random_uuid(),
  dia         date not null,
  hora        time,
  titulo      text not null,
  notas       text not null default '',
  categoria   text not null default 'outro',   -- gravacao / edicao / postagem / reuniao / pessoal / outro
  concluida   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tarefas_dia on public.tarefas (dia, hora);

alter table public.tarefas enable row level security;
drop policy if exists painel_autenticado on public.tarefas;
create policy painel_autenticado on public.tarefas
  for all to authenticated using (true) with check (true);
revoke all on public.tarefas from anon;
grant select, insert, update, delete on public.tarefas to authenticated;

-- ---------------------------------------------------------------------
-- Métricas do site
-- ---------------------------------------------------------------------
create table if not exists public.site_eventos (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  tipo        text not null,             -- view / video / click
  path        text not null default '/',
  ref         text not null default '',  -- domínio de onde a pessoa veio
  utm         text not null default '',
  dispositivo text not null default '',  -- celular / computador
  visitante   text not null default '',  -- número aleatório do navegador (não identifica a pessoa)
  sessao      text not null default '',  -- número aleatório da visita
  alvo        text not null default '',  -- vídeo: id do YouTube; clique: whatsapp / email / domínio
  rotulo      text not null default ''   -- vídeo: "Marca · Tipo"; clique: texto do botão
);
create index if not exists site_eventos_ts on public.site_eventos (ts desc);

alter table public.site_eventos enable row level security;
drop policy if exists painel_le on public.site_eventos;
create policy painel_le on public.site_eventos for select to authenticated using (true);
revoke all on public.site_eventos from anon;
revoke insert, update, delete on public.site_eventos from authenticated;
grant select on public.site_eventos to authenticated;

create or replace function public.site_resumo(p_dias int default 30)
returns json
language sql
stable
security invoker
set search_path = public
as $$
  with e as (
    select *, (ts at time zone 'America/Sao_Paulo')::date as dia
      from site_eventos
     where p_dias <= 0 or ts >= now() - make_interval(days => p_dias)
  ),
  v as (select * from e where tipo = 'view')
  select json_build_object(
    'pessoas',        (select count(distinct visitante) from v),
    'visitas',        (select count(distinct sessao) from v),
    'visualizacoes',  (select count(*) from v),
    'videos_vistos',  (select count(*) from e where tipo = 'video'),
    'cliques',        (select count(*) from e where tipo = 'click'),
    'primeiro_evento',(select min(ts) from site_eventos),
    'serie', coalesce((select json_agg(x order by x.dia) from (
        select dia, count(distinct visitante) as pessoas, count(*) as visualizacoes
          from v group by dia) x), '[]'::json),
    'paginas', coalesce((select json_agg(x) from (
        select path, count(*) as total, count(distinct visitante) as pessoas
          from v group by path order by total desc limit 10) x), '[]'::json),
    'origens', coalesce((select json_agg(x) from (
        select ref, utm, count(distinct visitante) as pessoas
          from v group by ref, utm order by pessoas desc limit 50) x), '[]'::json),
    'dispositivos', coalesce((select json_agg(x) from (
        select dispositivo, count(distinct visitante) as pessoas
          from v group by dispositivo order by pessoas desc) x), '[]'::json),
    'videos', coalesce((select json_agg(x) from (
        select alvo as id, max(rotulo) as rotulo, count(*) as total, count(distinct visitante) as pessoas
          from e where tipo = 'video' and alvo <> '' group by alvo order by total desc limit 20) x), '[]'::json),
    'links', coalesce((select json_agg(x) from (
        select alvo, max(rotulo) as rotulo, count(*) as total, count(distinct visitante) as pessoas
          from e where tipo = 'click' group by alvo order by total desc limit 10) x), '[]'::json)
  );
$$;
revoke execute on function public.site_resumo(int) from public, anon;
grant execute on function public.site_resumo(int) to authenticated;
