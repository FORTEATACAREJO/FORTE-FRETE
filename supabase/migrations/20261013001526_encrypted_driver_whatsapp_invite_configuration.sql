create table private.driver_whatsapp_config(singleton boolean primary key default true check(singleton),secret_id uuid not null,phone_id text not null,waba_id text not null,template_name text not null,graph_version text not null,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now());
alter table private.driver_whatsapp_config enable row level security;
revoke all on private.driver_whatsapp_config from public,anon,authenticated;
create or replace function private.driver_whatsapp_read() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('token',s.decrypted_secret,'phone_id',c.phone_id,'waba_id',c.waba_id,'template_name',c.template_name,'graph_version',c.graph_version) from private.driver_whatsapp_config c join vault.decrypted_secrets s on s.id=c.secret_id where c.singleton;
$$;
create or replace function public.driver_whatsapp_read() returns jsonb language sql set search_path='' as $$ select private.driver_whatsapp_read(); $$;
create or replace function private.driver_whatsapp_save(p_actor uuid,p_token text,p_phone text,p_waba text,p_template text,p_version text) returns void language plpgsql security definer set search_path='' as $$
declare k uuid;
begin
 if not exists(select 1 from public.usuarios_app where user_id=p_actor and ativo and status_aprovacao='APROVADO' and not trocar_senha and perfil in ('ADMINISTRADOR','MASTER')) then raise exception 'Administração obrigatória.';end if;
 select secret_id into k from private.driver_whatsapp_config where singleton for update;
 if k is null then select vault.create_secret(p_token,'forte_frete_driver_whatsapp_access_token','Token exclusivo do envio de convites do Forte Frete') into k;
 else perform vault.update_secret(k,p_token);end if;
 insert into private.driver_whatsapp_config(singleton,secret_id,phone_id,waba_id,template_name,graph_version,updated_by) values(true,k,p_phone,p_waba,p_template,p_version,p_actor)
 on conflict(singleton) do update set secret_id=k,phone_id=p_phone,waba_id=p_waba,template_name=p_template,graph_version=p_version,updated_by=p_actor,updated_at=now();
 insert into public.access_audit(app,event,user_id) values('frete','WHATSAPP_CONVITES_CONFIGURADO',p_actor);
end;$$;
create or replace function public.driver_whatsapp_save(p_actor uuid,p_token text,p_phone text,p_waba text,p_template text,p_version text) returns void language sql set search_path='' as $$select private.driver_whatsapp_save(p_actor,p_token,p_phone,p_waba,p_template,p_version);$$;
revoke all on function private.driver_whatsapp_read(),public.driver_whatsapp_read(),private.driver_whatsapp_save(uuid,text,text,text,text,text),public.driver_whatsapp_save(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.driver_whatsapp_read(),public.driver_whatsapp_read(),private.driver_whatsapp_save(uuid,text,text,text,text,text),public.driver_whatsapp_save(uuid,text,text,text,text,text) to service_role;
grant usage on schema private to service_role;
