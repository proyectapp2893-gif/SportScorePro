-- Permite que un comprobante cubra una parte exacta de las sanciones pendientes.
alter table public.match_events
  add column if not exists fine_amount numeric(12, 2);

alter table public.fine_payment_proofs
  add column if not exists approved_amount numeric(12, 2),
  add column if not exists coverage_type text not null default 'FULL';

alter table public.fine_payment_proofs
  drop constraint if exists fine_payment_proofs_coverage_type_check;

alter table public.fine_payment_proofs
  add constraint fine_payment_proofs_coverage_type_check
    check (coverage_type in ('FULL', 'PARTIAL'));

create table if not exists public.fine_payment_proof_allocations (
  id uuid primary key default gen_random_uuid(),
  proof_id uuid not null references public.fine_payment_proofs(id) on delete cascade,
  match_event_id uuid not null references public.match_events(id) on delete restrict,
  amount_applied numeric(12, 2) not null check (amount_applied > 0),
  created_at timestamptz not null default now(),
  unique (proof_id, match_event_id)
);

create index if not exists fine_payment_proof_allocations_event_idx
  on public.fine_payment_proof_allocations(match_event_id);

alter table public.fine_payment_proof_allocations enable row level security;
revoke all on table public.fine_payment_proof_allocations from public, anon, authenticated;
grant select, insert, update, delete on table public.fine_payment_proof_allocations to service_role;

comment on column public.fine_payment_proofs.approved_amount is 'Valor efectivamente aplicado a sanciones al aprobar el comprobante.';
comment on column public.fine_payment_proofs.coverage_type is 'FULL cubre todas las sanciones aplicables; PARTIAL cubre solo una selección.';

create or replace function public.sportscore_approve_fine_payment_proof(
  p_proof_id uuid,
  p_event_ids uuid[],
  p_approved_amount numeric,
  p_reviewer uuid
)
returns table(updated_events integer, applied_amount numeric, coverage_type text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proof record;
  v_requested_count integer;
  v_selected_count integer;
  v_pending_count integer;
  v_selected_amount numeric(12, 2);
  v_applied_amount numeric(12, 2);
  v_coverage_type text;
  v_updated_count integer;
begin
  if p_event_ids is null then
    raise exception 'Selecciona al menos una sanción para cubrir.';
  end if;

  select id, team_id, tournament_id, player_id, proof_scope, status
    into v_proof
    from public.fine_payment_proofs
   where id = p_proof_id
   for update;

  if not found then
    raise exception 'Comprobante no encontrado.';
  end if;
  if v_proof.status <> 'PENDING' then
    raise exception 'Este comprobante ya fue revisado.';
  end if;
  if p_reviewer is null then
    raise exception 'No se identificó al administrador que revisa el comprobante.';
  end if;

  select count(*)
    into v_requested_count
    from (select distinct value as id from unnest(p_event_ids) as value) requested;
  if v_requested_count = 0 then
    raise exception 'Selecciona al menos una sanción para cubrir.';
  end if;

  select count(*), coalesce(sum(
    coalesce(nullif(me.fine_amount, 0), case when me.event_type = 'RED' then t.fine_red_amount else t.fine_yellow_amount end, 0)
  ), 0)
    into v_selected_count, v_selected_amount
    from public.match_events me
    join public.matches m on m.id = me.match_id
    join public.matchdays md on md.id = m.matchday_id
    join public.categories c on c.id = md.category_id
    join public.tournaments t on t.id = c.tournament_id
   where me.id in (select distinct value as id from unnest(p_event_ids) as value)
     and me.team_id = v_proof.team_id
     and c.tournament_id = v_proof.tournament_id
     and me.event_type in ('YELLOW', 'RED')
     and me.fine_status = 'UNPAID'
     and (v_proof.proof_scope = 'TEAM' or me.player_id = v_proof.player_id);

  if v_selected_count <> v_requested_count then
    raise exception 'Una o más sanciones ya fueron pagadas o no pertenecen al alcance del comprobante.';
  end if;
  if v_proof.proof_scope = 'PLAYER' and v_proof.player_id is null then
    raise exception 'El comprobante individual no tiene jugador asociado.';
  end if;

  select count(*)
    into v_pending_count
    from public.match_events me
    join public.matches m on m.id = me.match_id
    join public.matchdays md on md.id = m.matchday_id
    join public.categories c on c.id = md.category_id
   where me.team_id = v_proof.team_id
     and c.tournament_id = v_proof.tournament_id
     and me.event_type in ('YELLOW', 'RED')
     and me.fine_status = 'UNPAID'
     and (v_proof.proof_scope = 'TEAM' or me.player_id = v_proof.player_id);

  v_applied_amount := coalesce(p_approved_amount, v_selected_amount);
  if v_applied_amount <= 0 or abs(v_applied_amount - v_selected_amount) > 0.01 then
    raise exception 'El valor aprobado debe coincidir con las sanciones seleccionadas (%).', v_selected_amount;
  end if;
  v_coverage_type := case when v_selected_count = v_pending_count then 'FULL' else 'PARTIAL' end;

  with updated as (
    update public.match_events
       set fine_status = 'PAID'
     where id in (select distinct value as id from unnest(p_event_ids) as value)
       and fine_status = 'UNPAID'
     returning id
  )
  select count(*) into v_updated_count from updated;

  if v_updated_count <> v_selected_count then
    raise exception 'Las sanciones cambiaron mientras se revisaba el comprobante. Actualiza la página e intenta de nuevo.';
  end if;

  insert into public.fine_payment_proof_allocations (proof_id, match_event_id, amount_applied)
  select p_proof_id,
         me.id,
         coalesce(nullif(me.fine_amount, 0), case when me.event_type = 'RED' then t.fine_red_amount else t.fine_yellow_amount end, 0)
    from public.match_events me
    join public.matches m on m.id = me.match_id
    join public.matchdays md on md.id = m.matchday_id
    join public.categories c on c.id = md.category_id
    join public.tournaments t on t.id = c.tournament_id
   where me.id in (select distinct value as id from unnest(p_event_ids) as value);

  update public.fine_payment_proofs
     set status = 'APPROVED',
         approved_amount = v_applied_amount,
         coverage_type = v_coverage_type,
         reviewed_by = p_reviewer,
         reviewed_at = now()
   where id = p_proof_id
     and status = 'PENDING';

  if not found then
    raise exception 'No se pudo cerrar el comprobante.';
  end if;

  return query select v_updated_count, v_applied_amount, v_coverage_type;
end;
$$;

revoke all on function public.sportscore_approve_fine_payment_proof(uuid, uuid[], numeric, uuid) from public, anon, authenticated;
grant execute on function public.sportscore_approve_fine_payment_proof(uuid, uuid[], numeric, uuid) to service_role;
