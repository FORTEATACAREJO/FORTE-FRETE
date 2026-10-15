create or replace function private.integration_vault_manage(p_actor uuid,p_session uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item private.integration_credentials; sid uuid; result jsonb; event text; v integer;
begin
  -- Recheck both current database role and session even after Edge getUser validation.
  if not exists (select 1 from public.usuarios_app p where p.user_id=p_actor and p.ativo and p.status_aprovacao='APROVADO' and not coalesce(p.trocar_senha,false) and p.perfil::text in ('MASTER','ULTRA_ADMIN'))
    or not exists (select 1 from auth.sessions s where s.id=p_session and s.user_id=p_actor and (s.not_after is null or s.not_after>now()))
    or not exists (select 1 from auth.users u where u.id=p_actor and (u.banned_until is null or u.banned_until<=now()))
  then raise exception 'VAULT_FORBIDDEN' using errcode='42501'; end if;
  if p_action='STATUS' then return jsonb_build_object('available',true); end if;
  if p_action='LIST' then
    insert into private.integration_vault_audit(actor_id,action) values(p_actor,'LIST');
    select jsonb_build_object('entries',coalesce((
      select jsonb_agg(jsonb_build_object('id',c.id,'provider',c.provider,'reference',c.reference,'label',c.label,'expires_at',c.expires_at,'expires_on',to_char(c.expires_at at time zone 'America/Sao_Paulo','YYYY-MM-DD'),'archived',c.archived,'version',c.version,'updated_at',c.updated_at) order by c.updated_at desc,c.id)
      from private.integration_credentials c),'[]'::jsonb),
      'audit',coalesce((select jsonb_agg(row_to_json(a) order by a.created_at desc,a.id desc) from (
        select a.id,a.action,a.actor_id,a.created_at,c.reference
        from private.integration_vault_audit a left join private.integration_credentials c on c.id=a.credential_id
        order by a.created_at desc,a.id desc limit 40) a),'[]'::jsonb)) into result;
    return result;
  end if;
  if p_action='SAVE' then
    if jsonb_typeof(p_data->'secret') is distinct from 'string' or length(btrim(p_data->>'secret'))=0 or length(p_data->>'secret')>32768
      or length(btrim(p_data->>'label')) not between 1 and 100
      or p_data->>'provider' not in ('whatsapp','gmail','itau','fiscal','other')
      or not (p_data->>'reference' ~ '^[a-z0-9][a-z0-9_-]{1,63}$') then raise exception 'VAULT_INVALID'; end if;
    v=(p_data->>'version')::integer;
    if v is null or v<0 then raise exception 'VAULT_INVALID'; end if;
    -- Serialize creation of the same provider/reference, not just updates.
    perform pg_advisory_xact_lock(hashtextextended('integration-vault:'||(p_data->>'provider')||':'||(p_data->>'reference'),0));
    select * into item from private.integration_credentials where provider=p_data->>'provider' and reference=p_data->>'reference' for update;
    if item.id is null then
      if v<>0 then raise exception 'VAULT_CONFLICT'; end if;
      sid=vault.create_secret(p_data->>'secret');
      insert into private.integration_credentials(provider,reference,label,secret_id,expires_at,created_by,updated_by)
      values(p_data->>'provider',p_data->>'reference',btrim(p_data->>'label'),sid,(nullif(p_data->>'expires_at','')::date at time zone 'America/Sao_Paulo')+interval '1 day'-interval '1 millisecond',p_actor,p_actor) returning * into item;
      event='CREATED';
    else
      if item.archived or item.version<>v then raise exception 'VAULT_CONFLICT'; end if;
      perform vault.update_secret(item.secret_id,p_data->>'secret');
      update private.integration_credentials set label=btrim(p_data->>'label'),expires_at=(nullif(p_data->>'expires_at','')::date at time zone 'America/Sao_Paulo')+interval '1 day'-interval '1 millisecond',updated_by=p_actor,updated_at=now(),version=version+1 where id=item.id returning * into item;
      event='REPLACED';
    end if;
  elsif p_action in ('ARCHIVE','RESTORE') then
    select * into item from private.integration_credentials where id=(p_data->>'id')::uuid for update;
    if item.id is null or item.version is distinct from (p_data->>'version')::integer then raise exception 'VAULT_CONFLICT'; end if;
    update private.integration_credentials set archived=(p_action='ARCHIVE'),version=version+1,updated_by=p_actor,updated_at=now() where id=item.id returning * into item;
    event=case when p_action='ARCHIVE' then 'ARCHIVED' else 'RESTORED' end;
  else raise exception 'VAULT_INVALID_ACTION'; end if;
  insert into private.integration_vault_audit(credential_id,actor_id,action) values(item.id,p_actor,event);
  return jsonb_build_object('saved',true,'id',item.id,'version',item.version);
end $$;
