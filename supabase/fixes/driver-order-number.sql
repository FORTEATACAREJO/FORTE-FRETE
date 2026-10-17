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
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'origem',x.origem_cidade||'/'||x.origem_uf,'destino',x.destino_cidade||'/'||x.destino_uf,'produto',x.produto,'peso_min_t',x.peso_min_t,'peso_max_t',x.peso_max_t,'frete_por_t',x.frete_por_t,'data_carregamento',x.data_carregamento,'privada',x.audiencia='privada')||private.frete_previa(x.id,m.id) order by x.created_at desc),'[]') into result from public.cargas x where x.status='publicada' and x.oferta_status='pendente' and (x.audiencia='publica' or x.destinatario_motorista_id=m.id) and private.frete_elegivel(x.id,m.id);
 return result;
 elsif p_acao='VIAGENS' then
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'numero_pedido_fornecedor',x.numero_pedido_fornecedor,'origem',x.origem,'destino',x.destino,'produto',x.produto,'peso_t',x.peso_t,'frete_total',x.frete_total,'status',x.status,'pagamento_status',x.pagamento_status,'ordem_enviada_em',x.ordem_enviada_em,'carregamento_iniciado_em',x.carregamento_iniciado_em,'viagem_iniciada_em',x.viagem_iniciada_em,'entrega_concluida_em',x.entrega_concluida_em,'pagamento_comprovante_bucket',x.pagamento_comprovante_bucket,'pagamento_comprovante_path',case when x.pagamento_status='pago' and x.comprovante_autorizado_em is not null then x.pagamento_comprovante_path end) order by x.created_at desc),'[]') into result from public.viagens x where x.motorista_id=m.id;
 return result;
 elsif p_acao='ORDENS' then
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'snapshot',jsonb_build_object('pedido',x.snapshot->>'pedido','codigo',x.snapshot->>'codigo','origem',x.snapshot->>'origem','destino',x.snapshot->>'destino','dataCarregamento',x.snapshot->>'dataCarregamento','placas',x.snapshot->'placas','pesoKg',x.snapshot->'pesoKg','freteValor',x.snapshot->'freteValor'),'pagamento_status',x.pagamento_status,'documento_frete_path',case when x.pagamento_status like 'PAGO%' then x.documento_frete_path end) order by x.updated_at desc),'[]') into result from public.vendas_ordens x where x.motorista_id=m.id;
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
 select * into v from public.veiculos_motorista where motorista_id=m.id and ativo and coalesce(capacidade_efetiva_t,capacidade_t,0)>=c.peso_min_t and coalesce(capacidade_efetiva_t,capacidade_t,0)<>'NaN'::numeric order by conjunto_principal desc,id limit 1 for update;
 cap:=coalesce(v.capacidade_efetiva_t,v.capacidade_t);unit:=coalesce(c.peso_unitario_kg,50);
 if cap is null or cap in ('Infinity'::numeric,'-Infinity'::numeric,'NaN'::numeric) or unit<=0 or unit in ('Infinity'::numeric,'NaN'::numeric) or c.frete_por_t is null or c.frete_por_t<0 or c.frete_por_t in ('Infinity'::numeric,'NaN'::numeric) or c.peso_max_t in ('Infinity'::numeric,'NaN'::numeric) then raise exception 'Capacidade, peso ou tarifa inválida.' using errcode='22023';end if;
 qtd:=floor(least(cap,c.peso_max_t)*1000/unit);peso:=qtd*unit/1000;
 if qtd<=0 or peso<c.peso_min_t or peso>cap then raise exception 'Quantidade incompatível com a capacidade.' using errcode='22023';end if;
 total:=round(c.frete_por_t*peso,2);
 insert into public.interesses_carga(carga_id,motorista_id,veiculo_id,placa_confirmada,status,capacidade_efetiva_t,peso_aceito_t,quantidade_calculada) values(c.id,m.id,v.id,v.placa,'selecionado',cap,peso,qtd) returning * into i;
 insert into public.viagens(carga_id,motorista_id,veiculo_id,placas_snapshot,origem,destino,produto,peso_t,frete_por_t,frete_total,status) values(c.id,m.id,v.id,jsonb_build_object('principal',v.placa),c.origem_cidade||'/'||c.origem_uf,c.destino_cidade||'/'||c.destino_uf,c.produto,peso,c.frete_por_t,total,'aguardando_pedido') returning * into t;
 update public.cargas set status='atribuida',oferta_status='aceita' where id=c.id;
 insert into public.integracao_forte_vendas(carga_id,interesse_id,motorista_id,veiculo_id,tipo,status,payload) values(c.id,i.id,m.id,v.id,'SOLICITAR_PEDIDO','PENDENTE_ENVIO',jsonb_build_object('carga_id',c.id,'viagem_id',t.id,'motorista',jsonb_build_object('id',m.id,'nome',m.nome,'cpf',m.cpf,'whatsapp',m.telefone),'veiculo',jsonb_build_object('id',v.id,'placa',v.placa,'capacidade_efetiva_t',cap),'fornecedor',c.fornecedor,'local_expedicao',c.local_expedicao,'origem',t.origem,'destino',t.destino,'produto',c.produto,'peso_t',peso,'peso_unitario_kg',unit,'quantidade',qtd,'frete_por_t',c.frete_por_t,'frete_total',total,'status_vendas','MOTORISTA VINCULADO','exigencia',case when c.numero_pedido_fornecedor is null then 'AGUARDANDO PEDIDO DO FORNECEDOR' else 'PEDIDO INFORMADO' end));
 return jsonb_build_object('ok',true,'status','ACEITA_AGUARDANDO_PEDIDO','peso_t',peso,'quantidade',qtd,'viagem_id',t.id);
end $function$
