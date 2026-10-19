begin;
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
  foreach k in array array['cnh_number','cnh_category','vehicle_type','brand','model','owner_name','owner_document','owner_whatsapp','beneficiary_name','beneficiary_document'] loop
   if length(btrim(coalesce(x->>k,'')))<1 then raise exception 'Preencha o campo obrigatório: %.',k;end if;
  end loop;
  if (nullif(x->>'cnh_validity','')::date>=current_date) is distinct from true then raise exception 'CNH vencida ou validade não informada.';end if;
  if coalesce(x->>'cnh_category','') !~* '^(A|B|C|D|E|AB|AC|AD|AE)$' then raise exception 'Categoria da CNH inválida.';end if;
  if (nullif(x->>'year','')::integer between 1950 and extract(year from current_date)::integer+1) is distinct from true then raise exception 'Ano do veículo inválido.';end if;
  if regexp_replace(x->>'owner_whatsapp','[^0-9]','','g') !~ '^(55)?[1-9][0-9][2-9][0-9]{7,8}$' then raise exception 'Informe WhatsApp do proprietário com DDD.';end if;
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

