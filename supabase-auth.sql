create table if not exists public.admin_profiles (
    user_id uuid primary key references auth.users (id) on delete cascade,
    role text not null check (role in ('super', 'teacher')),
    teacher text,
    constraint admin_profiles_teacher_required
        check (role <> 'teacher' or nullif(btrim(teacher), '') is not null),
    constraint admin_profiles_super_has_no_teacher
        check (role <> 'super' or teacher is null)
);

alter table public.admin_profiles enable row level security;

revoke all on table public.admin_profiles from anon, authenticated;
grant select on table public.admin_profiles to authenticated;

drop policy if exists admin_profiles_select_own on public.admin_profiles;
create policy admin_profiles_select_own
    on public.admin_profiles
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

insert into public.admin_profiles (user_id, role)
values ('68da0a07-195d-4d02-ac06-aa015b096d7b', 'super')
on conflict (user_id) do update
set role = excluded.role,
    teacher = null;

insert into public.admin_profiles (user_id, role, teacher)
values ('550e9840-2f3e-46af-90ca-d1596c967438', 'teacher', 'LI ZHENXINANG')
on conflict (user_id) do update
set role = excluded.role,
    teacher = excluded.teacher;

insert into public.admin_profiles (user_id, role, teacher)
values ('f4a64d2c-528c-4ac5-9075-54668c06c517', 'teacher', 'WANG SEN')
on conflict (user_id) do update
set role = excluded.role,
    teacher = excluded.teacher;

-- After creating an Auth user, assign its UUID a role in this table.
-- Super admin:
-- insert into public.admin_profiles (user_id, role)
-- values ('AUTH_USER_UUID', 'super');
-- Teacher:
-- insert into public.admin_profiles (user_id, role, teacher)
-- values ('AUTH_USER_UUID', 'teacher', 'EXACT TEACHER NAME');