-- Preferências sincronizadas entre dispositivos.
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  appearance jsonb not null default '{"pageWidth":"standard","primaryColor":"#D9F99D","secondaryColor":"#8ED7CE"}'::jsonb,
  effort_by_mode jsonb not null default '{"general":"medium","stormworks":"medium","personality":"medium"}'::jsonb,
  preferred_mode text not null default 'auto'
    check (preferred_mode in ('auto','general','stormworks','image','personality')),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
alter table public.user_preferences replica identity full;

drop policy if exists "Users can manage their own preferences" on public.user_preferences;
create policy "Users can manage their own preferences"
  on public.user_preferences
  for all
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select private.is_allowed_google_account())
  )
  with check (
    (select auth.uid()) = user_id
    and (select private.is_allowed_google_account())
  );

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_preferences'
  ) then
    alter publication supabase_realtime add table public.user_preferences;
  end if;
end
$$;
