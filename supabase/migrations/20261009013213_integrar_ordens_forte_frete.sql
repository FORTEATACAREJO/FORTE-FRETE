-- Applied to FORTE FRETE only. Additive private inbox; does not publish loads to other drivers.
create table public.vendas_ordens (
 id uuid primary key default gen_random_uuid(), empresa_vendas_id uuid not null,
 carga_vendas_id text not null, motorista_id uuid not null references public.motoristas(id),
 snapshot jsonb not null default '{}'::jsonb,
 documento_frete_path text, pagamento_status text not null default 'PENDENTE',
 enviada_em timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(empresa_vendas_id,carga_vendas_id)
);
alter table public.vendas_ordens enable row level security;
grant select on public.vendas_ordens to authenticated;
create policy vendas_ordens_read on public.vendas_ordens for select to authenticated
using(private.is_operational() and (private.is_admin() or motorista_id=private.me_motorista_id()));
insert into storage.buckets(id,name,public,file_size_limit) values('vendas-ordens-frete','vendas-ordens-frete',false,10485760) on conflict(id) do nothing;
create policy vendas_ordens_file_read on storage.objects for select to authenticated
using(bucket_id='vendas-ordens-frete' and exists(select 1 from public.vendas_ordens o where o.documento_frete_path=name));
