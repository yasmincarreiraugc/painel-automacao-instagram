-- =====================================================================
-- 03_rls.sql
-- Regras de acesso (RLS). Quem tranca o banco é isto aqui, por isso a
-- chave anônima pode ficar no HTML público.
--   - Painel: só usuário AUTENTICADO (o admin logado) lê e escreve.
--   - Público anônimo: nada.
--   - Edge Functions: usam a service_role, que ignora o RLS.
-- =====================================================================

-- Liga o RLS em TODAS as tabelas.
alter table public.ig_automations      enable row level security;
alter table public.ig_leads            enable row level security;
alter table public.ig_deliveries       enable row level security;
alter table public.ig_send_queue       enable row level security;
alter table public.ig_send_budget      enable row level security;
alter table public.ig_scheduled        enable row level security;
alter table public.ig_assets           enable row level security;
alter table public.ig_token_status     enable row level security;
alter table public.ig_bot_sends        enable row level security;
alter table public.ig_processed_events enable row level security;

-- Tabelas que o painel lê e edita (usuário logado).
drop policy if exists painel_autenticado on public.ig_automations;
create policy painel_autenticado on public.ig_automations
  for all to authenticated using (true) with check (true);

drop policy if exists painel_autenticado on public.ig_leads;
create policy painel_autenticado on public.ig_leads
  for all to authenticated using (true) with check (true);

drop policy if exists painel_autenticado on public.ig_assets;
create policy painel_autenticado on public.ig_assets
  for all to authenticated using (true) with check (true);

-- Tabelas que o painel só LÊ (as funções é que escrevem).
drop policy if exists painel_leitura on public.ig_deliveries;
create policy painel_leitura on public.ig_deliveries
  for select to authenticated using (true);

drop policy if exists painel_leitura on public.ig_send_queue;
create policy painel_leitura on public.ig_send_queue
  for select to authenticated using (true);

drop policy if exists painel_leitura on public.ig_send_budget;
create policy painel_leitura on public.ig_send_budget
  for select to authenticated using (true);

drop policy if exists painel_leitura on public.ig_scheduled;
create policy painel_leitura on public.ig_scheduled
  for select to authenticated using (true);

-- ig_token_status: o painel vê a validade, mas NUNCA a coluna do token.
drop policy if exists painel_leitura on public.ig_token_status;
create policy painel_leitura on public.ig_token_status
  for select to authenticated using (true);
revoke all on public.ig_token_status from anon, authenticated;
grant select (id, expires_at, last_ok, last_error, last_refreshed_at, updated_at)
  on public.ig_token_status to authenticated;

-- ig_bot_sends e ig_processed_events: sem política = só as funções acessam.

-- Garantia extra: o público anônimo não tem acesso a nada daqui.
revoke all on public.ig_automations, public.ig_leads, public.ig_deliveries,
  public.ig_send_queue, public.ig_send_budget, public.ig_scheduled,
  public.ig_assets, public.ig_bot_sends, public.ig_processed_events
  from anon;
