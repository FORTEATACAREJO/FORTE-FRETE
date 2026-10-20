begin;
-- These invitations copy an explicitly selected draft, never grant access or
-- link a driver/vehicle. Existing CNH review and approval remain mandatory.
alter table public.access_invites add column driver_id uuid references public.motoristas(id),
 add column driver_cpf text;
alter table public.registration_dossiers add column completion_driver_id uuid references public.motoristas(id),
 add column completion_warnings jsonb not null default '[]';

create function public.driver_completion_invite_create(p_actor uuid,p_driver uuid,p_phone text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.motoristas;i public.access_invites;phone text;cpf text;
begin
 if not private.access_is_admin(p_actor) then raise exception 'Somente admin ou master aprovado pode convidar para completar um cadastro.' using errcode='42501';end if;
 select * into strict m from public.motoristas where id=p_driver for update;
 if m.auth_user_id is not null or m.status_cadastro not in ('legado','pre_cadastro','pendencia','reprovado') then raise exception 'Este motorista já tem acesso ou não está disponível para complementação.';end if;
 cpf:=regexp_replace(coalesce(m.cpf,''),'[^0-9]','','g');
 if length(cpf)<>11 or not public.validar_documento_favorecido(cpf) then raise exception 'Confira e salve um CPF válido no cadastro antes de enviar o convite de complementação.';end if;
 phone:=regexp_replace(coalesce(m.telefone,''),'[^0-9]','','g');
 if length(phone) in (10,11) then phone:='55'||phone;end if;
 if phone !~ '^55[1-9][0-9][2-9][0-9]{7,8}$' or phone is distinct from p_phone then raise exception 'Confira e salve o WhatsApp do motorista no cadastro antes de enviar.';end if;
 insert into public.access_invites(app,created_by,recipient_phone,recipient_name,driver_id,driver_cpf)
 values('frete',p_actor,phone,m.nome,m.id,cpf) returning * into i;
 insert into public.access_audit(app,event,user_id) values('frete','CONVITE_COMPLEMENTACAO_CRIADO_'||m.id::text,p_actor);
 return jsonb_build_object('id',i.id,'token',i.token,'recipient_phone',phone,'recipient_name',m.nome,'driver_id',m.id);
end;$$;

create or replace function public.access_invite_claim(p_user uuid,p_token uuid,p_app text)
returns void language plpgsql security invoker set search_path='' as $$
declare i public.access_invites;r public.access_requests;m public.motoristas;d public.registration_dossiers;
 p public.usuarios_app;source jsonb;seed jsonb:='{}';k text;v jsonb;parts jsonb:='{}';
begin
 select * into strict i from public.access_invites where token=p_token for update;
 select * into strict r from public.access_requests where user_id=p_user and app=p_app order by created_at desc limit 1 for update;
 if i.app<>p_app or i.expires_at<now() or i.recipient_phone<>regexp_replace(r.whatsapp,'[^0-9]','','g') then raise exception 'Convite expirado ou destinado a outro aplicativo/WhatsApp.';end if;
 if i.claimed_by=p_user and r.access_invite_id=i.id then return;end if;
 if i.claimed_by is not null or r.access_invite_id is not null then raise exception 'Convite já utilizado ou cadastro já vinculado.';end if;
 if i.driver_id is not null then
  if p_app<>'frete' or not private.access_is_admin(i.created_by) then raise exception 'Convite de complementação indisponível. Consulte a administração.';end if;
  select * into strict m from public.motoristas where id=i.driver_id for update;
  select * into strict p from public.usuarios_app where user_id=p_user for update;
  select * into strict d from public.registration_dossiers where user_id=p_user for update;
  if m.auth_user_id is not null or m.status_cadastro not in ('legado','pre_cadastro','pendencia','reprovado')
   or r.status<>'PENDENTE' or p.ativo is distinct from false or p.status_aprovacao is distinct from 'PENDENTE'
   or p.trocar_senha is distinct from false or d.kind<>'MOTORISTA' or d.status<>'DRAFT'
   or d.completion_driver_id is not null then raise exception 'Cadastro não está aberto para receber os dados anteriores.';end if;
  if i.driver_cpf is distinct from regexp_replace(coalesce(m.cpf,''),'[^0-9]','','g')
   or i.driver_cpf is distinct from regexp_replace(coalesce(r.cpf,''),'[^0-9]','','g')
   or i.driver_cpf is distinct from regexp_replace(coalesce(p.cpf,''),'[^0-9]','','g') then raise exception 'O convite pertence a outro CPF. Consulte a administração.';end if;
  source:=coalesce(m.dados_legados->'completion_draft','{}');
  if jsonb_typeof(source)<>'object' then source:='{}';end if;
  source:=source||jsonb_strip_nulls(jsonb_build_object('cnh_number',nullif(m.cnh_registro,''),'cnh_category',nullif(m.categoria_cnh,''),'cnh_validity',m.validade_cnh,'logradouro',nullif(m.endereco,''),'numero',nullif(m.numero,''),'bairro',nullif(m.bairro,''),'cep',nullif(m.cep,'')));
  -- Whitelist scalar fields. Never copy files, declarations, roles or approvals.
  foreach k in array array['cep','logradouro','numero','complemento','bairro','cidade','uf','city','cnh_number','cnh_category','cnh_validity','vehicle_type','plate','brand','model','year','capacity','owner_name','owner_document','owner_whatsapp','payment_method','beneficiary_name','beneficiary_document','bank','pix_type','pix_key'] loop
   v:=source->k;
   if jsonb_typeof(v) in ('string','number') and btrim(source->>k)<>'' and (d.data->k is null or d.data->k='null'::jsonb or d.data->>k='') then seed:=seed||jsonb_build_object(k,v);end if;
  end loop;
  foreach k in array array['carreta_1','dolly','carreta_2'] loop
   v:=source->'plates'->k;
   if jsonb_typeof(v)='string' and btrim(v#>>'{}')<>'' then parts:=parts||jsonb_build_object(k,v);end if;
  end loop;
  if parts<>'{}' then
   for k,v in select key,value from jsonb_each(case when jsonb_typeof(d.data->'plates')='object' then d.data->'plates' else '{}'::jsonb end) loop
    if k in ('carreta_1','dolly','carreta_2') and jsonb_typeof(v)='string' and btrim(v#>>'{}')<>'' then parts:=parts||jsonb_build_object(k,v);end if;
   end loop;
   seed:=seed||jsonb_build_object('plates',parts);
  end if;
  update public.registration_dossiers set data=data||seed,completion_driver_id=m.id,
   completion_warnings=case when jsonb_typeof(m.dados_legados->'pendenciasCadastro')='array' then m.dados_legados->'pendenciasCadastro' else '[]'::jsonb end,
   revision=revision+1,updated_at=now() where user_id=p_user;
  insert into public.access_audit(app,event,user_id) values('frete','RASCUNHO_COMPLEMENTADO_POR_CONVITE_'||m.id::text,p_user);
 end if;
 update public.access_invites set claimed_by=p_user,claimed_at=now() where id=i.id;
 update public.access_requests set access_invite_id=i.id where id=r.id;
 insert into public.access_audit(app,event,user_id) values(p_app,'CONVITE_VINCULADO',p_user);
end;$$;
revoke all on function public.driver_completion_invite_create(uuid,uuid,text),public.access_invite_claim(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.driver_completion_invite_create(uuid,uuid,text),public.access_invite_claim(uuid,uuid,text) to service_role;
commit;
