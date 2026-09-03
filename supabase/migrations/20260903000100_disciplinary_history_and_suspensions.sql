-- Historial disciplinario: observación del tribunal y jornadas de suspensión.
alter table public.match_events
  add column if not exists disciplinary_comment text,
  add column if not exists suspension_matches integer;

alter table public.match_events
  drop constraint if exists match_events_suspension_matches_check;

alter table public.match_events
  add constraint match_events_suspension_matches_check
  check (suspension_matches is null or suspension_matches between 1 and 20);

comment on column public.match_events.disciplinary_comment is 'Motivo u observación registrada por el Tribunal Disciplinario.';
comment on column public.match_events.suspension_matches is 'Cantidad de jornadas posteriores al partido en que el jugador queda suspendido.';
