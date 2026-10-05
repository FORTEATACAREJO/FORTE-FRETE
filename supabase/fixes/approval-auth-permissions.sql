-- Approval remains SECURITY INVOKER and restricted to service_role.
-- Auth metadata is synchronized through the server-side Admin API.
do $fix$
declare definition text; obsolete text := '  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,''{}''::jsonb)||jsonb_build_object(''role'',chosen),updated_at=now() where id=r.user_id;';
begin
 select pg_get_functiondef('public.access_review_with_role(uuid,uuid,text,text,uuid[],text)'::regprocedure) into definition;
 if position(obsolete in definition)>0 then
  execute replace(definition,obsolete,'  -- Auth metadata is synchronized by access-standard using the Admin API.');
 elsif position('Auth metadata is synchronized by access-standard' in definition)=0 then
  raise exception 'Unexpected approval function; review before applying this fix.';
 end if;
end $fix$;
notify pgrst,'reload schema';
