alter table public.conversations drop constraint if exists conversations_mode_check;
alter table public.conversations add constraint conversations_mode_check
check (mode in ('auto','general','stormworks','image','personality','conversation','agent'));
