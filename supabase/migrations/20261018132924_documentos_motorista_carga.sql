begin;
-- Documents are exposed through a bounded projection; the order inbox stays private.
create function private.frete_documentos_motorista() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'codigo',o.snapshot->>'codigo','pedido',o.snapshot->>'pedido','ordem',o.snapshot->'documentosMotorista'->>'ordem','romaneio',o.snapshot->'documentosMotorista'->>'romaneio') order by o.updated_at desc),'[]'::jsonb)
 from public.vendas_ordens o
 where private.is_operational() and o.motorista_id=private.me_motorista_id()
 and exists(select 1 from public.usuarios_app u where u.user_id=auth.uid() and u.perfil='MOTORISTA')
 and exists(select 1 from public.motoristas m where m.id=o.motorista_id and m.auth_user_id=auth.uid() and m.status_cadastro='aprovado');
$$;
create function public.frete_documentos_motorista() returns jsonb language sql security invoker set search_path='' as $$select private.frete_documentos_motorista()$$;
create function private.frete_documento_permitido(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_operational() and exists(select 1 from public.vendas_ordens o join public.motoristas m on m.id=o.motorista_id join public.usuarios_app u on u.user_id=m.auth_user_id where m.auth_user_id=auth.uid() and u.perfil='MOTORISTA' and m.status_cadastro='aprovado' and (o.snapshot->'documentosMotorista'->>'ordem'=p_path or o.snapshot->'documentosMotorista'->>'romaneio'=p_path));
$$;
revoke all on function private.frete_documentos_motorista(),public.frete_documentos_motorista(),private.frete_documento_permitido(text) from public,anon;
grant execute on function private.frete_documentos_motorista(),public.frete_documentos_motorista(),private.frete_documento_permitido(text) to authenticated;
create policy frete_driver_pdf_read on storage.objects for select to authenticated using(bucket_id='vendas-ordens-frete' and private.frete_documento_permitido(name));
commit;
