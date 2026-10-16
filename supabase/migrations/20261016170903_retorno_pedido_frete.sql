begin;
grant usage on schema private to service_role;
alter table public.integracao_forte_vendas add column carga_vendas_id text;
alter table public.integracao_forte_vendas add column ultima_tentativa_sync timestamptz;
alter table public.integracao_forte_vendas add column tentativas_sync integer not null default 0;
alter table public.viagens add column pagamento_comprovante_bucket text not null default 'motorista-documentos' check(pagamento_comprovante_bucket in ('motorista-documentos','vendas-ordens-frete'));
create function private.frete_listar_integracoes() returns jsonb language sql security definer set search_path='' as $$
 with picked as (select id from public.integracao_forte_vendas where tipo='SOLICITAR_PEDIDO' and status in ('PENDENTE_ENVIO','ENVIADO') and (ultima_tentativa_sync is null or ultima_tentativa_sync<now()-interval '30 seconds') order by ultima_tentativa_sync nulls first,created_at,id limit 10 for update skip locked), claimed as (update public.integracao_forte_vendas e set ultima_tentativa_sync=now(),tentativas_sync=e.tentativas_sync+1 from picked where e.id=picked.id returning e.id,e.payload,e.status) select coalesce(jsonb_agg(jsonb_build_object('id',id,'payload',payload,'status',status)),'[]') from claimed
$$;
create function public.frete_listar_integracoes() returns jsonb language sql security invoker set search_path='' as $$select private.frete_listar_integracoes()$$;
revoke all on function private.frete_listar_integracoes(),public.frete_listar_integracoes() from public,anon,authenticated;
grant execute on function private.frete_listar_integracoes(),public.frete_listar_integracoes() to service_role;
create function private.frete_confirmar_integracao(p_evento uuid,p_solicitacao uuid,p_carga_vendas text,p_numero_pedido text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.integracao_forte_vendas;c public.cargas;t public.viagens;
begin
 select * into e from public.integracao_forte_vendas where id=p_evento for update;
 if not found or p_solicitacao is null then raise exception 'Evento não localizado.';end if;
 if e.vendas_solicitacao_id is not null and e.vendas_solicitacao_id<>p_solicitacao then raise exception 'Evento já vinculado a outra solicitação.';end if;
 if nullif(btrim(p_numero_pedido),'') is null then
 update public.integracao_forte_vendas set vendas_solicitacao_id=p_solicitacao,status=case when retornado_em is not null then status else 'ENVIADO' end,enviado_em=coalesce(enviado_em,now()),erro=null where id=e.id;
 return jsonb_build_object('ok',true,'status','ENVIADO');
 end if;
 if nullif(btrim(p_carga_vendas),'') is null or length(p_numero_pedido)>100 then raise exception 'Pedido inválido.';end if;
 select * into c from public.cargas where id=e.carga_id for update;
 select * into t from public.viagens where id=(e.payload->>'viagem_id')::uuid and carga_id=e.carga_id and motorista_id=e.motorista_id for update;
 if c.id is null or t.id is null or c.status='cancelada' or t.status='cancelada' then raise exception 'Carga ou viagem incompatível com o retorno.';end if;
 if coalesce(c.numero_pedido_fornecedor,p_numero_pedido)<>p_numero_pedido or coalesce(t.numero_pedido_fornecedor,p_numero_pedido)<>p_numero_pedido then raise exception 'Pedido já informado com outro número.';end if;
 update public.cargas set forte_vendas_solicitacao_id=p_solicitacao,numero_pedido_fornecedor=p_numero_pedido,pedido_recebido_em=coalesce(pedido_recebido_em,now()) where id=c.id;
 update public.viagens set numero_pedido_fornecedor=p_numero_pedido where id=t.id;
 update public.integracao_forte_vendas set vendas_solicitacao_id=p_solicitacao,carga_vendas_id=p_carga_vendas,numero_pedido_fornecedor=p_numero_pedido,status='RETORNADO',enviado_em=coalesce(enviado_em,now()),retornado_em=coalesce(retornado_em,now()),erro=null where id=e.id;
 return jsonb_build_object('ok',true,'status','RETORNADO','viagem_id',t.id);
end $$;
create function public.frete_confirmar_integracao(p_evento uuid,p_solicitacao uuid,p_carga_vendas text,p_numero_pedido text) returns jsonb language sql security invoker set search_path='' as $$select private.frete_confirmar_integracao(p_evento,p_solicitacao,p_carga_vendas,p_numero_pedido)$$;
revoke all on function private.frete_confirmar_integracao(uuid,uuid,text,text),public.frete_confirmar_integracao(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function private.frete_confirmar_integracao(uuid,uuid,text,text),public.frete_confirmar_integracao(uuid,uuid,text,text) to service_role;

create function private.frete_proteger_pagamento() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user='authenticated' and (new.pagamento_status,new.pagamento_comprovante_path,new.pagamento_em,new.comprovante_autorizado_em,new.pagamento_comprovante_bucket) is distinct from (old.pagamento_status,old.pagamento_comprovante_path,old.pagamento_em,old.comprovante_autorizado_em,old.pagamento_comprovante_bucket) then raise exception 'Pagamentos e autorização financeira pertencem ao Forte Vendas, Master.' using errcode='42501';end if;
 return new;
end $$;
create trigger frete_proteger_pagamento before update on public.viagens for each row execute function private.frete_proteger_pagamento();
revoke all on function private.frete_proteger_pagamento() from public,anon,authenticated;
create function private.frete_sincronizar_comprovante(p_carga_vendas text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.integracao_forte_vendas;o public.vendas_ordens;
begin
 select * into e from public.integracao_forte_vendas where carga_vendas_id=p_carga_vendas and status='RETORNADO' for update;
 if not found then return jsonb_build_object('ok',true,'sem_aceite_vinculado',true);end if;
 select * into o from public.vendas_ordens where carga_vendas_id=p_carga_vendas and motorista_id=e.motorista_id and documento_frete_path is not null and pagamento_status like 'PAGO%' order by updated_at desc limit 1;
 if not found then return jsonb_build_object('ok',true,'aguardando_comprovante',true);end if;
 update public.viagens set status=case when entrega_concluida_em is not null then 'encerrada' else status end,pagamento_status='pago',pagamento_em=coalesce(pagamento_em,now()),pagamento_comprovante_path=o.documento_frete_path,pagamento_comprovante_bucket='vendas-ordens-frete',comprovante_autorizado_em=coalesce(comprovante_autorizado_em,now()) where id=(e.payload->>'viagem_id')::uuid and motorista_id=e.motorista_id;
 return jsonb_build_object('ok',true,'comprovante_autorizado',true);
end $$;
create function public.frete_sincronizar_comprovante(p_carga_vendas text) returns jsonb language sql security invoker set search_path='' as $$select private.frete_sincronizar_comprovante(p_carga_vendas)$$;
revoke all on function private.frete_sincronizar_comprovante(text),public.frete_sincronizar_comprovante(text) from public,anon,authenticated;
grant execute on function private.frete_sincronizar_comprovante(text),public.frete_sincronizar_comprovante(text) to service_role;

commit;
