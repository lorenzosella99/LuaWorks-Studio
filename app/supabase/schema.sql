-- AI Workbench — schema inicial para Supabase PostgreSQL
-- Execute uma vez no SQL Editor do seu projeto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nova conversa',
  mode text not null default 'general'
    check (mode in ('general', 'stormworks', 'image', 'personality')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_id_user_id_unique unique (id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now(),
  constraint messages_conversation_owner_fk
    foreign key (conversation_id, user_id)
    references public.conversations (id, user_id)
    on delete cascade
);

-- O PAT do GitHub é criptografado no servidor com AES-GCM antes de ser salvo.
-- Mesmo assim, RLS restringe a linha ao próprio usuário.
create table if not exists public.github_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_ciphertext text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at asc);

-- updated_at automático para conversas e conexão GitHub.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists github_connections_set_updated_at on public.github_connections;
create trigger github_connections_set_updated_at
before update on public.github_connections
for each row execute function public.set_updated_at();

-- Toda mensagem nova atualiza a data da conversa para ordenar o histórico por atividade.
create or replace function public.touch_conversation_from_message()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id and user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation_from_message();

-- ACESSO PRIVADO: somente o e-mail autorizado pode acessar dados.
-- A aplicação aceita login por senha; o usuário 'loren' é associado a este e-mail no frontend.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_allowed_google_account()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'lorenzosella99@gmail.com';
$$;

revoke all on function private.is_allowed_google_account() from public, anon;
grant execute on function private.is_allowed_google_account() to authenticated;

-- O hook mantém o cadastro restrito ao e-mail autorizado, sem exigir Google.
-- Pode continuar selecionado em Authentication -> Hooks -> Before User Created.
create or replace function public.allow_only_lorenzo_google(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  submitted_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if submitted_email = 'lorenzosella99@gmail.com' then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Aplicação privada: somente a conta autorizada pode ser criada.'
    )
  );
end;
$$;

grant execute on function public.allow_only_lorenzo_google(jsonb) to supabase_auth_admin;
revoke execute on function public.allow_only_lorenzo_google(jsonb) from public, anon, authenticated;

-- RLS ligado em todas as tabelas expostas.
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.github_connections enable row level security;

-- CONVERSATIONS
 drop policy if exists "Users can read their conversations" on public.conversations;
create policy "Users can read their conversations"
on public.conversations for select to authenticated
using ((select auth.uid()) = user_id and (select private.is_allowed_google_account()));

drop policy if exists "Users can create their conversations" on public.conversations;
create policy "Users can create their conversations"
on public.conversations for insert to authenticated
with check ((select auth.uid()) = user_id and (select private.is_allowed_google_account()));

drop policy if exists "Users can update their conversations" on public.conversations;
create policy "Users can update their conversations"
on public.conversations for update to authenticated
using ((select auth.uid()) = user_id and (select private.is_allowed_google_account()))
with check ((select auth.uid()) = user_id and (select private.is_allowed_google_account()));

drop policy if exists "Users can delete their conversations" on public.conversations;
create policy "Users can delete their conversations"
on public.conversations for delete to authenticated
using ((select auth.uid()) = user_id and (select private.is_allowed_google_account()));

-- MESSAGES: o FK composto garante que a conversa pertence ao mesmo usuário.
drop policy if exists "Users can read their messages" on public.messages;
create policy "Users can read their messages"
on public.messages for select to authenticated
using (
  (select auth.uid()) = user_id
  and (select private.is_allowed_google_account())
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can add messages to their conversations" on public.messages;
create policy "Users can add messages to their conversations"
on public.messages for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (select private.is_allowed_google_account())
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = (select auth.uid())
  )
);

drop policy if exists "Users can delete their messages" on public.messages;
create policy "Users can delete their messages"
on public.messages for delete to authenticated
using ((select auth.uid()) = user_id and (select private.is_allowed_google_account()));

-- GITHUB CONNECTIONS: a aplicação só chama esta tabela via Edge Function.
-- O ciphertext pode ser lido pelo dono, mas não é descriptografável sem a chave
-- GITHUB_TOKEN_ENCRYPTION_KEY, que existe apenas no ambiente do servidor.
drop policy if exists "Users can read their GitHub connection" on public.github_connections;
create policy "Users can read their GitHub connection"
on public.github_connections for select to authenticated
using ((select auth.uid()) = user_id and (select private.is_allowed_google_account()));

drop policy if exists "Users can create their GitHub connection" on public.github_connections;
create policy "Users can create their GitHub connection"
on public.github_connections for insert to authenticated
with check ((select auth.uid()) = user_id and (select private.is_allowed_google_account()));

drop policy if exists "Users can update their GitHub connection" on public.github_connections;
create policy "Users can update their GitHub connection"
on public.github_connections for update to authenticated
using ((select auth.uid()) = user_id and (select private.is_allowed_google_account()))
with check ((select auth.uid()) = user_id and (select private.is_allowed_google_account()));

drop policy if exists "Users can delete their GitHub connection" on public.github_connections;
create policy "Users can delete their GitHub connection"
on public.github_connections for delete to authenticated
using ((select auth.uid()) = user_id and (select private.is_allowed_google_account()));

-- Permissões para o Data API; RLS continua sendo a barreira de acesso por linha.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, delete on public.messages to authenticated;
grant select, insert, update, delete on public.github_connections to authenticated;
