create table if not exists public.push_subscriptions (
    endpoint text primary key,
    p256dh text not null,
    auth text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.push_subscriptions to service_role;
grant select on table public.admin_profiles to service_role;
