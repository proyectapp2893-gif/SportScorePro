-- Comprobantes disciplinarios por jugador, por equipo y pagos externos.
-- Los comprobantes existentes continúan siendo comprobantes individuales.
alter table public.fine_payment_proofs
  add column if not exists tournament_id uuid references public.tournaments(id) on delete cascade,
  add column if not exists proof_scope text not null default 'PLAYER',
  add column if not exists payment_source text not null default 'DELEGATE',
  add column if not exists payment_note text;

alter table public.fine_payment_proofs
  alter column player_id drop not null,
  alter column match_event_id drop not null;

alter table public.fine_payment_proofs
  drop constraint if exists fine_payment_proofs_scope_check,
  drop constraint if exists fine_payment_proofs_source_check;

alter table public.fine_payment_proofs
  add constraint fine_payment_proofs_scope_check
    check (proof_scope in ('PLAYER', 'TEAM')),
  add constraint fine_payment_proofs_source_check
    check (payment_source in ('DELEGATE', 'EXTERNAL'));

-- Los registros anteriores se pueden ubicar por su evento disciplinario.
update public.fine_payment_proofs proof
set tournament_id = tournament_row.id
from public.match_events event_row
join public.matches fixture on fixture.id = event_row.match_id
join public.matchdays matchday_row on matchday_row.id = fixture.matchday_id
join public.categories category_row on category_row.id = matchday_row.category_id
join public.tournaments tournament_row on tournament_row.id = category_row.tournament_id
where proof.match_event_id = event_row.id
  and proof.tournament_id is null;

-- Un comprobante nuevo siempre debe estar asociado a un torneo, incluso si es global
-- y por ello no tiene un match_event_id de referencia.
alter table public.fine_payment_proofs
  alter column tournament_id set not null;

create index if not exists fine_payment_proofs_tournament_team_idx
  on public.fine_payment_proofs(tournament_id, team_id, proof_scope, status);

comment on column public.fine_payment_proofs.proof_scope is 'PLAYER cubre las multas pendientes de un jugador; TEAM cubre las del equipo.';
comment on column public.fine_payment_proofs.payment_source is 'DELEGATE: comprobante cargado por el delegado; EXTERNAL: soporte cargado por Tribunal.';
