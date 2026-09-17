alter table public.tournaments
  add column if not exists schedule_weekdays jsonb not null default '[6]'::jsonb;

comment on column public.tournaments.schedule_weekdays is
  'Días de la semana habilitados para programar jornadas. Valores 0 domingo a 6 sábado.';
