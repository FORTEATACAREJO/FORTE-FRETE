create table public.driver_onboarding (
 user_id uuid primary key references auth.users(id), motorista_id uuid not null references public.motoristas(id),
 invite_id uuid references public.convites_motorista(id), data jsonb not null default '{}',
 status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED')),
 updated_at timestamptz not null default now(), submitted_at timestamptz, vehicle_id uuid references public.veiculos_motorista(id), beneficiary_id uuid references public.favorecidos_frete(id)
);
alter table public.driver_onboarding enable row level security;
revoke all on public.driver_onboarding from anon,authenticated;
grant select on public.driver_onboarding to authenticated;
create policy driver_onboarding_read on public.driver_onboarding for select to authenticated using(user_id=(select auth.uid()) or private.is_admin());
alter table public.convites_motorista add column expires_at timestamptz, add column target_phone text, add column recipient_name text, add column meta_message_id text, add column send_status text not null default 'LINK_CREATED', add column send_error text, add column send_started_at timestamptz;
create or replace function public.driver_onboarding_submit(p_user uuid) returns jsonb language plpgsql set search_path='' as $$
declare d public.driver_onboarding;m public.motoristas;v public.veiculos_motorista;f uuid;x jsonb;k text;files jsonb;c numeric;dt jsonb;
begin
 select * into strict d from public.driver_onboarding where user_id=p_user for update;
 select * into strict m from public.motoristas where id=d.motorista_id and auth_user_id=p_user for update;
 if d.status='SUBMITTED' and m.status_cadastro='em_analise' then return jsonb_build_object('status','SUBMITTED');end if;
 if m.status_cadastro not in ('pre_cadastro','pendencia','reprovado') then raise exception 'Cadastro não está aberto para envio.';end if;
 dt:=d.data;files:=coalesce(dt->'files','{}');c:=nullif(dt->>'capacity','')::numeric;
 if coalesce(dt->>'plate','') !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' or c is null or c<=0 or c>80 then raise exception 'Confira placa e capacidade efetiva do veículo.';end if;
 if length(btrim(coalesce(dt->>'beneficiary_name','')))<3 or not public.validar_documento_favorecido(dt->>'beneficiary_document') or not public.validar_documento_favorecido(dt->>'owner_document') or length(btrim(coalesce(dt->>'owner_name','')))<3 then raise exception 'Confira nomes e CPF/CNPJ do proprietário e favorecido.';end if;
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
 if d.beneficiary_id is null and exists(select 1 from public.favorecidos_frete where regexp_replace(cpf_cnpj,'[^0-9]','','g')=regexp_replace(dt->>'beneficiary_document','[^0-9]','','g')) then raise exception 'Favorecido já cadastrado. Solicite à administração o vínculo, sem criar duplicata.';end if;
 if d.beneficiary_id is null then
  insert into public.favorecidos_frete(nome,cpf_cnpj,banco,criado_por) values(dt->>'beneficiary_name',dt->>'beneficiary_document',nullif(dt->>'bank',''),p_user) returning id into f;
 else f:=d.beneficiary_id;update public.favorecidos_frete set nome=dt->>'beneficiary_name',cpf_cnpj=dt->>'beneficiary_document',banco=nullif(dt->>'bank','') where id=f;end if;
 update public.chaves_pix_frete set principal=false where favorecido_id=f;
 insert into public.chaves_pix_frete(favorecido_id,tipo,chave,principal) values(f,dt->>'pix_type',btrim(dt->>'pix_key'),true) on conflict(favorecido_id,chave) do update set tipo=excluded.tipo,principal=true,ativo=true;
 if d.vehicle_id is null then
  insert into public.veiculos_motorista(motorista_id,favorecido_id,tipo,papel,placa,capacidade_t,capacidade_efetiva_t,conjunto_principal,proprietario_nome,proprietario_cpf_cnpj,cadastrado_por,componentes)
  values(m.id,f,coalesce(nullif(dt->>'vehicle_type',''),'Carreta'),'conjunto',dt->>'plate',c,c,true,dt->>'owner_name',dt->>'owner_document',p_user,'[]') returning * into v;
 else update public.veiculos_motorista set favorecido_id=f,tipo=coalesce(nullif(dt->>'vehicle_type',''),'Carreta'),placa=dt->>'plate',capacidade_t=c,capacidade_efetiva_t=c,proprietario_nome=dt->>'owner_name',proprietario_cpf_cnpj=dt->>'owner_document' where id=d.vehicle_id returning * into v;end if;
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
create or replace function private.driver_documents_before_approval() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status_cadastro='aprovado' and old.status_cadastro is distinct from 'aprovado' and old.status_cadastro='pre_cadastro' and not exists(select 1 from public.driver_onboarding where motorista_id=new.id and status='SUBMITTED') then raise exception 'Motorista deve concluir e enviar os documentos antes da aprovação.';end if;return new;
end;$$;
create trigger driver_documents_before_approval before update on public.motoristas for each row execute function private.driver_documents_before_approval();

create or replace function public.driver_onboarding_claim(p_user uuid,p_code uuid) returns void language plpgsql set search_path='' as $$
declare i public.convites_motorista;m public.motoristas;d public.driver_onboarding;
begin
 select * into strict i from public.convites_motorista where codigo=p_code for update;
 select * into strict m from public.motoristas where auth_user_id=p_user;
 select * into strict d from public.driver_onboarding where user_id=p_user for update;
 if not i.ativo or i.expires_at<now() or i.target_phone is not null and i.target_phone<>m.telefone then raise exception 'Convite expirado, cancelado ou destinado a outro WhatsApp.';end if;
 if d.invite_id=i.id then return;end if;
 if d.invite_id is not null or not i.uso_ilimitado and exists(select 1 from public.driver_onboarding where invite_id=i.id) then raise exception 'Convite já utilizado.';end if;
 update public.driver_onboarding set invite_id=i.id where user_id=p_user;
 update public.convites_motorista set total_cadastros=total_cadastros+1 where id=i.id;
end;$$;
revoke all on function public.driver_onboarding_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.driver_onboarding_claim(uuid,uuid) to service_role;
