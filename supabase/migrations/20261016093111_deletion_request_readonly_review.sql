create or replace function private.frete_deletion_assess(p_actor uuid,p_session uuid,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_user uuid; profile_role text; item record; amount bigint; driver_ids uuid[];
 auth_refs jsonb='[]'::jsonb; driver_refs jsonb='[]'::jsonb; files jsonb; blockers bigint=0; category text;
begin
 if not exists(select 1 from public.usuarios_app where user_id=p_actor and ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('MASTER','ADMINISTRADOR'))
 or not exists(select 1 from auth.sessions where id=p_session and user_id=p_actor and (not_after is null or not_after>now()))
 or not exists(select 1 from auth.users where id=p_actor and (banned_until is null or banned_until<=now()))
 then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select user_id into target_user from public.frete_atendimento where id=p_request and tipo='EXCLUSAO';
 if target_user is null then raise exception 'INVALID_REQUEST';end if;
 select perfil into profile_role from public.usuarios_app where user_id=target_user;
 select coalesce(array_agg(id),'{}'::uuid[]) into driver_ids from public.motoristas where auth_user_id=target_user;
 for item in
  select ns.nspname as schema_name,t.relname as table_name,a.attname as column_name,c.confdeltype
  from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid=c.conrelid join pg_catalog.pg_namespace ns on ns.oid=t.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum=c.conkey[1]
  where c.contype='f' and c.confrelid='auth.users'::regclass and cardinality(c.conkey)=1
 loop
  execute format('select count(*) from %I.%I where %I=$1',item.schema_name,item.table_name,item.column_name) into amount using target_user;
  if amount=0 then continue;end if;
  category=case when item.schema_name='auth' then 'GERENCIADO_PELO_AUTH'
   when item.schema_name='public' and item.column_name='user_id' and item.table_name in ('usuarios_app','access_notifications','access_recovery_requests','access_requests','forte_notice_reads','forte_push_subscriptions','frete_atendimento','driver_onboarding') then 'DADOS_DA_CONTA'
   else 'REVISAR_VINCULO' end;
  if category='REVISAR_VINCULO' then blockers=blockers+amount;end if;
  auth_refs=auth_refs||jsonb_build_array(jsonb_build_object('tabela',item.schema_name||'.'||item.table_name,'campo',item.column_name,'quantidade',amount,'categoria',category));
 end loop;
 for item in
  select ns.nspname as schema_name,t.relname as table_name,a.attname as column_name
  from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid=c.conrelid join pg_catalog.pg_namespace ns on ns.oid=t.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum=c.conkey[1]
  where c.contype='f' and c.confrelid='public.motoristas'::regclass and cardinality(c.conkey)=1
 loop
  execute format('select count(*) from %I.%I where %I=any($1)',item.schema_name,item.table_name,item.column_name) into amount using driver_ids;
  if amount=0 then continue;end if;
  category=case when item.table_name in ('documentos_motorista','driver_onboarding','interesses_carga','motorista_rotas','notificacoes_whatsapp') then 'DADOS_DO_MOTORISTA' else 'REVISAR_OPERACAO' end;
  if category='REVISAR_OPERACAO' then blockers=blockers+amount;end if;
  driver_refs=driver_refs||jsonb_build_array(jsonb_build_object('tabela',item.schema_name||'.'||item.table_name,'campo',item.column_name,'quantidade',amount,'categoria',category));
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'quantidade',total)),'[]'::jsonb) into files from (
  select bucket_id,count(*) as total from storage.objects where owner_id=target_user::text or name like target_user::text||'/%' group by bucket_id
 ) counts;
 if profile_role in ('MASTER','ADMINISTRADOR') then blockers=blockers+1;end if;
 return jsonb_build_object('request_id',p_request,'read_only',true,'deleted',false,'perfil',profile_role,'motoristas_vinculados',cardinality(driver_ids),'vinculos_conta',auth_refs,'vinculos_motorista',driver_refs,'arquivos_identificados',files,
 'revisoes_obrigatorias',blockers,'resultado',case when blockers>0 then 'REVISAO_OBRIGATORIA' else 'SEM_VINCULO_OPERACIONAL_DETECTADO' end,
 'aviso','Análise não executa exclusão. Arquivos legados sem proprietário ou fora da pasta da conta exigem conferência adicional. A remoção deve incluir Auth, sessões, dados pessoais e arquivos; registros operacionais precisam de decisão documentada sobre retenção.');
end $$;
create or replace function public.frete_deletion_assess(p_actor uuid,p_session uuid,p_request uuid)
returns jsonb language sql security invoker set search_path='' as $$select private.frete_deletion_assess(p_actor,p_session,p_request);$$;
revoke all on function private.frete_deletion_assess(uuid,uuid,uuid),public.frete_deletion_assess(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function private.frete_deletion_assess(uuid,uuid,uuid),public.frete_deletion_assess(uuid,uuid,uuid) to service_role;
