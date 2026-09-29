alter table public.usuarios_app
  add column if not exists trocar_senha boolean not null default false;
