begin;
alter table public.cargas
 add column fornecedor_vendas_id text,add column produto_vendas_id text,add column local_vendas_id text,
 add column origem_ibge_id text,add column destino_ibge_id text,
 add column quantidade_pedida numeric check(quantidade_pedida>0 and quantidade_pedida::text not in ('NaN','Infinity','-Infinity')),
 add column peso_pedido_t numeric check(peso_pedido_t>0 and peso_pedido_t::text not in ('NaN','Infinity','-Infinity'));
-- Deliberately no automatic approval of old vehicles. Existing links and trips
-- remain intact; the independent review migration governs future dispatches.
alter table public.veiculos_motorista add column status_aprovacao text not null default 'PENDENTE'
 check(status_aprovacao in ('RASCUNHO','PENDENTE','EM_ANALISE','APROVADO','CORRECAO_SOLICITADA','REPROVADO'));

create function public.frete_salvar_rascunho(p_id uuid,p_dados jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare q numeric;unit numeric;pedido numeric;minimum numeric;maximum numeric;rate numeric;c public.cargas;k text;
begin
 if private.is_admin() is distinct from true then raise exception 'Somente a administração aprovada pode gravar cargas.' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(p_dados) is distinct from 'object' then raise exception 'Rascunho inválido.';end if;
 foreach k in array array['fornecedor','fornecedor_vendas_id','produto','produto_vendas_id','local_expedicao','local_vendas_id','origem_cidade','destino_cidade'] loop
  if length(btrim(coalesce(p_dados->>k,''))) not between 1 and 200 then raise exception 'Confira o campo: %.',k;end if;
 end loop;
 if coalesce(p_dados->>'origem_uf','') !~ '^[A-Z]{2}$' or coalesce(p_dados->>'destino_uf','') !~ '^[A-Z]{2}$'
 or coalesce(p_dados->>'origem_ibge_id','') !~ '^[0-9]{7}$' or coalesce(p_dados->>'destino_ibge_id','') !~ '^[0-9]{7}$' then raise exception 'Selecione cidades e UF válidos.';end if;
 q:=(p_dados->>'quantidade_pedida')::numeric;unit:=(p_dados->>'peso_unitario_kg')::numeric;pedido:=round(q*unit/1000,6);
 minimum:=(p_dados->>'peso_min_t')::numeric;maximum:=(p_dados->>'peso_max_t')::numeric;rate:=(p_dados->>'frete_por_t')::numeric;
 if (q between 1 and 1000000000 and q=trunc(q) and unit between 0.001 and 1000000 and pedido between 0.000001 and 1000000
 and minimum between 0.000001 and maximum and maximum<=pedido and rate between 0 and 1000000) is distinct from true
 or pedido is distinct from (p_dados->>'peso_pedido_t')::numeric then raise exception 'Confira quantidades, pesos e valor do frete.';end if;
 insert into public.cargas(id,fornecedor,fornecedor_vendas_id,local_expedicao,local_vendas_id,origem_cidade,origem_uf,origem_ibge_id,destino_cidade,destino_uf,destino_ibge_id,produto,produto_vendas_id,peso_t,peso_min_t,peso_max_t,peso_unitario_kg,quantidade_pedida,peso_pedido_t,frete_por_t,status)
 values(p_id,p_dados->>'fornecedor',p_dados->>'fornecedor_vendas_id',p_dados->>'local_expedicao',p_dados->>'local_vendas_id',p_dados->>'origem_cidade',p_dados->>'origem_uf',p_dados->>'origem_ibge_id',p_dados->>'destino_cidade',p_dados->>'destino_uf',p_dados->>'destino_ibge_id',p_dados->>'produto',p_dados->>'produto_vendas_id',pedido,minimum,maximum,unit,q,pedido,rate,'rascunho')
 on conflict(id) do update set fornecedor=excluded.fornecedor,fornecedor_vendas_id=excluded.fornecedor_vendas_id,local_expedicao=excluded.local_expedicao,local_vendas_id=excluded.local_vendas_id,
 origem_cidade=excluded.origem_cidade,origem_uf=excluded.origem_uf,origem_ibge_id=excluded.origem_ibge_id,destino_cidade=excluded.destino_cidade,destino_uf=excluded.destino_uf,destino_ibge_id=excluded.destino_ibge_id,
 produto=excluded.produto,produto_vendas_id=excluded.produto_vendas_id,peso_t=excluded.peso_t,peso_min_t=excluded.peso_min_t,peso_max_t=excluded.peso_max_t,peso_unitario_kg=excluded.peso_unitario_kg,
 quantidade_pedida=excluded.quantidade_pedida,peso_pedido_t=excluded.peso_pedido_t,frete_por_t=excluded.frete_por_t
 where cargas.status='rascunho' and cargas.oferta_status='pendente' returning * into c;
 if c.id is null then raise exception 'Carga já ofertada ou aceita. Atualize antes de alterar o pedido.' using errcode='40001';end if;
 perform public.frete_alterar_valor(c.id,rate,p_dados->>'frete_fonte',nullif(p_dados->>'frete_tarifa_id','')::uuid);
 return jsonb_build_object('id',c.id,'status',c.status,'peso_pedido_t',pedido,'quantidade_pedida',q);
end;$$;
revoke all on function public.frete_salvar_rascunho(uuid,jsonb) from public,anon;
grant execute on function public.frete_salvar_rascunho(uuid,jsonb) to authenticated;
commit;
