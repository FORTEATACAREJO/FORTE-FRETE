begin;
-- Owner details are optional. Do not infer ownership from missing information.
alter table public.veiculos_motorista alter column proprietario_nome drop not null;
alter table public.veiculos_motorista alter column proprietario_cpf_cnpj drop not null;
CREATE OR REPLACE FUNCTION public.driver_onboarding_submit(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.driver_onboarding;m public.motoristas;v public.veiculos_motorista;f uuid;x jsonb;k text;files jsonb;c numeric;dt jsonb;
begin
 select * into strict d from public.driver_onboarding where user_id=p_user for update;
 select * into strict m from public.motoristas where id=d.motorista_id and auth_user_id=p_user for update;
 if d.status='SUBMITTED' and m.status_cadastro='em_analise' then return jsonb_build_object('status','SUBMITTED');end if;
 if m.status_cadastro not in ('pre_cadastro','pendencia','reprovado') then raise exception 'Cadastro não está aberto para envio.';end if;
 dt:=d.data;files:=coalesce(dt->'files','{}');c:=nullif(dt->>'capacity','')::numeric;
 if coalesce(dt->>'plate','') !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' or c is null or c<=0 or c>80 then raise exception 'Confira placa e capacidade efetiva do veículo.';end if;
 if length(btrim(coalesce(dt->>'beneficiary_name','')))<3 or not public.validar_documento_favorecido(dt->>'beneficiary_document') then raise exception 'Confira nome e CPF/CNPJ do favorecido do frete.';end if;
 if coalesce(dt->>'payment_method','PIX')='PIX' then
 if dt->>'pix_type' not in ('CPF','CNPJ','TELEFONE','EMAIL','ALEATORIA') or length(btrim(coalesce(dt->>'pix_key','')))<5 then raise exception 'Informe tipo e chave Pix.';end if;
 if dt->>'pix_type' in ('CPF','CNPJ') and (not public.validar_documento_favorecido(dt->>'pix_key') or regexp_replace(dt->>'pix_key','[^0-9]','','g')<>regexp_replace(dt->>'beneficiary_document','[^0-9]','','g')) then raise exception 'Chave Pix CPF/CNPJ deve corresponder ao favorecido.';end if;
 if dt->>'pix_type'='EMAIL' and dt->>'pix_key' !~ '^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'Chave Pix e-mail inválida.';end if;
 if dt->>'pix_type'='TELEFONE' and dt->>'pix_key' !~ '^\+55[1-9][0-9]{9,10}$' then raise exception 'Chave Pix telefone: use +55 e DDD.';end if;
 if dt->>'pix_type'='ALEATORIA' and dt->>'pix_key' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Chave Pix aleatória inválida.';end if;
 end if;
 foreach k in array array['cnh_frente','cavalo','rntrc'] loop if nullif(files->>k,'') is null then raise exception 'Anexe CNH aberta, documento do cavalo e RNTRC/ANTT.';end if;end loop;
 foreach k in array array['carreta_1','dolly','carreta_2'] loop
  if coalesce(dt->'absent'->>k,'false')<>'true' and (nullif(files->>k,'') is null or coalesce(dt->'plates'->>k,'') !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$') then raise exception 'Anexe documento e placa dos componentes ou marque Não tenho: %',k;end if;
 end loop;
 for k,x in select key,value from jsonb_each(files) loop
  if k not in ('cnh_frente','cnh_verso','cavalo','carreta_1','dolly','carreta_2','rntrc','foto_conjunto','foto_frente','foto_lateral','pix_comprovante') or split_part(x#>>'{}','/',1)<>p_user::text or not exists(select 1 from storage.objects where bucket_id='motorista-documentos' and name=x#>>'{}') then raise exception 'Anexo inválido ou não pertence ao motorista.';end if;
 end loop;
 if exists(select 1 from public.veiculos_motorista where upper(regexp_replace(placa,'[^A-Za-z0-9]','','g'))=dt->>'plate' and ativo and id is distinct from d.vehicle_id) then raise exception 'Placa já cadastrada. Solicite à administração o vínculo ao veículo existente.';end if;
 select id into f from public.favorecidos_frete where regexp_replace(cpf_cnpj,'[^0-9]','','g')=regexp_replace(dt->>'beneficiary_document','[^0-9]','','g') and ativo order by created_at limit 1;
 if d.beneficiary_id is not null and f is distinct from d.beneficiary_id then raise exception 'Favorecido mudou. Solicite à administração revisão do vínculo.';end if;
 if f is null then
  insert into public.favorecidos_frete(nome,cpf_cnpj,banco,criado_por) values(dt->>'beneficiary_name',dt->>'beneficiary_document',nullif(dt->>'bank',''),p_user) returning id into f;
  if coalesce(dt->>'payment_method','PIX')='PIX' then
  insert into public.chaves_pix_frete(favorecido_id,tipo,chave,principal) values(f,dt->>'pix_type',btrim(dt->>'pix_key'),true);
  end if;
 elsif (coalesce(dt->>'payment_method','PIX')='PIX' and not exists(select 1 from public.favorecidos_frete fav join public.chaves_pix_frete p on p.favorecido_id=fav.id where fav.id=f and upper(btrim(fav.nome))=upper(btrim(dt->>'beneficiary_name')) and p.ativo and p.principal and p.tipo=dt->>'pix_type' and p.chave=btrim(dt->>'pix_key'))) or (dt->>'payment_method'='OUTRO' and not exists(select 1 from public.favorecidos_frete fav where fav.id=f and upper(btrim(fav.nome))=upper(btrim(dt->>'beneficiary_name')) and fav.banco=dt->>'bank')) then
  raise exception 'Favorecido já cadastrado com dados diferentes. Solicite revisão da administração; não será criada duplicata nem alterado o Pix existente.';
 end if;
 if d.vehicle_id is null then
  insert into public.veiculos_motorista(motorista_id,favorecido_id,tipo,papel,placa,capacidade_t,capacidade_efetiva_t,conjunto_principal,proprietario_nome,proprietario_cpf_cnpj,cadastrado_por,componentes)
  values(m.id,f,coalesce(nullif(dt->>'vehicle_type',''),'Carreta'),'conjunto',dt->>'plate',c,c,true,dt->>'owner_name',dt->>'owner_document',p_user,'[]') returning * into v;
 else update public.veiculos_motorista set favorecido_id=f,tipo=coalesce(nullif(dt->>'vehicle_type',''),'Carreta'),placa=dt->>'plate',capacidade_t=c,capacidade_efetiva_t=c,proprietario_nome=coalesce(nullif(dt->>'owner_name',''),proprietario_nome),proprietario_cpf_cnpj=coalesce(nullif(dt->>'owner_document',''),proprietario_cpf_cnpj) where id=d.vehicle_id returning * into v;end if;
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
end;$function$;

CREATE OR REPLACE FUNCTION private.assert_driver_dossier(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare m public.motoristas;v public.veiculos_motorista;d public.driver_onboarding;k text;
begin
 select * into strict m from public.motoristas where id=p_id;
 select * into d from public.driver_onboarding where motorista_id=p_id;
 if m.data_nascimento is null or nullif(m.cnh_registro,'') is null or nullif(m.categoria_cnh,'') is null or m.validade_cnh is null then raise exception 'Complete nascimento e dados da CNH.';end if;
 select * into v from public.veiculos_motorista where motorista_id=p_id and ativo and conjunto_principal order by created_at desc limit 1;
 if v.id is null or coalesce(v.capacidade_efetiva_t,v.capacidade_t,0)<=0 or nullif(v.placa,'') is null then raise exception 'Complete veículo, placa e capacidade.';end if;
 if coalesce(d.data->>'payment_method','PIX')='PIX' and not exists(select 1 from public.favorecidos_frete f join public.chaves_pix_frete p on p.favorecido_id=f.id where f.id=v.favorecido_id and f.ativo and p.ativo and p.principal) then raise exception 'Complete o favorecido e a chave Pix principal.';end if;
 if d.data->>'payment_method'='OUTRO' and not exists(select 1 from public.favorecidos_frete where id=v.favorecido_id and ativo and length(btrim(coalesce(banco,'')))>=3) then raise exception 'Complete os dados bancários do favorecido.';end if;
 if not exists(select 1 from public.documentos_motorista where motorista_id=p_id and tipo='cnh_frente') then raise exception 'Anexe a CNH aberta ou o documento digital completo.';end if;
 foreach k in array array['rntrc','cavalo'] loop if not exists(select 1 from public.documentos_veiculo where veiculo_id=v.id and tipo=k) then raise exception 'Anexe documento: %.',k;end if;end loop;
 foreach k in array array['carreta_1','dolly','carreta_2'] loop
  if (d.user_id is not null and coalesce(d.data->'absent'->>k,'false')<>'true' or exists(select 1 from jsonb_array_elements(v.componentes) c where c->>'papel'=k)) and not exists(select 1 from public.documentos_veiculo where veiculo_id=v.id and tipo=k) then raise exception 'Anexe documento do componente: %.',k;end if;
 end loop;
end;$function$;

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
commit;

