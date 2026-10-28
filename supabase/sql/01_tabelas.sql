-- =====================================================================
-- 01_tabelas.sql
-- Cria todas as tabelas do sistema de automação de DM do Instagram.
-- Rode no Supabase: menu "SQL Editor" > New query > cole e clique Run.
-- Ordem dos scripts: 01 (tabelas), 02 (freio), 03 (RLS), 04 (agendamento).
-- =====================================================================

-- ---------------------------------------------------------------------
-- ig_automations: cada automação ("quem comentar X recebe a DM Y").
-- A conversa INTEIRA mora no campo "flow" (jsonb). A Mensagem 1 é sempre
-- o primeiro item de flow.steps. Não existem colunas separadas de
-- "mensagem" ou "link": tudo vive no fluxo.
-- ---------------------------------------------------------------------
create table if not exists public.ig_automations (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null default '',
  keyword                text not null default '',        -- palavras separadas por vírgula
  match_any              boolean not null default false,  -- true = qualquer comentário dispara
  active                 boolean not null default true,
  media_ids              text[] not null default '{}',    -- posts escolhidos (vazio = todos)
  public_reply           text not null default '',        -- resposta pública no comentário
  public_reply_variants  text[] not null default '{}',    -- variações A/B da resposta pública
  flow                   jsonb not null default '{"steps": []}'::jsonb,
  asset_ids              text[] not null default '{}',    -- arquivos anexados à Mensagem 1
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ig_leads: cada pessoa que interagiu (comentou, tocou em botão...).
-- ---------------------------------------------------------------------
create table if not exists public.ig_leads (
  ig_user_id     text primary key,
  username       text,
  last_source    text,             -- comment / dm / story_reply
  last_keyword   text,
  automation_id  uuid references public.ig_automations(id) on delete set null,
  flow_step      text,             -- em que passo da conversa a pessoa está
  link_sent      boolean not null default false,
  expecting      jsonb,            -- quando um passo pediu um dado (email/telefone)
  tags           text[] not null default '{}',
  email          text,             -- dado capturado
  telefone       text,             -- dado capturado
  dados          jsonb not null default '{}'::jsonb,  -- outros dados livres
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ig_deliveries: log de cada envio (ok, erro ou na fila).
-- ---------------------------------------------------------------------
create table if not exists public.ig_deliveries (
  id             bigint generated always as identity primary key,
  ig_user_id     text,
  automation_id  uuid,
  canal          text,   -- private_reply / dm
  tipo           text,   -- flow / link / text
  status         text,   -- ok / erro / na_fila
  motivo         text,
  ts             timestamptz not null default now()
);
create index if not exists ig_deliveries_user_ts on public.ig_deliveries (ig_user_id, ts desc);
create index if not exists ig_deliveries_ts on public.ig_deliveries (ts desc);

-- ---------------------------------------------------------------------
-- ig_send_queue: envios segurados pelo freio (o ig-scheduler manda depois).
-- ---------------------------------------------------------------------
create table if not exists public.ig_send_queue (
  id             bigint generated always as identity primary key,
  comment_id     text not null unique,
  automation_id  uuid,
  ig_user_id     text,
  username       text,
  keyword        text,
  status         text not null default 'pendente',  -- pendente / enviado / erro / expirado
  tentativas     int not null default 0,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz,
  last_error     text
);
create index if not exists ig_send_queue_pendente on public.ig_send_queue (status, created_at);

-- ---------------------------------------------------------------------
-- ig_send_budget: o CONTADOR do freio (balde de fichas).
-- Uma linha por tipo de envio. As funções take_send_slot e
-- record_send_result (script 02) leem e escrevem AQUI.
-- SEM ESTA TABELA (e a linha inicial abaixo), O FREIO NÃO TEM ONDE
-- CONTAR E NENHUMA DM POR COMENTÁRIO SAI.
-- ---------------------------------------------------------------------
create table if not exists public.ig_send_budget (
  id            text primary key,
  min_count     int not null default 0,
  min_start     timestamptz not null default now(),
  hour_count    int not null default 0,
  hour_start    timestamptz not null default now(),
  day_count     int not null default 0,
  day_start     timestamptz not null default now(),
  err_streak    int not null default 0,   -- pontos de falha seguidas (disjuntor)
  cap_minute    int not null default 6,   -- tetos CONSERVADORES, bem abaixo do Instagram
  cap_hour      int not null default 60,
  cap_day       int not null default 180,
  paused_until  timestamptz,              -- disjuntor: pausado até esse horário
  updated_at    timestamptz not null default now()
);

-- Linha inicial (seed) com os tetos padrão.
insert into public.ig_send_budget (id) values ('private_reply')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- ig_scheduled: passos com atraso ("manda a próxima sozinha depois de X").
-- ---------------------------------------------------------------------
create table if not exists public.ig_scheduled (
  id             bigint generated always as identity primary key,
  ig_user_id     text not null,
  automation_id  uuid,
  step_id        text not null,
  send_at        timestamptz not null,
  sent           boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists ig_scheduled_pendente on public.ig_scheduled (sent, send_at);

-- ---------------------------------------------------------------------
-- ig_assets: biblioteca de arquivos (PDF, áudio, foto, vídeo).
-- ---------------------------------------------------------------------
create table if not exists public.ig_assets (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null default '',
  tipo           text not null check (tipo in ('image','audio','video','file')),
  public_url     text not null,
  attachment_id  text,           -- cache do Instagram (preenchido no primeiro envio)
  size_bytes     bigint,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ig_token_status: validade do token. O ig-token-refresh grava aqui o
-- token renovado (access_token), e as funções usam ele no lugar do
-- IG_ACCESS_TOKEN do ambiente quando existir.
-- ---------------------------------------------------------------------
create table if not exists public.ig_token_status (
  id                 text primary key default 'main',
  access_token       text,
  expires_at         timestamptz,
  last_ok            boolean,
  last_error         text,
  last_refreshed_at  timestamptz,
  updated_at         timestamptz not null default now()
);
insert into public.ig_token_status (id) values ('main')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- ig_bot_sends: ids (mid) das mensagens que o PRÓPRIO sistema enviou.
-- Serve pra diferenciar o "echo" de um envio automático de uma
-- resposta manual sua.
-- ---------------------------------------------------------------------
create table if not exists public.ig_bot_sends (
  mid         text primary key,
  ig_user_id  text,
  ts          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ig_processed_events: "já processei esse id" (anti-duplicado).
-- O Meta às vezes manda o mesmo evento mais de uma vez.
-- O ig-scheduler apaga registros com mais de 7 dias.
-- ---------------------------------------------------------------------
create table if not exists public.ig_processed_events (
  id  text primary key,
  ts  timestamptz not null default now()
);
