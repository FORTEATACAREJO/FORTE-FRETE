
-- Registration fixture from read-only schema and policy audit, without production data.
create table public.chaves_pix_frete(id uuid primary key default gen_random_uuid(),favorecido_id uuid,tipo text,chave text,principal boolean,ativo boolean,created_at timestamp with time zone);alter table public.chaves_pix_frete enable row level security;
create table public.documentos_motorista(id uuid primary key default gen_random_uuid(),motorista_id uuid,tipo text,arquivo_path text,status text,dados_extraidos jsonb,observacoes text,created_at timestamp with time zone);alter table public.documentos_motorista enable row level security;
create table public.documentos_veiculo(id uuid primary key default gen_random_uuid(),veiculo_id uuid,tipo text,arquivo_path text,created_at timestamp with time zone);alter table public.documentos_veiculo enable row level security;
create table public.favorecidos_frete(id uuid primary key default gen_random_uuid(),nome text,cpf_cnpj text,telefone text,banco text,criado_por uuid,ativo boolean,created_at timestamp with time zone);alter table public.favorecidos_frete enable row level security;
create table public.historico_motoristas_veiculo(id uuid primary key default gen_random_uuid(),veiculo_id uuid,motorista_anterior_id uuid,motorista_novo_id uuid,alterado_por uuid,alterado_em timestamp with time zone);alter table public.historico_motoristas_veiculo enable row level security;
alter table public.motoristas enable row level security;alter table public.veiculos_motorista enable row level security;alter table public.motorista_rotas enable row level security;
grant all on all tables in schema public to authenticated;
create policy pix_insert on public.chaves_pix_frete for INSERT to authenticated  with check((private.is_admin() OR (EXISTS ( SELECT 1
   FROM favorecidos_frete f
  WHERE ((f.id = chaves_pix_frete.favorecido_id) AND (f.criado_por = ( SELECT auth.uid() AS uid)))))));
create policy pix_read on public.chaves_pix_frete for SELECT to authenticated using((EXISTS ( SELECT 1
   FROM favorecidos_frete f
  WHERE (f.id = chaves_pix_frete.favorecido_id)))) ;
create policy pix_update on public.chaves_pix_frete for UPDATE to authenticated using(private.is_admin()) with check(private.is_admin());
create policy documentos_owner_all on public.documentos_motorista for ALL to authenticated using(((motorista_id = private.me_motorista_id()) OR private.is_admin())) with check(((motorista_id = private.me_motorista_id()) OR private.is_admin()));
create policy documentos_veiculo_insert on public.documentos_veiculo for INSERT to authenticated  with check((private.is_admin() OR (EXISTS ( SELECT 1
   FROM veiculos_motorista v
  WHERE ((v.id = documentos_veiculo.veiculo_id) AND (v.motorista_id = private.me_motorista_id()))))));
create policy documentos_veiculo_read on public.documentos_veiculo for SELECT to authenticated using((EXISTS ( SELECT 1
   FROM veiculos_motorista v
  WHERE (v.id = documentos_veiculo.veiculo_id)))) ;
create policy documentos_veiculo_update on public.documentos_veiculo for UPDATE to authenticated using(private.is_admin()) with check(private.is_admin());
create policy favorecidos_insert on public.favorecidos_frete for INSERT to authenticated  with check((private.is_admin() OR (criado_por = ( SELECT auth.uid() AS uid))));
create policy favorecidos_read on public.favorecidos_frete for SELECT to authenticated using((private.is_admin() OR (criado_por = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM veiculos_motorista v
  WHERE ((v.favorecido_id = favorecidos_frete.id) AND (v.motorista_id = private.me_motorista_id())))))) ;
create policy favorecidos_update on public.favorecidos_frete for UPDATE to authenticated using(private.is_admin()) with check(private.is_admin());
create policy historico_insert on public.historico_motoristas_veiculo for INSERT to authenticated  with check((private.is_admin() AND (alterado_por = ( SELECT auth.uid() AS uid))));
create policy historico_read on public.historico_motoristas_veiculo for SELECT to authenticated using((private.is_admin() OR (motorista_anterior_id = private.me_motorista_id()) OR (motorista_novo_id = private.me_motorista_id()))) ;
create policy motorista_rotas_owner_all on public.motorista_rotas for ALL to authenticated using(((motorista_id = private.me_motorista_id()) OR private.is_admin())) with check(((motorista_id = private.me_motorista_id()) OR private.is_admin()));
create policy motoristas_admin_delete on public.motoristas for DELETE to authenticated using(private.is_admin()) ;
create policy motoristas_self_insert on public.motoristas for INSERT to authenticated  with check(((auth_user_id = ( SELECT auth.uid() AS uid)) OR private.is_admin()));
create policy motoristas_self_select on public.motoristas for SELECT to authenticated using(((auth_user_id = ( SELECT auth.uid() AS uid)) OR private.is_admin())) ;
create policy motoristas_self_update on public.motoristas for UPDATE to authenticated using(((auth_user_id = ( SELECT auth.uid() AS uid)) OR private.is_admin())) with check(((auth_user_id = ( SELECT auth.uid() AS uid)) OR private.is_admin()));
create policy veiculos_insert on public.veiculos_motorista for INSERT to authenticated  with check((private.is_admin() OR ((motorista_id = private.me_motorista_id()) AND (cadastrado_por = ( SELECT auth.uid() AS uid)))));
create policy veiculos_read on public.veiculos_motorista for SELECT to authenticated using((private.is_admin() OR (motorista_id = private.me_motorista_id()) OR (EXISTS ( SELECT 1
   FROM viagens t
  WHERE ((t.veiculo_id = veiculos_motorista.id) AND (t.motorista_id = private.me_motorista_id())))))) ;
create policy veiculos_update on public.veiculos_motorista for UPDATE to authenticated using((private.is_admin() OR (motorista_id = private.me_motorista_id()))) with check((private.is_admin() OR (motorista_id = private.me_motorista_id())));

