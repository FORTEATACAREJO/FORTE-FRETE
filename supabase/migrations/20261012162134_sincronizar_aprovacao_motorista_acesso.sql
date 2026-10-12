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
 -- Keep the standard access decision in the same transaction as the dossier.
 next_status:=case p_decision when 'aprovado' then 'APROVADO' when 'reprovado' then 'REPROVADO' else 'PENDENTE' end;
 update public.motoristas set status_cadastro=p_decision,analisado_por=auth.uid(),analisado_em=now(),observacoes=concat_ws(E'\n',nullif(observacoes,''),case when p_reason is not null then p_decision||': '||trim(p_reason) end) where id=m.id;
 update public.usuarios_app set status_aprovacao=next_status,ativo=(p_decision='aprovado') where user_id=m.auth_user_id;
 update public.access_requests set status=case p_decision when 'aprovado' then 'APROVADO' when 'reprovado' then 'RECUSADO' else 'PENDENTE' end,
 reviewed_by=auth.uid(),reviewed_at=now(),reason=nullif(trim(p_reason),'')
 where user_id=m.auth_user_id and app='frete';
 insert into public.notificacoes_whatsapp(motorista_id,tipo,telefone,mensagem) values(m.id,case p_decision when 'aprovado' then 'CADASTRO_APROVADO' when 'pendencia' then 'CORRECAO_CADASTRO' else 'CADASTRO_REPROVADO' end,m.telefone,'Forte Frete: cadastro '||p_decision||case when p_reason is not null then '. Motivo: '||trim(p_reason) else '. Acesso à operação liberado.' end);
 return jsonb_build_object('motorista_id',m.id,'status_cadastro',p_decision,'status_aprovacao',next_status,'ativo',p_decision='aprovado');
end $function$
