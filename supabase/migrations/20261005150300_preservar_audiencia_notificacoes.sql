CREATE OR REPLACE FUNCTION private.access_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if tg_op='INSERT' then
 insert into public.access_notifications(request_id,user_id,audience,event,message) values
 (new.id,new.user_id,'ADMIN','NOVO_CADASTRO','Novo usuário aguardando análise: '||new.nome||' • '||new.app),
 (new.id,new.user_id,'USER','NOVO_CADASTRO','Cadastro enviado para análise. Aguarde aprovação do admin ou master.') on conflict do nothing;
 elsif new.status is distinct from old.status and new.status in ('APROVADO','RECUSADO') then
 insert into public.access_notifications(request_id,user_id,audience,event,message)
 values(new.id,new.user_id,'USER',new.status,case when new.status='APROVADO' then 'Acesso aprovado para '||new.app||'.' else 'Acesso recusado: '||coalesce(new.reason,'Contate o administrador.') end) on conflict do nothing;
 end if;return new;
end;$function$
;

