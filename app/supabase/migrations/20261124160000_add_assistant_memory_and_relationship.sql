-- Memória explícita e perfil de vínculo por usuário.
create table if not exists public.assistant_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1200),
  category text not null default 'preferencia' check (category in ('preferencia','projeto','pessoa','rotina','outro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assistant_memories_user_updated_idx on public.assistant_memories(user_id, updated_at desc);
alter table public.assistant_memories enable row level security;
create policy "Users manage their own assistant memories" on public.assistant_memories
for all to authenticated using ((select auth.uid()) = user_id and (select private.is_allowed_google_account()))
with check ((select auth.uid()) = user_id and (select private.is_allowed_google_account()));
grant select, insert, update, delete on public.assistant_memories to authenticated;

create table if not exists public.ai_relationship_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bond_level integer not null default 0 check (bond_level between 0 and 100),
  mood text not null default 'neutro' check (mood in ('neutro','feliz','animada','calma','brincalhona','irritada')),
  interaction_count integer not null default 0 check (interaction_count >= 0),
  notes text not null default '' check (char_length(notes) <= 1200),
  updated_at timestamptz not null default now()
);
alter table public.ai_relationship_profiles enable row level security;
create policy "Users manage their own AI relationship profile" on public.ai_relationship_profiles
for all to authenticated using ((select auth.uid()) = user_id and (select private.is_allowed_google_account()))
with check ((select auth.uid()) = user_id and (select private.is_allowed_google_account()));
grant select, insert, update, delete on public.ai_relationship_profiles to authenticated;
