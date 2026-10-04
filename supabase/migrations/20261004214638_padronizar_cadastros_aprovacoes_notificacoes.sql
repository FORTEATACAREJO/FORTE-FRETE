
create schema if not exists private;
create table if not exists public.access_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 app text not null check(app in ('vendas','financeiro','venda-externa','carga-direta','patio','site','frete','fiscal')),
 nome text not null, cpf text not null, whatsapp text not null, data_nascimento date not null,
 email text, managed_account boolean not null default true, status text not null default 'PENDENTE' check(status in ('PENDENTE','APROVADO','RECUSADO')),
 created_at timestamptz not null default now(), reviewed_at timestamptz, reviewed_by uuid references auth.users(id), reason text,
 unique(user_id,app), check(data_nascimento<current_date)
);
create index if not exists access_requests_pending_idx on public.access_requests(app,created_at) where status='PENDENTE';
alter table public.access_requests enable row level security;
revoke all on public.access_requests from anon,authenticated;
grant select on public.access_requests to authenticated;
create policy access_requests_self on public.access_requests for select to authenticated using(user_id=(select auth.uid()));
create table if not exists public.access_notifications (
 id uuid primary key default gen_random_uuid(), request_id uuid not null references public.access_requests(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, audience text not null check(audience in ('ADMIN','USER')),
 event text not null check(event in ('NOVO_CADASTRO','APROVADO','RECUSADO')), message text not null,
 created_at timestamptz not null default now(), unique(request_id,audience,event)
);
alter table public.access_notifications enable row level security;
revoke all on public.access_notifications from anon,authenticated;
grant select on public.access_notifications to authenticated;
create policy access_notifications_self on public.access_notifications for select to authenticated using(audience='USER' and user_id=(select auth.uid()));
create index if not exists access_notifications_user_idx on public.access_notifications(user_id,created_at);
create index if not exists access_notifications_request_idx on public.access_notifications(request_id);
create or replace function private.access_notify() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
 insert into public.access_notifications(request_id,user_id,audience,event,message) values
 (new.id,new.user_id,'ADMIN','NOVO_CADASTRO','Novo usuário aguardando análise: '||new.nome||' • '||new.app),
 (new.id,new.user_id,'USER','NOVO_CADASTRO','Cadastro enviado para análise. Aguarde aprovação do admin ou master.') on conflict do nothing;
 elsif new.status is distinct from old.status and new.status in ('APROVADO','RECUSADO') then
 insert into public.access_notifications(request_id,user_id,audience,event,message)
 values(new.id,new.user_id,'USER',new.status,case when new.status='APROVADO' then 'Acesso aprovado para '||new.app||'.' else 'Acesso recusado: '||coalesce(new.reason,'Contate o administrador.') end) on conflict do nothing;
 end if;return new;
end;$$;
revoke all on function private.access_notify() from public,anon,authenticated;
create trigger access_notify after insert or update of status on public.access_requests for each row execute function private.access_notify();
create or replace function private.access_app_allowed(p_app text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
 not exists(select 1 from public.access_requests where user_id=(select auth.uid()) and managed_account)
 or exists(select 1 from public.access_requests where user_id=(select auth.uid()) and app=p_app and status='APROVADO'));
$$;
revoke all on function private.access_app_allowed(text) from public,anon;
grant execute on function private.access_app_allowed(text) to authenticated,service_role;

grant all on public.access_requests,public.access_notifications to service_role;

alter table public.usuarios_app add column if not exists data_nascimento date;
create or replace function private.access_is_admin(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.usuarios_app where user_id=p_user and ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('MASTER','ADMIN','ULTRA_ADMIN'));
$$;
create or replace function public.access_register_profile(p_user uuid,p_app text,p_nome text,p_cpf text,p_whatsapp text,p_birth date,p_email text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r uuid;
begin
 if p_app<>'frete' then raise exception 'Aplicativo inválido.';end if;
 insert into public.usuarios_app(user_id,nome,cpf,whatsapp,email,data_nascimento,perfil,ativo,trocar_senha,status_aprovacao)
 values(p_user,p_nome,p_cpf,p_whatsapp,p_email,p_birth,'MOTORISTA',false,false,'PENDENTE');
 insert into public.motoristas(auth_user_id,nome,cpf,telefone,email,data_nascimento,status_cadastro)
 values(p_user,p_nome,p_cpf,p_whatsapp,p_email,p_birth,'pre_cadastro');
 insert into public.access_requests(user_id,app,nome,cpf,whatsapp,data_nascimento,email) values(p_user,p_app,p_nome,p_cpf,p_whatsapp,p_birth,p_email) returning id into r;
 return r;
end;$$;
create or replace function public.access_review(p_request uuid,p_actor uuid,p_decision text,p_unit uuid default null,p_reason text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.access_requests;
begin
 if not private.access_is_admin(p_actor) then raise exception 'Somente admin ou master aprovado pode analisar.' using errcode='42501';end if;
 select * into r from public.access_requests where id=p_request for update;
 if not found or r.app<>'frete' or r.status<>'PENDENTE' then raise exception 'Cadastro não está aguardando análise.';end if;
 if p_decision not in ('APROVADO','RECUSADO') or (p_decision='RECUSADO' and length(trim(coalesce(p_reason,'')))<3) then raise exception 'Informe decisão e motivo válidos.';end if;
 if p_decision='APROVADO' then
 update public.usuarios_app set ativo=true,status_aprovacao='APROVADO' where user_id=r.user_id and perfil='MOTORISTA';
 if not found then raise exception 'Perfil não permitido.';end if;
 end if;
 update public.access_requests set status=p_decision,reviewed_by=p_actor,reviewed_at=now(),reason=nullif(trim(p_reason),'') where id=r.id;
 return jsonb_build_object('status',p_decision,'app',r.app);
end;$$;

revoke all on function private.access_is_admin(uuid) from public,anon,authenticated;
grant execute on function private.access_is_admin(uuid) to service_role;
revoke all on function public.access_register_profile(uuid,text,text,text,text,date,text) from public,anon,authenticated;
grant execute on function public.access_register_profile(uuid,text,text,text,text,date,text) to service_role;
revoke all on function public.access_review(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.access_review(uuid,uuid,text,uuid,text) to service_role;
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
   if m.data_nascimento is null or coalesce(m.cnh_registro,'')='' or coalesce(m.categoria_cnh,'')='' or m.validade_cnh is null then raise exception 'Complete nascimento e dados da CNH.'; end if;
   select * into v from public.veiculos_motorista where motorista_id=m.id and ativo and conjunto_principal order by created_at desc limit 1;
   if not found or coalesce(v.capacidade_efetiva_t,v.capacidade_t,0)<=0 or coalesce(v.placa,'')='' or coalesce(v.proprietario_nome,'')='' or coalesce(v.proprietario_cpf_cnpj,'')='' then raise exception 'Complete veículo, proprietário, placa e capacidade.'; end if;
   if not exists(select 1 from public.favorecidos_frete f join public.chaves_pix_frete p on p.favorecido_id=f.id where f.id=v.favorecido_id and f.ativo and p.ativo and p.principal and coalesce(f.cpf_cnpj,'')<>'') then raise exception 'Complete o favorecido e a chave Pix principal.'; end if;
   select string_agg(t,', ') into missing from unnest(array['cnh_frente','cnh_verso']) t where not exists(select 1 from public.documentos_motorista d where d.motorista_id=m.id and d.tipo=t);
   if missing is not null then raise exception 'Anexe os documentos pessoais: %.',missing; end if;
   select string_agg(t,', ') into missing from unnest(array['rntrc','cavalo','carreta_1','foto_conjunto']) t where not exists(select 1 from public.documentos_veiculo d where d.veiculo_id=v.id and d.tipo=t);
   if missing is not null then raise exception 'Anexe os documentos do conjunto: %.',missing; end if;
   if exists(select 1 from jsonb_array_elements(v.componentes) c where c->>'papel' in ('dolly','carreta_2') and not exists(select 1 from public.documentos_veiculo d where d.veiculo_id=v.id and d.tipo=c->>'papel')) then raise exception 'Anexe os documentos de todos os componentes informados.'; end if;
 end if;
 next_status:=case p_decision when 'aprovado' then 'APROVADO' when 'reprovado' then 'REPROVADO' else 'PENDENTE' end;
 update public.motoristas set status_cadastro=p_decision,analisado_por=auth.uid(),analisado_em=now(),observacoes=concat_ws(E'\n',nullif(observacoes,''),case when p_reason is not null then p_decision||': '||trim(p_reason) end) where id=m.id;
 update public.usuarios_app set status_aprovacao=next_status,ativo=(p_decision='aprovado') where user_id=m.auth_user_id;
 insert into public.notificacoes_whatsapp(motorista_id,tipo,telefone,mensagem) values(m.id,case p_decision when 'aprovado' then 'CADASTRO_APROVADO' when 'pendencia' then 'CORRECAO_CADASTRO' else 'CADASTRO_REPROVADO' end,m.telefone,'Forte Frete: cadastro '||p_decision||case when p_reason is not null then '. Motivo: '||trim(p_reason) else '. Acesso à operação liberado.' end);
 return jsonb_build_object('motorista_id',m.id,'status_cadastro',p_decision,'status_aprovacao',next_status,'ativo',p_decision='aprovado');
end $function$;

grant usage on schema private to authenticated,service_role;
create table if not exists public.access_audit(id bigint generated always as identity primary key,app text not null,event text not null,user_id uuid references auth.users(id) on delete set null,created_at timestamptz not null default now());
alter table public.access_audit enable row level security;
revoke all on public.access_audit from anon,authenticated;
grant all on public.access_audit to service_role;
grant usage,select on sequence public.access_audit_id_seq to service_role;
create index if not exists access_audit_user_idx on public.access_audit(user_id,created_at);

