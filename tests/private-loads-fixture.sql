create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema private; create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.cargas(id uuid primary key default gen_random_uuid(),rota_id uuid,origem_cidade text,origem_uf text,destino_cidade text,destino_uf text,produto text,peso_t numeric,quantidade_sacos integer,frete_por_t numeric,frete_total numeric,data_carregamento date,status text,created_at timestamp with time zone,fornecedor text,local_expedicao text,peso_min_t numeric,peso_max_t numeric,peso_unitario_kg numeric,forte_vendas_solicitacao_id uuid,numero_pedido_fornecedor text,pedido_recebido_em timestamp with time zone);
create table public.integracao_forte_vendas(id uuid primary key default gen_random_uuid(),carga_id uuid,interesse_id uuid,motorista_id uuid,veiculo_id uuid,tipo text,status text,payload jsonb,vendas_solicitacao_id uuid,numero_pedido_fornecedor text,erro text,created_at timestamp with time zone,enviado_em timestamp with time zone,retornado_em timestamp with time zone);
create table public.interesses_carga(id uuid primary key default gen_random_uuid(),carga_id uuid,motorista_id uuid,veiculo_id uuid,placa_confirmada text,status text,created_at timestamp with time zone,capacidade_efetiva_t numeric,peso_aceito_t numeric,quantidade_calculada integer,enviado_vendas_em timestamp with time zone);
create table public.motorista_rotas(motorista_id uuid,rota_id uuid,created_at timestamp with time zone);
create table public.motoristas(id uuid primary key default gen_random_uuid(),nome text,telefone text,cpf text,cnh_registro text,categoria_cnh text,cidade_uf text,observacoes text,created_at timestamp with time zone,updated_at timestamp with time zone,auth_user_id uuid,email text,status_cadastro text,chave_pix text,titular_pix text,rntrc text,proprietario_nome text,proprietario_cpf_cnpj text,validade_cnh date,endereco text,numero text,bairro text,cep text,complemento text,contato_emergencia text,comprovante_endereco_path text,enviado_em timestamp with time zone,analisado_por uuid,analisado_em timestamp with time zone,data_nascimento date,pais text,contato_emergencia_tipo text,contato_emergencia_telefone text,preferencia_todas_rotas boolean,origem_vendas_id text,dados_legados jsonb);
create table public.ordens_carregamento(id uuid primary key default gen_random_uuid(),viagem_id uuid,carga_id uuid,motorista_id uuid,numero text,numero_pedido_fornecedor text,snapshot jsonb,status text,conferida_por uuid,conferida_em timestamp with time zone,enviada_em timestamp with time zone,created_at timestamp with time zone);
create table public.usuarios_app(user_id uuid primary key,nome text,cpf text,whatsapp text,email text,perfil text,ativo boolean,permissoes jsonb,created_at timestamp with time zone,trocar_senha boolean,status_aprovacao text,data_nascimento date);
create table public.veiculos_motorista(id uuid primary key default gen_random_uuid(),motorista_id uuid,tipo text,placa text,renavam text,marca_modelo text,ano_fabricacao integer,ano_modelo integer,chassi text,cor text,combustivel text,capacidade_t numeric,pbt_t numeric,cmt_t numeric,eixos integer,carroceria text,observacoes text,created_at timestamp with time zone,ativo boolean,papel text,proprietario_nome text,proprietario_cpf_cnpj text,capacidade_efetiva_t numeric,foto_conjunto_path text,conjunto_principal boolean,favorecido_id uuid,componentes jsonb,cadastrado_por uuid,rntrc text);
create table public.vendas_ordens(id uuid primary key default gen_random_uuid(),empresa_vendas_id uuid,carga_vendas_id text,motorista_id uuid,snapshot jsonb,documento_frete_path text,pagamento_status text,enviada_em timestamp with time zone,updated_at timestamp with time zone);
create table public.viagens(id uuid primary key default gen_random_uuid(),carga_id uuid,motorista_id uuid,veiculo_id uuid,placas_snapshot jsonb,origem text,destino text,produto text,peso_t numeric,frete_por_t numeric,frete_total numeric,inicio_em timestamp with time zone,concluida_em timestamp with time zone,status text,created_at timestamp with time zone,numero_pedido_fornecedor text,ordem_carregamento_numero text,ordem_gerada_em timestamp with time zone,ordem_enviada_em timestamp with time zone,carregamento_iniciado_em timestamp with time zone,viagem_iniciada_em timestamp with time zone,entrega_concluida_em timestamp with time zone,pagamento_status text,pagamento_comprovante_path text,pagamento_em timestamp with time zone,favorecido_snapshot jsonb);
alter table public.cargas alter created_at set default now();alter table public.viagens alter created_at set default now();alter table public.viagens alter pagamento_status set default 'nao_liberado';alter table public.viagens alter favorecido_snapshot set default '{}';alter table public.interesses_carga add unique(carga_id,motorista_id);alter table public.integracao_forte_vendas add unique(carga_id,motorista_id,tipo);alter table public.integracao_forte_vendas alter created_at set default now();
CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$;
 select exists(select 1 from public.usuarios_app where user_id=(select auth.uid()) and ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('ADMINISTRADOR','MASTER','MASTER'))
$function$;

CREATE OR REPLACE FUNCTION private.is_operational()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$;
 select auth.uid() is not null and exists(
   select 1 from public.usuarios_app u where u.user_id=auth.uid() and u.ativo and u.status_aprovacao='APROVADO' and not u.trocar_senha
   and (u.perfil in ('ADMINISTRADOR','MASTER','MASTER') or (u.perfil='MOTORISTA' and exists(select 1 from public.motoristas m where m.auth_user_id=u.user_id and m.status_cadastro='aprovado')))
 )
$function$;

CREATE OR REPLACE FUNCTION private.me_motorista_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select id from public.motoristas where auth_user_id=(select auth.uid()) limit 1 $function$;

grant usage on schema public,private,auth,storage to authenticated;grant execute on all functions in schema private,auth to authenticated;grant all on all tables in schema public to authenticated;create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant all on storage.objects to authenticated;
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
alter table public.cargas enable row level security;
alter table public.viagens enable row level security;
alter table public.interesses_carga enable row level security;
alter table public.ordens_carregamento enable row level security;
alter table public.integracao_forte_vendas enable row level security;
alter table public.vendas_ordens enable row level security;
create policy cargas_admin_write on public.cargas for ALL to authenticated using(private.is_admin()) with check(private.is_admin());
create policy cargas_approved_gate on public.cargas as restrictive for ALL to authenticated using(private.is_operational()) with check(private.is_operational());
create policy cargas_eligible_select on public.cargas for SELECT to authenticated using((private.is_admin() OR ((status = ANY (ARRAY['publicada'::text, 'atribuida'::text, 'em_viagem'::text, 'concluida'::text])) AND ((rota_id IS NULL) OR (EXISTS ( SELECT 1
   FROM motorista_rotas mr
  WHERE ((mr.motorista_id = private.me_motorista_id()) AND (mr.rota_id = cargas.rota_id))))) AND (EXISTS ( SELECT 1
   FROM veiculos_motorista v
  WHERE ((v.motorista_id = private.me_motorista_id()) AND v.ativo AND (COALESCE(v.capacidade_efetiva_t, v.capacidade_t, (0)::numeric) >= COALESCE(cargas.peso_min_t, (36)::numeric)) AND (COALESCE(v.capacidade_efetiva_t, v.capacidade_t, (0)::numeric) <= COALESCE(cargas.peso_max_t, (52)::numeric)))))))) ;
create policy integracao_admin_all on public.integracao_forte_vendas for ALL to authenticated using(private.is_admin()) with check(private.is_admin());
create policy integracao_approved_gate on public.integracao_forte_vendas as restrictive for ALL to authenticated using(private.is_operational()) with check(private.is_operational());
create policy interesses_approved_gate on public.interesses_carga as restrictive for ALL to authenticated using(private.is_operational()) with check(private.is_operational());
create policy interesses_owner_delete on public.interesses_carga for DELETE to authenticated using(((motorista_id = private.me_motorista_id()) OR private.is_admin())) ;
create policy interesses_owner_insert on public.interesses_carga for INSERT to authenticated  with check(((motorista_id = private.me_motorista_id()) OR private.is_admin()));
create policy interesses_owner_select on public.interesses_carga for SELECT to authenticated using(((motorista_id = private.me_motorista_id()) OR private.is_admin())) ;
create policy interesses_owner_update on public.interesses_carga for UPDATE to authenticated using(((motorista_id = private.me_motorista_id()) OR private.is_admin())) with check(((motorista_id = private.me_motorista_id()) OR private.is_admin()));
create policy frete_docs_read_self on storage.objects for SELECT to authenticated using(((bucket_id = 'forte-frete-cadastros'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text))) ;
create policy frete_docs_upload_self on storage.objects for INSERT to authenticated  with check(((bucket_id = 'forte-frete-cadastros'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy motorista_storage_delete on storage.objects for DELETE to authenticated using(((bucket_id = 'motorista-documentos'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR private.is_admin()))) ;
create policy motorista_storage_insert on storage.objects for INSERT to authenticated  with check(((bucket_id = 'motorista-documentos'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR private.is_admin())));
create policy motorista_storage_select on storage.objects for SELECT to authenticated using(((bucket_id = 'motorista-documentos'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR private.is_admin()))) ;
create policy motorista_storage_update on storage.objects for UPDATE to authenticated using(((bucket_id = 'motorista-documentos'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR private.is_admin()))) with check(((bucket_id = 'motorista-documentos'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR private.is_admin())));
create policy vendas_ordens_file_read on storage.objects for SELECT to authenticated using(((bucket_id = 'vendas-ordens-frete'::text) AND (EXISTS ( SELECT 1
   FROM vendas_ordens o
  WHERE (o.documento_frete_path = objects.name))))) ;
create policy ordens_admin_all on public.ordens_carregamento for ALL to authenticated using(private.is_admin()) with check(private.is_admin());
create policy ordens_approved_gate on public.ordens_carregamento as restrictive for ALL to authenticated using(private.is_operational()) with check(private.is_operational());
create policy ordens_motorista_select on public.ordens_carregamento for SELECT to authenticated using((motorista_id = private.me_motorista_id())) ;
create policy vendas_ordens_read on public.vendas_ordens for SELECT to authenticated using((private.is_operational() AND (private.is_admin() OR (motorista_id = private.me_motorista_id())))) ;
create policy viagens_admin_write on public.viagens for ALL to authenticated using(private.is_admin()) with check(private.is_admin());
create policy viagens_approved_gate on public.viagens as restrictive for ALL to authenticated using(private.is_operational()) with check(private.is_operational());
create policy viagens_owner_select on public.viagens for SELECT to authenticated using(((motorista_id = private.me_motorista_id()) OR private.is_admin())) ;

