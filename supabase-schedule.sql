create table if not exists public.schedule_state (
    singleton boolean primary key default true check (singleton),
    schedule jsonb not null,
    week_number integer not null check (week_number between 1 and 53),
    announcement text not null default 'Schedule updates: Schedule changes and news will be posted here.',
    updated_at timestamptz not null default now()
);

alter table public.schedule_state enable row level security;
revoke all on table public.schedule_state from anon, authenticated;
grant select on table public.schedule_state to anon, authenticated;

drop policy if exists schedule_state_read_public on public.schedule_state;
create policy schedule_state_read_public
    on public.schedule_state
    for select
    to anon, authenticated
    using (true);

create or replace function public.save_schedule(p_schedule jsonb, p_week_number integer)
returns public.schedule_state
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := auth.uid();
    v_role text;
    v_teacher text;
    v_current public.schedule_state%rowtype;
    v_has_current boolean;
    v_row jsonb;
    v_slot jsonb;
    v_event jsonb;
    v_old_other_events jsonb;
    v_new_other_events jsonb;
begin
    if v_user_id is null then
        raise exception 'Sign-in is required to save the schedule.' using errcode = '42501';
    end if;

    select profile.role, profile.teacher
    into v_role, v_teacher
    from public.admin_profiles as profile
    where profile.user_id = v_user_id;

    if not found then
        raise exception 'This account has no admin profile.' using errcode = '42501';
    end if;

    if p_week_number is null or p_week_number < 1 or p_week_number > 53 then
        raise exception 'Week number must be between 1 and 53.' using errcode = '22023';
    end if;

    if jsonb_typeof(p_schedule) is distinct from 'array' then
        raise exception 'Schedule must be an array.' using errcode = '22023';
    end if;

    if jsonb_array_length(p_schedule) <> 5 then
        raise exception 'Schedule must contain five time rows.' using errcode = '22023';
    end if;

    for v_row in select value from jsonb_array_elements(p_schedule)
    loop
        if jsonb_typeof(v_row) is distinct from 'array' then
            raise exception 'Each schedule row must be an array.' using errcode = '22023';
        end if;

        if jsonb_array_length(v_row) <> 5 then
            raise exception 'Each schedule row must contain five weekdays.' using errcode = '22023';
        end if;

        for v_slot in select value from jsonb_array_elements(v_row)
        loop
            if jsonb_typeof(v_slot) is distinct from 'array' then
                raise exception 'Each schedule slot must be an array.' using errcode = '22023';
            end if;

            for v_event in select value from jsonb_array_elements(v_slot)
            loop
                if jsonb_typeof(v_event) is distinct from 'object'
                    or jsonb_typeof(v_event -> 'course') is distinct from 'string'
                    or jsonb_typeof(v_event -> 'teacher') is distinct from 'string'
                    or jsonb_typeof(v_event -> 'weeks') is distinct from 'string'
                    or jsonb_typeof(v_event -> 'location') is distinct from 'string' then
                    raise exception 'Schedule entries have an invalid format.' using errcode = '22023';
                end if;
            end loop;
        end loop;
    end loop;

    select *
    into v_current
    from public.schedule_state
    where singleton = true
    for update;
    v_has_current := found;

    if v_role = 'teacher' then
        if not v_has_current then
            raise exception 'The schedule must be initialized by a super admin first.' using errcode = '42501';
        end if;

        if p_week_number <> v_current.week_number then
            raise exception 'Only a super admin can change the week number.' using errcode = '42501';
        end if;

        select coalesce(jsonb_agg(
            jsonb_build_object(
                'row', schedule_rows.row_index,
                'day', schedule_days.day_index,
                'slot', schedule_slots.slot_index,
                'event', schedule_events.event_value
            ) order by schedule_rows.row_index, schedule_days.day_index,
                schedule_slots.slot_index, schedule_events.event_value::text
        ), '[]'::jsonb)
        into v_old_other_events
        from jsonb_array_elements(v_current.schedule) with ordinality
            as schedule_rows(row_value, row_index)
        cross join lateral jsonb_array_elements(schedule_rows.row_value) with ordinality
            as schedule_days(day_value, day_index)
        cross join lateral jsonb_array_elements(schedule_days.day_value) with ordinality
            as schedule_slots(slot_value, slot_index)
        cross join lateral jsonb_array_elements(schedule_slots.slot_value) with ordinality
            as schedule_events(event_value, event_index)
        where upper(btrim(schedule_events.event_value ->> 'teacher'))
            is distinct from upper(btrim(v_teacher));

        select coalesce(jsonb_agg(
            jsonb_build_object(
                'row', schedule_rows.row_index,
                'day', schedule_days.day_index,
                'slot', schedule_slots.slot_index,
                'event', schedule_events.event_value
            ) order by schedule_rows.row_index, schedule_days.day_index,
                schedule_slots.slot_index, schedule_events.event_value::text
        ), '[]'::jsonb)
        into v_new_other_events
        from jsonb_array_elements(p_schedule) with ordinality
            as schedule_rows(row_value, row_index)
        cross join lateral jsonb_array_elements(schedule_rows.row_value) with ordinality
            as schedule_days(day_value, day_index)
        cross join lateral jsonb_array_elements(schedule_days.day_value) with ordinality
            as schedule_slots(slot_value, slot_index)
        cross join lateral jsonb_array_elements(schedule_slots.slot_value) with ordinality
            as schedule_events(event_value, event_index)
        where upper(btrim(schedule_events.event_value ->> 'teacher'))
            is distinct from upper(btrim(v_teacher));

        if v_old_other_events is distinct from v_new_other_events then
            raise exception 'Teachers can only change classes assigned to their account.' using errcode = '42501';
        end if;
    elsif v_role <> 'super' then
        raise exception 'This account does not have a supported admin role.' using errcode = '42501';
    end if;

    if v_has_current then
        update public.schedule_state
        set schedule = p_schedule,
            week_number = p_week_number,
            updated_at = now()
        where singleton = true
        returning * into v_current;
    else
        insert into public.schedule_state (singleton, schedule, week_number)
        values (true, p_schedule, p_week_number)
        returning * into v_current;
    end if;

    return v_current;
end;
$$;

revoke all on function public.save_schedule(jsonb, integer) from public, anon, authenticated;
grant execute on function public.save_schedule(jsonb, integer) to authenticated;

create or replace function public.publish_announcement(p_message text)
returns public.schedule_state
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_user_id uuid := auth.uid();
    v_state public.schedule_state%rowtype;
begin
    if v_user_id is null or not exists (
        select 1
        from public.admin_profiles as profile
        where profile.user_id = v_user_id
    ) then
        raise exception 'An admin account is required to publish an announcement.' using errcode = '42501';
    end if;

    if p_message is null or length(p_message) > 1000 then
        raise exception 'Announcement must contain at most 1000 characters.' using errcode = '22023';
    end if;

    update public.schedule_state
    set announcement = p_message,
        updated_at = now()
    where singleton = true
    returning * into v_state;

    if not found then
        raise exception 'The schedule must be initialized before publishing announcements.' using errcode = '22023';
    end if;

    return v_state;
end;
$$;

revoke all on function public.publish_announcement(text) from public, anon, authenticated;
grant execute on function public.publish_announcement(text) to authenticated;

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'schedule_state'
    ) then
        alter publication supabase_realtime add table public.schedule_state;
    end if;
end;
$$;
