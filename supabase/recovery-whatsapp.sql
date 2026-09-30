create table if not exists public.password_recovery_limits (
 request_key text primary key,
 created_at timestamptz not null default now()
);
alter table public.password_recovery_limits enable row level security;
revoke all on public.password_recovery_limits from anon, authenticated;
grant all on public.password_recovery_limits to service_role;
create index if not exists password_recovery_limits_created_at on public.password_recovery_limits(created_at);
