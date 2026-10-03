begin;

create or replace function private.is_admin() returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.usuarios_app where user_id=(select auth.uid()) and ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('ADMIN','MASTER','ULTRA_ADMIN'))
$$;

create or replace function private.is_operational() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
   select 1 from public.usuarios_app u where u.user_id=auth.uid() and u.ativo and u.status_aprovacao='APROVADO' and not u.trocar_senha
   and (u.perfil in ('ADMIN','MASTER','ULTRA_ADMIN') or (u.perfil='MOTORISTA' and exists(select 1 from public.motoristas m where m.auth_user_id=u.user_id and m.status_cadastro='aprovado')))
 )
$$;
revoke all on function private.is_operational() from public,anon;
grant execute on function private.is_operational() to authenticated;

-- RLS grants a driver ownership of their dossier, never the right to approve it.
create or replace function private.protect_driver_approval() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('postgres','service_role') or private.is_admin() then return new; end if;
 if auth.uid() is null or new.auth_user_id is distinct from auth.uid() then raise exception 'Cadastro não autorizado.'; end if;
 if tg_op='INSERT' then
   if new.status_cadastro <> 'pre_cadastro' or new.analisado_por is not null or new.analisado_em is not null then raise exception 'A aprovação depende de MASTER ou ADMIN.'; end if;
 else
   if new.auth_user_id is distinct from old.auth_user_id or new.cpf is distinct from old.cpf
     or new.email is distinct from old.email or new.telefone is distinct from old.telefone
     or new.analisado_por is distinct from old.analisado_por or new.analisado_em is distinct from old.analisado_em then
       raise exception 'A identidade e a análise são administradas por MASTER ou ADMIN.';
   end if;
   if new.status_cadastro is distinct from old.status_cadastro and not
     (old.status_cadastro in ('pre_cadastro','pendencia') and new.status_cadastro='em_analise') then
       raise exception 'A aprovação depende de MASTER ou ADMIN.';
   end if;
 end if;
 return new;
end $$;
create trigger protect_driver_approval before insert or update on public.motoristas for each row execute function private.protect_driver_approval();

-- This private function needs privileged access only for the atomic administrative review.
-- Every invocation validates the current administrator from the server-managed profile.
create or replace function private.review_driver(p_id uuid,p_decision text,p_reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
   if m.data_nascimento is null or coalesce(m.email,'')='' or coalesce(m.cnh_registro,'')='' or coalesce(m.categoria_cnh,'')='' or m.validade_cnh is null then raise exception 'Complete e-mail, nascimento e dados da CNH.'; end if;
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
end $$;
revoke all on function private.review_driver(uuid,text,text) from public,anon;
grant execute on function private.review_driver(uuid,text,text) to authenticated;
create or replace function public.analisar_cadastro_motorista(p_id uuid,p_decision text,p_reason text default null) returns jsonb language sql security invoker set search_path='' as $$
 select private.review_driver(p_id,p_decision,p_reason)
$$;
revoke all on function public.analisar_cadastro_motorista(uuid,text,text) from public,anon;
grant execute on function public.analisar_cadastro_motorista(uuid,text,text) to authenticated;

create policy cargas_approved_gate on public.cargas as restrictive for all to authenticated using(private.is_operational()) with check(private.is_operational());
create policy interesses_approved_gate on public.interesses_carga as restrictive for all to authenticated using(private.is_operational()) with check(private.is_operational());
create policy viagens_approved_gate on public.viagens as restrictive for all to authenticated using(private.is_operational()) with check(private.is_operational());
create policy integracao_approved_gate on public.integracao_forte_vendas as restrictive for all to authenticated using(private.is_operational()) with check(private.is_operational());
create policy ordens_approved_gate on public.ordens_carregamento as restrictive for all to authenticated using(private.is_operational()) with check(private.is_operational());
commit;
