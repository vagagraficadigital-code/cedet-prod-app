-- Usuários básicos
insert into app_users (name, username, password, role, approved, active)
values ('Master', 'master', 'master123', 'master', true, true)
on conflict (username) do nothing;

insert into app_users (name, username, password, role, approved, active)
values ('Administrador', 'admin', 'admin123', 'gerencia', true, true)
on conflict (username) do nothing;

insert into app_users (name, username, password, role, approved, active)
values ('Consultor Exemplo', 'consultor', 'consultor123', 'consultor', true, true)
on conflict (username) do nothing;

insert into app_users (name, username, password, role, area, approved, active)
values ('Operador Exemplo', 'operador', 'operador123', 'operador', 'Impressora Digital Nuvera - Miolo', true, true)
on conflict (username) do nothing;

-- Políticas padrão
insert into role_policies (role, policy) values
('master',    '{"manage_users":true,"manage_policies":true,"create_production":true,"delete_production":true,"reorder_queue":true,"view_all_productions":true,"operator_actions":true,"view_reports":true,"see_deadlines":true,"mark_plates":true}'),
('gerencia',  '{"manage_users":true,"manage_policies":false,"create_production":true,"delete_production":true,"reorder_queue":true,"view_all_productions":true,"operator_actions":false,"view_reports":true,"see_deadlines":true,"mark_plates":true}'),
('consultor', '{"manage_users":false,"manage_policies":false,"create_production":false,"delete_production":false,"reorder_queue":false,"view_all_productions":true,"operator_actions":false,"view_reports":true,"see_deadlines":true,"mark_plates":false}'),
('operador',  '{"manage_users":false,"manage_policies":false,"create_production":false,"delete_production":false,"reorder_queue":false,"view_all_productions":false,"operator_actions":true,"view_reports":false,"see_deadlines":true,"mark_plates":true}')
on conflict (role) do nothing;
