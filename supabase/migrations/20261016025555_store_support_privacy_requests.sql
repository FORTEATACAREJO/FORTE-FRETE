create table public.frete_atendimento (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 tipo text not null check (tipo in ('SUPORTE','EXCLUSAO')),
 mensagem text not null check (length(mensagem) between 1 and 2000),
 status text not null default 'ABERTO' check (status in ('ABERTO','EM_ANALISE','RESPONDIDO')),
 resposta text not null default '' check (length(resposta)<=4000),
 created_at timestamptz not null default now()
);
create index frete_atendimento_owner on public.frete_atendimento(user_id,created_at desc);
create unique index frete_atendimento_open_deletion on public.frete_atendimento(user_id) where tipo='EXCLUSAO' and status in ('ABERTO','EM_ANALISE');
alter table public.frete_atendimento enable row level security;
revoke all on public.frete_atendimento from anon,authenticated;
grant select on public.frete_atendimento to authenticated;
grant insert(tipo,mensagem) on public.frete_atendimento to authenticated;
grant update(status,resposta) on public.frete_atendimento to authenticated;
grant all on public.frete_atendimento to service_role;
create policy frete_atendimento_owner_read on public.frete_atendimento for select to authenticated
 using (user_id=(select auth.uid()));
create policy frete_atendimento_owner_insert on public.frete_atendimento for insert to authenticated
 with check (user_id=(select auth.uid()) and status='ABERTO' and resposta='');
create policy frete_atendimento_admin_read on public.frete_atendimento for select to authenticated
 using (exists(select 1 from public.usuarios_app p where p.user_id=(select auth.uid()) and p.ativo and p.status_aprovacao='APROVADO' and not p.trocar_senha and p.perfil in ('MASTER','ADMINISTRADOR')));
create policy frete_atendimento_admin_update on public.frete_atendimento for update to authenticated
 using (exists(select 1 from public.usuarios_app p where p.user_id=(select auth.uid()) and p.ativo and p.status_aprovacao='APROVADO' and not p.trocar_senha and p.perfil in ('MASTER','ADMINISTRADOR')))
 with check (exists(select 1 from public.usuarios_app p where p.user_id=(select auth.uid()) and p.ativo and p.status_aprovacao='APROVADO' and not p.trocar_senha and p.perfil in ('MASTER','ADMINISTRADOR')));
