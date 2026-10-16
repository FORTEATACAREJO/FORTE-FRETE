begin;
-- Onboarding retains access to the person's own unfinished registration. An approved driver uses only the operational projections.
create function private.frete_cadastro_em_preenchimento() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.usuarios_app where user_id=auth.uid() and perfil='MOTORISTA') and not exists(select 1 from public.motoristas where auth_user_id=auth.uid() and status_cadastro='aprovado')
$$;
revoke all on function private.frete_cadastro_em_preenchimento() from public,anon;
grant execute on function private.frete_cadastro_em_preenchimento() to authenticated;
create function private.frete_identidade() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',m.id,'nome',m.nome,'status_cadastro',m.status_cadastro) from public.motoristas m join public.usuarios_app u on u.user_id=m.auth_user_id where m.auth_user_id=auth.uid() and u.perfil='MOTORISTA' limit 1
$$;
create function public.frete_identidade() returns jsonb language sql security invoker set search_path='' as $$select private.frete_identidade()$$;
revoke all on function private.frete_identidade(),public.frete_identidade() from public,anon;
grant execute on function private.frete_identidade(),public.frete_identidade() to authenticated;
create policy motorista_cadastro_gate on public.motoristas as restrictive for all to authenticated using(private.is_admin() or private.frete_cadastro_em_preenchimento()) with check(private.is_admin() or private.frete_cadastro_em_preenchimento());
create policy veiculo_cadastro_gate on public.veiculos_motorista as restrictive for all to authenticated using(private.is_admin() or private.frete_cadastro_em_preenchimento()) with check(private.is_admin() or private.frete_cadastro_em_preenchimento());
create policy favorecido_cadastro_gate on public.favorecidos_frete as restrictive for all to authenticated using(private.is_admin() or private.frete_cadastro_em_preenchimento()) with check(private.is_admin() or private.frete_cadastro_em_preenchimento());
create policy pix_cadastro_gate on public.chaves_pix_frete as restrictive for all to authenticated using(private.is_admin() or private.frete_cadastro_em_preenchimento()) with check(private.is_admin() or private.frete_cadastro_em_preenchimento());
create policy documento_motorista_gate on public.documentos_motorista as restrictive for all to authenticated using(private.is_admin() or private.frete_cadastro_em_preenchimento()) with check(private.is_admin() or private.frete_cadastro_em_preenchimento());
create policy documento_veiculo_gate on public.documentos_veiculo as restrictive for all to authenticated using(private.is_admin() or private.frete_cadastro_em_preenchimento()) with check(private.is_admin() or private.frete_cadastro_em_preenchimento());
create policy motorista_rota_cadastro_gate on public.motorista_rotas as restrictive for all to authenticated using(private.is_admin() or private.frete_cadastro_em_preenchimento()) with check(private.is_admin() or private.frete_cadastro_em_preenchimento());
create policy historico_cadastro_gate on public.historico_motoristas_veiculo as restrictive for all to authenticated using(private.is_admin() or private.frete_cadastro_em_preenchimento()) with check(private.is_admin() or private.frete_cadastro_em_preenchimento());
create policy motorista_documentos_operacionais on storage.objects as restrictive for select to authenticated using(bucket_id not in ('motorista-documentos','forte-frete-cadastros') or private.is_admin() or private.frete_cadastro_em_preenchimento() or private.frete_comprovante_permitido(name,bucket_id));
create policy motorista_documentos_escrita_insert on storage.objects as restrictive for insert to authenticated with check(bucket_id not in ('motorista-documentos','forte-frete-cadastros') or private.is_admin() or private.frete_cadastro_em_preenchimento());
create policy motorista_documentos_escrita_update on storage.objects as restrictive for update to authenticated using(bucket_id not in ('motorista-documentos','forte-frete-cadastros') or private.is_admin() or private.frete_cadastro_em_preenchimento()) with check(bucket_id not in ('motorista-documentos','forte-frete-cadastros') or private.is_admin() or private.frete_cadastro_em_preenchimento());
create policy motorista_documentos_escrita_delete on storage.objects as restrictive for delete to authenticated using(bucket_id not in ('motorista-documentos','forte-frete-cadastros') or private.is_admin() or private.frete_cadastro_em_preenchimento());
commit;
