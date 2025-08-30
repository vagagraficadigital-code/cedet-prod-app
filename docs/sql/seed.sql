insert into app_users(name,username,password,role,approved,active) values
('Master','master','master123','master',true,true),
('Gerente','admin','admin123','gerencia',true,true),
('Consultor','consultor','consultor123','consultor',true,true),
('Operador','operador','operador123','operador',true,true)
on conflict(username) do nothing;