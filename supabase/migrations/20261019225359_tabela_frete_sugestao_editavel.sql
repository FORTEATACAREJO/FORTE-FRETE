begin;
create table public.frete_tarifas(id uuid primary key default gen_random_uuid(),origem text not null check(length(btrim(origem)) between 2 and 150),destino text not null check(length(btrim(destino)) between 2 and 150),valor_por_t numeric(12,2) not null check(valor_por_t>=0 and valor_por_t::text not in ('NaN','Infinity','-Infinity')),ativa boolean not null default true,updated_at timestamptz not null default now());
create unique index frete_tarifas_rota_unique on public.frete_tarifas(lower(btrim(origem)),lower(btrim(destino)));
alter table public.frete_tarifas enable row level security;
create policy frete_tarifas_admin on public.frete_tarifas for all to authenticated using(private.is_admin()) with check(private.is_admin());
grant select,insert,update on public.frete_tarifas to authenticated;
grant all on public.frete_tarifas to service_role;
alter table public.cargas add column frete_fonte text check(frete_fonte in ('COMBINADO','TABELA')),add column frete_tarifa_id uuid references public.frete_tarifas(id);
create function public.frete_alterar_valor(p_carga uuid,p_valor numeric,p_fonte text default 'COMBINADO',p_tarifa uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.cargas;t public.frete_tarifas;
begin
 if not private.is_admin() then raise exception 'Somente administração aprovada pode alterar o frete.' using errcode='42501';end if;
 select * into strict c from public.cargas where id=p_carga for update;
 if c.status not in ('rascunho','publicada') or c.oferta_status='aceita' or exists(select 1 from public.viagens where carga_id=c.id) then raise exception 'Carga já aceita ou em viagem. Confira a renegociação antes de alterar o valor contratado.';end if;
 if p_valor is null or p_valor<0 or p_valor::text in ('NaN','Infinity','-Infinity') or p_fonte is null or p_fonte not in ('COMBINADO','TABELA') then raise exception 'Informe um valor de frete válido.';end if;
 if p_fonte='TABELA' then select * into t from public.frete_tarifas where id=p_tarifa and ativa;if not found or t.valor_por_t<>round(p_valor,2) then raise exception 'A sugestão da tabela mudou. Atualize e confira o valor.';end if;end if;
 update public.cargas set frete_por_t=round(p_valor,2),frete_fonte=p_fonte,frete_tarifa_id=case when p_fonte='TABELA' then p_tarifa end where id=c.id;
 return jsonb_build_object('valor',round(p_valor,2),'fonte',p_fonte);
end;$$;
revoke all on function public.frete_alterar_valor(uuid,numeric,text,uuid) from public,anon;
grant execute on function public.frete_alterar_valor(uuid,numeric,text,uuid) to authenticated;
create function private.auditar_frete_valor() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.frete_por_t is distinct from old.frete_por_t then insert into public.frete_ofertas_auditoria(carga_id,autor_id,evento,anterior,atual) values(new.id,auth.uid(),'FRETE_ALTERADO',jsonb_build_object('valor_por_t',old.frete_por_t,'fonte',old.frete_fonte),jsonb_build_object('valor_por_t',new.frete_por_t,'fonte',new.frete_fonte));end if;return new;
end;$$;
revoke all on function private.auditar_frete_valor() from public,anon,authenticated;
create trigger auditar_frete_valor after update on public.cargas for each row execute function private.auditar_frete_valor();
commit;
