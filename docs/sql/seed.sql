insert into app_users (name, username, password, role, approved)
values ('Administrador', 'admin', 'admin123', 'gerencia', true)
on conflict (username) do nothing;

insert into app_users (name, username, password, role, approved)
values ('Consultor Exemplo', 'consultor', 'consultor123', 'consultor', true)
on conflict (username) do nothing;

insert into app_users (name, username, password, role, area, approved)
values ('Operador Exemplo', 'operador', 'operador123', 'operador', 'Impressora Digital Nuvera - Miolo', true)
on conflict (username) do nothing;
