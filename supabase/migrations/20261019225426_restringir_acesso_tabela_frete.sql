revoke all on table public.frete_tarifas from public,anon,authenticated;
grant select,insert,update on table public.frete_tarifas to authenticated;
grant all on table public.frete_tarifas to service_role;
