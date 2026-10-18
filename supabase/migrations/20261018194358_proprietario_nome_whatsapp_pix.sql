begin;
-- Owner contact is independent from the payee and the Pix actually used for freight.
-- Keep historical owner documents and all existing payment relationships unchanged.
alter table public.veiculos_motorista add column if not exists proprietario_whatsapp text;
alter table public.veiculos_motorista alter column proprietario_cpf_cnpj drop not null;
comment on column public.veiculos_motorista.proprietario_whatsapp is 'WhatsApp do proprietário com DDD. Pix do frete permanece no favorecido vinculado ao veículo.';
create or replace function private.validar_whatsapp_proprietario(p_value text)
returns boolean language sql immutable set search_path='' as $$
 select regexp_replace(coalesce(p_value,''),'[^0-9]','','g') ~ '^([1-9][0-9]{9,10}|55[1-9][0-9]{9,10})$'
$$;
revoke all on function private.validar_whatsapp_proprietario(text) from public,anon;
grant execute on function private.validar_whatsapp_proprietario(text) to authenticated,service_role;
create or replace function public.driver_onboarding_submit(p_user uuid) returns jsonb language plpgsql set search_path='' as $$
declare d public.driver_onboarding;m public.motoristas;v public.veiculos_motorista;f uuid;x jsonb;k text;files jsonb;c numeric;dt jsonb;
begin
 select * into strict d from public.driver_onboarding where user_id=p_user for update;
 select * into strict m from public.motoristas where id=d.motorista_id and auth_user_id=p_user for update;
 if d.status='SUBMITTED' and m.status_cadastro='em_analise' then return jsonb_build_object('status','SUBMITTED');end if;
 if m.status_cadastro not in ('pre_cadastro','pendencia','reprovado') then raise exception 'Cadastro não está aberto para envio.';end if;
 dt:=d.data;files:=coalesce(dt->'files','{}');c:=nullif(dt->>'capacity','')::numeric;
 if coalesce(dt->>'plate','') !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' or c is null or c<=0 or c>80 then raise exception 'Confira placa e capacidade efetiva do veículo.';end if;
 if length(btrim(coalesce(dt->>'owner_name','')))<3 or not private.validar_whatsapp_proprietario(dt->>'owner_whatsapp') then raise exception 'Informe nome e WhatsApp do proprietário com DDD.';end if;
 if length(btrim(coalesce(dt->>'beneficiary_name','')))<3 or not public.validar_documento_favorecido(dt->>'beneficiary_document') then raise exception 'Confira nome e CPF/CNPJ do favorecido do pagamento do frete.';end if;
 if dt->>'pix_type' not in ('CPF','CNPJ','TELEFONE','EMAIL','ALEATORIA') or length(btrim(coalesce(dt->>'pix_key','')))<5 then raise exception 'Informe tipo e chave Pix.';end if;
 if dt->>'pix_type' in ('CPF','CNPJ') and (not public.validar_documento_favorecido(dt->>'pix_key') or regexp_replace(dt->>'pix_key','[^0-9]','','g')<>regexp_replace(dt->>'beneficiary_document','[^0-9]','','g')) then raise exception 'Chave Pix CPF/CNPJ deve corresponder ao favorecido.';end if;
 if dt->>'pix_type'='EMAIL' and dt->>'pix_key' !~ '^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'Chave Pix e-mail inválida.';end if;
 if dt->>'pix_type'='TELEFONE' and dt->>'pix_key' !~ '^\+55[1-9][0-9]{9,10}$' then raise exception 'Chave Pix telefone: use +55 e DDD.';end if;
 if dt->>'pix_type'='ALEATORIA' and dt->>'pix_key' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Chave Pix aleatória inválida.';end if;
 foreach k in array array['cnh_frente','cavalo','rntrc'] loop if nullif(files->>k,'') is null then raise exception 'Anexe CNH aberta, documento do cavalo e RNTRC/ANTT.';end if;end loop;
 foreach k in array array['carreta_1','dolly','carreta_2'] loop
  if coalesce(dt->'absent'->>k,'false')<>'true' and (nullif(files->>k,'') is null or coalesce(dt->'plates'->>k,'') !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$') then raise exception 'Anexe documento e placa dos componentes ou marque Não tenho: %',k;end if;
 end loop;
 for k,x in select key,value from jsonb_each(files) loop
  if k not in ('cnh_frente','cnh_verso','cavalo','carreta_1','dolly','carreta_2','rntrc','foto_conjunto','pix_comprovante') or split_part(x#>>'{}','/',1)<>p_user::text or not exists(select 1 from storage.objects where bucket_id='motorista-documentos' and name=x#>>'{}') then raise exception 'Anexo inválido ou não pertence ao motorista.';end if;
 end loop;
 if exists(select 1 from public.veiculos_motorista where upper(regexp_replace(placa,'[^A-Za-z0-9]','','g'))=dt->>'plate' and ativo and id is distinct from d.vehicle_id) then raise exception 'Placa já cadastrada. Solicite à administração o vínculo ao veículo existente.';end if;
 select id into f from public.favorecidos_frete where regexp_replace(cpf_cnpj,'[^0-9]','','g')=regexp_replace(dt->>'beneficiary_document','[^0-9]','','g') and ativo order by created_at limit 1;
 if d.beneficiary_id is not null and f is distinct from d.beneficiary_id then raise exception 'Favorecido mudou. Solicite à administração revisão do vínculo.';end if;
 if f is null then
  insert into public.favorecidos_frete(nome,cpf_cnpj,banco,criado_por) values(dt->>'beneficiary_name',dt->>'beneficiary_document',nullif(dt->>'bank',''),p_user) returning id into f;
  insert into public.chaves_pix_frete(favorecido_id,tipo,chave,principal) values(f,dt->>'pix_type',btrim(dt->>'pix_key'),true);
 elsif not exists(select 1 from public.favorecidos_frete fav join public.chaves_pix_frete p on p.favorecido_id=fav.id where fav.id=f and upper(btrim(fav.nome))=upper(btrim(dt->>'beneficiary_name')) and p.ativo and p.principal and p.tipo=dt->>'pix_type' and p.chave=btrim(dt->>'pix_key')) then
  raise exception 'Favorecido já cadastrado com dados diferentes. Solicite revisão da administração; não será criada duplicata nem alterado o Pix existente.';
 end if;
 if d.vehicle_id is null then
  insert into public.veiculos_motorista(motorista_id,favorecido_id,tipo,papel,placa,capacidade_t,capacidade_efetiva_t,conjunto_principal,proprietario_nome,proprietario_cpf_cnpj,proprietario_whatsapp,cadastrado_por,componentes)
  values(m.id,f,coalesce(nullif(dt->>'vehicle_type',''),'Carreta'),'conjunto',dt->>'plate',c,c,true,dt->>'owner_name',nullif(dt->>'owner_document',''),regexp_replace(dt->>'owner_whatsapp','[^0-9]','','g'),p_user,'[]') returning * into v;
 else update public.veiculos_motorista set favorecido_id=f,tipo=coalesce(nullif(dt->>'vehicle_type',''),'Carreta'),placa=dt->>'plate',capacidade_t=c,capacidade_efetiva_t=c,proprietario_nome=dt->>'owner_name',proprietario_cpf_cnpj=coalesce(nullif(dt->>'owner_document',''),proprietario_cpf_cnpj),proprietario_whatsapp=regexp_replace(dt->>'owner_whatsapp','[^0-9]','','g') where id=d.vehicle_id returning * into v;end if;
 update public.veiculos_motorista set componentes=(select coalesce(jsonb_agg(jsonb_build_object('papel',key,'placa',value#>>'{}')),'[]') from jsonb_each(coalesce(dt->'plates','{}')) where coalesce(dt->'absent'->>key,'false')<>'true') where id=v.id;
 for k,x in select key,value from jsonb_each(files) loop
  if k in ('cnh_frente','cnh_verso') then
   if not exists(select 1 from public.documentos_motorista where motorista_id=m.id and arquivo_path=x#>>'{}') then insert into public.documentos_motorista(motorista_id,tipo,arquivo_path) values(m.id,k,x#>>'{}');end if;
  else if not exists(select 1 from public.documentos_veiculo where veiculo_id=v.id and arquivo_path=x#>>'{}') then insert into public.documentos_veiculo(veiculo_id,tipo,arquivo_path) values(v.id,k,x#>>'{}');end if;end if;
 end loop;
 update public.motoristas set cidade_uf=dt->>'city',cnh_registro=dt->>'cnh_number',categoria_cnh=dt->>'cnh_category',validade_cnh=nullif(dt->>'cnh_validity','')::date,status_cadastro='em_analise',enviado_em=now() where id=m.id;
 update public.driver_onboarding set status='SUBMITTED',submitted_at=now(),vehicle_id=v.id,beneficiary_id=f where user_id=p_user;
 insert into public.access_audit(app,event,user_id) values('frete','DOCUMENTOS_MOTORISTA_ENVIADOS',p_user);
 return jsonb_build_object('status','SUBMITTED');
end;$$;

revoke all on function public.driver_onboarding_submit(uuid) from public,anon,authenticated;
grant execute on function public.driver_onboarding_submit(uuid) to service_role;
create or replace function private.assert_driver_dossier(p_id uuid) returns void language plpgsql set search_path='' as $$
declare m public.motoristas;v public.veiculos_motorista;d public.driver_onboarding;k text;
begin
 select * into strict m from public.motoristas where id=p_id;
 select * into d from public.driver_onboarding where motorista_id=p_id;
 if m.data_nascimento is null or nullif(m.cnh_registro,'') is null or nullif(m.categoria_cnh,'') is null or m.validade_cnh is null then raise exception 'Complete nascimento e dados da CNH.';end if;
 select * into v from public.veiculos_motorista where motorista_id=p_id and ativo and conjunto_principal order by created_at desc limit 1;
 if v.id is null or coalesce(v.capacidade_efetiva_t,v.capacidade_t,0)<=0 or nullif(v.placa,'') is null or nullif(v.proprietario_nome,'') is null or not private.validar_whatsapp_proprietario(v.proprietario_whatsapp) then raise exception 'Complete veículo, nome e WhatsApp do proprietário, placa e capacidade.';end if;
 if not exists(select 1 from public.favorecidos_frete f join public.chaves_pix_frete p on p.favorecido_id=f.id where f.id=v.favorecido_id and f.ativo and p.ativo and p.principal) then raise exception 'Complete o favorecido e a chave Pix principal.';end if;
 if not exists(select 1 from public.documentos_motorista where motorista_id=p_id and tipo='cnh_frente') then raise exception 'Anexe a CNH aberta ou o documento digital completo.';end if;
 foreach k in array array['rntrc','cavalo'] loop if not exists(select 1 from public.documentos_veiculo where veiculo_id=v.id and tipo=k) then raise exception 'Anexe documento: %.',k;end if;end loop;
 foreach k in array array['carreta_1','dolly','carreta_2'] loop
  if (d.user_id is not null and coalesce(d.data->'absent'->>k,'false')<>'true' or exists(select 1 from jsonb_array_elements(v.componentes) c where c->>'papel'=k)) and not exists(select 1 from public.documentos_veiculo where veiculo_id=v.id and tipo=k) then raise exception 'Anexe documento do componente: %.',k;end if;
 end loop;
end;$$;
revoke all on function private.assert_driver_dossier(uuid) from public,anon;
grant execute on function private.assert_driver_dossier(uuid) to service_role,authenticated;

commit;
