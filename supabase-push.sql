create table if not exists public.push_subscriptions (
    endpoint text primary key,
    p256dh text not null,
    auth text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
