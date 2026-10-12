alter table public.motoristas add column if not exists origem_vendas_id text;
alter table public.motoristas add column if not exists dados_legados jsonb not null default '{}'::jsonb;
create unique index if not exists motoristas_origem_vendas_id_unique on public.motoristas(origem_vendas_id) where origem_vendas_id is not null;