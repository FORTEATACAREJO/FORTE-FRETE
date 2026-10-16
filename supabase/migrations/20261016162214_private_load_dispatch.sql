begin;
-- Additive, unapplied release candidate. No existing records or status values are removed.
alter table public.cargas add column audiencia text not null default 'publica' check(audiencia in ('publica','privada'));
alter table public.cargas add column destinatario_motorista_id uuid references public.motoristas(id);
alter table public.cargas add column oferta_status text not null default 'pendente' check(oferta_status in ('pendente','aceita','recusada'));
alter table public.cargas add constraint carga_destinatario check((audiencia='privada')=(destinatario_motorista_id is not null));
alter table public.viagens add column comprovante_autorizado_em timestamptz;
create index cargas_destinatario_idx on public.cargas(destinatario_motorista_id) where audiencia='privada';
create table public.frete_ofertas_auditoria (
 id uuid primary key default gen_random_uuid(),carga_id uuid not null references public.cargas(id),
 autor_id uuid, ocorrido_em timestamptz not null default now(),evento text not null,
 anterior jsonb,atual jsonb not null
);
alter table public.frete_ofertas_auditoria enable row level security;
grant select on public.frete_ofertas_auditoria to authenticated;
create policy ofertas_auditoria_admin on public.frete_ofertas_auditoria for select to authenticated using(private.is_admin());
create function private.auditar_oferta() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or (new.audiencia,new.destinatario_motorista_id,new.oferta_status,new.status) is distinct from (old.audiencia,old.destinatario_motorista_id,old.oferta_status,old.status) then
 insert into public.frete_ofertas_auditoria(carga_id,autor_id,evento,anterior,atual) values(new.id,auth.uid(),tg_op,
 case when tg_op='UPDATE' then jsonb_build_object('audiencia',old.audiencia,'destinatario',old.destinatario_motorista_id,'oferta_status',old.oferta_status,'status',old.status) end,
 jsonb_build_object('audiencia',new.audiencia,'destinatario',new.destinatario_motorista_id,'oferta_status',new.oferta_status,'status',new.status));
 end if;return new;
end $$;
create trigger auditar_oferta after insert or update on public.cargas for each row execute function private.auditar_oferta();
revoke all on function private.auditar_oferta() from public,anon,authenticated;
-- Driver reads use projections below. Raw tables retain all legacy fields for administration/integrations.
create policy cargas_private_projection on public.cargas as restrictive for select to authenticated using(private.is_admin());
create policy viagens_private_projection on public.viagens as restrictive for select to authenticated using(private.is_admin());
create policy ordens_private_projection on public.ordens_carregamento as restrictive for select to authenticated using(private.is_admin());
create policy vendas_ordens_private_projection on public.vendas_ordens as restrictive for select to authenticated using(private.is_admin());
create policy interesses_admin_insert on public.interesses_carga as restrictive for insert to authenticated with check(private.is_admin());
create policy interesses_admin_update on public.interesses_carga as restrictive for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy interesses_admin_delete on public.interesses_carga as restrictive for delete to authenticated using(private.is_admin());

create function private.frete_elegivel(p_carga uuid,p_motorista uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cargas c join public.motoristas m on m.id=p_motorista
 join public.usuarios_app u on u.user_id=m.auth_user_id
 where c.id=p_carga and m.status_cadastro='aprovado' and u.perfil='MOTORISTA' and u.ativo and u.status_aprovacao='APROVADO' and not u.trocar_senha
 and (c.rota_id is null or m.preferencia_todas_rotas or exists(select 1 from public.motorista_rotas r where r.motorista_id=m.id and r.rota_id=c.rota_id))
 and c.peso_min_t>0 and c.peso_max_t>=c.peso_min_t
 and exists(select 1 from public.veiculos_motorista v where v.motorista_id=m.id and v.ativo
 and coalesce(v.capacidade_efetiva_t,v.capacidade_t,0)>=c.peso_min_t
 and coalesce(v.capacidade_efetiva_t,v.capacidade_t,0)<>'NaN'::numeric))
$$;
revoke all on function private.frete_elegivel(uuid,uuid) from public,anon,authenticated;
create function private.frete_ofertar(p_carga_id uuid,p_motorista_id uuid,p_modo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.cargas;
begin
 if not private.is_admin() then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 select * into c from public.cargas where id=p_carga_id for update;
 if not found or c.status not in ('rascunho','publicada') then raise exception 'Carga indisponível.' using errcode='40001';end if;
 if p_modo not in ('publica','privada') or (p_modo='privada')<>(p_motorista_id is not null) then raise exception 'Escolha a modalidade e o destinatário.' using errcode='22023';end if;
 if p_modo='privada' and not private.frete_elegivel(c.id,p_motorista_id) then raise exception 'Motorista não elegível para esta carga.' using errcode='22023';end if;
 update public.cargas set audiencia=p_modo,destinatario_motorista_id=p_motorista_id,oferta_status='pendente',status='publicada' where id=c.id;
 return jsonb_build_object('ok',true,'audiencia',p_modo);
end $$;
revoke all on function private.frete_ofertar(uuid,uuid,text) from public,anon;
grant execute on function private.frete_ofertar(uuid,uuid,text) to authenticated;
create function public.frete_ofertar(p_carga_id uuid,p_motorista_id uuid,p_modo text) returns jsonb language sql security invoker set search_path='' as $$select private.frete_ofertar(p_carga_id,p_motorista_id,p_modo)$$;
revoke all on function public.frete_ofertar(uuid,uuid,text) from public,anon;
grant execute on function public.frete_ofertar(uuid,uuid,text) to authenticated;

create function private.frete_operacao(p_acao text,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.motoristas;c public.cargas;v public.veiculos_motorista;t public.viagens;i public.interesses_carga;result jsonb; cap numeric;peso numeric;unit numeric;qtd integer;total numeric;
begin
 if not private.is_operational() or not exists(select 1 from public.usuarios_app where user_id=auth.uid() and perfil='MOTORISTA') then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 select * into m from public.motoristas where auth_user_id=auth.uid() and status_cadastro='aprovado' for update;
 if not found then raise exception 'Acesso não autorizado.' using errcode='42501';end if;
 if p_acao='CARGAS' then
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'origem',x.origem_cidade||'/'||x.origem_uf,'destino',x.destino_cidade||'/'||x.destino_uf,'produto',x.produto,'peso_min_t',x.peso_min_t,'peso_max_t',x.peso_max_t,'frete_por_t',x.frete_por_t,'data_carregamento',x.data_carregamento,'privada',x.audiencia='privada') order by x.created_at desc),'[]') into result from public.cargas x where x.status='publicada' and x.oferta_status='pendente' and (x.audiencia='publica' or x.destinatario_motorista_id=m.id) and private.frete_elegivel(x.id,m.id);
 return result;
 elsif p_acao='VIAGENS' then
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'origem',x.origem,'destino',x.destino,'produto',x.produto,'peso_t',x.peso_t,'frete_total',x.frete_total,'status',x.status,'pagamento_status',x.pagamento_status,'ordem_enviada_em',x.ordem_enviada_em,'carregamento_iniciado_em',x.carregamento_iniciado_em,'viagem_iniciada_em',x.viagem_iniciada_em,'entrega_concluida_em',x.entrega_concluida_em,'pagamento_comprovante_path',case when x.pagamento_status='pago' and x.comprovante_autorizado_em is not null then x.pagamento_comprovante_path end) order by x.created_at desc),'[]') into result from public.viagens x where x.motorista_id=m.id;
 return result;
 elsif p_acao='ORDENS' then
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'snapshot',jsonb_build_object('origem',x.snapshot->>'origem','destino',x.snapshot->>'destino','dataCarregamento',x.snapshot->>'dataCarregamento','placas',x.snapshot->'placas','pesoKg',x.snapshot->'pesoKg','freteValor',x.snapshot->'freteValor'),'pagamento_status',x.pagamento_status,'documento_frete_path',case when x.pagamento_status like 'PAGO%' then x.documento_frete_path end) order by x.updated_at desc),'[]') into result from public.vendas_ordens x where x.motorista_id=m.id;
 return result;
 elsif p_acao in ('INICIAR_CARREGAMENTO','INICIAR_VIAGEM','CONCLUIR_VIAGEM') then
 select * into t from public.viagens where id=p_id and motorista_id=m.id for update;
 if not found then raise exception 'Viagem indisponível.' using errcode='42501';end if;
 if p_acao='INICIAR_CARREGAMENTO' and t.status='ordem_liberada' and t.ordem_enviada_em is not null then
 update public.viagens set status='em_carregamento',carregamento_iniciado_em=now() where id=t.id;
 elsif p_acao='INICIAR_VIAGEM' and t.status='em_carregamento' then
 update public.viagens set status='em_viagem',viagem_iniciada_em=now() where id=t.id;
 elsif p_acao='CONCLUIR_VIAGEM' and t.status in ('em_carregamento','em_viagem') then
 update public.viagens set status='concluida',entrega_concluida_em=now(),concluida_em=now(),pagamento_status='aguardando_pagamento' where id=t.id;
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
end $$;
revoke all on function private.frete_operacao(text,uuid) from public,anon;
grant execute on function private.frete_operacao(text,uuid) to authenticated;
create function public.frete_operacao(p_acao text,p_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.frete_operacao(p_acao,p_id)$$;
revoke all on function public.frete_operacao(text,uuid) from public,anon;
grant execute on function public.frete_operacao(text,uuid) to authenticated;
-- Receipt reads require a registered, explicitly authorized proof owned by the current driver.
create policy frete_payment_read_guard on storage.objects as restrictive for select to authenticated using(
 bucket_id<>'motorista-documentos' or name not like '%/pagamentos/%' or private.is_admin() or exists(select 1 from public.viagens t where t.motorista_id=private.me_motorista_id() and t.pagamento_comprovante_path=name and t.pagamento_status='pago' and t.comprovante_autorizado_em is not null)
);
-- RLS on trips is admin-only, so the receipt predicate needs a bounded definer helper.
create function private.frete_comprovante_permitido(p_path text,p_bucket text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_operational() and (private.is_admin() or exists(select 1 from public.viagens t where p_bucket='motorista-documentos' and t.motorista_id=private.me_motorista_id() and t.pagamento_comprovante_path=p_path and t.pagamento_status='pago' and t.comprovante_autorizado_em is not null) or exists(select 1 from public.vendas_ordens o where p_bucket='vendas-ordens-frete' and o.motorista_id=private.me_motorista_id() and o.documento_frete_path=p_path and o.pagamento_status like 'PAGO%'))
$$;
revoke all on function private.frete_comprovante_permitido(text,text) from public,anon;
grant execute on function private.frete_comprovante_permitido(text,text) to authenticated;
alter policy frete_payment_read_guard on storage.objects using(bucket_id<>'motorista-documentos' or name not like '%/pagamentos/%' or private.frete_comprovante_permitido(name,bucket_id));
drop policy vendas_ordens_file_read on storage.objects;
create policy vendas_ordens_file_read on storage.objects for select to authenticated using(bucket_id='vendas-ordens-frete' and private.frete_comprovante_permitido(name,bucket_id));
create policy frete_payment_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'motorista-documentos' or name not like '%/pagamentos/%' or private.is_admin());
create policy frete_payment_update_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'motorista-documentos' or name not like '%/pagamentos/%' or private.is_admin()) with check(bucket_id<>'motorista-documentos' or name not like '%/pagamentos/%' or private.is_admin());
create policy frete_payment_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'motorista-documentos' or name not like '%/pagamentos/%' or private.is_admin());

-- In-app notifications only; no external provider or WhatsApp delivery is presumed.
create table public.frete_alertas (
 id uuid primary key default gen_random_uuid(),user_id uuid not null,carga_id uuid references public.cargas(id),
 viagem_id uuid references public.viagens(id),evento text not null,mensagem text not null,created_at timestamptz not null default now()
);
create index frete_alertas_usuario_idx on public.frete_alertas(user_id,created_at desc);
alter table public.frete_alertas enable row level security;
grant select on public.frete_alertas to authenticated;
create policy frete_alertas_proprios on public.frete_alertas for select to authenticated using(private.is_operational() and user_id=auth.uid());
create function private.notificar_oferta_frete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.audiencia='privada' and new.status='publicada' and new.oferta_status='pendente' and (tg_op='INSERT' or (new.destinatario_motorista_id,new.oferta_status,new.status) is distinct from (old.destinatario_motorista_id,old.oferta_status,old.status)) then
 insert into public.frete_alertas(user_id,carga_id,evento,mensagem) select auth_user_id,new.id,'OFERTA_PRIVADA','Você recebeu uma oferta privada. Confira as condições em Cargas.' from public.motoristas where id=new.destinatario_motorista_id and auth_user_id is not null;
 end if;
 if tg_op='UPDATE' and new.oferta_status in ('aceita','recusada') and new.oferta_status is distinct from old.oferta_status then
 insert into public.frete_alertas(user_id,carga_id,evento,mensagem) select user_id,new.id,'OFERTA_'||upper(new.oferta_status),'Uma oferta foi '||new.oferta_status||'. Confira o acompanhamento de cargas.' from public.usuarios_app where ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('MASTER','ADMINISTRADOR');
 end if;return new;
end $$;
create trigger notificar_oferta_frete after insert or update on public.cargas for each row execute function private.notificar_oferta_frete();
create function private.notificar_viagem_frete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.status is distinct from old.status or new.comprovante_autorizado_em is distinct from old.comprovante_autorizado_em then
 insert into public.frete_alertas(user_id,carga_id,viagem_id,evento,mensagem) select auth_user_id,new.carga_id,new.id,
 case when new.comprovante_autorizado_em is not null then 'COMPROVANTE_AUTORIZADO' else 'VIAGEM_ATUALIZADA' end,
 case when new.comprovante_autorizado_em is not null then 'O comprovante de frete da sua viagem foi autorizado.' else 'Sua viagem foi atualizada. Confira o andamento.' end
 from public.motoristas where id=new.motorista_id and auth_user_id is not null;
 end if;return new;
end $$;
create trigger notificar_viagem_frete after insert or update on public.viagens for each row execute function private.notificar_viagem_frete();
revoke all on function private.notificar_oferta_frete(),private.notificar_viagem_frete() from public,anon,authenticated;

commit;
