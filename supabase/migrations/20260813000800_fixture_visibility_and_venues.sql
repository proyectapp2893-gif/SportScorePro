alter table public.tournaments
  add column if not exists fixture_visible_to_delegates boolean not null default false,
  add column if not exists available_venues jsonb not null default '["Cancha 1", "Cancha 2"]'::jsonb;

comment on column public.tournaments.fixture_visible_to_delegates is
  'Controls whether delegates can see fixtures, schedules and upcoming matches.';

comment on column public.tournaments.available_venues is
  'Tournament venues restricted by the configuration interface to Cancha 1 and Cancha 2.';
