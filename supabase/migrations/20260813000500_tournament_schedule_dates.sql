alter table public.tournaments
add column if not exists schedule_dates jsonb not null default '[]'::jsonb;

comment on column public.tournaments.schedule_dates is
'Ordered list of YYYY-MM-DD play dates assigned to pending fixture matchdays.';
