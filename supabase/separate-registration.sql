begin;
-- Authorization is based on the server-managed profile, including uppercase roles.
create or replace function private.is_admin() returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.usuarios_app where user_id=(select auth.uid()) and ativo and not trocar_senha and perfil in ('ADMIN','MASTER','ULTRA_ADMIN'))
$$;
create table if not exists public.favorecidos_frete (
 id uuid primary key default gen_random_uuid(), nome text not null, cpf_cnpj text, telefone text, banco text,
 criado_por uuid not null default auth.uid() references auth.users(id), ativo boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.chaves_pix_frete (
 id uuid primary key default gen_random_uuid(), favorecido_id uuid not null references public.favorecidos_frete(id) on delete restrict,
 tipo text not null check(tipo in ('CPF','CNPJ','TELEFONE','EMAIL','ALEATORIA')), chave text not null check(length(trim(chave))>0),
 principal boolean not null default false, ativo boolean not null default true, created_at timestamptz not null default now(), unique(favorecido_id,chave)
);
create unique index if not exists pix_principal_favorecido on public.chaves_pix_frete(favorecido_id) where principal and ativo;
alter table public.veiculos_motorista alter column motorista_id drop not null;
alter table public.veiculos_motorista drop constraint veiculos_motorista_motorista_id_fkey;
alter table public.veiculos_motorista add constraint veiculos_motorista_motorista_id_fkey foreign key(motorista_id) references public.motoristas(id) on delete restrict;
alter table public.veiculos_motorista add column if not exists favorecido_id uuid references public.favorecidos_frete(id) on delete restrict;
alter table public.veiculos_motorista add column if not exists componentes jsonb not null default '[]';
alter table public.veiculos_motorista add column if not exists cadastrado_por uuid default auth.uid() references auth.users(id);
alter table public.veiculos_motorista add column if not exists rntrc text;
create table if not exists public.documentos_veiculo (
 id uuid primary key default gen_random_uuid(), veiculo_id uuid not null references public.veiculos_motorista(id) on delete restrict,
 tipo text not null, arquivo_path text not null, created_at timestamptz not null default now()
);
create table if not exists public.historico_motoristas_veiculo (
 id uuid primary key default gen_random_uuid(), veiculo_id uuid not null references public.veiculos_motorista(id) on delete restrict,
 motorista_anterior_id uuid references public.motoristas(id) on delete restrict, motorista_novo_id uuid references public.motoristas(id) on delete restrict,
 alterado_por uuid references auth.users(id), alterado_em timestamptz not null default now()
);
alter table public.viagens add column if not exists favorecido_snapshot jsonb not null default '{}';
create index if not exists veiculos_favorecido_idx on public.veiculos_motorista(favorecido_id);
create index if not exists documentos_veiculo_idx on public.documentos_veiculo(veiculo_id);
create index if not exists historico_veiculo_idx on public.historico_motoristas_veiculo(veiculo_id);
create index if not exists favorecidos_criador_idx on public.favorecidos_frete(criado_por);
create index if not exists pix_favorecido_idx on public.chaves_pix_frete(favorecido_id);
-- A reassignment changes only the current link. Trips and orders keep their original driver.
create or replace function private.auditar_motorista_veiculo() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.motorista_id is distinct from new.motorista_id then
  if not private.is_admin() and current_user not in ('postgres','service_role') then raise exception 'Somente o administrador pode trocar o motorista.'; end if;
  if exists(select 1 from public.viagens where veiculo_id=old.id and status not in ('encerrada','concluida','cancelada')) then raise exception 'Finalize ou cancele a viagem em andamento antes de trocar o motorista.'; end if;
  insert into public.historico_motoristas_veiculo(veiculo_id,motorista_anterior_id,motorista_novo_id,alterado_por) values(old.id,old.motorista_id,new.motorista_id,auth.uid());
 end if;
 return new;
end $$;
create trigger auditar_motorista_veiculo before update of motorista_id on public.veiculos_motorista for each row execute function private.auditar_motorista_veiculo();
create or replace function public.trocar_motorista_veiculo(p_veiculo_id uuid,p_motorista_id uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Acesso exclusivo do administrador.'; end if;
 if p_motorista_id is not null and not exists(select 1 from public.motoristas where id=p_motorista_id and status_cadastro='aprovado') then raise exception 'Selecione um motorista aprovado.'; end if;
 perform 1 from public.veiculos_motorista where id=p_veiculo_id for update;
 if not found then raise exception 'Veículo não localizado.'; end if;
 update public.veiculos_motorista set motorista_id=p_motorista_id where id=p_veiculo_id;
end $$;
revoke all on function public.trocar_motorista_veiculo(uuid,uuid) from public,anon;
grant execute on function public.trocar_motorista_veiculo(uuid,uuid) to authenticated;
create or replace function private.snapshot_favorecido_viagem() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 select jsonb_build_object('favorecido_id',f.id,'nome',f.nome,'cpf_cnpj',f.cpf_cnpj,'banco',f.banco,'chave',p.chave,'tipo',p.tipo)
 into new.favorecido_snapshot from public.veiculos_motorista v join public.favorecidos_frete f on f.id=v.favorecido_id
 left join public.chaves_pix_frete p on p.favorecido_id=f.id and p.ativo and p.principal where v.id=new.veiculo_id;
 new.favorecido_snapshot:=coalesce(new.favorecido_snapshot,'{}'::jsonb);
 return new;
end $$;
create trigger snapshot_favorecido_viagem before insert on public.viagens for each row execute function private.snapshot_favorecido_viagem();
alter table public.favorecidos_frete enable row level security;
alter table public.chaves_pix_frete enable row level security;
alter table public.documentos_veiculo enable row level security;
alter table public.historico_motoristas_veiculo enable row level security;
grant select,insert,update on public.favorecidos_frete,public.chaves_pix_frete,public.documentos_veiculo to authenticated;
grant select,insert on public.historico_motoristas_veiculo to authenticated;
grant all on public.favorecidos_frete,public.chaves_pix_frete,public.documentos_veiculo,public.historico_motoristas_veiculo to service_role;
drop policy veiculos_owner_all on public.veiculos_motorista;
create policy veiculos_read on public.veiculos_motorista for select to authenticated using (private.is_admin() or motorista_id=private.me_motorista_id() or exists(select 1 from public.viagens t where t.veiculo_id=veiculos_motorista.id and t.motorista_id=private.me_motorista_id()));
create policy veiculos_insert on public.veiculos_motorista for insert to authenticated with check(private.is_admin() or (motorista_id=private.me_motorista_id() and cadastrado_por=(select auth.uid())));
create policy veiculos_update on public.veiculos_motorista for update to authenticated using(private.is_admin() or motorista_id=private.me_motorista_id()) with check(private.is_admin() or motorista_id=private.me_motorista_id());
create policy favorecidos_read on public.favorecidos_frete for select to authenticated using(private.is_admin() or criado_por=(select auth.uid()) or exists(select 1 from public.veiculos_motorista v where v.favorecido_id=favorecidos_frete.id and v.motorista_id=private.me_motorista_id()));
create policy favorecidos_insert on public.favorecidos_frete for insert to authenticated with check(private.is_admin() or criado_por=(select auth.uid()));
create policy favorecidos_update on public.favorecidos_frete for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy pix_read on public.chaves_pix_frete for select to authenticated using(exists(select 1 from public.favorecidos_frete f where f.id=favorecido_id));
create policy pix_insert on public.chaves_pix_frete for insert to authenticated with check(private.is_admin() or exists(select 1 from public.favorecidos_frete f where f.id=favorecido_id and f.criado_por=(select auth.uid())));
create policy pix_update on public.chaves_pix_frete for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy documentos_veiculo_read on public.documentos_veiculo for select to authenticated using(exists(select 1 from public.veiculos_motorista v where v.id=veiculo_id));
create policy documentos_veiculo_insert on public.documentos_veiculo for insert to authenticated with check(private.is_admin() or exists(select 1 from public.veiculos_motorista v where v.id=veiculo_id and v.motorista_id=private.me_motorista_id()));
create policy documentos_veiculo_update on public.documentos_veiculo for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy historico_read on public.historico_motoristas_veiculo for select to authenticated using(private.is_admin() or motorista_anterior_id=private.me_motorista_id() or motorista_novo_id=private.me_motorista_id());
create policy historico_insert on public.historico_motoristas_veiculo for insert to authenticated with check(private.is_admin() and alterado_por=(select auth.uid()));
commit;
-- Policies and invoker RPCs require schema access for their authorization helpers.
grant usage on schema private to authenticated;
grant execute on function private.is_admin(),private.me_motorista_id() to authenticated;
