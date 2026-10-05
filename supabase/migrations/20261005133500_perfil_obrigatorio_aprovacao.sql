
create or replace function public.access_review_with_role(p_request uuid,p_actor uuid,p_decision text,p_role text,p_units uuid[],p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare r public.access_requests; a public.usuarios_app; t public.usuarios_app; chosen text; units uuid[];
begin
 if not private.access_is_admin(p_actor) then raise exception 'Somente admin ou master aprovado pode analisar.' using errcode='42501'; end if;
 select * into a from public.usuarios_app where user_id=p_actor for share;
 select * into r from public.access_requests where id=p_request for update;
 if not found or r.status<>'PENDENTE' or r.app<>'frete' then raise exception 'Cadastro não está aguardando análise.'; end if;
 select * into t from public.usuarios_app where user_id=r.user_id for update;
 if not found  then raise exception 'Cadastro não permitido.'; end if;
 if t.perfil::text in ('MASTER','ADMIN','ULTRA_ADMIN') and a.perfil::text not in ('MASTER','ULTRA_ADMIN') then raise exception 'Somente master pode analisar usuários administrativos.' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('APROVADO','RECUSADO') or (p_decision='RECUSADO' and length(trim(coalesce(p_reason,'')))<3) then raise exception 'Informe decisão e motivo válidos.'; end if;
 if p_decision='APROVADO' then
  chosen:=nullif(trim(p_role),'');
  if chosen is null then raise exception 'Selecione o perfil do usuário antes de aprovar.'; end if;
  if not chosen=any(array['MASTER','ADMIN','MOTORISTA']) then raise exception 'Perfil inválido para este sistema.'; end if;
  if chosen in ('MASTER','ADMIN') and a.perfil::text not in ('MASTER','ULTRA_ADMIN') then raise exception 'Somente master pode conceder perfil master ou administrador.' using errcode='42501'; end if;
  update public.usuarios_app set ativo=true,status_aprovacao='APROVADO',perfil=chosen where user_id=r.user_id;
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role',chosen),updated_at=now() where id=r.user_id;
 end if;
 update public.access_requests set status=p_decision,reviewed_by=p_actor,reviewed_at=now(),reason=nullif(trim(p_reason),'') where id=r.id;
 insert into public.access_audit(app,event,user_id) values(r.app,'PERFIL_'||coalesce(chosen,t.perfil::text)||'_'||p_decision,r.user_id);
 return jsonb_build_object('status',p_decision,'app',r.app,'role',coalesce(chosen,t.perfil::text));
end;$fn$;
revoke all on function public.access_review_with_role(uuid,uuid,text,text,uuid[],text) from public,anon,authenticated;
grant execute on function public.access_review_with_role(uuid,uuid,text,text,uuid[],text) to service_role;

create or replace function public.access_review(p_request uuid,p_actor uuid,p_decision text,p_unit uuid default null,p_reason text default null)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
begin
 return public.access_review_with_role(p_request,p_actor,p_decision,null,case when p_unit is null then '{}'::uuid[] else array[p_unit] end,p_reason);
end;$fn$;
revoke all on function public.access_review(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.access_review(uuid,uuid,text,uuid,text) to service_role;
alter table public.usuarios_app add constraint usuarios_app_perfil_obrigatorio check(perfil is not null and perfil in ('MASTER','ULTRA_ADMIN','ADMIN','MOTORISTA'));
alter table public.usuarios_app alter column perfil set not null;
notify pgrst,'reload schema';
