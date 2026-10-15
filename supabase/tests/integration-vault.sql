-- Regression fixtures are transaction-local. No provider calls or real secrets.
begin;
do $$
declare actor uuid; session uuid=gen_random_uuid(); denied boolean=false;
  ref text='qa_'||replace(gen_random_uuid()::text,'-','');
  qa_value text='VAULT_QA_SENTINEL_NOT_A_REAL_CREDENTIAL'; saved jsonb; metadata jsonb; sid uuid;
begin
  select p.user_id into actor from public.usuarios_app p where p.ativo and p.status_aprovacao='APROVADO' and not coalesce(p.trocar_senha,false) and p.perfil::text in ('MASTER','ULTRA_ADMIN') limit 1;
  if actor is null then raise exception 'QA requires an existing approved Master'; end if;
  insert into auth.sessions(id,user_id,created_at,updated_at,not_after) values(session,actor,now(),now(),now()+interval '5 minutes');
  assert not has_function_privilege('anon','public.integration_vault_manage(uuid,uuid,text,jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','public.integration_vault_manage(uuid,uuid,text,jsonb)','EXECUTE');
  assert not has_function_privilege('authenticated','public.integration_vault_read(text,text)','EXECUTE');
  assert not has_table_privilege('authenticated','private.integration_credentials','SELECT');
  assert not has_table_privilege('anon','private.integration_vault_audit','SELECT');
  assert not has_table_privilege('authenticated','vault.decrypted_secrets','SELECT');
  begin
    perform private.integration_vault_manage(gen_random_uuid(),session,'STATUS','{}');
  exception when insufficient_privilege then denied=true;
  end;
  assert denied,'Non-Master actor must be rejected';
  denied=false;
  begin
    perform private.integration_vault_manage(actor,gen_random_uuid(),'STATUS','{}');
  exception when insufficient_privilege then denied=true;
  end;
  assert denied,'Unknown session must be rejected';
  saved=private.integration_vault_manage(actor,session,'SAVE',jsonb_build_object('provider','other','reference',ref,'label','QA fixture','secret',qa_value,'version',0));
  select secret_id into sid from private.integration_credentials where id=(saved->>'id')::uuid;
  assert sid is not null;
  assert (select s.secret<>qa_value from vault.secrets s where id=sid),'Storage must be encrypted';
  assert private.integration_vault_read('other',ref)=qa_value,'Backend decryption must work';
  metadata=private.integration_vault_manage(actor,session,'LIST','{}');
  assert strpos(metadata::text,qa_value)=0,'Metadata and audit must not include the secret';
  assert strpos(metadata::text,'secret_id')=0,'Metadata must not expose vault pointers';
  saved=private.integration_vault_manage(actor,session,'SAVE',jsonb_build_object('provider','other','reference',ref,'label','QA updated','secret',qa_value||'_2','version',1));
  assert (saved->>'version')::integer=2;
  begin
    perform private.integration_vault_manage(actor,session,'SAVE',jsonb_build_object('provider','other','reference',ref,'label','Stale overwrite','secret','stale','version',1));
    raise exception 'QA stale write was accepted';
  exception when raise_exception then
    if sqlerrm<>'VAULT_CONFLICT' then raise; end if;
  end;
  assert private.integration_vault_read('other',ref)=qa_value||'_2';
  saved=private.integration_vault_manage(actor,session,'ARCHIVE',jsonb_build_object('id',saved->>'id','version',2));
  assert private.integration_vault_read('other',ref) is null;
  saved=private.integration_vault_manage(actor,session,'RESTORE',jsonb_build_object('id',saved->>'id','version',3));
  assert private.integration_vault_read('other',ref)=qa_value||'_2';
  assert (select count(distinct action)=4 from private.integration_vault_audit where credential_id=(saved->>'id')::uuid and action in ('CREATED','REPLACED','ARCHIVED','RESTORED'));
  perform private.integration_vault_manage(actor,session,'SAVE',jsonb_build_object('provider','other','reference',ref||'_expired','label','QA expired','secret',qa_value,'version',0,'expires_at','2000-01-01'));
  assert private.integration_vault_read('other',ref||'_expired') is null;
  update auth.sessions set not_after=now()-interval '1 second' where id=session;
  denied=false;
  begin
    perform private.integration_vault_manage(actor,session,'STATUS','{}');
  exception when insufficient_privilege then denied=true;
  end;
  assert denied,'Expired session must be rejected';
end $$;
rollback;
select 'PASS: encrypted storage, backend read, no client access, Master/session checks, metadata redaction, version conflicts, archive/restore, expiry and audit; fixtures rolled back' as verification;
