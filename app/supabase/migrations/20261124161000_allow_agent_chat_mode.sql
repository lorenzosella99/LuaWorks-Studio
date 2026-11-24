alter table public.conversations drop constraint if exists conversations_mode_check;
alter table public.conversations add constraint conversations_mode_check
check (mode in ('general','stormworks','image','personality','conversation','agent'));
alter table public.user_preferences drop constraint if exists user_preferences_preferred_mode_check;
alter table public.user_preferences add constraint user_preferences_preferred_mode_check
check (preferred_mode in ('auto','general','stormworks','image','personality','conversation','agent'));
