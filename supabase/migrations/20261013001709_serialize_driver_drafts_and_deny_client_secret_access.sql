create policy driver_whatsapp_config_no_client on private.driver_whatsapp_config for all to anon,authenticated using(false) with check(false);
create or replace function public.driver_onboarding_save(p_user uuid,p_data jsonb) returns void language plpgsql set search_path='' as $$
declare d public.driver_onboarding;m public.motoristas;
begin
 select * into strict d from public.driver_onboarding where user_id=p_user for update;
 select * into strict m from public.motoristas where id=d.motorista_id and auth_user_id=p_user for update;
 if m.status_cadastro not in ('pre_cadastro','pendencia','reprovado') or exists(select 1 from public.usuarios_app where user_id=p_user and status_aprovacao='APROVADO') then raise exception 'Cadastro não está aberto para edição.';end if;
 if jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>30000 then raise exception 'Dados inválidos.';end if;
 update public.driver_onboarding set data=p_data,status='DRAFT',updated_at=now() where user_id=p_user;
end;$$;
revoke all on function public.driver_onboarding_save(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.driver_onboarding_save(uuid,jsonb) to service_role;
create or replace function private.driver_documents_before_approval() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status_cadastro='aprovado' and old.status_cadastro is distinct from 'aprovado' and (exists(select 1 from public.driver_onboarding where motorista_id=new.id and status<>'SUBMITTED') or old.status_cadastro='pre_cadastro' and not exists(select 1 from public.driver_onboarding where motorista_id=new.id and status='SUBMITTED')) then raise exception 'Motorista deve concluir e enviar os documentos antes da aprovação.';end if;return new;
end;$$;
