begin;
create or replace function public.driver_onboarding_start(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.access_requests;p public.usuarios_app;m public.motoristas;d public.driver_onboarding;
begin
 if exists(select 1 from public.registration_dossiers where user_id=p_user and kind='FUNCIONARIO') then raise exception 'O tipo deste cadastro é funcionário e não pode ser alterado pelo candidato.' using errcode='42501';end if;
 select * into r from public.access_requests where user_id=p_user and app='frete' order by created_at desc limit 1 for update;
 if not found or r.status is distinct from 'PENDENTE' then raise exception 'Use um cadastro pendente deste aplicativo.' using errcode='42501';end if;
 select * into p from public.usuarios_app where user_id=p_user for update;
 if not found or p.ativo is distinct from false or p.status_aprovacao is distinct from 'PENDENTE' or p.trocar_senha is distinct from false or coalesce(p.perfil,'') not in ('OPERADOR_GERAL','MOTORISTA') then raise exception 'Este acesso não permite iniciar cadastro de motorista.' using errcode='42501';end if;
 select * into m from public.motoristas where auth_user_id=p_user for update;
 if found and m.status_cadastro not in ('pre_cadastro','pendencia','reprovado','em_analise') then raise exception 'Cadastro já aprovado ou indisponível para alteração.' using errcode='42501';end if;
 if m.id is null and exists(select 1 from public.motoristas where regexp_replace(cpf,'[^0-9]','','g')=regexp_replace(r.cpf,'[^0-9]','','g')) then
  -- A CPF claim never grants access to an imported driver's data.
  update public.usuarios_app set perfil='MOTORISTA',ativo=false where user_id=p_user;
  return jsonb_build_object('status','LEGACY_REVIEW_REQUIRED','message','Rascunho salvo. A administração deve conferir os documentos e vincular o cadastro anterior deste CPF.');
 end if;
 if m.id is null then
  insert into public.motoristas(auth_user_id,nome,cpf,telefone,email,data_nascimento,status_cadastro) values(p_user,r.nome,r.cpf,r.whatsapp,r.email,r.data_nascimento,'pre_cadastro') returning * into m;
 end if;
 insert into public.driver_onboarding(user_id,motorista_id,documents_requested) values(p_user,m.id,true)
 on conflict(user_id) do update set documents_requested=true;
 update public.usuarios_app set perfil='MOTORISTA',ativo=false where user_id=p_user;
 if p.perfil<>'MOTORISTA' then insert into public.access_audit(app,event,user_id) values('frete','CADASTRO_MOTORISTA_INICIADO_PELO_CONVIDADO',p_user);end if;
 return jsonb_build_object('status','DOCUMENTS_REQUIRED','message','Continue com os documentos. O acesso continua bloqueado até a aprovação da administração.');
end $$;
CREATE OR REPLACE FUNCTION public.registration_dossier_submit(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.registration_dossiers;p public.usuarios_app;x jsonb;files jsonb;k text;obj storage.objects;
begin
 select * into strict p from public.usuarios_app where user_id=p_user for update;
 select * into strict d from public.registration_dossiers where user_id=p_user for update;
 if p.ativo or p.status_aprovacao is distinct from 'PENDENTE' or p.trocar_senha or not exists(select 1 from public.access_requests where user_id=p_user and app='frete' and status='PENDENTE') then raise exception 'Cadastro não está aberto para envio.';end if;
 if d.status='SUBMITTED' then return jsonb_build_object('status','SUBMITTED');end if;
 if d.kind='MOTORISTA' and not exists(select 1 from public.motoristas where auth_user_id=p_user) then
  raise exception 'Dados e anexos salvos no rascunho. A administração precisa conferir a CNH e vincular o cadastro anterior deste CPF. Depois, entre com CPF e senha e envie novamente.';
 end if;
 x:=d.data;files:=coalesce(x->'files','{}');
 foreach k in array array['logradouro','numero','bairro','cidade'] loop
  if length(btrim(coalesce(x->>k,'')))<1 then raise exception 'Preencha o endereço completo: %.',k;end if;
 end loop;
 if regexp_replace(coalesce(x->>'cep',''),'[^0-9]','','g') !~ '^[0-9]{8}$' or coalesce(x->>'uf','')<>all(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']) then raise exception 'Confira CEP e UF.';end if;
 if (d.kind<>'MOTORISTA' or nullif(btrim(coalesce(p.email,'')),'') is not null) and coalesce(p.email,'') !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Informe e-mail válido.';end if;
 if coalesce(x->>'declaracao','false')<>'true' then raise exception 'Confirme a declaração.';end if;
 if jsonb_typeof(files) is distinct from 'object' then raise exception 'Anexos inválidos.';end if;
 if d.kind='FUNCIONARIO' then
  if nullif(files->>'identificacao','') is null then raise exception 'Anexe o documento de identificação do funcionário.';end if;
 else
  foreach k in array array['cnh_number','cnh_category','vehicle_type','brand','model','beneficiary_name','beneficiary_document'] loop
   if length(btrim(coalesce(x->>k,'')))<1 then raise exception 'Preencha o campo obrigatório: %.',k;end if;
  end loop;
  if (nullif(x->>'cnh_validity','')::date>=current_date) is distinct from true then raise exception 'CNH vencida ou validade não informada.';end if;
  if coalesce(x->>'cnh_category','') !~* '^(A|B|C|D|E|AB|AC|AD|AE)$' then raise exception 'Categoria da CNH inválida.';end if;
  if (nullif(x->>'year','')::integer between 1950 and extract(year from current_date)::integer+1) is distinct from true then raise exception 'Ano do veículo inválido.';end if;
  if nullif(btrim(x->>'owner_whatsapp'),'') is not null and regexp_replace(x->>'owner_whatsapp','[^0-9]','','g') !~ '^(55)?[1-9][0-9][2-9][0-9]{7,8}$' then raise exception 'Informe WhatsApp do proprietário com DDD.';end if;
  if coalesce(x->>'payment_method','') not in ('PIX','OUTRO') or x->>'payment_method'='OUTRO' and length(btrim(coalesce(x->>'bank','')))<3 then raise exception 'Informe a forma e os dados de pagamento do frete.';end if;
  foreach k in array array['cnh_frente','cavalo','rntrc','foto_frente','foto_lateral'] loop
   if nullif(files->>k,'') is null then raise exception 'Anexe o documento ou foto obrigatório: %.',k;end if;
  end loop;
 end if;
 for k in select jsonb_object_keys(files) loop
  if d.kind='FUNCIONARIO' and k<>'identificacao' or d.kind='MOTORISTA' and k not in ('cnh_frente','cnh_verso','cavalo','carreta_1','dolly','carreta_2','rntrc','foto_frente','foto_lateral','pix_comprovante') then raise exception 'Tipo de anexo não permitido.';end if;
  if split_part(files->>k,'/',1)<>p_user::text then raise exception 'Anexo pertence a outro cadastro.';end if;
  select * into obj from storage.objects where bucket_id='motorista-documentos' and name=files->>k;
  if not found or coalesce(obj.metadata->>'mimetype','') not in ('application/pdf','image/jpeg','image/png','image/webp') or coalesce((obj.metadata->>'size')::bigint,0) not between 1 and 10485760 then raise exception 'Anexo ausente, tipo inválido ou maior que 10 MB.';end if;
  if k in ('foto_frente','foto_lateral') and obj.metadata->>'mimetype'='application/pdf' then raise exception 'Envie as fotos como imagens.';end if;
 end loop;
 if d.kind='MOTORISTA' then
  perform public.driver_onboarding_save(p_user,x);
  perform public.driver_onboarding_submit(p_user);
  update public.veiculos_motorista set marca_modelo=(x->>'brand')||' '||(x->>'model'),ano_fabricacao=(x->>'year')::integer,proprietario_whatsapp=regexp_replace(x->>'owner_whatsapp','[^0-9]','','g') where id=(select vehicle_id from public.driver_onboarding where user_id=p_user);
 end if;
 update public.registration_dossiers set status='SUBMITTED',submitted_at=now(),updated_at=now(),revision=revision+1 where user_id=p_user;
 insert into public.access_audit(app,event,user_id) values('frete','CADASTRO_COMPLETO_ENVIADO',p_user);
 return jsonb_build_object('status','SUBMITTED');
end;$function$;

create or replace function public.registration_legacy_match(p_actor uuid,p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not private.access_is_admin(p_actor) then raise exception 'Somente admin ou master aprovado pode conferir o vínculo.' using errcode='42501';end if;
 select jsonb_build_object('id',m.id,'nome',m.nome,'available',m.auth_user_id is null and m.status_cadastro in ('legado','pre_cadastro','pendencia','reprovado')) into result
 from public.registration_dossiers d join public.usuarios_app p on p.user_id=d.user_id
 join public.motoristas m on regexp_replace(m.cpf,'[^0-9]','','g')=regexp_replace(p.cpf,'[^0-9]','','g')
 where d.user_id=p_user and d.kind='MOTORISTA' and p.ativo=false and p.status_aprovacao='PENDENTE'
 and not exists(select 1 from public.motoristas own where own.auth_user_id=p_user);
 return result;
end;$$;

create or replace function public.registration_link_legacy_driver(p_actor uuid,p_user uuid,p_driver uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.usuarios_app;r public.access_requests;m public.motoristas;d public.registration_dossiers;
begin
 if not private.access_is_admin(p_actor) then raise exception 'Somente admin ou master aprovado pode vincular.' using errcode='42501';end if;
 select * into strict r from public.access_requests where user_id=p_user and app='frete' and status='PENDENTE' for update;
 select * into strict p from public.usuarios_app where user_id=p_user for update;
 select * into strict d from public.registration_dossiers where user_id=p_user for update;
 if p.ativo is distinct from false or p.status_aprovacao is distinct from 'PENDENTE' or p.trocar_senha is distinct from false or p.perfil<>'MOTORISTA' or d.kind<>'MOTORISTA' or d.status<>'DRAFT' then raise exception 'O vínculo exige cadastro de motorista pendente e bloqueado.';end if;
 if nullif(d.data->'files'->>'cnh_frente','') is null or not exists(select 1 from storage.objects where bucket_id='motorista-documentos' and name=d.data->'files'->>'cnh_frente' and split_part(name,'/',1)=p_user::text) then raise exception 'O motorista deve salvar a CNH no rascunho para a conferência do vínculo.';end if;
 select * into strict m from public.motoristas where id=p_driver for update;
 if regexp_replace(coalesce(m.cpf,''),'[^0-9]','','g')<>regexp_replace(r.cpf,'[^0-9]','','g') or nullif(regexp_replace(r.cpf,'[^0-9]','','g'),'') is null then raise exception 'O CPF do cadastro anterior deve ser o mesmo do novo cadastro.';end if;
 if m.auth_user_id is not null or coalesce(m.status_cadastro,'') not in ('legado','pre_cadastro','pendencia','reprovado') or exists(select 1 from public.motoristas where auth_user_id=p_user) or exists(select 1 from public.driver_onboarding where motorista_id=m.id or user_id=p_user) then raise exception 'Cadastro já vinculado ou aprovado. Confira com a administração.';end if;
 update public.motoristas set auth_user_id=p_user,nome=r.nome,telefone=r.whatsapp,email=r.email,data_nascimento=r.data_nascimento,status_cadastro='pre_cadastro' where id=m.id;
 perform public.driver_onboarding_start(p_user);
 insert into public.access_audit(app,event,user_id) values('frete','CADASTRO_LEGADO_VINCULADO_POR_ADMIN',p_user);
 insert into public.access_audit(app,event,user_id) values('frete','VINCULO_LEGADO_CONFIRMADO_'||p_user::text,p_actor);
 return jsonb_build_object('message','Cadastro anterior vinculado sem aprovação de acesso. O motorista pode entrar com CPF e senha e enviar o cadastro e anexos salvos.');
end;$$;
revoke all on function public.registration_legacy_match(uuid,uuid),public.registration_link_legacy_driver(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.registration_legacy_match(uuid,uuid),public.registration_link_legacy_driver(uuid,uuid,uuid) to service_role;

commit;
