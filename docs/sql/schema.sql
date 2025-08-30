drop table if exists events cascade;
drop table if exists productions cascade;
drop table if exists app_users cascade;

create table app_users (
  id bigserial primary key,
  name text,
  username text unique,
  password text,
  role text check (role in ('gerencia','operador','consultor')) default 'operador',
  area text,
  approved boolean default false,
  created_at timestamptz default now()
);

create table productions (
  id bigserial primary key,
  isbn text not null,
  title text not null,
  qty integer not null,
  pages integer not null,
  format text not null,
  os_number text not null,
  deadline timestamptz,
  status text,
  current_area text,
  final_qty integer,
  discard_qty integer,
  priority bigint,
  created_at timestamptz default now()
);

create table events (
  id bigserial primary key,
  production_id bigint not null references productions(id) on delete cascade,
  type text not null,
  details jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_app_users_username_exact on app_users(username);
create index if not exists idx_productions_priority on productions(priority);
create index if not exists idx_productions_deadline on productions(deadline);
create index if not exists idx_events_prod on events(production_id);

alter table app_users    disable row level security;
alter table productions  disable row level security;
alter table events       disable row level security;
