-- Account-based diet record storage for "오늘 기록 저장하기"
-- Run once in Supabase SQL editor.

create table if not exists public.diet_daily_logs (
    user_id uuid not null references auth.users(id) on delete cascade,
    date_key date not null,
    log_payload jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (user_id, date_key)
);

create index if not exists diet_daily_logs_user_updated_idx
    on public.diet_daily_logs (user_id, updated_at desc);

alter table public.diet_daily_logs enable row level security;

create policy "diet_daily_logs_select_own"
    on public.diet_daily_logs
    for select
    to authenticated
    using (auth.uid() = user_id);

create policy "diet_daily_logs_insert_own"
    on public.diet_daily_logs
    for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "diet_daily_logs_update_own"
    on public.diet_daily_logs
    for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "diet_daily_logs_delete_own"
    on public.diet_daily_logs
    for delete
    to authenticated
    using (auth.uid() = user_id);
