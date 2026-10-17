begin;
-- Selection opens a pending dossier only. It never grants an operational role or approval.
create function public.driver_onboarding_start(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.access_requests;p public.usuarios_app;m public.motoristas;d public.driver_onboarding;
begin
 select * into r from public.access_requests where user_id=p_user and app='frete' order by created_at desc limit 1 for update;
 if not found or r.status is distinct from 'PENDENTE' or (r.invite_id is null and r.access_invite_id is null) then raise exception 'Use um convite vinculado a um cadastro pendente.' using errcode='42501';end if;
 select * into p from public.usuarios_app where user_id=p_user for update;
 if not found or p.ativo is distinct from false or p.status_aprovacao is distinct from 'PENDENTE' or p.trocar_senha is distinct from false or coalesce(p.perfil,'') not in ('OPERADOR_GERAL','MOTORISTA') then raise exception 'Este acesso não permite iniciar cadastro de motorista.' using errcode='42501';end if;
 select * into m from public.motoristas where auth_user_id=p_user for update;
 if found and m.status_cadastro not in ('pre_cadastro','pendencia','reprovado','em_analise') then raise exception 'Cadastro já aprovado ou indisponível para alteração.' using errcode='42501';end if;
 if m.id is null then
  insert into public.motoristas(auth_user_id,nome,cpf,telefone,email,data_nascimento,status_cadastro) values(p_user,r.nome,r.cpf,r.whatsapp,r.email,r.data_nascimento,'pre_cadastro') returning * into m;
 end if;
 insert into public.driver_onboarding(user_id,motorista_id,documents_requested) values(p_user,m.id,true)
 on conflict(user_id) do update set documents_requested=true;
 update public.usuarios_app set perfil='MOTORISTA',ativo=false where user_id=p_user;
 if p.perfil<>'MOTORISTA' then insert into public.access_audit(app,event,user_id) values('frete','CADASTRO_MOTORISTA_INICIADO_PELO_CONVIDADO',p_user);end if;
 return jsonb_build_object('status','DOCUMENTS_REQUIRED','message','Continue com os documentos. O acesso continua bloqueado até a aprovação da administração.');
end $$;
revoke all on function public.driver_onboarding_start(uuid) from public,anon,authenticated;
grant execute on function public.driver_onboarding_start(uuid) to service_role;
commit;
