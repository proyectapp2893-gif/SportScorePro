alter table public.tournaments
add column if not exists schedule_time_slots jsonb not null default '[]'::jsonb;

comment on column public.tournaments.schedule_time_slots is
'Ordered list of HH:MM time slots used to distribute fixture schedules fairly.';
