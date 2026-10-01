create or replace function public.salvar_chave_pix_frete(p_favorecido_id uuid,p_tipo text,p_chave text,p_principal boolean) returns uuid language plpgsql security invoker set search_path='' as $$
declare result_id uuid;
begin
 if not private.is_admin() then raise exception 'Acesso exclusivo do administrador.'; end if;
 perform 1 from public.favorecidos_frete where id=p_favorecido_id for update;
 if not found then raise exception 'Favorecido não localizado.'; end if;
 if p_principal then update public.chaves_pix_frete set principal=false where favorecido_id=p_favorecido_id; end if;
 insert into public.chaves_pix_frete(favorecido_id,tipo,chave,principal) values(p_favorecido_id,p_tipo,trim(p_chave),p_principal)
 on conflict(favorecido_id,chave) do update set tipo=excluded.tipo,principal=excluded.principal,ativo=true returning id into result_id;
 return result_id;
end $$;
revoke all on function public.salvar_chave_pix_frete(uuid,text,text,boolean) from public,anon;
grant execute on function public.salvar_chave_pix_frete(uuid,text,text,boolean) to authenticated;
