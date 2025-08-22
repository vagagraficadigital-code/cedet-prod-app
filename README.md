# CEDET – Gestão de Produção (Full, limpo)

Projeto completo (React + Vite + Supabase) pronto para Vercel. Sem `emailjs-com`.
Inclui: login hierárquico (gerência/operador/consultor), cadastro/aprovação de operador, CRUD de livros com **data de entrega**, fila do operador com botões e encaminhamento, exclusão de livros e usuários, badges de prazo.

## Como colocar no ar (Vercel)
1. Suba TODO o conteúdo deste repositório para o GitHub (repo novo, de preferência).
2. Na Vercel, conecte o repo (ou troque o repo do projeto atual).
3. Em **Settings → Build & Output**: Framework = **Vite**, Output = **dist**.
4. Em **Settings → Environment Variables** crie:
   - `VITE_SUPABASE_URL` (URL do seu projeto Supabase)
   - `VITE_SUPABASE_ANON_KEY` (anon key)
5. Faça **Deploy** (ou **Redeploy** com **Clear Build Cache**).

## Supabase – Tabelas e dados iniciais
Execute no SQL Editor:

```sql
create table if not exists app_users (
  id bigserial primary key,
  name text,
  username text not null,
  password text not null,
  role text not null, -- 'gerencia' | 'consultor' | 'operador'
  area text,
  approved boolean default false
);

create index if not exists idx_app_users_username on app_users (lower(username));

create table if not exists productions (
  id bigserial primary key,
  isbn text not null,
  title text not null,
  qty int not null,
  pages int not null,
  format text not null,
  os_number text not null,
  deadline timestamptz,
  status text,
  current_area text,
  discard_qty int,
  final_qty int
);

create index if not exists idx_productions_isbn on productions (isbn);
create index if not exists idx_productions_deadline on productions (deadline);

create table if not exists events (
  id bigserial primary key,
  production_id bigint references productions(id) on delete cascade,
  type text,
  details jsonb,
  created_at timestamptz default now()
);

alter table app_users disable row level security;
alter table productions disable row level security;
alter table events disable row level security;
```

Crie um usuário master (gerência) para começar:
```sql
insert into app_users (name, username, password, role, approved)
values ('Master', 'master@cedet.com', 'Master123', 'gerencia', true);
```

Depois disso, acesse o site e faça login como:
- **Usuário:** master@cedet.com
- **Senha:** Master123

Cadastre livros e aprove operadores pela tela de **Gerência**.
