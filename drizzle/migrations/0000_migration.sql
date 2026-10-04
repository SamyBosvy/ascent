
create type public.app_role as enum ('owner','member');
create type public.route_type as enum ('book','language','skill','course','paper','habit');
create type public.route_status as enum ('active','paused','summited','abandoned');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  role app_role not null,
  created_at timestamptz not null default now()
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "read own role" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create table public.allowlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.allowlist to authenticated;
grant all on public.allowlist to service_role;
alter table public.allowlist enable row level security;
create policy "owner manages allowlist" on public.allowlist for all to authenticated
  using (public.has_role(auth.uid(),'owner')) with check (public.has_role(auth.uid(),'owner'));

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  type route_type not null,
  description text,
  target_date date,
  status route_status not null default 'active',
  camp_override int check (camp_override between 0 and 4),
  current_page int,
  total_pages int,
  habit_frequency text check (habit_frequency in ('daily','x_per_week','weekly')),
  habit_target int,
  summited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  title text not null,
  position int not null default 0,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  minutes int not null check (minutes > 0),
  note text,
  logged_at timestamptz not null default now()
);
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  front text not null,
  back text not null,
  example text,
  pronunciation text,
  ease real not null default 2.5,
  interval_days int not null default 0,
  reps int not null default 0,
  due_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  rating int not null check (rating between 0 and 3),
  reviewed_at timestamptz not null default now()
);
create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  route_id uuid not null references public.routes(id) on delete cascade,
  checked_on date not null default current_date,
  unique (route_id, checked_on)
);

do $$
declare t text;
begin
  foreach t in array array['routes','milestones','sessions','notes','cards','reviews','checkins'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create index on public.%I (user_id)', t);
  end loop;
end $$;
