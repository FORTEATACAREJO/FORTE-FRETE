begin;
do $setup$
declare actor uuid; target uuid:=gen_random_uuid(); request uuid;
begin
 select user_id into actor from public.usuarios_app where perfil='MASTER' and ativo and status_aprovacao='APROVADO' and not trocar_senha limit 1;
 if actor is null then raise exception 'Missing test actor';end if;
 insert into auth.users(id,email,raw_user_meta_data) values(target,'approval-test-'||target||'@example.invalid','{"full_name":"Teste de aprovação"}');
 insert into public.usuarios_app(user_id,nome,cpf,whatsapp,perfil,ativo) values(target,'Teste de aprovação','52998224725','5534999998888','MOTORISTA',false);
 insert into public.access_requests(user_id,app,nome,cpf,whatsapp,data_nascimento) values(target,'frete','Teste de aprovação','52998224725','5534999998888','1990-01-01') returning id into request;
 perform set_config('forte.test.actor',actor::text,true);
 perform set_config('forte.test.request',request::text,true);
end $setup$;
set local role service_role;
do $test$
declare actor uuid:=current_setting('forte.test.actor')::uuid; request uuid:=current_setting('forte.test.request')::uuid; result jsonb; chosen text; blocked boolean;
begin
 blocked:=false;
 begin perform public.access_review_with_role(request,actor,'APROVADO',null,'{}'::uuid[],null);exception when others then if sqlerrm like '%Selecione o perfil%' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Missing role was accepted';end if;
 foreach chosen in array array['MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO'] loop
  update public.access_requests set status='PENDENTE',reviewed_by=null,reviewed_at=null where id=request;
  result:=public.access_review_with_role(request,actor,'APROVADO',chosen,'{}'::uuid[],null);
  if result->>'role'<>chosen or not exists(select 1 from public.access_requests r join public.usuarios_app u on u.user_id=r.user_id where r.id=request and r.status='APROVADO' and u.perfil=chosen and u.ativo) then raise exception 'Approval not saved';end if;
 end loop;
end $test$;
rollback;
select 'PASS: aprovação exige perfil e salva todos os perfis como service_role' result;
