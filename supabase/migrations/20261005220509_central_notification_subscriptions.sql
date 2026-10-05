-- One installed Central can receive the user's authorized counters from multiple apps.
-- Keep existing rows and RLS; all writes continue through the authenticated Edge Function.
alter table public.forte_push_subscriptions drop constraint if exists forte_push_subscriptions_endpoint_key;
create unique index if not exists forte_push_subscriptions_endpoint_app_key on public.forte_push_subscriptions(endpoint,app);
