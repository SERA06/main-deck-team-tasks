-- Main Deck shared team task board
-- Run this script once in Supabase Dashboard > SQL Editor.
-- Access is limited to signed-in members of the same team through RLS.

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  join_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Team member',
  role text not null default 'member' check (role in ('manager', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.team_tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text check (description is null or char_length(description) <= 1000),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  assignee_id uuid,
  due_date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_tasks_assignee_member_fkey
    foreign key (team_id, assignee_id)
    references public.team_members(team_id, user_id)
    on delete set null (assignee_id)
);

create index if not exists team_tasks_team_created_idx
  on public.team_tasks(team_id, created_at desc);
create index if not exists team_tasks_assignee_idx
  on public.team_tasks(team_id, assignee_id);

-- SECURITY DEFINER avoids recursive RLS checks when policies inspect membership.
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.user_id = (select auth.uid())
  );
$$;

create or replace function public.create_team(p_team_name text, p_display_name text)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_join_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
begin
  if v_user_id is null then raise exception 'Sign in before creating a team.'; end if;
  if char_length(trim(coalesce(p_team_name, ''))) not between 1 and 80 then
    raise exception 'Enter a team name between 1 and 80 characters.';
  end if;
  insert into public.teams(name, join_code, created_by)
    values (trim(p_team_name), v_join_code, v_user_id)
    returning id into v_team_id;
  insert into public.team_members(team_id, user_id, display_name, role)
    values (v_team_id, v_user_id, coalesce(nullif(trim(p_display_name), ''), 'Team manager'), 'manager');
  return v_team_id;
end;
$$;

create or replace function public.join_team_by_code(p_join_code text, p_display_name text)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
begin
  if v_user_id is null then raise exception 'Sign in before joining a team.'; end if;
  select id into v_team_id from public.teams
    where join_code = upper(trim(coalesce(p_join_code, '')));
  if v_team_id is null then raise exception 'That invite code was not found. Check it and try again.'; end if;
  insert into public.team_members(team_id, user_id, display_name)
    values (v_team_id, v_user_id, coalesce(nullif(trim(p_display_name), ''), 'Team member'))
    on conflict (team_id, user_id) do update
      set display_name = excluded.display_name;
  return v_team_id;
end;
$$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_tasks enable row level security;

drop policy if exists "Members can view their teams" on public.teams;
create policy "Members can view their teams" on public.teams
  for select to authenticated using (public.is_team_member(id));

drop policy if exists "Members can view teammates" on public.team_members;
create policy "Members can view teammates" on public.team_members
  for select to authenticated using (public.is_team_member(team_id));

drop policy if exists "Members can view team tasks" on public.team_tasks;
create policy "Members can view team tasks" on public.team_tasks
  for select to authenticated using (public.is_team_member(team_id));

drop policy if exists "Members can create team tasks" on public.team_tasks;
create policy "Members can create team tasks" on public.team_tasks
  for insert to authenticated with check (
    public.is_team_member(team_id)
    and created_by = (select auth.uid())
    and (assignee_id is null or exists (
      select 1 from public.team_members tm
      where tm.team_id = team_tasks.team_id and tm.user_id = team_tasks.assignee_id
    ))
  );

drop policy if exists "Members can update team tasks" on public.team_tasks;
create policy "Members can update team tasks" on public.team_tasks
  for update to authenticated
  using (public.is_team_member(team_id))
  with check (
    public.is_team_member(team_id)
    and (assignee_id is null or exists (
      select 1 from public.team_members tm
      where tm.team_id = team_tasks.team_id and tm.user_id = team_tasks.assignee_id
    ))
  );

drop policy if exists "Members can delete team tasks" on public.team_tasks;
create policy "Members can delete team tasks" on public.team_tasks
  for delete to authenticated using (public.is_team_member(team_id));

grant select on public.teams, public.team_members to authenticated;
grant select, insert, update, delete on public.team_tasks to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.create_team(text, text) to authenticated;
grant execute on function public.join_team_by_code(text, text) to authenticated;

-- Enable shared task updates in real time. Safe to rerun if already published.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'team_tasks'
  ) then
    alter publication supabase_realtime add table public.team_tasks;
  end if;
end;
$$;
-- Do not leave the RPC helpers executable by anonymous users.
revoke all on function public.is_team_member(uuid) from public, anon;
revoke all on function public.create_team(text, text) from public, anon;
revoke all on function public.join_team_by_code(text, text) from public, anon;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.create_team(text, text) to authenticated;
grant execute on function public.join_team_by_code(text, text) to authenticated;
