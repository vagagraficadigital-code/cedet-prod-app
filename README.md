# Rollback v2 (UI anterior restaurada) + melhorias
- Login, cartões e layout iguais ao que você aprovou
- Melhorias mantidas: detalhe do livro, finalização clara, reordenar por priority, chips reduzidos no Operador
- Login de operador normalizado (username minúsculo)

## Supabase: rode estes SQLs uma vez
```
alter table productions add column if not exists priority bigint;
create index if not exists idx_productions_priority on productions (priority);
update app_users set username = lower(username);
create index if not exists idx_app_users_username_exact on app_users (username);
```
