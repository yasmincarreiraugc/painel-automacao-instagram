-- =====================================================================
-- 13_roteiro_cliente.sql
-- Roteiro pra aprovação da marca por link:
--   - roteiros ganha 2 ganchos, cenas (parte, áudio, imagem, referência),
--     nome e logo da marca, o link secreto e o estado da aprovação.
--   - roteiro_feedback guarda o que a marca fez na página (gancho
--     escolhido, comentários por cena e aprovação).
--   - bucket "roteiros" (público) pros logos e fotos de referência.
-- A marca NÃO acessa o banco: a página fala com a Edge Function
-- roteiro-cliente, que confere o link secreto.
-- Pode rodar de novo sem problema.
-- =====================================================================
alter table public.roteiros
  add column if not exists gancho2           text not null default '',
  add column if not exists cenas             jsonb not null default '[]'::jsonb,  -- [{parte, audio, imagem, referencia}]
  add column if not exists marca_nome        text not null default '',            -- usado quando não tem campanha
  add column if not exists marca_logo        text not null default '',
  add column if not exists link_token        text unique,
  add column if not exists enviado_em        timestamptz,
  add column if not exists gancho_escolhido  int,
  add column if not exists aprovado_por      text,
  add column if not exists aprovado_em       timestamptz;

create table if not exists public.roteiro_feedback (
  id          uuid primary key default gen_random_uuid(),
  roteiro_id  uuid not null references public.roteiros(id) on delete cascade,
  tipo        text not null check (tipo in ('gancho', 'comentario', 'aprovacao')),
  cena        int,             -- posição da cena (0, 1, 2...) quando é comentário
  parte       text not null default '',
  texto       text not null default '',
  nome        text not null default '',
  lido        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists roteiro_feedback_roteiro on public.roteiro_feedback (roteiro_id, created_at);

alter table public.roteiro_feedback enable row level security;
drop policy if exists painel_autenticado on public.roteiro_feedback;
create policy painel_autenticado on public.roteiro_feedback for all to authenticated using (true) with check (true);
revoke all on public.roteiro_feedback from anon;
grant select, insert, update, delete on public.roteiro_feedback to authenticated;

-- Logos e fotos de referência (até 5 MB, só imagem). Leitura pública
-- pra aparecer na página da marca; só o painel logado envia e apaga.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('roteiros', 'roteiros', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists roteiros_painel_envia on storage.objects;
create policy roteiros_painel_envia on storage.objects for insert to authenticated with check (bucket_id = 'roteiros');
drop policy if exists roteiros_painel_altera on storage.objects;
create policy roteiros_painel_altera on storage.objects for update to authenticated using (bucket_id = 'roteiros');
drop policy if exists roteiros_painel_apaga on storage.objects;
create policy roteiros_painel_apaga on storage.objects for delete to authenticated using (bucket_id = 'roteiros');
