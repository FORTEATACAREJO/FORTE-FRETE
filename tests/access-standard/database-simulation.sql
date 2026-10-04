begin;

create temporary table access_test_results(name text,ok boolean,detail text);
grant all on access_test_results to authenticated,anon;
create or replace function pg_temp.expect_denied(p_name text,p_sql text) returns void language plpgsql as $$
declare denied boolean:=false;detail text;
begin
 begin execute p_sql;exception when others then denied=true;detail=sqlerrm;end;
 insert into access_test_results values(p_name,denied,coalesce(detail,'ACEITO INDEVIDAMENTE'));
end;$$;
create temporary table access_fixture as select gen_random_uuid() as uid,gen_random_uuid() as other_uid;
grant select on access_fixture to authenticated,anon;
insert into auth.users(id,email,aud,role,email_confirmed_at,raw_user_meta_data)
select uid,'audit-'||uid||'@acesso.forte.internal','authenticated','authenticated',now(),'{"full_name":"Usuário Simulado"}'::jsonb from access_fixture
union all select other_uid,'audit-'||other_uid||'@acesso.forte.internal','authenticated','authenticated',now(),'{"full_name":"Outro Simulado"}'::jsonb from access_fixture;
select public.access_register_profile(uid,'frete','Usuário Simulado','52998224725','5534999998888','1990-01-15',null) from access_fixture;
select public.access_register_profile(other_uid,'frete','Outro Simulado','11144477735','5534999997777','1991-02-15',null) from access_fixture;

insert into access_test_results select 'Cada cadastro gera aviso para admin e usuário',count(*)=4,'avisos='||count(*) from public.access_notifications where user_id in (select uid from access_fixture union select other_uid from access_fixture);
insert into access_test_results select 'Cadastros começam pendentes',count(*)=2 and bool_and(status='PENDENTE'),'solicitações='||count(*) from public.access_requests where user_id in (select uid from access_fixture union select other_uid from access_fixture);
select set_config('request.jwt.claim.sub',(select uid::text from access_fixture),true);
set local role authenticated;
insert into access_test_results select 'Usuário vê somente a própria solicitação',count(*)=1,'visíveis='||count(*) from public.access_requests;
insert into access_test_results select 'Usuário vê somente seu aviso',count(*)=1 and bool_and(audience='USER'),'visíveis='||count(*) from public.access_notifications;
select pg_temp.expect_denied('Usuário não pode aprovar o próprio cadastro','update public.access_requests set status=''APROVADO'' where user_id=auth.uid()');
select pg_temp.expect_denied('RPC de aprovação não aceita chamada direta de usuário','select public.access_review(gen_random_uuid(),auth.uid(),''APROVADO'')');
reset role;

set local role authenticated;
insert into access_test_results select 'Pendente não vê viagens de outros usuários',count(*)=0,'viagens='||count(*) from public.viagens;
select pg_temp.expect_denied('Pendente não publica cargas','insert into public.cargas(origem_cidade,origem_uf,destino_cidade,destino_uf,frete_por_t) values(''Teste'',''MG'',''Teste'',''GO'',100)');
reset role;
select public.access_review((select id from public.access_requests where user_id=(select uid from access_fixture)),(select user_id from public.usuarios_app where ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('MASTER','ULTRA_ADMIN') limit 1),'APROVADO');
insert into access_test_results select 'Aprovação de acesso preserva análise de documentos do motorista',status_cadastro='pre_cadastro','status='||status_cadastro from public.motoristas where auth_user_id=(select uid from access_fixture);
set local role authenticated;
select pg_temp.expect_denied('Motorista aprovado para acesso não pode aprovar dossiê','select public.analisar_cadastro_motorista((select id from public.motoristas where auth_user_id=auth.uid()),''aprovado'')');
reset role;

insert into access_test_results select 'Aprovação gera aviso ao usuário',count(*)=1,'avisos='||count(*) from public.access_notifications where user_id=(select uid from access_fixture) and event='APROVADO' and audience='USER';
select pg_temp.expect_denied('Uma decisão não pode ser repetida','select public.access_review((select id from public.access_requests where user_id=(select uid from access_fixture)),(select reviewed_by from public.access_requests where user_id=(select uid from access_fixture)),''APROVADO'')');
select jsonb_agg(to_jsonb(t)) as results from access_test_results t;

rollback;

