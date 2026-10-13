create table public.access_invites(
 id uuid primary key default gen_random_uuid(),token uuid not null unique default gen_random_uuid(),
 app text not null,created_by uuid not null references auth.users(id),recipient_phone text not null,recipient_name text,
 expires_at timestamptz not null default now()+interval '30 days',created_at timestamptz not null default now(),
 claimed_by uuid references auth.users(id),claimed_at timestamptz,
 status text not null default 'CREATED' check(status in ('CREATED','SENDING','ACCEPTED_BY_META','FAILED','UNCERTAIN')),
 meta_message_id text,error_message text,send_started_at timestamptz
);
alter table public.access_invites enable row level security;
revoke all on public.access_invites from anon,authenticated;
create policy access_invites_no_client on public.access_invites for all to anon,authenticated using(false) with check(false);
alter table public.access_requests add column access_invite_id uuid references public.access_invites(id);
create or replace function public.access_invite_claim(p_user uuid,p_token uuid,p_app text) returns void language plpgsql set search_path='' as $$
declare i public.access_invites;r public.access_requests;
begin
 select * into strict i from public.access_invites where token=p_token for update;
 select * into strict r from public.access_requests where user_id=p_user and app=p_app order by created_at desc limit 1 for update;
 if i.app<>p_app or i.expires_at<now() or i.recipient_phone<>regexp_replace(r.whatsapp,'[^0-9]','','g') then raise exception 'Convite expirado ou destinado a outro aplicativo/WhatsApp.';end if;
 if i.claimed_by=p_user and r.access_invite_id=i.id then return;end if;
 if i.claimed_by is not null or r.access_invite_id is not null then raise exception 'Convite já utilizado ou cadastro já vinculado.';end if;
 update public.access_invites set claimed_by=p_user,claimed_at=now() where id=i.id;
 update public.access_requests set access_invite_id=i.id where id=r.id;
 insert into public.access_audit(app,event,user_id) values(p_app,'CONVITE_VINCULADO',p_user);
end;$$;
revoke all on function public.access_invite_claim(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.access_invite_claim(uuid,uuid,text) to service_role;
