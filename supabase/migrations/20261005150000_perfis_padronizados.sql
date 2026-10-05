alter table public.usuarios_app drop constraint if exists usuarios_app_perfil_obrigatorio;
update public.usuarios_app set perfil=(case perfil::text when 'ADMIN' then 'ADMINISTRADOR' when 'ULTRA_ADMIN' then 'MASTER' when 'OPERATOR' then 'OPERADOR_GERAL' when 'FISCAL' then 'OPERADOR_GERAL' when 'ACCOUNTANT' then 'OPERADOR_GERAL' when 'AUDITOR' then 'OPERADOR_GERAL' when 'CONSULTA' then 'OPERADOR_GERAL' when 'VENDAS' then 'VENDEDOR_INTERNO' when 'CAIXA' then 'VENDEDOR_INTERNO' when 'CONFERENCIA' then 'OPERADOR_PATIO' when 'FINANCEIRO' then 'OPERADOR_GERAL' when 'AUXILIAR_N1' then 'OPERADOR_GERAL' when 'AUXILIAR_N2' then 'OPERADOR_GERAL' when 'MOTORISTA_ENTREGA' then 'MOTORISTA' else perfil::text end)::text where perfil::text not in ('MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO');
alter table public.usuarios_app alter column perfil set not null;
alter table public.usuarios_app add constraint usuarios_app_perfil_padronizado check(perfil::text in ('MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO'));
alter table public.usuarios_app alter column perfil set default 'MOTORISTA'::text;
CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.usuarios_app where user_id=(select auth.uid()) and ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('ADMINISTRADOR','MASTER','MASTER'))
$function$
;
CREATE OR REPLACE FUNCTION private.is_operational()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and exists(
   select 1 from public.usuarios_app u where u.user_id=auth.uid() and u.ativo and u.status_aprovacao='APROVADO' and not u.trocar_senha
   and (u.perfil in ('ADMINISTRADOR','MASTER','MASTER') or (u.perfil='MOTORISTA' and exists(select 1 from public.motoristas m where m.auth_user_id=u.user_id and m.status_cadastro='aprovado')))
 )
$function$
;
CREATE OR REPLACE FUNCTION private.access_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if tg_op='INSERT' then
 insert into public.access_notifications(request_id,user_id,audience,event,message) values
 (new.id,new.user_id,'ADMINISTRADOR','NOVO_CADASTRO','Novo usuário aguardando análise: '||new.nome||' • '||new.app),
 (new.id,new.user_id,'USER','NOVO_CADASTRO','Cadastro enviado para análise. Aguarde aprovação do admin ou master.') on conflict do nothing;
 elsif new.status is distinct from old.status and new.status in ('APROVADO','RECUSADO') then
 insert into public.access_notifications(request_id,user_id,audience,event,message)
 values(new.id,new.user_id,'USER',new.status,case when new.status='APROVADO' then 'Acesso aprovado para '||new.app||'.' else 'Acesso recusado: '||coalesce(new.reason,'Contate o administrador.') end) on conflict do nothing;
 end if;return new;
end;$function$
;
CREATE OR REPLACE FUNCTION private.access_is_admin(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.usuarios_app where user_id=p_user and ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('MASTER','ADMINISTRADOR','MASTER'));
$function$
;
CREATE OR REPLACE FUNCTION public.access_recovery_claim(p_request uuid, p_actor uuid, p_decision text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.access_recovery_requests;a public.usuarios_app;p public.usuarios_app;
begin
 if not private.access_is_admin(p_actor) then raise exception 'Somente admin ou master aprovado pode analisar.' using errcode='42501';end if;
 select * into r from public.access_recovery_requests where id=p_request for update;
 if not found or r.status<>'PENDENTE' then raise exception 'Solicitação não está aguardando análise.';end if;
 if r.user_id=p_actor then raise exception 'Você já está autenticado. Use TROCAR MINHA SENHA para sua própria senha.';end if;
 select * into a from public.usuarios_app where user_id=p_actor;
 select * into p from public.usuarios_app where user_id=r.user_id for update;
 if not found then raise exception 'Cadastro não localizado.';end if;
 
 if p.perfil in ('MASTER','MASTER') and a.perfil not in ('MASTER','MASTER') then raise exception 'Somente outro master pode redefinir a senha do master.' using errcode='42501';end if;
 if p_decision is null or p_decision not in ('ATENDIDO','RECUSADO') or (p_decision='RECUSADO' and length(trim(coalesce(p_reason,'')))<3) then raise exception 'Informe decisão e motivo válidos.';end if;
 if p_decision='ATENDIDO' then
 update public.usuarios_app set trocar_senha=true where user_id=r.user_id;
 end if;
 update public.access_recovery_requests set status=case when p_decision='ATENDIDO' then 'PROCESSANDO' else 'RECUSADO' end,reviewed_by=p_actor,reviewed_at=now(),reason=nullif(trim(p_reason),'') where id=r.id;
 return jsonb_build_object('user_id',r.user_id,'nome',p.nome,'whatsapp',p.whatsapp,'status',case when p_decision='ATENDIDO' then 'PROCESSANDO' else 'RECUSADO' end);
end;$function$
;
CREATE OR REPLACE FUNCTION public.access_review_with_role(p_request uuid, p_actor uuid, p_decision text, p_role text, p_units uuid[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.access_requests; a public.usuarios_app; t public.usuarios_app; chosen text; units uuid[];
begin
 if not private.access_is_admin(p_actor) then raise exception 'Somente admin ou master aprovado pode analisar.' using errcode='42501'; end if;
 select * into a from public.usuarios_app where user_id=p_actor for share;
 select * into r from public.access_requests where id=p_request for update;
 if not found or r.status<>'PENDENTE' or r.app<>'frete' then raise exception 'Cadastro não está aguardando análise.'; end if;
 select * into t from public.usuarios_app where user_id=r.user_id for update;
 if not found  then raise exception 'Cadastro não permitido.'; end if;
 if t.perfil::text in ('MASTER','ADMINISTRADOR','MASTER') and a.perfil::text not in ('MASTER','MASTER') then raise exception 'Somente master pode analisar usuários administrativos.' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('APROVADO','RECUSADO') or (p_decision='RECUSADO' and length(trim(coalesce(p_reason,'')))<3) then raise exception 'Informe decisão e motivo válidos.'; end if;
 if p_decision='APROVADO' then
  chosen:=nullif(trim(p_role),'');
  if chosen is null then raise exception 'Selecione o perfil do usuário antes de aprovar.'; end if;
  if not chosen=any(array['MASTER','ADMINISTRADOR','OPERADOR_GERAL','OPERADOR_PATIO','MOTORISTA','VENDEDOR_EXTERNO','VENDEDOR_INTERNO']) then raise exception 'Perfil inválido para este sistema.'; end if;
  if chosen in ('MASTER','ADMINISTRADOR') and a.perfil::text not in ('MASTER','MASTER') then raise exception 'Somente master pode conceder perfil master ou administrador.' using errcode='42501'; end if;
  update public.usuarios_app set ativo=true,status_aprovacao='APROVADO',perfil=chosen where user_id=r.user_id;
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role',chosen),updated_at=now() where id=r.user_id;
 end if;
 update public.access_requests set status=p_decision,reviewed_by=p_actor,reviewed_at=now(),reason=nullif(trim(p_reason),'') where id=r.id;
 insert into public.access_audit(app,event,user_id) values(r.app,'PERFIL_'||coalesce(chosen,t.perfil::text)||'_'||p_decision,r.user_id);
 return jsonb_build_object('status',p_decision,'app',r.app,'role',coalesce(chosen,t.perfil::text));
end;$function$
;
update auth.users u set raw_app_meta_data=coalesce(u.raw_app_meta_data,'{}'::jsonb)||jsonb_build_object('role',p.perfil::text),updated_at=now() from public.usuarios_app p where p.user_id=u.id and u.raw_app_meta_data->>'role' is distinct from p.perfil::text;
notify pgrst,'reload schema';
