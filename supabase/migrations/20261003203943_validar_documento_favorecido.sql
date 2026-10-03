create or replace function public.validar_documento_favorecido(p_value text)
returns boolean language plpgsql immutable set search_path='' as $$
declare v text:=upper(regexp_replace(coalesce(p_value,''),'[./[:space:]-]','','g')); s integer; d integer; i integer; n integer; w integer;
begin
 if v ~ '^(.)\1+$' then return false; end if;
 if v ~ '^[0-9]{11}$' then
  for n in 9..10 loop
   s:=0; for i in 1..n loop s:=s+substring(v from i for 1)::integer*(n+2-i); end loop;
   d:=(s*10)%11; if d=10 then d:=0; end if;
   if d<>substring(v from n+1 for 1)::integer then return false; end if;
  end loop;
  return true;
 elsif v ~ '^[A-Z0-9]{12}[0-9]{2}$' then
  for n in 12..13 loop
   s:=0;w:=2;for i in reverse n..1 loop s:=s+(ascii(substring(v from i for 1))-48)*w;w:=case when w=9 then 2 else w+1 end;end loop;
   d:=s%11;d:=case when d<2 then 0 else 11-d end;
   if d<>substring(v from n+1 for 1)::integer then return false;end if;
  end loop;
  return true;
 end if;
 return false;
end;
$$;
revoke all on function public.validar_documento_favorecido(text) from public,anon;
grant execute on function public.validar_documento_favorecido(text) to authenticated,service_role;

create or replace function private.guardar_documento_favorecido()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not public.validar_documento_favorecido(new.cpf_cnpj) then
  raise exception 'CPF/CNPJ do favorecido inválido. Confira os dígitos verificadores.' using errcode='23514';
 end if;
 new.cpf_cnpj:=upper(regexp_replace(new.cpf_cnpj,'[./[:space:]-]','','g'));
 return new;
end;
$$;
revoke all on function private.guardar_documento_favorecido() from public,anon,authenticated;
create trigger guardar_documento_favorecido before insert or update of cpf_cnpj on public.favorecidos_frete
for each row execute function private.guardar_documento_favorecido();
alter table public.favorecidos_frete add constraint favorecido_documento_valido
check (public.validar_documento_favorecido(cpf_cnpj));
