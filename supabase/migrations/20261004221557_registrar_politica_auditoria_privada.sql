
create policy access_audit_service_only on public.access_audit for all to service_role using(true) with check(true);

