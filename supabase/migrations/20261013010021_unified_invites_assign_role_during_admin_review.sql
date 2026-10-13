alter table public.driver_onboarding add column documents_requested boolean not null default false;
update public.driver_onboarding set documents_requested=true where status='SUBMITTED' or data<>'{}'::jsonb;
alter table public.access_requests add column invite_id uuid references public.convites_motorista(id);
update public.access_requests r set invite_id=d.invite_id from public.driver_onboarding d where r.user_id=d.user_id and r.app='frete' and d.invite_id is not null;
create or replace function private.assert_driver_dossier(p_id uuid) returns void language plpgsql set search_path='' as $$
declare m public.motoristas;v public.veiculos_motorista;d public.driver_onboarding;k text;
begin
 select * into strict m from public.motoristas where id=p_id;
 select * into d from public.driver_onboarding where motorista_id=p_id;
 if m.data_nascimento is null or nullif(m.cnh_registro,'') is null or nullif(m.categoria_cnh,'') is null or m.validade_cnh is null then raise exception 'Complete nascimento e dados da CNH.';end if;
 select * into v from public.veiculos_motorista where motorista_id=p_id and ativo and conjunto_principal order by created_at desc limit 1;
 if v.id is null or coalesce(v.capacidade_efetiva_t,v.capacidade_t,0)<=0 or nullif(v.placa,'') is null or nullif(v.proprietario_nome,'') is null or nullif(v.proprietario_cpf_cnpj,'') is null then raise exception 'Complete veículo, proprietário, placa e capacidade.';end if;
 if not exists(select 1 from public.favorecidos_frete f join public.chaves_pix_frete p on p.favorecido_id=f.id where f.id=v.favorecido_id and f.ativo and p.ativo and p.principal) then raise exception 'Complete o favorecido e a chave Pix principal.';end if;
 if not exists(select 1 from public.documentos_motorista where motorista_id=p_id and tipo='cnh_frente') then raise exception 'Anexe a CNH aberta ou o documento digital completo.';end if;
 foreach k in array array['rntrc','cavalo'] loop if not exists(select 1 from public.documentos_veiculo where veiculo_id=v.id and tipo=k) then raise exception 'Anexe documento: %.',k;end if;end loop;
 foreach k in array array['carreta_1','dolly','carreta_2'] loop
  if (d.user_id is not null and coalesce(d.data->'absent'->>k,'false')<>'true' or exists(select 1 from jsonb_array_elements(v.componentes) c where c->>'papel'=k)) and not exists(select 1 from public.documentos_veiculo where veiculo_id=v.id and tipo=k) then raise exception 'Anexe documento do componente: %.',k;end if;
 end loop;
end;$$;
revoke all on function private.assert_driver_dossier(uuid) from public,anon;
grant execute on function private.assert_driver_dossier(uuid) to service_role,authenticated;
create or replace function public.access_claim_invite(p_user uuid,p_code uuid) returns void language plpgsql set search_path='' as $$
declare i public.convites_motorista;r public.access_requests;
begin
 select * into strict i from public.convites_motorista where codigo=p_code for update;
 select * into strict r from public.access_requests where user_id=p_user and app='frete' order by created_at desc limit 1 for update;
 if not i.ativo or i.expires_at<now() or i.target_phone is not null and i.target_phone<>r.whatsapp then raise exception 'Convite expirado, cancelado ou destinado a outro WhatsApp.';end if;
 if r.invite_id=i.id then return;end if;
 if r.invite_id is not null or not i.uso_ilimitado and (exists(select 1 from public.access_requests where invite_id=i.id) or exists(select 1 from public.driver_onboarding where invite_id=i.id)) then raise exception 'Convite já utilizado.';end if;
 update public.access_requests set invite_id=i.id where id=r.id;
 update public.convites_motorista set total_cadastros=total_cadastros+1 where id=i.id;
end;$$;
revoke all on function public.access_claim_invite(uuid,uuid) from public,anon,authenticated;
grant execute on function public.access_claim_invite(uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.access_register_profile(p_user uuid, p_app text, p_nome text, p_cpf text, p_whatsapp text, p_birth date, p_email text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r uuid;
begin
 if p_app<>'frete' then raise exception 'Aplicativo inválido.';end if;
 insert into public.usuarios_app(user_id,nome,cpf,whatsapp,email,data_nascimento,perfil,ativo,trocar_senha,status_aprovacao)
 values(p_user,p_nome,p_cpf,p_whatsapp,p_email,p_birth,'OPERADOR_GERAL',false,false,'PENDENTE');
 insert into public.access_requests(user_id,app,nome,cpf,whatsapp,data_nascimento,email) values(p_user,p_app,p_nome,p_cpf,p_whatsapp,p_birth,p_email) returning id into r;
 return r;
end;$function$;

CREATE OR REPLACE FUNCTION public.access_review_with_role(p_request uuid, p_actor uuid, p_decision text, p_role text, p_units uuid[], p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.access_requests; a public.usuarios_app; t public.usuarios_app; chosen text; units uuid[]; m public.motoristas;
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
  if chosen='MOTORISTA' then
   select * into m from public.motoristas where auth_user_id=r.user_id for update;
   if not found then
    insert into public.motoristas(auth_user_id,nome,cpf,telefone,email,data_nascimento,status_cadastro) values(r.user_id,r.nome,r.cpf,r.whatsapp,r.email,r.data_nascimento,'pre_cadastro') returning * into m;
   end if;
   if not exists(select 1 from public.driver_onboarding where user_id=r.user_id and status='SUBMITTED') then
    insert into public.driver_onboarding(user_id,motorista_id,documents_requested) values(r.user_id,m.id,true) on conflict(user_id) do update set documents_requested=true;
    update public.usuarios_app set perfil='MOTORISTA',ativo=false,status_aprovacao='PENDENTE' where user_id=r.user_id;
    insert into public.access_audit(app,event,user_id) values('frete','DOCUMENTOS_MOTORISTA_SOLICITADOS',r.user_id);
    return jsonb_build_object('status','DOCUMENTS_REQUIRED','role','MOTORISTA','message','Perfil motorista selecionado. O cadastro segue bloqueado; a pessoa deve enviar os documentos, veículos e Pix antes da aprovação final.');
   end if;
   perform private.assert_driver_dossier(m.id);
   update public.motoristas set status_cadastro='aprovado',analisado_por=p_actor,analisado_em=now() where id=m.id;
  end if;
  update public.usuarios_app set ativo=true,status_aprovacao='APROVADO',perfil=chosen where user_id=r.user_id;
  -- Auth metadata is synchronized by access-standard using the Admin API.
 end if;
 update public.access_requests set status=p_decision,reviewed_by=p_actor,reviewed_at=now(),reason=nullif(trim(p_reason),'') where id=r.id;
 insert into public.access_audit(app,event,user_id) values(r.app,'PERFIL_'||coalesce(chosen,t.perfil::text)||'_'||p_decision,r.user_id);
 return jsonb_build_object('status',p_decision,'app',r.app,'role',coalesce(chosen,t.perfil::text));
end;$function$;

CREATE OR REPLACE FUNCTION private.review_driver(p_id uuid, p_decision text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.motoristas%rowtype; v public.veiculos_motorista%rowtype; next_status text; missing text;
begin
 if auth.uid() is null or not private.is_admin() then raise exception 'Acesso exclusivo de MASTER ou ADMIN.'; end if;
 if p_decision is null or p_decision not in ('aprovado','reprovado','pendencia') then raise exception 'Decisão inválida.'; end if;
 if p_decision <> 'aprovado' and coalesce(length(trim(p_reason)),0)=0 then raise exception 'Informe o motivo da decisão.'; end if;
 select * into m from public.motoristas where id=p_id for update;
 if not found or m.auth_user_id is null then raise exception 'Motorista não localizado.'; end if;
 perform 1 from public.usuarios_app where user_id=m.auth_user_id and perfil='MOTORISTA' for update;
 if not found then raise exception 'O cadastro não corresponde a um usuário motorista.'; end if;
 if p_decision='aprovado' then
   if m.status_cadastro not in ('em_analise','pendencia') then raise exception 'O motorista deve enviar o dossiê para análise.'; end if;
   perform private.assert_driver_dossier(m.id);
 end if;
 -- Keep the standard access decision in the same transaction as the dossier.
 next_status:=case p_decision when 'aprovado' then 'APROVADO' when 'reprovado' then 'REPROVADO' else 'PENDENTE' end;
 update public.motoristas set status_cadastro=p_decision,analisado_por=auth.uid(),analisado_em=now(),observacoes=concat_ws(E'\n',nullif(observacoes,''),case when p_reason is not null then p_decision||': '||trim(p_reason) end) where id=m.id;
 update public.usuarios_app set status_aprovacao=next_status,ativo=(p_decision='aprovado') where user_id=m.auth_user_id;
 update public.access_requests set status=case p_decision when 'aprovado' then 'APROVADO' when 'reprovado' then 'RECUSADO' else 'PENDENTE' end,
 reviewed_by=auth.uid(),reviewed_at=now(),reason=nullif(trim(p_reason),'')
 where user_id=m.auth_user_id and app='frete';
 insert into public.notificacoes_whatsapp(motorista_id,tipo,telefone,mensagem) values(m.id,case p_decision when 'aprovado' then 'CADASTRO_APROVADO' when 'pendencia' then 'CORRECAO_CADASTRO' else 'CADASTRO_REPROVADO' end,m.telefone,'Forte Frete: cadastro '||p_decision||case when p_reason is not null then '. Motivo: '||trim(p_reason) else '. Acesso à operação liberado.' end);
 return jsonb_build_object('motorista_id',m.id,'status_cadastro',p_decision,'status_aprovacao',next_status,'ativo',p_decision='aprovado');
end $function$;
