begin;
alter table public.veiculos_motorista add column analisado_por uuid references auth.users(id),add column analisado_em timestamptz,add column motivo_analise text;
create table public.vehicle_registration_drafts(
 id uuid primary key,user_id uuid not null references auth.users(id),veiculo_id uuid references public.veiculos_motorista(id) on delete restrict,
 data jsonb not null default '{}',status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED')),revision integer not null default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),submitted_at timestamptz
);
create index vehicle_drafts_user_idx on public.vehicle_registration_drafts(user_id);
create unique index vehicle_drafts_vehicle_idx on public.vehicle_registration_drafts(veiculo_id) where veiculo_id is not null;
create table public.vehicle_link_requests(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),veiculo_id uuid not null references public.veiculos_motorista(id),
 status text not null default 'PENDENTE' check(status in ('PENDENTE','CONCLUIDA','RECUSADA')),created_at timestamptz not null default now(),reviewed_at timestamptz
);
create unique index vehicle_link_request_pending on public.vehicle_link_requests(user_id,veiculo_id) where status='PENDENTE';
alter table public.vehicle_link_requests enable row level security;
revoke all on public.vehicle_link_requests from public,anon,authenticated;
grant all on public.vehicle_link_requests to service_role;
create table public.motorista_veiculo_vinculos(
 id uuid primary key default gen_random_uuid(),motorista_id uuid not null references public.motoristas(id) on delete restrict,
 veiculo_id uuid not null references public.veiculos_motorista(id) on delete restrict,
 iniciado_em timestamptz not null default now(),encerrado_em timestamptz,criado_por uuid references auth.users(id),encerrado_por uuid references auth.users(id),motivo text,
 origem text not null default 'ACAO_EXPLICITA'
);
create unique index vinculo_veiculo_ativo_idx on public.motorista_veiculo_vinculos(veiculo_id) where encerrado_em is null;
create index vinculo_motorista_idx on public.motorista_veiculo_vinculos(motorista_id);
-- Stop for human reconciliation if historical plates conflict; never merge vehicles.
create unique index vehicle_plate_normalized_unique on public.veiculos_motorista(upper(regexp_replace(placa,'[^A-Za-z0-9]','','g'))) where nullif(placa,'') is not null;
-- Copy current associations as associations, never as approval events.
insert into public.motorista_veiculo_vinculos(motorista_id,veiculo_id,iniciado_em,origem)
select motorista_id,id,coalesce(created_at,now()),'MIGRACAO_VINCULO_EXISTENTE' from public.veiculos_motorista where motorista_id is not null;
alter table public.vehicle_registration_drafts enable row level security;
alter table public.motorista_veiculo_vinculos enable row level security;
revoke all on public.vehicle_registration_drafts,public.motorista_veiculo_vinculos from anon,authenticated;
grant all on public.vehicle_registration_drafts,public.motorista_veiculo_vinculos to service_role;

create function private.registration_files(p_user uuid,p_files jsonb,p_allowed text[],p_required text[]) returns void language plpgsql security invoker set search_path='' as $$
declare k text;path text;o storage.objects;
begin
 if jsonb_typeof(p_files) is distinct from 'object' then raise exception 'Anexos inválidos.';end if;
 foreach k in array p_required loop if nullif(p_files->>k,'') is null then raise exception 'Anexe o documento ou foto: %.',k;end if;end loop;
 for k,path in select key,value#>>'{}' from jsonb_each(p_files) loop
  if not(k=any(p_allowed)) or split_part(path,'/',1)<>p_user::text then raise exception 'Anexo não permitido ou pertence a outro cadastro.';end if;
  select * into o from storage.objects where bucket_id='motorista-documentos' and name=path;
  if not found or coalesce(o.metadata->>'mimetype','') not in ('application/pdf','image/jpeg','image/png','image/webp') or coalesce((o.metadata->>'size')::bigint,0) not between 1 and 10485760 then raise exception 'Anexo ausente, tipo inválido ou maior que 10 MB.';end if;
  if k like 'foto_%' and o.metadata->>'mimetype'='application/pdf' then raise exception 'Envie fotos em formato de imagem.';end if;
 end loop;
end;$$;
revoke all on function private.registration_files(uuid,jsonb,text[],text[]) from public,anon,authenticated;
grant execute on function private.registration_files(uuid,jsonb,text[],text[]) to service_role;

create or replace function private.assert_driver_dossier(p_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare m public.motoristas;
begin
 select * into strict m from public.motoristas where id=p_id;
 if m.data_nascimento is null or coalesce(m.cnh_registro,'') !~ '^[0-9]{11}$' or coalesce(m.categoria_cnh,'') !~ '^(A|B|C|D|E|AB|AC|AD|AE)$' or m.validade_cnh is null or m.validade_cnh<current_date then raise exception 'Complete nascimento e CNH válida do motorista.';end if;
 if not exists(select 1 from public.documentos_motorista d join storage.objects o on o.bucket_id='motorista-documentos' and o.name=d.arquivo_path where d.motorista_id=p_id and d.tipo='cnh_frente' and coalesce((o.metadata->>'size')::bigint,0) between 1 and 10485760 and o.metadata->>'mimetype' in ('application/pdf','image/jpeg','image/png','image/webp')) then raise exception 'Anexe a CNH do motorista.';end if;
end;$$;

-- Resume older pending accounts in the personal form; preserve their original draft JSON.
insert into public.registration_dossiers(user_id,kind,status,data)
select o.user_id,'MOTORISTA',case when o.status='SUBMITTED' then 'SUBMITTED' else 'DRAFT' end,
 coalesce(o.data,'{}')||jsonb_strip_nulls(jsonb_build_object('cep',m.cep,'logradouro',m.endereco,'numero',m.numero,'bairro',m.bairro,'complemento',m.complemento))
from public.driver_onboarding o join public.usuarios_app p on p.user_id=o.user_id join public.motoristas m on m.id=o.motorista_id
where not p.ativo and p.status_aprovacao='PENDENTE' and not p.trocar_senha
on conflict(user_id) do nothing;

create or replace function public.registration_dossier_submit(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.registration_dossiers;p public.usuarios_app;m public.motoristas;x jsonb;files jsonb;k text;path text;
begin
 select * into strict p from public.usuarios_app where user_id=p_user for update;
 select * into strict d from public.registration_dossiers where user_id=p_user for update;
 if p.ativo or p.status_aprovacao is distinct from 'PENDENTE' or p.trocar_senha or not exists(select 1 from public.access_requests where user_id=p_user and app='frete' and status='PENDENTE') then raise exception 'Cadastro não está aberto para envio.';end if;
 if d.status='SUBMITTED' then return jsonb_build_object('status','SUBMITTED');end if;
 if public.forte_legal_status(p_user,'frete')->>'accepted' is distinct from 'true' then raise exception 'Aceite o termo vigente antes de concluir.';end if;
 x:=d.data;files:=coalesce(x->'files','{}');
 foreach k in array array['logradouro','numero','bairro','cidade'] loop if length(btrim(coalesce(x->>k,'')))<1 then raise exception 'Preencha o endereço completo: %.',k;end if;end loop;
 if coalesce(x->>'cep','') !~ '^[0-9]{8}$' or coalesce(x->>'uf','')<>all(array['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']) then raise exception 'Confira CEP e UF.';end if;
 if coalesce(x->>'declaracao','false')<>'true' then raise exception 'Confirme a declaração.';end if;
 if d.kind='FUNCIONARIO' then
  if coalesce(p.email,'') !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Informe e-mail válido.';end if;
  perform private.registration_files(p_user,files,array['identificacao'],array['identificacao']);
 else
  select * into m from public.motoristas where auth_user_id=p_user for update;
  if m.id is null then raise exception 'Rascunho salvo. A administração deve conferir a CNH e vincular o cadastro anterior deste CPF.';end if;
  if coalesce(x->>'cnh_number','') !~ '^[0-9]{11}$' or coalesce(x->>'cnh_category','') !~ '^(A|B|C|D|E|AB|AC|AD|AE)$' or (nullif(x->>'cnh_validity','')::date>=current_date) is distinct from true then raise exception 'Confira registro, categoria e validade da CNH.';end if;
  perform private.registration_files(p_user,files,array['cnh_frente','cnh_verso','cavalo','carreta_1','dolly','carreta_2','rntrc','foto_frente','foto_lateral','pix_comprovante'],array['cnh_frente']);
  for k,path in select key,value#>>'{}' from jsonb_each(files) where key in ('cnh_frente','cnh_verso') loop
   if not exists(select 1 from public.documentos_motorista where motorista_id=m.id and arquivo_path=path) then insert into public.documentos_motorista(motorista_id,tipo,arquivo_path) values(m.id,k,path);end if;
  end loop;
  update public.motoristas set cnh_registro=x->>'cnh_number',categoria_cnh=x->>'cnh_category',validade_cnh=(x->>'cnh_validity')::date,
   cep=x->>'cep',endereco=x->>'logradouro',numero=x->>'numero',bairro=x->>'bairro',complemento=x->>'complemento',cidade_uf=(x->>'cidade')||'/'||(x->>'uf'),status_cadastro='em_analise',enviado_em=now() where id=m.id;
  insert into public.driver_onboarding(user_id,motorista_id,documents_requested,data,status,submitted_at) values(p_user,m.id,true,x,'SUBMITTED',now())
   on conflict(user_id) do update set data=excluded.data,status='SUBMITTED',submitted_at=now();
 end if;
 update public.registration_dossiers set status='SUBMITTED',submitted_at=now(),updated_at=now(),revision=revision+1 where user_id=p_user;
 insert into public.access_audit(app,event,user_id) values('frete','CADASTRO_PESSOAL_ENVIADO_SEM_VINCULO',p_user);
 return jsonb_build_object('status','SUBMITTED','message','Cadastro pessoal enviado. Veículo e vínculo são analisados separadamente.');
end;$$;

create function public.vehicle_registration_save(p_user uuid,p_id uuid,p_revision integer,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.vehicle_registration_drafts;
begin
 if not exists(select 1 from public.usuarios_app p where p.user_id=p_user and not p.trocar_senha and p.status_aprovacao in ('PENDENTE','APROVADO') and (exists(select 1 from public.registration_dossiers r where r.user_id=p_user and r.kind='MOTORISTA') or exists(select 1 from public.motoristas m where m.auth_user_id=p_user))) then raise exception 'Cadastro de motorista indisponível.';end if;
 if p_id is null or p_revision is null or p_revision<0 or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>30000 then raise exception 'Rascunho inválido.';end if;
 if p_revision<>0 and not exists(select 1 from public.vehicle_registration_drafts where id=p_id and user_id=p_user) then raise exception 'Revisão inicial inválida.' using errcode='40001';end if;
 insert into public.vehicle_registration_drafts(id,user_id,data) values(p_id,p_user,p_data)
 on conflict(id) do update set data=excluded.data,revision=vehicle_registration_drafts.revision+1,updated_at=now()
 where vehicle_registration_drafts.user_id=p_user and vehicle_registration_drafts.status='DRAFT' and vehicle_registration_drafts.revision=p_revision
 returning * into d;
 if d.id is null then raise exception 'Cadastro alterado em outra tela, enviado ou pertence a outro usuário.' using errcode='40001';end if;
 return jsonb_build_object('id',d.id,'revision',d.revision,'status',d.status);
end;$$;
create function public.vehicle_registration_submit(p_user uuid,p_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.vehicle_registration_drafts;x jsonb;v public.veiculos_motorista;plate text;c numeric;k text;path text;required text[]:=array['cavalo','rntrc','foto_frente','foto_lateral'];
begin
 select * into strict d from public.vehicle_registration_drafts where id=p_id and user_id=p_user for update;
 if d.status='SUBMITTED' then return jsonb_build_object('id',d.veiculo_id,'status','SUBMITTED');end if;
 if public.forte_legal_status(p_user,'frete')->>'accepted' is distinct from 'true' then raise exception 'Aceite o termo vigente antes de concluir.';end if;
 if not exists(select 1 from public.usuarios_app p where p.user_id=p_user and not p.trocar_senha and p.status_aprovacao in ('PENDENTE','APROVADO') and (exists(select 1 from public.registration_dossiers r where r.user_id=p_user and r.kind='MOTORISTA') or exists(select 1 from public.motoristas m where m.auth_user_id=p_user))) then raise exception 'Cadastro de motorista indisponível.';end if;
 x:=d.data;plate:=upper(regexp_replace(x->>'plate','[^a-zA-Z0-9]','','g'));c:=(x->>'capacity')::numeric;
 if coalesce(plate,'') !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' or (c between 0.1 and 80) is distinct from true or length(btrim(coalesce(x->>'brand','')))<1 or length(btrim(coalesce(x->>'model','')))<1 or ((x->>'year')::integer between 1950 and extract(year from current_date)::integer+1) is distinct from true then raise exception 'Confira placa, marca, modelo, ano e capacidade.';end if;
 if coalesce(x->>'vehicle_type','') not in ('Caminhão','Carreta','Carreta 4º eixo','Bitrem','Rodotrem','Outro') then raise exception 'Selecione o tipo do conjunto.';end if;
 if nullif(x->>'owner_whatsapp','') is not null and regexp_replace(x->>'owner_whatsapp','[^0-9]','','g') !~ '^(55)?[1-9][0-9][2-9][0-9]{7,8}$' then raise exception 'Confira o WhatsApp do proprietário ou deixe em branco.';end if;
 if coalesce(x->>'declaracao','false')<>'true' then raise exception 'Confirme a declaração do veículo.';end if;
 foreach k in array array['carreta_1','dolly','carreta_2'] loop
  if coalesce(x->'absent'->>k,'false')<>'true' then
   if coalesce(x->'plates'->>k,'') !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then raise exception 'Confira a placa de % ou indique que não possui este componente.',k;end if;
   required:=array_append(required,k);
  end if;
 end loop;
 if exists(select 1 from (select plate p union all select value#>>'{}' from jsonb_each(coalesce(x->'plates','{}')) where key in ('carreta_1','dolly','carreta_2') and coalesce(x->'absent'->>key,'false')<>'true') a group by p having count(*)>1) then raise exception 'As placas dos componentes precisam ser distintas.';end if;
 perform private.registration_files(p_user,coalesce(x->'files','{}'),array['cavalo','rntrc','foto_frente','foto_lateral','carreta_1','dolly','carreta_2','pix_comprovante'],required);
 perform pg_advisory_xact_lock(hashtextextended('vehicle-plate:'||plate,0));
 if exists(select 1 from public.veiculos_motorista where upper(regexp_replace(placa,'[^A-Za-z0-9]','','g'))=plate and id is distinct from d.veiculo_id) then raise exception 'Esta placa já está cadastrada. Solicite o vínculo à administração; não cadastre outro veículo.';end if;
 if d.veiculo_id is null then
  insert into public.veiculos_motorista(motorista_id,tipo,papel,placa,capacidade_t,capacidade_efetiva_t,conjunto_principal,proprietario_nome,proprietario_cpf_cnpj,proprietario_whatsapp,cadastrado_por,ativo,status_aprovacao,marca_modelo,ano_fabricacao,componentes)
  values(null,x->>'vehicle_type','conjunto',plate,c,c,false,nullif(x->>'owner_name',''),nullif(x->>'owner_document',''),nullif(x->>'owner_whatsapp',''),p_user,true,'EM_ANALISE',(x->>'brand')||' '||(x->>'model'),(x->>'year')::integer,'[]') returning * into v;
 else
  select * into strict v from public.veiculos_motorista where id=d.veiculo_id for update;
  if v.motorista_id is not null or v.status_aprovacao not in ('RASCUNHO','CORRECAO_SOLICITADA') or v.cadastrado_por is distinct from p_user then raise exception 'Veículo já aprovado ou vinculado. Solicite revisão administrativa.';end if;
  update public.veiculos_motorista set tipo=x->>'vehicle_type',placa=plate,capacidade_t=c,capacidade_efetiva_t=c,proprietario_nome=nullif(x->>'owner_name',''),proprietario_cpf_cnpj=nullif(x->>'owner_document',''),proprietario_whatsapp=nullif(x->>'owner_whatsapp',''),marca_modelo=(x->>'brand')||' '||(x->>'model'),ano_fabricacao=(x->>'year')::integer,status_aprovacao='EM_ANALISE' where id=v.id;
 end if;
 update public.veiculos_motorista set componentes=(select coalesce(jsonb_agg(jsonb_build_object('papel',key,'placa',value#>>'{}')),'[]') from jsonb_each(coalesce(x->'plates','{}')) where key in ('carreta_1','dolly','carreta_2') and coalesce(x->'absent'->>key,'false')<>'true') where id=v.id;
 for k,path in select key,value#>>'{}' from jsonb_each(x->'files') loop
  if not exists(select 1 from public.documentos_veiculo where veiculo_id=v.id and arquivo_path=path) then insert into public.documentos_veiculo(veiculo_id,tipo,arquivo_path) values(v.id,k,path);end if;
 end loop;
 update public.vehicle_registration_drafts set veiculo_id=v.id,status='SUBMITTED',submitted_at=now(),revision=revision+1,updated_at=now() where id=d.id;
 insert into public.access_audit(app,event,user_id) values('frete','VEICULO_ENVIADO_SEM_VINCULO_'||v.id::text,p_user);
 return jsonb_build_object('id',v.id,'status','SUBMITTED','message','Veículo enviado para análise própria. Nenhum vínculo foi criado.');
end;$$;

create function private.assert_vehicle_dossier(p_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare v public.veiculos_motorista;k text;
begin
 select * into strict v from public.veiculos_motorista where id=p_id;
 if not v.ativo or v.placa !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' or (coalesce(v.capacidade_efetiva_t,v.capacidade_t,0) between 0.1 and 80) is distinct from true or nullif(v.marca_modelo,'') is null or (v.ano_fabricacao between 1950 and extract(year from current_date)::integer+1) is distinct from true then raise exception 'Confira cadastro, placa e capacidade do veículo.';end if;
 foreach k in array array['cavalo','rntrc','foto_frente','foto_lateral'] loop
  if not exists(select 1 from public.documentos_veiculo d join storage.objects o on o.bucket_id='motorista-documentos' and o.name=d.arquivo_path where d.veiculo_id=p_id and d.tipo=k and coalesce((o.metadata->>'size')::bigint,0) between 1 and 10485760 and o.metadata->>'mimetype' in ('application/pdf','image/jpeg','image/png','image/webp') and (k not like 'foto_%' or o.metadata->>'mimetype'<>'application/pdf')) then raise exception 'Anexo obrigatório do veículo: %.',k;end if;
 end loop;
 for k in select value->>'papel' from jsonb_array_elements(v.componentes) loop
  if not exists(select 1 from public.documentos_veiculo d join storage.objects o on o.bucket_id='motorista-documentos' and o.name=d.arquivo_path where d.veiculo_id=p_id and d.tipo=k and coalesce((o.metadata->>'size')::bigint,0) between 1 and 10485760 and o.metadata->>'mimetype' in ('application/pdf','image/jpeg','image/png','image/webp')) then raise exception 'Anexe documento do componente: %.',k;end if;
 end loop;
end;$$;
create function public.vehicle_registration_review(p_actor uuid,p_id uuid,p_decision text,p_reason text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.veiculos_motorista;
begin
 if private.access_is_admin(p_actor) is distinct from true then raise exception 'Somente a administração aprovada pode analisar veículos.' using errcode='42501';end if;
 if p_decision not in ('APROVADO','REPROVADO','CORRECAO_SOLICITADA') or p_decision is null or (p_decision<>'APROVADO' and length(btrim(coalesce(p_reason,'')))<3) then raise exception 'Informe decisão e motivo válidos.';end if;
 select * into strict v from public.veiculos_motorista where id=p_id for update;
 if v.status_aprovacao=p_decision then return jsonb_build_object('status',p_decision,'id',v.id);end if;
 if v.status_aprovacao not in ('PENDENTE','EM_ANALISE','CORRECAO_SOLICITADA','APROVADO','REPROVADO') then raise exception 'Veículo não está aberto para análise.';end if;
 if p_decision='APROVADO' then perform private.assert_vehicle_dossier(v.id);end if;
 if exists(select 1 from public.viagens where veiculo_id=v.id and status not in ('encerrada','concluida','cancelada')) then raise exception 'Finalize ou trate a viagem em andamento antes de rever este veículo.';end if;
 perform set_config('forte.explicit_vehicle_review','yes',true);
 update public.veiculos_motorista set status_aprovacao=p_decision,analisado_por=p_actor,analisado_em=now(),motivo_analise=nullif(btrim(p_reason),'') where id=v.id;
 if p_decision='CORRECAO_SOLICITADA' then update public.vehicle_registration_drafts set status='DRAFT',revision=revision+1,updated_at=now() where veiculo_id=v.id;end if;
 insert into public.access_audit(app,event,user_id) values('frete','VEICULO_'||p_decision||'_'||v.id::text,p_actor);
 return jsonb_build_object('id',v.id,'status',p_decision,'message','Análise do veículo registrada. Motorista e vínculo não foram alterados.');
end;$$;

create function public.vehicle_registration_link(p_actor uuid,p_vehicle uuid,p_driver uuid,p_unlink boolean default false,p_reason text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v public.veiculos_motorista;m public.motoristas;
begin
 if private.access_is_admin(p_actor) is distinct from true then raise exception 'Somente a administração aprovada pode administrar vínculos.' using errcode='42501';end if;
 select * into strict v from public.veiculos_motorista where id=p_vehicle for update;
 if exists(select 1 from public.viagens where veiculo_id=v.id and status not in ('encerrada','concluida','cancelada')) then raise exception 'Finalize ou trate a viagem em andamento antes de alterar o vínculo.';end if;
 if p_unlink then
  if v.motorista_id is null then return jsonb_build_object('status','SEM_VINCULO');end if;
  if p_driver is distinct from v.motorista_id then raise exception 'O vínculo mudou. Atualize antes de desvincular.' using errcode='40001';end if;
  if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe o motivo da desvinculação.';end if;
  update public.motorista_veiculo_vinculos set encerrado_em=now(),encerrado_por=p_actor,motivo=p_reason where veiculo_id=v.id and encerrado_em is null;
 else
  select * into strict m from public.motoristas where id=p_driver for update;
  if m.status_cadastro is distinct from 'aprovado' or v.status_aprovacao is distinct from 'APROVADO' then raise exception 'Aprove motorista e veículo separadamente antes de vincular.';end if;
  perform private.assert_driver_dossier(m.id);perform private.assert_vehicle_dossier(v.id);
  if v.motorista_id=m.id then return jsonb_build_object('status','VINCULADO');end if;
  if v.motorista_id is not null then raise exception 'Desvincule o motorista atual em uma ação separada.';end if;
  insert into public.motorista_veiculo_vinculos(motorista_id,veiculo_id,criado_por) values(m.id,v.id,p_actor);
 end if;
 perform set_config('forte.explicit_vehicle_link','yes',true);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 update public.veiculos_motorista set motorista_id=case when p_unlink then null else m.id end where id=v.id;
 if not p_unlink then update public.vehicle_link_requests set status='CONCLUIDA',reviewed_at=now() where veiculo_id=v.id and user_id=m.auth_user_id and status='PENDENTE';end if;
 insert into public.access_audit(app,event,user_id) values('frete',case when p_unlink then 'VEICULO_DESVINCULADO_' else 'VEICULO_VINCULADO_' end||v.id::text,p_actor);
 return jsonb_build_object('status',case when p_unlink then 'SEM_VINCULO' else 'VINCULADO' end,'message','Vínculo registrado sem alterar aprovações ou viagens anteriores.');
end;$$;

create function private.guard_separate_vehicle_link() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (tg_op='INSERT' and new.motorista_id is not null) or (tg_op='UPDATE' and new.motorista_id is distinct from old.motorista_id) then
  if current_setting('forte.explicit_vehicle_link',true) is distinct from 'yes' or current_user not in ('postgres','service_role') then raise exception 'Use a ação separada de vincular ou desvincular.';end if;
 end if;
 return new;
end;$$;
create trigger guard_separate_vehicle_link before insert or update of motorista_id on public.veiculos_motorista for each row execute function private.guard_separate_vehicle_link();
create function private.guard_vehicle_review() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (tg_op='INSERT' and new.status_aprovacao='APROVADO') or (tg_op='UPDATE' and new.status_aprovacao is distinct from old.status_aprovacao and (old.status_aprovacao='APROVADO' or new.status_aprovacao in ('APROVADO','REPROVADO','CORRECAO_SOLICITADA'))) then
  if current_user not in ('postgres','service_role') or current_setting('forte.explicit_vehicle_review',true) is distinct from 'yes' then raise exception 'Use a análise separada do veículo.';end if;
 end if;
 if tg_op='UPDATE' and old.status_aprovacao='APROVADO' and (new.placa,new.capacidade_t,new.capacidade_efetiva_t,new.componentes,new.marca_modelo,new.ano_fabricacao) is distinct from (old.placa,old.capacidade_t,old.capacidade_efetiva_t,old.componentes,old.marca_modelo,old.ano_fabricacao) then raise exception 'Solicite revisão do veículo antes de alterar identificação, documentos ou capacidade.';end if;
 return new;
end;$$;
create trigger guard_vehicle_review before insert or update on public.veiculos_motorista for each row execute function private.guard_vehicle_review();
revoke all on function private.guard_vehicle_review() from public,anon,authenticated;
revoke all on function private.guard_separate_vehicle_link(),private.assert_vehicle_dossier(uuid) from public,anon,authenticated;
grant execute on function private.assert_vehicle_dossier(uuid) to service_role;
revoke all on function public.vehicle_registration_save(uuid,uuid,integer,jsonb),public.vehicle_registration_submit(uuid,uuid),public.vehicle_registration_review(uuid,uuid,text,text),public.vehicle_registration_link(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.vehicle_registration_save(uuid,uuid,integer,jsonb),public.vehicle_registration_submit(uuid,uuid),public.vehicle_registration_review(uuid,uuid,text,text),public.vehicle_registration_link(uuid,uuid,uuid,boolean,text) to service_role;

create function public.vehicle_registration_request_link(p_user uuid,p_vehicle uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r uuid;
begin
 if not exists(select 1 from public.usuarios_app p where p.user_id=p_user and not p.trocar_senha and p.status_aprovacao in ('PENDENTE','APROVADO') and (exists(select 1 from public.registration_dossiers d where d.user_id=p_user and d.kind='MOTORISTA' and d.status='SUBMITTED') or exists(select 1 from public.motoristas m where m.auth_user_id=p_user))) then raise exception 'Conclua o cadastro pessoal antes de solicitar vínculo.';end if;
 if public.forte_legal_status(p_user,'frete')->>'accepted' is distinct from 'true' then raise exception 'Aceite o termo vigente.';end if;
 if not exists(select 1 from public.veiculos_motorista where id=p_vehicle and ativo and status_aprovacao<>'REPROVADO') then raise exception 'Veículo indisponível para solicitação.';end if;
 insert into public.vehicle_link_requests(user_id,veiculo_id) values(p_user,p_vehicle) on conflict(user_id,veiculo_id) where status='PENDENTE' do update set user_id=excluded.user_id returning id into r;
 insert into public.access_audit(app,event,user_id) values('frete','SOLICITACAO_VINCULO_VEICULO_'||p_vehicle::text,p_user);
 return jsonb_build_object('id',r,'message','Solicitação salva para a administração. Nenhum vínculo ou aprovação foi criado.');
end;$$;
revoke all on function public.vehicle_registration_request_link(uuid,uuid) from public,anon,authenticated;
grant execute on function public.vehicle_registration_request_link(uuid,uuid) to service_role;

create or replace function private.frete_elegivel(p_carga uuid,p_motorista uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cargas c join public.motoristas m on m.id=p_motorista
 join public.usuarios_app u on u.user_id=m.auth_user_id
 where c.id=p_carga and m.status_cadastro='aprovado' and m.validade_cnh>=current_date and u.perfil='MOTORISTA' and u.ativo and u.status_aprovacao='APROVADO' and not u.trocar_senha
 and (c.rota_id is null or m.preferencia_todas_rotas or exists(select 1 from public.motorista_rotas r where r.motorista_id=m.id and r.rota_id=c.rota_id))
 and c.peso_min_t>0 and c.peso_max_t>=c.peso_min_t
 and exists(select 1 from public.veiculos_motorista v where v.motorista_id=m.id and v.ativo and v.status_aprovacao='APROVADO'
 and coalesce(v.capacidade_efetiva_t,v.capacidade_t,0)>=c.peso_min_t
 and coalesce(v.capacidade_efetiva_t,v.capacidade_t,0)<>'NaN'::numeric))
$$;
create or replace function private.frete_previa(p_carga uuid,p_motorista uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.cargas;cap numeric;unit numeric;qtd bigint;peso numeric;
begin
 select * into c from public.cargas where id=p_carga;
 select coalesce(v.capacidade_efetiva_t,v.capacidade_t) into cap from public.veiculos_motorista v where v.motorista_id=p_motorista and v.ativo and v.status_aprovacao='APROVADO' and coalesce(v.capacidade_efetiva_t,v.capacidade_t,0)>=c.peso_min_t order by v.conjunto_principal desc,v.id limit 1;
 unit:=coalesce(c.peso_unitario_kg,50);
 if cap is null or cap::text in ('NaN','Infinity','-Infinity') or unit<=0 or unit::text in ('NaN','Infinity','-Infinity') or c.peso_max_t::text in ('NaN','Infinity','-Infinity') or c.frete_por_t is null or c.frete_por_t<0 or c.frete_por_t::text in ('NaN','Infinity','-Infinity') then return '{}';end if;
 qtd:=floor(least(cap,c.peso_max_t)*1000/unit);peso:=qtd*unit/1000;
 if qtd<=0 or peso<c.peso_min_t then return '{}';end if;
 return jsonb_build_object('peso_estimado_t',peso,'quantidade_estimada',qtd,'frete_estimado',round(peso*c.frete_por_t,2),'placa', (select placa from public.veiculos_motorista where motorista_id=p_motorista and ativo and status_aprovacao='APROVADO' and coalesce(capacidade_efetiva_t,capacidade_t,0)>=c.peso_min_t order by conjunto_principal desc,id limit 1));
end $$;
CREATE OR REPLACE FUNCTION private.frete_operacao(p_acao text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.motoristas;c public.cargas;v public.veiculos_motorista;t public.viagens;i public.interesses_carga;result jsonb; cap numeric;peso numeric;unit numeric;qtd integer;total numeric;
begin
 if not private.is_operational() or not exists(select 1 from public.usuarios_app where user_id=auth.uid() and perfil='MOTORISTA') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 select * into m from public.motoristas where auth_user_id=auth.uid() and status_cadastro='aprovado' for update;
 if not found then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_acao='CARGAS' then
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'origem',x.origem_cidade||'/'||x.origem_uf,'destino',x.destino_cidade||'/'||x.destino_uf,'produto',x.produto,'peso_min_t',x.peso_min_t,'peso_max_t',x.peso_max_t,'data_carregamento',x.data_carregamento,'privada',x.audiencia='privada')||(private.frete_previa(x.id,m.id)-'frete_estimado') order by x.created_at desc),'[]') into result from public.cargas x where x.status='publicada' and x.oferta_status='pendente' and (x.audiencia='publica' or x.destinatario_motorista_id=m.id) and private.frete_elegivel(x.id,m.id);
 return result;
 elsif p_acao='VIAGENS' then
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'numero_pedido_fornecedor',x.numero_pedido_fornecedor,'origem',x.origem,'destino',x.destino,'produto',x.produto,'peso_t',x.peso_t,'status',x.status,'pagamento_status',x.pagamento_status,'ordem_enviada_em',x.ordem_enviada_em,'carregamento_iniciado_em',x.carregamento_iniciado_em,'viagem_iniciada_em',x.viagem_iniciada_em,'entrega_concluida_em',x.entrega_concluida_em,'pagamento_comprovante_bucket',x.pagamento_comprovante_bucket,'pagamento_comprovante_path',case when x.pagamento_status='pago' and x.comprovante_autorizado_em is not null then x.pagamento_comprovante_path end) order by x.created_at desc),'[]') into result from public.viagens x where x.motorista_id=m.id;
 return result;
 elsif p_acao='ORDENS' then
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'snapshot',jsonb_build_object('pedido',x.snapshot->>'pedido','codigo',x.snapshot->>'codigo','origem',x.snapshot->>'origem','destino',x.snapshot->>'destino','dataCarregamento',x.snapshot->>'dataCarregamento','placas',x.snapshot->'placas','pesoKg',x.snapshot->'pesoKg'),'pagamento_status',x.pagamento_status,'documento_frete_path',case when x.pagamento_status like 'PAGO%' then x.documento_frete_path end) order by x.updated_at desc),'[]') into result from public.vendas_ordens x where x.motorista_id=m.id;
 return result;
 elsif p_acao in ('INICIAR_CARREGAMENTO','INICIAR_VIAGEM','CONCLUIR_VIAGEM') then
 select * into t from public.viagens where id=p_id and motorista_id=m.id for update;
 if not found then raise exception 'Viagem indisponível.' using errcode='42501';end if;
 if p_acao='INICIAR_CARREGAMENTO' and t.status='ordem_liberada' and t.ordem_enviada_em is not null then
 update public.viagens set status='em_carregamento',carregamento_iniciado_em=now() where id=t.id;
 elsif p_acao='INICIAR_VIAGEM' and t.status='em_carregamento' then
 update public.viagens set status='em_viagem',viagem_iniciada_em=now() where id=t.id;
 elsif p_acao='CONCLUIR_VIAGEM' and t.status in ('em_carregamento','em_viagem') then
 update public.viagens set status=case when pagamento_status='pago' then 'encerrada' else 'concluida' end,entrega_concluida_em=now(),concluida_em=now(),pagamento_status=case when pagamento_status='pago' then 'pago' else 'aguardando_pagamento' end where id=t.id;
 else raise exception 'Transição não permitida.' using errcode='40001';end if;
 return jsonb_build_object('ok',true);
 end if;
 if p_acao not in ('ACEITAR','RECUSAR') then raise exception 'Ação inválida.' using errcode='22023';end if;
 select * into c from public.cargas where id=p_id for update;
 if not found then raise exception 'Carga indisponível.' using errcode='40001';end if;
 -- Idempotent retry returns the same trip and never duplicates the integration outbox.
 if p_acao='ACEITAR' and c.status='atribuida' then
 select * into t from public.viagens where carga_id=c.id and motorista_id=m.id order by created_at limit 1;
 if found then select * into i from public.interesses_carga where carga_id=c.id and motorista_id=m.id;return jsonb_build_object('ok',true,'replayed',true,'viagem_id',t.id,'peso_t',t.peso_t,'quantidade',i.quantidade_calculada);end if;
 end if;
 if c.status<>'publicada' or c.oferta_status<>'pendente' or (c.audiencia='privada' and c.destinatario_motorista_id<>m.id) or not private.frete_elegivel(c.id,m.id) then raise exception 'Carga indisponível.' using errcode='40001';end if;
 if p_acao='RECUSAR' then
 if c.audiencia<>'privada' then raise exception 'A oferta não é privada.' using errcode='22023';end if;
 update public.cargas set oferta_status='recusada' where id=c.id;
 return jsonb_build_object('ok',true,'status','RECUSADA');
 end if;
 select * into v from public.veiculos_motorista where motorista_id=m.id and ativo and status_aprovacao='APROVADO' and coalesce(capacidade_efetiva_t,capacidade_t,0)>=c.peso_min_t and coalesce(capacidade_efetiva_t,capacidade_t,0)<>'NaN'::numeric order by conjunto_principal desc,id limit 1 for update;
 cap:=coalesce(v.capacidade_efetiva_t,v.capacidade_t);unit:=coalesce(c.peso_unitario_kg,50);
 if cap is null or cap in ('Infinity'::numeric,'-Infinity'::numeric,'NaN'::numeric) or unit<=0 or unit in ('Infinity'::numeric,'NaN'::numeric) or c.frete_por_t is null or c.frete_por_t<0 or c.frete_por_t in ('Infinity'::numeric,'NaN'::numeric) or c.peso_max_t in ('Infinity'::numeric,'NaN'::numeric) then raise exception 'Capacidade, peso ou tarifa inválida.' using errcode='22023';end if;
 qtd:=floor(least(cap,c.peso_max_t)*1000/unit);peso:=qtd*unit/1000;
 if qtd<=0 or peso<c.peso_min_t or peso>cap then raise exception 'Quantidade incompatível com a capacidade.' using errcode='22023';end if;
 total:=round(c.frete_por_t*peso,2);
 insert into public.interesses_carga(carga_id,motorista_id,veiculo_id,placa_confirmada,status,capacidade_efetiva_t,peso_aceito_t,quantidade_calculada) values(c.id,m.id,v.id,v.placa,'selecionado',cap,peso,qtd) returning * into i;
 insert into public.viagens(carga_id,motorista_id,veiculo_id,placas_snapshot,origem,destino,produto,peso_t,frete_por_t,frete_total,status) values(c.id,m.id,v.id,jsonb_build_object('principal',v.placa),c.origem_cidade||'/'||c.origem_uf,c.destino_cidade||'/'||c.destino_uf,c.produto,peso,c.frete_por_t,total,'aguardando_pedido') returning * into t;
 update public.cargas set status='atribuida',oferta_status='aceita' where id=c.id;
 insert into public.integracao_forte_vendas(carga_id,interesse_id,motorista_id,veiculo_id,tipo,status,payload) values(c.id,i.id,m.id,v.id,'SOLICITAR_PEDIDO','PENDENTE_ENVIO',jsonb_build_object('carga_id',c.id,'viagem_id',t.id,'motorista',jsonb_build_object('id',m.id,'nome',m.nome,'cpf',m.cpf,'whatsapp',m.telefone),'veiculo',jsonb_build_object('id',v.id,'placa',v.placa,'capacidade_efetiva_t',cap),'fornecedor',c.fornecedor,'local_expedicao',c.local_expedicao,'origem',t.origem,'destino',t.destino,'produto',c.produto,'peso_t',peso,'peso_unitario_kg',unit,'quantidade',qtd,'quantidade_pedida',coalesce(c.quantidade_pedida,qtd),'peso_pedido_t',coalesce(c.peso_pedido_t,peso),'frete_por_t',c.frete_por_t,'frete_total',total,'status_vendas','MOTORISTA VINCULADO','exigencia',case when c.numero_pedido_fornecedor is null then 'AGUARDANDO PEDIDO DO FORNECEDOR' else 'PEDIDO INFORMADO' end));
 return jsonb_build_object('ok',true,'status','ACEITA_AGUARDANDO_PEDIDO','peso_t',peso,'quantidade',qtd,'viagem_id',t.id);
end $function$;
commit;
