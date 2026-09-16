alter table public.player_match_participation
  drop constraint if exists player_match_participation_source_check;
alter table public.player_match_participation
  add constraint player_match_participation_source_check check (source in ('EVENT', 'MANUAL', 'PLANILLERO'));
